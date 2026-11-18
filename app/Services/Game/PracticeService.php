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
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Single Player practice: the player against three server bots.
 *
 * Same deck, shuffle commitment, validation, foul rule and pairwise ±1
 * scoring as a classic table, but no currency: nothing here reads or writes
 * wallets, the ledger, XP, leaderboards or commissions. The bots arrange
 * with the server's AutoArranger at deal time; their hands stay hidden until
 * the player submits.
 */
class PracticeService
{
    public const PLAYER_SEAT = 1;

    /** seat => display name */
    public const BOTS = [2 => 'LuckyBot', 3 => 'CardBot', 4 => 'AceBot'];

    public function start(User $user): PracticeGame
    {
        return DB::transaction(function () use ($user) {
            PracticeGame::query()->where('user_id', $user->id)->where('status', PracticeGame::ARRANGING)
                ->update(['status' => PracticeGame::ABANDONED]);

            $seed = Deck::newSeed();
            $deck = Deck::shuffled($seed);
            $hands = Deck::deal($deck);
            $arrangements = [];

            foreach (array_keys(self::BOTS) as $seat) {
                $a = AutoArranger::arrange($hands[$seat]);
                $arrangements[$seat] = ['front' => $a->front, 'middle' => $a->middle, 'back' => $a->back];
            }

            return PracticeGame::create([
                'user_id' => $user->id,
                'status' => PracticeGame::ARRANGING,
                'server_seed' => $seed,
                'deck_commitment' => Deck::commitment($seed, $deck),
                'hands' => $hands,
                'arrangements' => $arrangements,
            ]);
        });
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
                ];
            }

            $players[] = $row;
        }

        return [
            'id' => $game->id,
            'status' => $game->status,
            'cards' => $game->hands[self::PLAYER_SEAT],
            'players' => $players,
            'deck_commitment' => $game->deck_commitment,
            'server_seed' => $done ? $game->server_seed : null,
            'allow_foul' => true,
            'completed_at' => $game->completed_at?->toIso8601String(),
        ];
    }
}
