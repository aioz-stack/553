<?php

namespace App\Services\Game;

use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientBalanceException;
use App\Game\Arrangement;
use App\Game\ArrangementPreview;
use App\Game\ArrangementValidator;
use App\Game\AutoArranger;
use App\Game\Banker\BankerRound;
use App\Game\BotArranger;
use App\Game\Deck;
use App\Game\Exceptions\InvalidArrangementException;
use App\Game\LuckyHand;
use App\Models\PracticeGame;
use App\Models\PracticeMatch;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use App\Support\Points;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
/**
 * Single Player — Round Bank Pusoy (Chinese Poker): the player and three bots
 * (LuckyBot, CardBot, AceBot) at one four-seat table.
 *
 * A match is 12 rounds. The banker rotates seat by seat — round 1 the player,
 * then LuckyBot, CardBot, AceBot, and around again (each seat banks 3 times).
 * The banker places no bet: it covers every other seat. Each non-banker bets
 * — you with a chip from the tier's options, each bot with its own pick. The
 * server deals all 52 cards (13 to each seat), arranges the bots (BotArranger
 * or casual by tier) and validates the player's Front (3) / Middle (5) /
 * Back (5). A misplaced (fouled) arrangement may be submitted and pays the
 * 2 × bet penalty (it loses every lane: to the banker, or as banker to every
 * opponent).
 *
 * Settlement (App\Game\Banker\BankerRound, banker advantage on): each
 * non-banker's lanes are compared with the banker's; an identical lane goes
 * to the banker. 3-0 = 2 × bet, 2-1 = 1 × bet, 1-2 = −1 ×, 0-3 = −2 ×
 * (config pusoy.banker.settlement). Declared Luck — any ONE of Three Flushes,
 * No Face Cards or Six Pairs — replaces the lane comparison and wins
 * lucky_multiplier (2) × bet; declaring without one loses 2 × bet. The player
 * declares theirs, bots declare automatically (only ever with a qualifying hand).
 *
 * Gold Wallet (GD — free-play, never cash; App\Services\Game\GoldService):
 * every round reserves the player's worst case (2 × bet, or 2 × every bot's
 * bet when the player banks) from their Gold wallet, and the house's matching
 * reserve (issued, free-play) into escrow, then pays both out once on
 * settlement — winnings credited and losses deducted automatically, always
 * covered, never negative, idempotent (one settlement per round, ledger
 * idempotency keys). The bots are house players: only the player's result
 * moves Gold. When a settled round leaves the player Out of Gold (cannot
 * cover the next round) the match ends at once (status out_of_gold) and no
 * further round can be dealt. Legacy matches (currency CP) still settle and
 * release in CP.
 */
class PracticeService
{
    public const PLAYER_SEAT = 1;

    /** seat => bot name (the three bots that join every match) */
    public const BOTS = [2 => 'LuckyBot', 3 => 'CardBot', 4 => 'AceBot'];

