<?php

namespace App\Game\Banker;

use App\Game\Arrangement;
use App\Game\Scorer;

/**
 * Pure settlement maths for one banker-mode round (Round Bank and Banker Mode).
 *
 * Each player plays only against the banker. Their Front, Middle and Back are
 * compared with the banker's same lane (win / loss / tie). The lane tally is
 * looked up in the settlement table (multiples of the player's bet):
 *
 *   3 wins = +2, 3 losses = -2, 2 wins 1 loss = +1, 1 win 2 losses = -1,
 *   anything containing a tie = 0 (default; see config('pusoy.banker.settlement')).
 *
 * Banker advantage (optional, $bankerWinsTies): an identical lane is won by
 * the banker instead of tying, so every lane has a winner.
 *
 * Fouls: a fouled hand loses every lane against a valid hand; two fouled
 * hands tie every lane.
 *
 * Lucky Hands replace the lane comparison: a lucky player vs a non-lucky
 * banker wins `luckyMultiplier` × bet; a lucky banker vs a non-lucky player
 * wins the same from that player; both lucky = 0.
 *
 * Failed Declared Luck ($failed): a seat that declared Luck without a
 * qualifying hand loses `luckyMultiplier` × bet in every pairing it is in
 * (as a player: to the banker; as the banker: to each player), whatever the
 * other hands are.
 *
 * Money: player and banker each reserved 2 × bet in escrow for every bet, so
 * escrow always covers the worst case. The platform fee is `feeBps` of each
 * positive net win (player or banker), taken from the winner's payout.
 * Σ payouts + Σ fees = Σ reserves (exactly zero-sum, integer minor units).
 */
final class BankerRound
{
    public const DEFAULT_TABLE = [
        '3-0-0' => 2,
        '0-3-0' => -2,
        '2-1-0' => 1,
        '1-2-0' => -1,
    ];

    /**
     * @param  array<string, int>  $table  "wins-losses-ties" => bet multiple; missing keys = 0
     */
    public function __construct(
        private readonly array $table = self::DEFAULT_TABLE,
        private readonly int $luckyMultiplier = 2,
        private readonly int $reserveMultiplier = 2,
        private readonly int $feeBps = 0,
        // Banker advantage: an identical (equal-strength) lane, or two fouled hands, goes to the banker instead of a tie.
        private readonly bool $bankerWinsTies = false,
    ) {}

    /**
     * @param  array<int, int>  $bets  playerId => bet (minor units); excludes the banker
     * @param  array<int, Arrangement>  $arrangements  includes the banker
     * @param  array<int, bool>  $fouls
     * @param  array<int, string|null>  $lucky  userId => lucky type
     * @param  array<int, bool>  $failed  userId => declared Luck without a qualifying hand
     * @return array{players: array<int, array<string, mixed>>, banker: array<string, mixed>}
     */
    public function settle(int $bankerId, array $bets, array $arrangements, array $fouls = [], array $lucky = [], array $failed = []): array
    {
        $banker = $arrangements[$bankerId];
        $bankerFailed = (bool) ($failed[$bankerId] ?? false);
        $bankerLucky = $bankerFailed ? null : ($lucky[$bankerId] ?? null);
        $bankerFoul = ! $bankerFailed && $bankerLucky === null && (($fouls[$bankerId] ?? false) || $banker->isFoul());
        $players = [];
        $bankerGross = 0;
        $bankerReserve = 0;

        foreach ($bets as $playerId => $bet) {
            $mine = $arrangements[$playerId];
            $myFailed = (bool) ($failed[$playerId] ?? false);
            $myLucky = $myFailed ? null : ($lucky[$playerId] ?? null);
            $myFoul = ! $myFailed && $myLucky === null && (($fouls[$playerId] ?? false) || $mine->isFoul());
            $lanes = null;
            $luckyWin = false;

            if ($myFailed || $bankerFailed) {
                // A failed declaration loses double in this pairing.
                $multiple = $myFailed ? -$this->luckyMultiplier : $this->luckyMultiplier;
            } elseif ($myLucky !== null || $bankerLucky !== null) {
                $multiple = match (true) {
                    $myLucky !== null && $bankerLucky !== null => 0,
                    $myLucky !== null => $this->luckyMultiplier,
                    default => -$this->luckyMultiplier,
                };
                $luckyWin = $myLucky !== null && $multiple > 0;
            } else {
                $lanes = [];

                foreach (Scorer::POSITIONS as $position) {
                    $lanes[$position] = match (true) {
                        $myFoul && $bankerFoul => $this->bankerWinsTies ? -1 : 0,
                        $myFoul => -1,
                        $bankerFoul => 1,
                        default => $this->laneOutcome($mine->value($position)->compare($banker->value($position))),
                    };
                }

                $multiple = $this->multiple($lanes);
            }

            $reserve = $bet * $this->reserveMultiplier;
            $gross = $multiple * $bet;
            $fee = $gross > 0 ? intdiv($gross * $this->feeBps, 10000) : 0;

            $players[$playerId] = [
                'bet' => $bet,
                'reserve' => $reserve,
                'lanes' => $lanes,
                'multiple' => $multiple,
                'gross' => $gross,
                'fee' => $fee,
                'payout' => $reserve + $gross - $fee,
                'net' => $gross - $fee,
                'is_foul' => $myFoul,
                'lucky_type' => $myLucky,
                'lucky_bonus' => $luckyWin ? $gross : 0,
                'lucky_failed' => $myFailed,
            ];

            $bankerGross -= $gross;
            $bankerReserve += $reserve;
        }

        $bankerFee = $bankerGross > 0 ? intdiv($bankerGross * $this->feeBps, 10000) : 0;
        $bankerLuckyBonus = $bankerLucky !== null
            ? array_sum(array_map(fn (array $p) => $p['lucky_type'] === null ? -$p['gross'] : 0, $players))
            : 0;

        return [
            'players' => $players,
            'banker' => [
                'reserve' => $bankerReserve,
                'gross' => $bankerGross,
                'fee' => $bankerFee,
                'payout' => $bankerReserve + $bankerGross - $bankerFee,
                'net' => $bankerGross - $bankerFee,
                'is_foul' => $bankerFoul,
                'lucky_type' => $bankerLucky,
                'lucky_bonus' => max(0, $bankerLuckyBonus),
                'lucky_failed' => $bankerFailed,
            ],
        ];
    }

    /** Player-vs-banker lane result from a strength comparison (ties go to the banker when enabled). */
    private function laneOutcome(int $cmp): int
    {
        if ($cmp === 0) {
            return $this->bankerWinsTies ? -1 : 0;
        }

        return $cmp > 0 ? 1 : -1;
    }

    /**
     * @param  array<string, int>  $lanes  position => 1 / 0 / -1
     */
    public function multiple(array $lanes): int
    {
        $wins = count(array_filter($lanes, fn (int $o) => $o > 0));
        $losses = count(array_filter($lanes, fn (int $o) => $o < 0));
        $ties = count($lanes) - $wins - $losses;

        return (int) ($this->table["{$wins}-{$losses}-{$ties}"] ?? 0);
    }
}
