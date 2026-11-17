<?php

namespace App\Game;

/**
 * Zero-sum pairwise scorer.
 *
 * Each player's Front, Middle and Back is compared with the same hand of
 * each of the three opponents: 3 hands × 3 opponents = 9 comparisons each.
 * Win = +1, Loss = -1, Tie (equal strength) = 0. No royalties, scoop or
 * special-hand bonuses.
 *
 * Foul rule (documented, configurable later): a fouled arrangement loses all
 * three comparisons against every non-fouled opponent. Two fouled players
 * tie all three comparisons against each other (0).
 */
final class Scorer
{
    public const POSITIONS = ['front', 'middle', 'back'];

    public function __construct(
        private readonly int $win = 1,
        private readonly int $loss = -1,
        private readonly int $tie = 0,
    ) {}

    /**
     * @param  array<int, Arrangement>  $arrangements  playerId => arrangement
     * @param  array<int, bool>  $forcedFouls  playerId => true to treat as fouled (e.g. timeout policy "foul")
     * @return array{totals: array<int, int>, comparisons: list<array{player: int, opponent: int, position: string, outcome: int}>, fouls: array<int, bool>}
     */
    public function score(array $arrangements, array $forcedFouls = []): array
    {
        $fouls = [];

        foreach ($arrangements as $id => $arrangement) {
            $fouls[$id] = $arrangement->isFoul() || ($forcedFouls[$id] ?? false);
        }

        $totals = array_fill_keys(array_keys($arrangements), 0);
        $comparisons = [];

        foreach ($arrangements as $playerId => $mine) {
            foreach ($arrangements as $opponentId => $theirs) {
                if ($playerId === $opponentId) {
                    continue;
                }

                foreach (self::POSITIONS as $position) {
                    $outcome = $this->outcome($mine, $theirs, $fouls[$playerId], $fouls[$opponentId], $position);
                    $totals[$playerId] += $outcome;
                    $comparisons[] = [
                        'player' => $playerId,
                        'opponent' => $opponentId,
                        'position' => $position,
                        'outcome' => $outcome,
                    ];
                }
            }
        }

        return ['totals' => $totals, 'comparisons' => $comparisons, 'fouls' => $fouls];
    }

    private function outcome(Arrangement $mine, Arrangement $theirs, bool $iFouled, bool $theyFouled, string $position): int
    {
        if ($iFouled && $theyFouled) {
            return $this->tie;
        }

        if ($iFouled) {
            return $this->loss;
        }

        if ($theyFouled) {
            return $this->win;
        }

        return match ($mine->value($position)->compare($theirs->value($position)) <=> 0) {
            1 => $this->win,
            -1 => $this->loss,
            0 => $this->tie,
        };
    }
}
