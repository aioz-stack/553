<?php

namespace App\Game;

/**
 * Bot strategy for arranging 13 cards (server-side only, deterministic, never fouls).
 *
 * 1. Every five-card hand of the 13 (1,287) and every three-card hand (286) is
 *    evaluated once and encoded as one integer strength (category, then the
 *    tie-break ranks), so lane order checks are integer comparisons with
 *    exactly the HandValue rules: Back ≥ Middle ≥ Front.
 * 2. The search is exhaustive: every Back, every Middle of the 8 cards left
 *    and the last 3 as Front — all ~72,000 splits. Fouled splits are skipped.
 * 3. Each lane's chance of beating an opponent's same lane comes from
 *    BotStrength: measured percentiles of real bot arrangements (self-play,
 *    `php artisan pusoy:calibrate-bots`), not guesses.
 * 4. The bot keeps the split with the highest expected Round Bank result,
 *    using the settlement table (3-0 = +2 ×, 2-1 = +1 ×, 1-2 = −1 ×,
 *    0-3 = −2 ×, config pusoy.banker.settlement), lanes treated as
 *    independent. Ties go to the stronger Back, then Middle, then Front.
 *
 * Declared Luck (Three Flushes, No Face Cards, Six Pairs) is checked
 * separately by the game services before this arrangement is used.
 */
final class BotArranger
{
    private const BASE = 15;

    /** @var list<list<int>>|null 5-of-8 index patterns */
    private static ?array $middlePatterns = null;

    /**
     * @param  list<string>  $cards  13 distinct cards
     */
    public static function arrange(array $cards): Arrangement
    {
        $cards = array_values($cards);

        if (count($cards) !== 13) {
            return AutoArranger::arrange($cards);
        }

        $payoff = self::payoffTable();
        $five = [];   // mask => [strength, P(win as Middle), P(win as Back)]
        $three = [];  // mask => [strength, P(win as Front)]

        foreach (self::masks(13, 5) as $mask) {
            $s = self::strength(HandEvaluator::evaluate(self::pick($cards, $mask)));
            $five[$mask] = [$s, BotStrength::chance('middle', $s), BotStrength::chance('back', $s)];
        }
        foreach (self::masks(13, 3) as $mask) {
            $s = self::strength(HandEvaluator::evaluate(self::pick($cards, $mask)));
            $three[$mask] = [$s, BotStrength::chance('front', $s)];
        }

        $patterns = self::$middlePatterns ??= self::patterns();
        $full = (1 << 13) - 1;
        $best = null;
        $bestKey = null;

        foreach ($five as $backMask => [$backS, , $pBack]) {
            $restBits = [];
            for ($i = 0, $rest = $full & ~$backMask; $i < 13; $i++) {
                if ($rest & (1 << $i)) {
                    $restBits[] = 1 << $i;
                }
            }

            foreach ($patterns as $pattern) {
                $midMask = $restBits[$pattern[0]] | $restBits[$pattern[1]] | $restBits[$pattern[2]] | $restBits[$pattern[3]] | $restBits[$pattern[4]];
                [$midS, $pMid] = $five[$midMask];

                if ($midS > $backS) {
                    continue;
                }

                $frontMask = $rest & ~$midMask;
                [$frontS, $pFront] = $three[$frontMask];

                // Front vs Middle compares only the ranks both hands have (HandValue::compare); the 0-padded
                // Front strength is above the Middle's exactly when an overlapping rank is higher (a foul).
                if ($frontS > $midS) {
                    continue;
                }

                $ev = self::expected($pFront, $pMid, $pBack, $payoff);
                $key = [$ev, $backS, $midS, $frontS];

                if ($bestKey === null || self::better($key, $bestKey)) {
                    $bestKey = $key;
                    $best = [$frontMask, $midMask, $backMask];
                }
            }
        }

        if ($best === null) {
            return AutoArranger::arrange($cards);
        }

        return new Arrangement(self::pick($cards, $best[0]), self::pick($cards, $best[1]), self::pick($cards, $best[2]));
    }

    /**
     * Expected result (in bets) of a split vs one opponent, from the three lane win chances.
     *
     * @param  array<int, float>  $payoff  lanes won (0-3) => multiple
     */
    public static function expected(float $pFront, float $pMid, float $pBack, array $payoff): float
    {
        $ev = 0.0;
        foreach ([0, 1] as $f) {
            foreach ([0, 1] as $m) {
                foreach ([0, 1] as $b) {
                    $p = ($f ? $pFront : 1 - $pFront) * ($m ? $pMid : 1 - $pMid) * ($b ? $pBack : 1 - $pBack);
                    $ev += $p * $payoff[$f + $m + $b];
                }
            }
        }

        return $ev;
    }

    /** Expected result of an arrangement (for tests and analysis). */
    public static function score(Arrangement $a): float
    {
        return self::expected(
            BotStrength::chance('front', self::strength($a->frontValue)),
            BotStrength::chance('middle', self::strength($a->middleValue)),
            BotStrength::chance('back', self::strength($a->backValue)),
            self::payoffTable(),
        );
    }

    /**
     * One integer per hand: category, then up to five tie-break ranks (0-padded).
     * Same lane: bigger = stronger, equal = tie (exactly HandValue::compare).
     */
    public static function strength(HandValue $v): int
    {
        $n = $v->category->value;
        for ($i = 0; $i < 5; $i++) {
            $n = $n * self::BASE + ($v->ranks[$i] ?? 0);
        }

        return $n;
    }

    /** @return array<int, float> lanes won (0-3) => multiple of the bet */
    private static function payoffTable(): array
    {
        $default = ['3-0-0' => 2, '2-1-0' => 1, '1-2-0' => -1, '0-3-0' => -2];
        // Outside the framework (pure unit tests, tools) the standard Round Bank table applies.
        $table = function_exists('app') && app()->bound('config') ? (array) config('pusoy.banker.settlement', $default) : $default;
        $out = [];
        foreach ([0, 1, 2, 3] as $wins) {
            $out[$wins] = (float) ($table["{$wins}-".(3 - $wins).'-0'] ?? $default["{$wins}-".(3 - $wins).'-0']);
        }

        return $out;
    }

    /** @param  array{0: float, 1: int, 2: int, 3: int}  $a */
    private static function better(array $a, array $b): bool
    {
        if (abs($a[0] - $b[0]) > 1e-9) {
            return $a[0] > $b[0];
        }

        return [$a[1], $a[2], $a[3]] > [$b[1], $b[2], $b[3]];
    }

    /**
     * @param  list<string>  $cards
     * @return list<string>
     */
    private static function pick(array $cards, int $mask): array
    {
        $out = [];
        foreach ($cards as $i => $card) {
            if ($mask & (1 << $i)) {
                $out[] = $card;
            }
        }

        return $out;
    }

    /** @return list<int> every $k-bit mask of $n bits */
    private static function masks(int $n, int $k): array
    {
        $out = [];
        for ($m = 0; $m < (1 << $n); $m++) {
            if (substr_count(decbin($m), '1') === $k) {
                $out[] = $m;
            }
        }

        return $out;
    }

    /** @return list<list<int>> every 5-of-8 index pattern */
    private static function patterns(): array
    {
        $out = [];
        foreach (self::masks(8, 5) as $m) {
            $idx = [];
            for ($i = 0; $i < 8; $i++) {
                if ($m & (1 << $i)) {
                    $idx[] = $i;
                }
            }
            $out[] = $idx;
        }

        return $out;
    }
}