    public const SEATS = [1, 2, 3, 4];

    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
        private readonly GoldService $gold,
    ) {}

    // ------------------------------------------------------------------ tiers

    /**
     * @return list<array<string, mixed>>
     */
    public function tiers(User $user): array
    {
        $gold = $this->goldMinor($user);
        $rows = [];

        foreach ((array) config('pusoy.practice.tiers', []) as $key => $tier) {
            $rows[] = [
                'key' => $key,
                'name' => $tier['name'],
                'stars' => (int) $tier['stars'],
                'crown' => (bool) ($tier['crown'] ?? false),
                'min_gold' => (int) $tier['min_gold'],
                'bets' => array_map('intval', $tier['bets']),
                'eligible' => $gold >= Points::toMinor((int) $tier['min_gold']),
            ];
        }

        return $rows;
    }

    // ------------------------------------------------------------------ match

    /** Start a new 12-round match at a tier (any unfinished match is abandoned and its reserves released). */
    public function startMatch(User $user, string $tierKey): PracticeMatch
    {
        $tier = $this->tier($tierKey);

        return DB::transaction(function () use ($user, $tierKey, $tier) {
            User::query()->whereKey($user->id)->lockForUpdate()->first();

            if ($this->goldMinor($user) < Points::toMinor(GoldService::minimumToStart())) {
                throw new BusinessRuleException('You are out of Gold. Claim your free Gold Points to keep playing.', 409, 'out_of_gold');
            }

            $this->assertGold($user, $tier);

            foreach (PracticeMatch::query()->where('user_id', $user->id)->where('status', PracticeMatch::ACTIVE)->lockForUpdate()->get() as $old) {
                $this->abandon($old);
            }

            // Legacy open practice deals (before Round Bank) are closed too.
            PracticeGame::query()->where('user_id', $user->id)->whereNull('practice_match_id')
                ->where('status', PracticeGame::ARRANGING)->update(['status' => PracticeGame::ABANDONED]);

            return PracticeMatch::create([
                'user_id' => $user->id,
                'tier' => $tierKey,
                'status' => PracticeMatch::ACTIVE,
                'rounds_total' => (int) config('pusoy.practice.rounds', 12),
                // Every round moves Gold (free-play) automatically.
                'wagering' => true,
                'currency' => Currency::GD->value,
            ])->refresh();
        });
    }

    public function activeMatch(User $user): ?PracticeMatch
    {
        return PracticeMatch::query()->where('user_id', $user->id)->where('status', PracticeMatch::ACTIVE)->latest('id')->first();
    }

    /**
     * Deal the next round of a match with the bet the player chose. A repeated
     * $requestId returns the round it already dealt.
     */
    public function deal(User $user, PracticeMatch $match, ?int $bet, ?string $requestId = null): PracticeGame
    {
        if ($requestId !== null && ($existing = $this->byRequest($user, $requestId))) {
            return $existing;
        }

        try {
            return DB::transaction(function () use ($user, $match, $bet, $requestId) {
                /** @var PracticeMatch $match */
                $match = PracticeMatch::query()->whereKey($match->id)->lockForUpdate()->firstOrFail();
                $this->ownMatch($user, $match);

                if ($match->status === PracticeMatch::OUT_OF_GOLD) {
                    throw new BusinessRuleException('You are out of Gold. Claim your free Gold Points to keep playing.', 409, 'out_of_gold');
                }

                if ($match->status !== PracticeMatch::ACTIVE) {
                    throw new BusinessRuleException('This match is over. Start a new one.', 409, 'match_over');
                }

                if (PracticeGame::query()->where('practice_match_id', $match->id)->where('status', PracticeGame::ARRANGING)->exists()) {
                    throw new BusinessRuleException('Finish the current round first.', 409, 'round_in_progress');
                }

                $tier = $this->tier($match->tier);
                $options = array_map('intval', $tier['bets']);
                $round = $match->rounds_played + 1;
                $bankerSeat = PracticeMatch::bankerFor($round);

                // The banker places no bet: it covers every other seat's bet. Each non-banker bets:
                // you (your chip, default the lowest) and each bot (its own pick from the tier's options).
                if ($bankerSeat === self::PLAYER_SEAT) {
                    $bet = 0;
                } else {
                    $bet ??= min($options);

                    if (! in_array($bet, $options, true)) {
                        throw new BusinessRuleException("That bet is not offered at {$tier['name']}.", 422, 'invalid_bet');
                    }
                }

                $bets = [];
                foreach (self::SEATS as $seat) {
                    if ($seat === $bankerSeat) {
                        continue;
                    }
                    $bets[$seat] = $seat === self::PLAYER_SEAT ? $bet : self::botBet($options);
                }

                // When you bank with Gold on the line, the bots only bet what you can cover
                // (2 × their total must fit your balance): they step down their largest bets.
                if ($match->wagering && $bankerSeat === self::PLAYER_SEAT) {
                    $bets = self::fitBets($bets, $options, intdiv($this->goldMinor($user, $match), Points::SCALE));
                }

                // The tier minimum applies when a match starts; mid-match a round only needs its reserve covered.
                if (! $match->wagering) {
                    $this->assertGold($user, $tier);
                }

                // Every round (round 1 included) starts from the complete 52-card deck and a fresh
                // CSPRNG seed, reshuffled before anything is dealt; nothing from earlier rounds carries over.
                $seed = Deck::newSeed();
                $deck = Deck::shuffled($seed);
                // All 52 cards, one at a time clockwise (You → LuckyBot → CardBot → AceBot), starting
                // with the seat after the banker and ending on the banker: 13 to each seat.
                $hands = Deck::deal($deck, 4, 13, self::firstToDeal($bankerSeat));
                self::assertFullDeal($deck, $hands);
                $arrangements = [];

                // Bot strength by tier: the first `strong_bots` bots arrange with BotArranger (searches for the
                // best-balanced valid arrangement); the others play casually (random but never fouled).
                foreach (array_keys(self::BOTS) as $i => $seat) {
                    $a = $i < (int) $tier['strong_bots'] ? BotArranger::arrange($hands[$seat]) : self::casualArrange($hands[$seat]);
                    $arrangements[$seat] = ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back];
                }

                $game = PracticeGame::create([
                    'user_id' => $user->id,
                    'practice_match_id' => $match->id,
                    'round_number' => $round,
                    'banker' => (string) $bankerSeat,
                    'status' => PracticeGame::ARRANGING,
                    'tier' => $match->tier,
                    'bet' => $bet,
                    'bets' => $bets,
                    'request_id' => $requestId,
                    'server_seed' => $seed,
                    'deck_commitment' => Deck::commitment($seed, $deck),
                    'hands' => $hands,
                    'arrangements' => $arrangements,
                ]);

                if ($match->wagering) {
                    $this->reserve($user, $game);
                }

                return $game;
            });
        } catch (UniqueConstraintViolationException $e) {
            return ($requestId !== null ? $this->byRequest($user, $requestId) : null) ?? throw $e;
        }
    }

    // ------------------------------------------------------------------ play

    /**
     * @param  mixed  $front
     * @param  mixed  $middle
     * @param  mixed  $back
     */
    public function submit(User $user, PracticeGame $game, $front, $middle, $back): PracticeGame
    {
        return DB::transaction(function () use ($user, $game, $front, $middle, $back) {
            $game = $this->lockOpenRound($user, $game);

            try {
                $mine = ArrangementValidator::build($game->hands[self::PLAYER_SEAT], $front, $middle, $back);
            } catch (InvalidArrangementException $e) {
                throw new BusinessRuleException($e->getMessage(), 422, 'invalid_arrangement');
            }

            // A misplaced (fouled) arrangement is accepted and penalised in settlement:
            // it loses every lane against the banker / every opponent → 2 × bet each.

            return $this->settle($user, $game, $mine, null);
        });
    }

    /**
     * Declared Luck: the server checks the player's dealt cards for any ONE of
     * Three Flushes, No Face Cards or Six Pairs and settles the round at once:
     * a qualifying hand wins lucky_multiplier (2) × bet; a declaration that does
     * not qualify loses 2 × bet (as the banker: 2 × each player's bet). The round
     * is locked and settled once, so a declaration can never pay or charge twice.
     */
    public function declareLucky(User $user, PracticeGame $game): PracticeGame
    {
        return DB::transaction(function () use ($user, $game) {
            $game = $this->lockOpenRound($user, $game, luckyCheck: true);

            $hand = $game->hands[self::PLAYER_SEAT];
            $lucky = LuckyHand::detect($hand);

            // No qualifying combination: the declaration fails and costs double. Your cards are
            // shown in a sensible (non-fouled) arrangement in the reveal; they decide nothing.
            $game = $lucky
                ? $this->settle($user, $game, $lucky['arrangement'], $lucky['type'])
                : $this->settle($user, $game, AutoArranger::arrange($hand), null, failed: true);

            AuditLogger::log($user, $lucky ? 'practice.lucky_declared' : 'practice.lucky_failed', $game, null, [
                'lucky_type' => $lucky['type'] ?? null,
                'match_id' => $game->practice_match_id,
                'round' => $game->round_number,
                'bet' => (int) $game->bet,
                'player_net' => (int) $game->results['player_net'],
            ]);

            return $game;
        });
    }

    /**
     * Settle one round (inside the caller's transaction, round row locked).
     */
    private function settle(User $user, PracticeGame $game, Arrangement $mine, ?string $playerLucky, bool $failed = false): PracticeGame
    {
        /** @var PracticeMatch $match */
        $match = PracticeMatch::query()->whereKey($game->practice_match_id)->lockForUpdate()->firstOrFail();
        $stored = $game->arrangements;
        $stored[self::PLAYER_SEAT] = ['front' => $mine->front, 'middle' => $mine->middle, 'back' => $mine->back];
        $arrangements = [self::PLAYER_SEAT => $mine];
        $lucky = [self::PLAYER_SEAT => $playerLucky];

        // Bots declare their own Lucky Hands (checked on their dealt cards).
        foreach (array_keys(self::BOTS) as $seat) {
            $found = LuckyHand::detect($game->hands[$seat]);
            $lucky[$seat] = $found['type'] ?? null;
            $arrangements[$seat] = $found['arrangement'] ?? new Arrangement($stored[$seat]['front'], $stored[$seat]['middle'], $stored[$seat]['back']);
            $stored[$seat] = ['front' => $arrangements[$seat]->front, 'middle' => $arrangements[$seat]->middle, 'back' => $arrangements[$seat]->back];
        }

        $bankerSeat = (int) $game->banker;
        // Each non-banker's own bet (the banker has none and covers them all).
        $bets = [];
        foreach (self::seatBets($game) as $seat => $points) {
            $bets[$seat] = Points::toMinor($points);
        }

        // Round Bank with banker advantage: identical lanes go to the banker.
        $r = (new BankerRound(
            (array) config('pusoy.banker.settlement', BankerRound::DEFAULT_TABLE),
            (int) config('pusoy.banker.lucky_multiplier', 2),
            (int) config('pusoy.banker.reserve_multiplier', 2),
            0,
            (bool) config('pusoy.practice.banker_wins_ties', true),
        ))->settle($bankerSeat, $bets, $arrangements, [], $lucky, [self::PLAYER_SEAT => $failed]);

        $seats = [];
        foreach (self::SEATS as $seat) {
            $row = $seat === $bankerSeat ? $r['banker'] : $r['players'][$seat];
            $seats[$seat] = [
                'banker' => $seat === $bankerSeat,
                'bet' => $seat === $bankerSeat ? 0 : (int) (self::seatBets($game)[$seat] ?? 0),
                // vs the banker, from this seat's side (null for the banker and when a Lucky Hand decided)
                'lanes' => $seat === $bankerSeat ? null : $row['lanes'],
                'multiple' => $seat === $bankerSeat ? null : (int) $row['multiple'],
                'net' => (int) $row['net'],
                'is_foul' => (bool) $row['is_foul'],
                'lucky' => $lucky[$seat],
                'lucky_failed' => (bool) $row['lucky_failed'],
            ];
        }

        $playerNet = $seats[self::PLAYER_SEAT]['net'];

        if ($match->wagering && $game->reserve_status === 'held') {
            $this->payout($user, $game, $playerNet);
        }

        $game->forceFill([
            'status' => PracticeGame::COMPLETED,
            'arrangements' => $stored,
            'lucky_type' => $playerLucky,
            'lucky_declared_at' => $playerLucky || $failed ? now() : null,
            'results' => [
                'banker' => $bankerSeat,
                'seats' => $seats,
                'player_net' => $playerNet,
                // You declared Luck without a qualifying hand (2 × bet penalty).
                'lucky_failed' => $failed,
            ],
            'completed_at' => now(),
        ])->save();

        $match->forceFill(['rounds_played' => $match->rounds_played + 1, 'player_net' => $match->player_net + $playerNet])->save();

        if ($match->rounds_played >= $match->rounds_total) {
            $match->forceFill(['status' => PracticeMatch::COMPLETED, 'completed_at' => now()])->save();
        } elseif ($match->wagering && $match->currency === Currency::GD->value && $this->gold->isOutOfGold($user, $match)) {
            // Out of Gold: the session ends now, no further round can be dealt.
            $match->forceFill(['status' => PracticeMatch::OUT_OF_GOLD, 'completed_at' => now()])->save();
            AuditLogger::log($user, 'practice.out_of_gold', $match, null, ['round' => $game->round_number, 'gold' => Points::decimal($this->goldMinor($user))]);
        }

        if ($match->wagering && $match->currency === Currency::GD->value) {
            $this->gold->pushBalances($user);
        }

        return $game;
    }

    // ------------------------------------------------------------------ gold

    /** Move reserve_multiplier × bet from the player and from the house into escrow. */
    private function reserve(User $user, PracticeGame $game): void
    {
        // Worst case for the player: as banker, lose 2 × bet to each of the three bots; otherwise 2 × bet.
        // Your worst case: as banker, 2 × every bot's bet; otherwise 2 × your own bet.
        $covered = (int) $game->banker === self::PLAYER_SEAT ? array_sum(self::seatBets($game)) : (int) $game->bet;
        $amount = Points::toMinor($covered) * (int) config('pusoy.banker.reserve_multiplier', 2);
        $currency = self::currencyOf($game);
        $escrow = $this->wallets->escrow($currency);
        $label = "Single Player round {$game->round_number} (match #{$game->practice_match_id})";

        try {
            $this->transfer($currency, TransactionType::GameEntry, $this->wallets->for($user, $currency), $escrow, $amount, "{$label}: bet reserve", $user, "sp:{$game->id}:reserve:player");
        } catch (InsufficientBalanceException) {
            throw new BusinessRuleException('Not enough gold to cover this round (your worst case is reserved: 2 × bet, or 6 × bet as banker).', 422, 'insufficient_gold');
        }

        try {
            // Gold is free-play: the house reserve is issued; legacy CP rounds draw on the platform wallet.
            $this->transfer($currency, TransactionType::GameEntry, $currency === Currency::GD ? null : $this->wallets->platform($currency), $escrow, $amount, "{$label}: house reserve", $user, "sp:{$game->id}:reserve:house");
        } catch (InsufficientBalanceException) {
            throw new BusinessRuleException('The house bank cannot cover this bet right now.', 422, 'house_insufficient');
        }

        $game->forceFill(['player_reserve' => $amount, 'house_reserve' => $amount, 'reserve_status' => 'held'])->save();
    }

    /** Pay both reserves out of escrow after settlement (|net| ≤ reserve, so it always balances). */
    private function payout(User $user, PracticeGame $game, int $playerNet): void
    {
        $currency = self::currencyOf($game);
        $escrow = $this->wallets->escrow($currency);
        $toPlayer = $game->player_reserve + $playerNet;
        $toHouse = $game->house_reserve - $playerNet;
        $label = "Single Player round {$game->round_number} (match #{$game->practice_match_id})";

        if ($toPlayer > 0) {
            $this->transfer($currency, $playerNet > 0 ? TransactionType::GameReward : TransactionType::GameRefund, $escrow, $this->wallets->for($user, $currency), $toPlayer, "{$label}: payout (net ".Points::decimal($playerNet).')', $user, "sp:{$game->id}:payout:player");
        }

        if ($toHouse > 0) {
            $this->transfer($currency, TransactionType::GameRefund, $escrow, $this->wallets->platform($currency), $toHouse, "{$label}: house settlement", $user, "sp:{$game->id}:payout:house");
        }

        $game->forceFill(['reserve_status' => 'settled'])->save();
    }

    /** Return held reserves (abandoned round). */
    private function release(User $user, PracticeGame $game): void
    {
        $currency = self::currencyOf($game);
        $escrow = $this->wallets->escrow($currency);
        $label = "Single Player round {$game->round_number} (match #{$game->practice_match_id}) abandoned";

        $this->transfer($currency, TransactionType::GameRefund, $escrow, $this->wallets->for($user, $currency), $game->player_reserve, "{$label}: reserve returned", $user, "sp:{$game->id}:release:player");
        $this->transfer($currency, TransactionType::GameRefund, $escrow, $this->wallets->platform($currency), $game->house_reserve, "{$label}: house reserve returned", $user, "sp:{$game->id}:release:house");
        $game->forceFill(['reserve_status' => 'released'])->save();
    }

    private function transfer(Currency $currency, TransactionType $type, $source, $destination, int $amount, string $reason, User $user, string $key): void
    {
        $this->ledger->transfer(new TransferRequest(
            type: $type,
            currency: $currency,
            source: $source,
            destination: $destination,
            amount: $amount,
            reason: $reason,
            actor: $user,
            idempotencyKey: $key,
            relatedPlayerId: $user->id,
            metadata: ['single_player' => true],
        ));
    }

    private function abandon(PracticeMatch $match): void
    {
        foreach (PracticeGame::query()->where('practice_match_id', $match->id)->where('status', PracticeGame::ARRANGING)->lockForUpdate()->get() as $open) {
            if ($open->reserve_status === 'held') {
                $this->release($match->user, $open);
            }
            $open->forceFill(['status' => PracticeGame::ABANDONED])->save();
        }

        $match->forceFill(['status' => PracticeMatch::ABANDONED])->save();
    }

    // ------------------------------------------------------------------ helpers

    /** @return array<string, mixed> */
    private function tier(string $key): array
    {
        $tier = config("pusoy.practice.tiers.{$key}");

        if (! is_array($tier)) {
            throw new BusinessRuleException('Choose a valid difficulty level.', 422, 'invalid_tier');
        }

        return $tier;
    }

    /** @param  array<string, mixed>  $tier */
    private function assertGold(User $user, array $tier): void
    {
        if ($this->goldMinor($user) < Points::toMinor((int) $tier['min_gold'])) {
            throw new BusinessRuleException('You need at least '.number_format((int) $tier['min_gold'])." gold to play {$tier['name']}.", 422, 'insufficient_gold');
        }
    }

    /** The player's Gold (or a legacy match's CP) balance in minor units. */
    private function goldMinor(User $user, ?PracticeMatch $match = null): int
    {
        $currency = $match ? Currency::from($match->currency ?? Currency::GD->value) : Currency::GD;

        return (int) ($user->wallet($currency)?->balance ?? 0);
    }

    private static function currencyOf(PracticeGame $game): Currency
    {
        return Currency::from($game->match->currency ?? Currency::GD->value);
    }

    private function byRequest(User $user, string $requestId): ?PracticeGame
    {
        return PracticeGame::query()->where('user_id', $user->id)->where('request_id', $requestId)->first();
    }

    private function ownMatch(User $user, PracticeMatch $match): void
    {
        if ($match->user_id !== $user->id) {
            throw new BusinessRuleException('This is not your match.', 403, 'forbidden');
        }
    }

    private function lockOpenRound(User $user, PracticeGame $game, bool $luckyCheck = false): PracticeGame
    {
        /** @var PracticeGame $game */
        $game = PracticeGame::query()->whereKey($game->id)->lockForUpdate()->firstOrFail();

        if ($game->user_id !== $user->id) {
            throw new BusinessRuleException('This is not your round.', 403, 'forbidden');
        }

        if ($luckyCheck && $game->lucky_type !== null) {
            throw new BusinessRuleException('Luck was already declared for this hand.', 409, 'already_declared');
        }

        if ($game->status !== PracticeGame::ARRANGING || $game->practice_match_id === null) {
            throw new BusinessRuleException('This round is already finished.', 409, 'already_submitted');
        }

        return $game;
    }

    /**
     * Each non-banker seat's bet (Gold points); the banker has none. Rounds
     * stored before per-seat bets fall back to the single table bet.
     *
     * @return array<int, int>
     */
    public static function seatBets(PracticeGame $game): array
    {
        if (is_array($game->bets)) {
            $out = [];
            foreach ($game->bets as $seat => $bet) {
                $out[(int) $seat] = (int) $bet;
            }

            return $out;
        }

        return array_fill_keys(array_values(array_diff(self::SEATS, [(int) $game->banker])), (int) $game->bet);
    }

    /**
     * A bot's bet before the deal (it cannot see its cards yet): one of the
     * tier's options, usually the lower ones.
     *
     * @param  list<int>  $options
     */
    private static function botBet(array $options): int
    {
        sort($options);
        $roll = random_int(1, 100);

        return $options[$roll <= 50 ? 0 : ($roll <= 85 ? min(1, count($options) - 1) : count($options) - 1)];
    }

    /**
     * Lower the largest bets one option at a time until reserve_multiplier ×
     * their total fits $gold (or every bet is already the minimum).
     *
     * @param  array<int, int>  $bets
     * @param  list<int>  $options
     * @return array<int, int>
     */
    private static function fitBets(array $bets, array $options, int $gold): array
    {
        sort($options);
        $multiplier = (int) config('pusoy.banker.reserve_multiplier', 2);

        while ($multiplier * array_sum($bets) > $gold) {
            arsort($bets);
            $seat = array_key_first($bets);
            $index = array_search($bets[$seat], $options, true);

            if ($index === false || $index === 0) {
                break;
            }
            $bets[$seat] = $options[$index - 1];
        }
        ksort($bets);

        return $bets;
    }

    /**
     * Integrity check before a deal is saved: the shuffled deck is exactly the
     * 52 distinct cards, and the four hands hold 13 each with no duplicates or
     * missing cards. A failure aborts the deal (nothing is stored).
     *
     * @param  list<string>  $deck
     * @param  array<int, list<string>>  $hands
     */
    /**
     * The lanes of a misplaced (fouled) arrangement that are out of order with a neighbour:
     * Front stronger than Middle marks Front and Middle; Middle stronger than Back marks Middle and Back.
     *
     * @param  array{front: list<string>, middle: list<string>, back: list<string>}  $a
     * @return list<string>
     */
    public static function misplacedLanes(array $a): array
    {
        $order = ArrangementPreview::evaluate([...$a['front'], ...$a['middle'], ...$a['back']], $a)['order'];

        return array_keys(array_filter($order, fn (?bool $ok) => $ok === false));
    }

    /** The seat dealt the first card: the one immediately after the banker, clockwise. */
    public static function firstToDeal(int $bankerSeat): int
    {
        return ($bankerSeat % 4) + 1;
    }

    private static function assertFullDeal(array $deck, array $hands): void
    {
        $full = Deck::ordered();
        $sorted = $deck;
        sort($sorted);
        sort($full);
        $dealt = array_merge(...array_values($hands));
        sort($dealt);

        $ok = $sorted === $full && $dealt === $full && count($hands) === 4;
        foreach ($hands as $hand) {
            $ok = $ok && count($hand) === 13;
        }

        if (! $ok) {
            throw new \RuntimeException('Deal integrity check failed: the deck must be 52 distinct cards, 13 to each seat.');
        }
    }

    /**
     * A beginner-level bot: a random arrangement that is not fouled.
     *
     * @param  list<string>  $cards
     */
    public static function casualArrange(array $cards): Arrangement
    {
        for ($try = 0; $try < 400; $try++) {
            $deck = $cards;
            for ($i = count($deck) - 1; $i > 0; $i--) {
                $j = random_int(0, $i);
                [$deck[$i], $deck[$j]] = [$deck[$j], $deck[$i]];
            }
            $a = new Arrangement(array_slice($deck, 0, 3), array_slice($deck, 3, 5), array_slice($deck, 8, 5));

            if (! $a->isFoul()) {
                return $a;
            }
        }

        return AutoArranger::arrange($cards);
    }

    // ------------------------------------------------------------------ presentation

    private static function gold(int $minor): int
    {
        return intdiv($minor, Points::SCALE);
    }

    public static function seatName(int $seat): string
    {
        return $seat === self::PLAYER_SEAT ? 'You' : (self::BOTS[$seat] ?? 'Bot');
    }

    /**
     * One round as its owner may see it: their own cards always; the bots'
     * hands, results and the seed only once the round is settled.
     *
     * @return array<string, mixed>
     */
    public function present(PracticeGame $game): array
    {
        $done = $game->status === PracticeGame::COMPLETED;
        $res = $game->results ?? [];
        $bankerSeat = (int) $game->banker;
        $players = [];
        $bets = self::seatBets($game);

        foreach (self::SEATS as $seat) {
            $row = ['seat' => $seat, 'name' => self::seatName($seat), 'is_you' => $seat === self::PLAYER_SEAT, 'is_banker' => $seat === $bankerSeat, 'bet' => $bets[$seat] ?? 0];

            if ($done) {
                $a = $game->arrangements[$seat];
                $s = $res['seats'][$seat];
                $row += [
                    'front' => $a['front'],
                    'middle' => $a['middle'],
                    'back' => $a['back'],
                    'labels' => (new Arrangement($a['front'], $a['middle'], $a['back']))->labels(),
                    'is_foul' => (bool) $s['is_foul'],
                    // Misplaced hand: the lanes out of order with a neighbour (what the reveal's lightning strikes).
                    'misplaced' => $s['is_foul'] ? self::misplacedLanes($a) : [],
                    'lucky' => $s['lucky'] ? ['type' => $s['lucky'], 'label' => LuckyHand::LABELS[$s['lucky']] ?? $s['lucky']] : null,
                    // Lanes vs the banker from this seat's side: 1 win, -1 loss (null for the banker / Lucky Hands).
                    'lanes' => $s['lanes'],
                    'multiple' => $s['multiple'],
                    'gold' => self::gold((int) $s['net']),
                ];
            }

            $players[] = $row;
        }

        $match = $game->match;
        $me = $res['seats'][self::PLAYER_SEAT] ?? null;

        return [
            'id' => $game->id,
            'status' => $game->status,
            'round' => (int) $game->round_number,
            'rounds_total' => (int) ($match->rounds_total ?? 12),
            'banker' => $bankerSeat,
            'banker_name' => self::seatName($bankerSeat),
            'tier' => ['key' => $game->tier, 'name' => config("pusoy.practice.tiers.{$game->tier}.name", ucfirst((string) $game->tier))],
            // Your bet (0 when you bank: the banker places no bet and covers the others).
            'bet' => (int) $game->bet,
            'covered' => (int) $game->banker === self::PLAYER_SEAT ? array_sum(self::seatBets($game)) : 0,
            'wagering' => (bool) ($match->wagering ?? false),
            'reserved' => self::gold((int) $game->player_reserve),
            'cards' => $game->hands[self::PLAYER_SEAT],
            'players' => $players,
            'result' => $done && $me ? [
                'lanes' => $me['lanes'],
                // You submitted a misplaced (fouled) hand: the 2 × bet penalty was applied.
                'misplaced' => (bool) $me['is_foul'],
                // Failed Declared Luck: no qualifying hand, 2 × bet lost.
                'lucky_failed' => (bool) ($me['lucky_failed'] ?? false),
                'multiple' => $me['multiple'],
                'gold' => self::gold((int) $res['player_net']),
            ] : null,
            'lucky' => $game->lucky_type ? [
                'type' => $game->lucky_type,
                'label' => LuckyHand::LABELS[$game->lucky_type] ?? $game->lucky_type,
                'multiplier' => (int) config('pusoy.banker.lucky_multiplier', 2),
            ] : null,
            'deck_commitment' => $game->deck_commitment,
            'server_seed' => $done ? $game->server_seed : null,
            // Misplaced hands may be submitted; they pay the 2 × bet penalty.
            'allow_foul' => true,
            'completed_at' => $game->completed_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function presentMatch(PracticeMatch $match): array
    {
        $rounds = $match->rounds()->get();
        $open = $rounds->firstWhere('status', PracticeGame::ARRANGING);
        $next = $match->rounds_played + 1;
        $nextBanker = $match->status === PracticeMatch::ACTIVE && ! $open ? PracticeMatch::bankerFor($next) : null;
        $totals = array_fill_keys(self::SEATS, 0);

        $history = $rounds->where('status', PracticeGame::COMPLETED)->values()->map(function (PracticeGame $g) use (&$totals) {
            foreach ($g->results['seats'] ?? [] as $seat => $s) {
                $totals[(int) $seat] += (int) $s['net'];
            }
            $me = $g->results['seats'][self::PLAYER_SEAT] ?? [];

            return [
                'round' => (int) $g->round_number,
                'banker' => (int) $g->banker,
                'banker_name' => self::seatName((int) $g->banker),
                'bet' => (int) $g->bet,
                'covered' => (int) $g->banker === self::PLAYER_SEAT ? array_sum(self::seatBets($g)) : 0,
                'multiple' => $me['multiple'] ?? null,
                'gold' => self::gold((int) ($g->results['player_net'] ?? 0)),
                'lucky' => $me['lucky'] ?? null,
            ];
        })->all();

        return [
            'id' => $match->id,
            'status' => $match->status,
            'tier' => ['key' => $match->tier, 'name' => config("pusoy.practice.tiers.{$match->tier}.name", ucfirst($match->tier))],
            'rounds_total' => $match->rounds_total,
            'rounds_played' => $match->rounds_played,
            'next_round' => $nextBanker ? $next : null,
            'next_banker' => $nextBanker,
            'next_banker_name' => $nextBanker ? self::seatName($nextBanker) : null,
            'wagering' => $match->wagering,
            'currency' => $match->currency ?? Currency::GD->value,
            // Ended early because you ran out of Gold: leave Single Player (Home shows the free Gold Points claim).
            'out_of_gold' => $match->status === PracticeMatch::OUT_OF_GOLD,
            'gold_wallet' => $this->gold->state($match->user),
            'gold' => self::gold($match->player_net),
            // Running Gold per seat (you and the three bots).
            'standings' => array_map(fn (int $seat) => ['seat' => $seat, 'name' => self::seatName($seat), 'gold' => self::gold($totals[$seat])], self::SEATS),
            'history' => $history,
            'current' => $open ? $this->present($open) : null,
            'completed_at' => $match->completed_at?->toIso8601String(),
        ];
    }
}
