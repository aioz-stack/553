<?php

use App\Game\Arrangement;
use App\Game\AutoArranger;
use App\Game\Deck;
use App\Game\Scorer;

function arrangement(string $front, string $middle, string $back): Arrangement
{
    return new Arrangement(explode(' ', $front), explode(' ', $middle), explode(' ', $back));
}

test('each player gets nine pairwise comparisons and scores are zero-sum', function () {
    $hands = Deck::deal(Deck::shuffled(Deck::newSeed()));
    $arrangements = [];

    foreach ($hands as $seat => $cards) {
        $arrangements[$seat * 10] = AutoArranger::arrange($cards);
    }

    $result = (new Scorer)->score($arrangements);

    expect($result['comparisons'])->toHaveCount(36)
        ->and(array_sum($result['totals']))->toBe(0);

    foreach (array_keys($arrangements) as $id) {
        expect(array_filter($result['comparisons'], fn ($c) => $c['player'] === $id))->toHaveCount(9);
    }
});

test('scoring awards +1 win, -1 loss, 0 tie per hand', function () {
    $strong = arrangement('AC AD 2H', 'KC KD KH 3S 3D', 'QC QD QH QS 4C');
    $weak = arrangement('5C 6D 8H', '7C 7D 9H TS JD', '2C 2D 4H 4S 6C');
    $tieFront = arrangement('AH AS 2C', '9C 9D 9S 8C 8D', 'TC TD TH TS 5C');

    $result = (new Scorer)->score([1 => $strong, 2 => $weak, 3 => $tieFront, 4 => $weak]);

    $vs = fn (int $a, int $b) => array_sum(array_map(fn ($c) => $c['outcome'], array_filter($result['comparisons'], fn ($c) => $c['player'] === $a && $c['opponent'] === $b)));

    expect($vs(1, 2))->toBe(3)
        ->and($vs(2, 1))->toBe(-3)
        ->and($vs(2, 4))->toBe(0) // identical strength = ties
        ->and($vs(1, 3))->toBe(2) // front tie (AA2 vs AA2), middle win, back win
        ->and(array_sum($result['totals']))->toBe(0);
});

test('a fouled hand loses all three hands to every valid opponent', function () {
    $foul = arrangement('AC AD AH', '2C 3D 5H 7S 9D', 'KC KD 4H 6S 8C');
    $valid = arrangement('2D 3C 4D', '5C 5D 6H 7C 8D', 'TC TD TH JS JD');
    $valid2 = arrangement('2H 3H 4S', '6C 6D 7H 8H 9C', 'QC QD QH JC JH');

    $result = (new Scorer)->score([1 => $foul, 2 => $valid, 3 => $valid2, 4 => $foul]);

    expect($result['fouls'][1])->toBeTrue()
        ->and($result['totals'][1])->toBe(-6) // -3 vs each of two valid players, 0 vs other foul
        ->and($result['totals'][4])->toBe(-6)
        ->and(array_sum($result['totals']))->toBe(0);
});

test('forced fouls (timeout policy) are treated as fouls', function () {
    $a = arrangement('2D 3C 4D', '5C 5D 6H 7C 8D', 'TC TD TH JS JD');
    $b = arrangement('2H 3H 4S', '6C 6D 7H 8H 9C', 'QC QD QH JC JH');

    $result = (new Scorer)->score([1 => $a, 2 => $b], [1 => true]);

    expect($result['totals'][1])->toBe(-3)->and($result['totals'][2])->toBe(3);
});
