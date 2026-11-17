<?php

use App\Game\HandCategory;
use App\Game\HandEvaluator;
use App\Game\HandValue;

function evalHand(string $cards): HandValue
{
    return HandEvaluator::evaluate(explode(' ', $cards));
}

dataset('five card categories', [
    'royal flush' => ['AS KS QS JS TS', HandCategory::RoyalFlush],
    'straight flush' => ['9H 8H 7H 6H 5H', HandCategory::StraightFlush],
    'wheel straight flush' => ['5D 4D 3D 2D AD', HandCategory::StraightFlush],
    'four of a kind' => ['7C 7D 7H 7S KD', HandCategory::FourOfAKind],
    'full house' => ['QC QD QH 4S 4D', HandCategory::FullHouse],
    'flush' => ['AC 9C 7C 4C 2C', HandCategory::Flush],
    'straight' => ['TC 9D 8H 7S 6D', HandCategory::Straight],
    'wheel straight' => ['5C 4D 3H 2S AD', HandCategory::Straight],
    'broadway straight' => ['AC KD QH JS TD', HandCategory::Straight],
    'three of a kind' => ['8C 8D 8H KS 2D', HandCategory::ThreeOfAKind],
    'two pair' => ['JC JD 4H 4S AD', HandCategory::TwoPair],
    'one pair' => ['TC TD 9H 4S 2D', HandCategory::OnePair],
    'high card' => ['AC JD 9H 4S 2D', HandCategory::HighCard],
    'no wraparound straight' => ['QC KD AH 2S 3D', HandCategory::HighCard],
]);

test('five-card hands are categorised correctly', function (string $cards, HandCategory $expected) {
    expect(evalHand($cards)->category)->toBe($expected);
})->with('five card categories');

test('five-card ranking order is strictly descending', function () {
    $order = [
        'AS KS QS JS TS', '9H 8H 7H 6H 5H', '7C 7D 7H 7S KD', 'QC QD QH 4S 4D', 'AC 9C 7C 4C 2C',
        'TC 9D 8H 7S 6D', '8C 8D 8H KS 2D', 'JC JD 4H 4S AD', 'TC TD 9H 4S 2D', 'AC JD 9H 4S 2D',
    ];

    for ($i = 0; $i < count($order) - 1; $i++) {
        expect(evalHand($order[$i])->compare(evalHand($order[$i + 1])))->toBe(1);
    }
});

test('three-card front hands only rank trips, pair, high card', function () {
    expect(evalHand('9C 9D 9H')->category)->toBe(HandCategory::ThreeOfAKind)
        ->and(evalHand('9C 9D 2H')->category)->toBe(HandCategory::OnePair)
        ->and(evalHand('AC KC QC')->category)->toBe(HandCategory::HighCard) // no 3-card flush/straight
        ->and(evalHand('4C 3D 2H')->category)->toBe(HandCategory::HighCard)
        ->and(evalHand('2C 2D 2H')->compare(evalHand('AC AD KH')))->toBe(1)
        ->and(evalHand('2C 2D 3H')->compare(evalHand('AC KD QH')))->toBe(1);
});

test('kickers decide between equal categories', function () {
    expect(evalHand('AC AD KH 9S 2D')->compare(evalHand('AH AS QH JS TD')))->toBe(1) // pair A, K kicker > Q
        ->and(evalHand('KC KD 5H 5S 9D')->compare(evalHand('KH KS 5C 5D 8D')))->toBe(1) // two pair, kicker 9 > 8
        ->and(evalHand('KC KD 6H 6S 2D')->compare(evalHand('KH KS 5C 5D AD')))->toBe(1) // second pair 6 > 5
        ->and(evalHand('AC JC 9C 4C 3C')->compare(evalHand('AD JD 9D 4D 2D')))->toBe(1) // flush last kicker
        ->and(evalHand('8C 8D 8H 4S 4D')->compare(evalHand('7C 7D 7H AS AD')))->toBe(1) // full house by trips
        ->and(evalHand('9C 9D 9H 9S 2D')->compare(evalHand('9C 9D 9H 9S AD')))->toBe(-1) // quad kicker
        ->and(evalHand('AC AD 7H')->compare(evalHand('AH AS 6H')))->toBe(1); // front pair kicker
});

test('a wheel is the lowest straight', function () {
    expect(evalHand('5C 4D 3H 2S AD')->compare(evalHand('6C 5D 4H 3S 2D')))->toBe(-1)
        ->and(evalHand('AC KD QH JS TD')->compare(evalHand('KC QD JH TS 9D')))->toBe(1);
});

test('suits never break ties', function () {
    expect(evalHand('AC KD 9H 4S 2D')->compare(evalHand('AS KH 9D 4C 2H')))->toBe(0)
        ->and(evalHand('TC 9D 8H 7S 6D')->compare(evalHand('TS 9S 8D 7C 6H')))->toBe(0)
        ->and(evalHand('QC QD 3H')->compare(evalHand('QH QS 3C')))->toBe(0);
});

test('evaluation is deterministic regardless of card order', function () {
    expect(evalHand('2D KS 2C KD 9H')->compare(evalHand('KD 9H KS 2D 2C')))->toBe(0)
        ->and(evalHand('2D KS 2C KD 9H')->ranks)->toBe([13, 2, 9]);
});
