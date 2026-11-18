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

test('no face cards: only 2-10 and Aces, any single J, Q or K disqualifies', function () {
    $hand = ['AC', '2D', '3H', '4S', '5C', '6D', '7H', '8S', '9C', 'TD', 'AH', '3S', '7C'];
    $lucky = LuckyHand::detect($hand);

    expect($lucky['type'])->toBe('no_face_cards')
        ->and($lucky['label'])->toBe('No Face Cards')
        ->and(count($lucky['arrangement']->allCards()))->toBe(13)
        ->and($lucky['arrangement']->isFoul())->toBeFalse()
        // one Jack, one Queen or one King is enough to fail
        ->and(LuckyHand::hasNoFaceCards([...array_slice($hand, 0, 12), 'JC']))->toBeFalse()
        ->and(LuckyHand::hasNoFaceCards([...array_slice($hand, 0, 12), 'QC']))->toBeFalse()
        ->and(LuckyHand::hasNoFaceCards([...array_slice($hand, 0, 12), 'KC']))->toBeFalse()
        // the old Three Straights hand (has J, Q, K) no longer qualifies
        ->and(LuckyHand::detect(['AC', '2D', '3H', '4S', '5C', '6D', '7H', '8S', '9C', 'TD', 'JH', 'QS', 'KC']))->toBeNull();
});

test('any one of the three combinations is enough; they are not needed together', function () {
    // Six pairs with face cards and mixed suits: only Six Pairs applies.
    expect(LuckyHand::detect(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'KS', 'AC'])['type'])->toBe('six_pairs')
        // Three flushes that contain face cards and no pairs: only Three Flushes applies.
        ->and(LuckyHand::detect(['2H', '7H', 'KH', '3S', '5S', '8S', 'TS', 'QS', '4D', '6D', '9D', 'JD', 'AD'])['type'])->toBe('three_flushes');
});

test('an ordinary hand is not lucky', function () {
    expect(LuckyHand::detect(['2C', '3D', '4H', 'TC', 'TD', '9H', '8S', '5D', 'AC', 'AD', 'AH', 'KS', 'KD']))->toBeNull();
});
