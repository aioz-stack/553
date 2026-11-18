<?php

namespace App\Game;

/**
 * Evaluates a partial or full arrangement for UI hints (hand names, a foul
 * warning and, per lane, whether it is in valid order with its neighbours).
 * Cards not in the dealt hand are ignored. Pure; stores nothing.
 */
final class ArrangementPreview
{
    /**
     * @param  list<string>  $dealt
     * @param  array{front?: list<string>, middle?: list<string>, back?: list<string>}  $rows
     * @return array{labels: array{front: ?string, middle: ?string, back: ?string}, complete: bool, is_foul: bool, order: array{front: ?bool, middle: ?bool, back: ?bool}}
     */
    public static function evaluate(array $dealt, array $rows): array
    {
        $labels = [];
        $values = [];

        foreach (['front' => 3, 'middle' => 5, 'back' => 5] as $position => $size) {
            $cards = array_values(array_unique(array_intersect($rows[$position] ?? [], $dealt)));
            $values[$position] = count($cards) === $size ? HandEvaluator::evaluate($cards) : null;
            $labels[$position] = $values[$position]?->label();
        }

        $complete = ! in_array(null, $values, true);
        $midOverFront = $values['middle'] && $values['front'] ? $values['middle']->compare($values['front']) >= 0 : null;
        $backOverMid = $values['back'] && $values['middle'] ? $values['back']->compare($values['middle']) >= 0 : null;
        $foul = $complete && (! $backOverMid || ! $midOverFront);

        return [
            'labels' => $labels,
            'complete' => $complete,
            'is_foul' => $foul,
            // true = in order with its neighbours, false = out of order, null = not enough cards yet.
            'order' => [
                'front' => $midOverFront,
                'middle' => $midOverFront === null || $backOverMid === null ? null : ($midOverFront && $backOverMid),
                'back' => $backOverMid,
            ],
        ];
    }
}
