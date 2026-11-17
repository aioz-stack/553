<?php

namespace App\Game;

use App\Game\Exceptions\InvalidArrangementException;

/**
 * Validates that a submitted arrangement uses exactly the dealt 13 cards
 * (3 / 5 / 5, no duplicates, no foreign cards).
 */
final class ArrangementValidator
{
    /**
     * @param  list<string>  $dealt
     * @param  mixed  $front
     * @param  mixed  $middle
     * @param  mixed  $back
     *
     * @throws InvalidArrangementException
     */
    public static function build(array $dealt, $front, $middle, $back): Arrangement
    {
        foreach (['front' => [$front, 3], 'middle' => [$middle, 5], 'back' => [$back, 5]] as $name => [$hand, $size]) {
            if (! is_array($hand) || count($hand) !== $size || array_filter($hand, fn ($c) => ! Card::isValidCode($c)) !== []) {
                throw new InvalidArrangementException("The {$name} hand must contain exactly {$size} valid cards.");
            }
        }

        $submitted = [...$front, ...$middle, ...$back];

        if (count(array_unique($submitted)) !== 13) {
            throw new InvalidArrangementException('Each card may be used only once.');
        }

        $expected = $dealt;
        sort($expected);
        sort($submitted);

        if ($expected !== $submitted) {
            throw new InvalidArrangementException('The arrangement must use exactly the cards you were dealt.');
        }

        return new Arrangement(array_values($front), array_values($middle), array_values($back));
    }
}
