<?php

use App\Game\LuckyHand;

test('six pairs qualifies, counting trips as one pair and quads as two', function () {
    expect(LuckyHand::detect(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'KS', 'AC'])['type'])->toBe('six_pairs')
        // 4 pairs + quads (= 2 pairs) + 1 card
        ->and(LuckyHand::isSixPairs(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'JH', 'JS', 'AC']))->toBeTrue()
        // five pairs + trips = six pairs
        ->and(LuckyHand::isSixPairs(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'KS', 'KC']))->toBeTrue()
        // only five pairs
        ->and(LuckyHand::isSixPairs(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'QS', 'AC']))->toBeFalse();
});

test('three flushes needs suit counts that split into 3 + 5 + 5', function () {
    $hand = ['2H', '7H', 'KH', '3S', '5S', '8S', 'TS', 'QS', '4D', '6D', '9D', 'JD', 'AD'];
    $lucky = LuckyHand::detect($hand);
    $suits = fn (array $cards) => count(array_unique(array_map(fn ($c) => $c[1], $cards)));

    expect($lucky['type'])->toBe('three_flushes')
        ->and($suits($lucky['arrangement']->front))->toBe(1)
        ->and($suits($lucky['arrangement']->middle))->toBe(1)
        ->and($suits($lucky['arrangement']->back))->toBe(1)
        ->and(count($lucky['arrangement']->allCards()))->toBe(13)
        // 8 + 5 of two suits also splits (3 + 5 of one suit, 5 of the other)
        ->and(LuckyHand::threeFlushes(['2H', '3H', '4H', '6H', '7H', '9H', 'JH', 'KH', '2S', '5S', '8S', 'TS', 'QS']))->not->toBeNull()
        // 4 + 4 + 5 cannot
        ->and(LuckyHand::threeFlushes(['2H', '3H', '4H', '6H', '2S', '5S', '8S', 'TS', '4D', '6D', '9D', 'JD', 'AD']))->toBeNull();
});

test('three straights including ace-low and ace-high lanes', function () {
    // A-2-3 front, 4-5-6-7-8 middle, 9-T-J-Q-K back (mixed suits)
    $hand = ['AC', '2D', '3H', '4S', '5C', '6D', '7H', '8S', '9C', 'TD', 'JH', 'QS', 'KC'];

    expect(LuckyHand::detect($hand)['type'])->toBe('three_straights')
        ->and(LuckyHand::isStraight(['QC', 'KD', 'AH']))->toBeTrue()
        ->and(LuckyHand::isStraight(['AC', '2D', '3H', '4S', '5C']))->toBeTrue()
        ->and(LuckyHand::isStraight(['KC', 'AD', '2H']))->toBeFalse()
        ->and(LuckyHand::detect(['AC', '2D', '3H', '4S', '5C', '6D', '7H', '8S', '9C', 'TD', 'JH', 'QS', '2C']))->toBeNull();
});

test('an ordinary hand is not lucky', function () {
    expect(LuckyHand::detect(['2C', '3D', '4H', 'TC', 'TD', '9H', '8S', '5D', 'AC', 'AD', 'AH', 'KS', 'KD']))->toBeNull();
});
