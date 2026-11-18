<?php

namespace App\Services\Game;

use App\Exceptions\BusinessRuleException;
use App\Game\Arrangement;
use App\Game\ArrangementValidator;
use App\Game\AutoArranger;
use App\Game\Deck;
use App\Game\Exceptions\InvalidArrangementException;
use App\Game\Scorer;
use App\Models\PracticeGame;
use App\Enums\Currency;
use App\Models\User;
use App\Support\Points;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Single Player practice: the player against three server bots.
 *
 * Same deck, shuffle commitment, validation, foul rule and pairwise ±1
 * scoring as a classic table, but no currency: nothing here writes
 * wallets, the ledger, XP, leaderboards or commissions (the CP balance is only
 * read to check a difficulty tier's minimum gold). The bots arrange
 * at deal time (tier-dependent: strong bots use AutoArranger, casual bots a
 * random non-fouled hand); their hands stay hidden until
 * the player submits.
 */
class PracticeService
{
    public const PLAYER_SEAT = 1;

    /** seat => display name */
    public const BOTS = [2 => 'LuckyBot', 3 => 'CardBot', 4 => 'AceBot'];

    /**
     * The difficulty tiers with the player's eligibility for each.
     *
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

    /**
     * Start a new deal at the chosen tier. The bet is optional (the picker shows
     * bets as information only) and defaults to the tier's lowest bet. The tier/bet are
     * validated here (never trusted from the client), and the player's CP
     * balance must meet the tier's minimum — it is only read, never charged.
     *
     * A repeated $requestId (double tap, network retry) returns the deal it
     * already created instead of starting another one.
     */
    public function start(User $user, string $tierKey, ?int $bet, ?string $requestId = null): PracticeGame
    {
        if ($requestId !== null && ($existing = $this->byRequest($user, $requestId))) {
            return $existing;
        }

        $tier = config("pusoy.practice.tiers.{$tierKey}");

        if (! is_array($tier)) {
            throw new BusinessRuleException('Choose a valid difficulty level.', 422, 'invalid_tier');
        }

        $bet ??= min(array_map('intval', $tier['bets']));

        if (! in_array($bet, array_map('intval', $tier['bets']), true)) {
            throw new BusinessRuleException("That bet is not offered at {$tier['name']}.", 422, 'invalid_bet');
        }

        try {
            return DB::transaction(function () use ($user, $tierKey, $tier, $bet, $requestId) {
                // Serialise starts per player so two taps can never leave two open deals.
                User::query()->whereKey($user->id)->lockForUpdate()->first();

                if ($this->goldMinor($user) < Points::toMinor((int) $tier['min_gold'])) {
                    throw new BusinessRuleException('You need at least '.number_format((int) $tier['min_gold'])." gold to play {$tier['name']}.", 422, 'insufficient_gold');
                }

                PracticeGame::query()->where('user_id', $user->id)->where('status', PracticeGame::ARRANGING)
                    ->update(['status' => PracticeGame::ABANDONED]);

                $seed = Deck::newSeed();
                $deck = Deck::shuffled($seed);
                $hands = Deck::deal($deck);
                $arrangements = [];
                $strong = (int) $tier['strong_bots'];

                foreach (array_keys(self::BOTS) as $i => $seat) {
                    // Strong bots fill the highest seats first.
                    $a = $i >= count(self::BOTS) - $strong ? AutoArranger::arrange($hands[$seat]) : self::casualArrange($hands[$seat]);
                    $arrangements[$seat] = ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back];
                }

                return PracticeGame::create([
                    'user_id' => $user->id,
                    'status' => PracticeGame::ARRANGING,
                    'tier' => $tierKey,
                    'bet' => $bet,
                    'request_id' => $requestId,
                    'server_seed' => $seed,
                    'deck_commitment' => Deck::commitment($seed, $deck),
                    'hands' => $hands,
                    'arrangements' => $arrangements,
                ]);
            });
        } catch (UniqueConstraintViolationException $e) {
            // A concurrent request with the same id won the race; return its deal.
            return $this->byRequest($user, (string) $requestId) ?? throw $e;
        }
    }

    private function byRequest(User $user, string $requestId): ?PracticeGame
    {
        return PracticeGame::query()->where('user_id', $user->id)->where('request_id', $requestId)->first();
    }

    private function goldMinor(User $user): int
    {
        return (int) ($user->wallet(Currency::CP)?->balance ?? 0);
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

    /**
     * @param  mixed  $front
     * @param  mixed  $middle
     * @param  mixed  $back
     */
    public function submit(User $user, PracticeGame $game, $front, $middle, $back, bool $allowFoul = true): PracticeGame
    {
        return DB::transaction(function () use ($user, $game, $front, $middle, $back, $allowFoul) {
            /** @var PracticeGame $game */
            $game = PracticeGame::query()->whereKey($game->id)->lockForUpdate()->firstOrFail();

            if ($game->user_id !== $user->id) {
                throw new BusinessRuleException('This is not your practice game.', 403, 'forbidden');
            }

            if ($game->status !== PracticeGame::ARRANGING) {
                throw new BusinessRuleException('This practice game is already finished.', 409, 'already_submitted');
            }

            try {
                $mine = ArrangementValidator::build($game->hands[self::PLAYER_SEAT], $front, $middle, $back);
            } catch (InvalidArrangementException $e) {
                throw new BusinessRuleException($e->getMessage(), 422, 'invalid_arrangement');
            }

            if (! $allowFoul && $mine->isFoul()) {
                throw new BusinessRuleException('Foul: Back must be at least as strong as Middle, and Middle at least as strong as Front.', 422, 'foul');
            }

            $arrangements = [self::PLAYER_SEAT => $mine];
            $stored = $game->arrangements;
            $stored[self::PLAYER_SEAT] = ['front' => $mine->front, 'middle' => $mine->middle, 'back' => $mine->back];

            foreach (array_keys(self::BOTS) as $seat) {
                $arrangements[$seat] = new Arrangement($stored[$seat]['front'], $stored[$seat]['middle'], $stored[$seat]['back']);
            }

            $result = (new Scorer((int) config('pusoy.game.score_win', 1), (int) config('pusoy.game.score_loss', -1), (int) config('pusoy.game.score_tie', 0)))->score($arrangements);

            $vsYou = [];
            foreach ($result['comparisons'] as $row) {
                if ($row['opponent'] === self::PLAYER_SEAT) {
                    // Outcome from the bot's side; flip so it reads "you vs bot".
                    $vsYou[$row['player']][$row['position']] = -$row['outcome'];
                }
            }

            $game->forceFill([
                'status' => PracticeGame::COMPLETED,
                'arrangements' => $stored,
                'results' => [
                    'totals' => $result['totals'],
                    'fouls' => $result['fouls'],
                    'placements' => array_map(fn (int $t) => 1 + count(array_filter($result['totals'], fn (int $o) => $o > $t)), $result['totals']),
                    'vs_you' => $vsYou,
                ],
                'completed_at' => now(),
            ])->save();

            return $game;
        });
    }

    /**
     * What the owner may see: their own cards always; bots' hands, scores and
     * the server seed only once the game is completed.
     *
     * @return array<string, mixed>
     */
    public function present(PracticeGame $game): array
    {
        $done = $game->status === PracticeGame::COMPLETED;
        $players = [];

        foreach ([self::PLAYER_SEAT => 'You'] + self::BOTS as $seat => $name) {
            $row = ['seat' => $seat, 'name' => $name, 'is_you' => $seat === self::PLAYER_SEAT];

            if ($done) {
                $a = $game->arrangements[$seat];
                $row += [
                    'front' => $a['front'],
                    'middle' => $a['middle'],
                    'back' => $a['back'],
                    'labels' => (new Arrangement($a['front'], $a['middle'], $a['back']))->labels(),
                    'is_foul' => (bool) $game->results['fouls'][$seat],
                    'score' => (int) $game->results['totals'][$seat],
                    'placement' => (int) $game->results['placements'][$seat],
                    'vs_you' => $game->results['vs_you'][$seat] ?? null,
                    // Score × bet, for display only: nothing is charged or paid.
                    'stake_result' => (int) $game->results['totals'][$seat] * (int) $game->bet,
                ];
            }

            $players[] = $row;
        }

        return [
            'id' => $game->id,
            'status' => $game->status,
            'tier' => [
                'key' => $game->tier,
                'name' => config("pusoy.practice.tiers.{$game->tier}.name", ucfirst((string) $game->tier)),
            ],
            'bet' => (int) $game->bet,
            'cards' => $game->hands[self::PLAYER_SEAT],
            'players' => $players,
            'deck_commitment' => $game->deck_commitment,
            'server_seed' => $done ? $game->server_seed : null,
            'allow_foul' => true,
            'completed_at' => $game->completed_at?->toIso8601String(),
        ];
    }
}
