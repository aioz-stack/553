<?php

use App\Game\LuckyHand;

test('only No Faces, 3-Straight, 3-Flushes and 6 Pairs qualify', function () {
    expect(LuckyHand::TYPES)->toBe(['three_flushes', 'three_straights', 'no_face_cards', 'six_pairs']);
});

test('6 Pairs: six distinct pairs among the 13 cards; the 13th card never invalidates it', function () {
    // six pairs + a single (face cards, mixed suits: no other Lucky Hand)
    $lucky = LuckyHand::detect(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'KS', 'AC']);
    expect($lucky['type'])->toBe('six_pairs')
        ->and($lucky['label'])->toBe('6 Pairs')
        ->and(LuckyHand::announcement('six_pairs'))->toBe('6 PAIRS – LUCKY HAND')
        ->and(count($lucky['arrangement']->allCards()))->toBe(13)
        ->and($lucky['arrangement']->isFoul())->toBeFalse()
        // the 13th card makes one pair trips: still six distinct pairs
        ->and(LuckyHand::isSixPairs(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'KS', 'KC']))->toBeTrue()
        // five pairs only
        ->and(LuckyHand::isSixPairs(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'QS', 'AC']))->toBeFalse()
        // four of a kind is ONE pair of that rank, not two: 4 + 4 distinct pairs = 5 ranks
        ->and(LuckyHand::isSixPairs(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'JH', 'JS', 'AC']))->toBeFalse()
        ->and(LuckyHand::detect(['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'JH', 'JS', 'AC']))->toBeNull();
});

test('3-Flushes needs suit counts that split into 3 + 5 + 5', function () {
    $hand = ['2H', '7H', 'KH', '3S', '5S', '8S', 'TS', 'QS', '4D', '6D', '9D', 'JD', 'AD'];
    $lucky = LuckyHand::detect($hand);
    $suits = fn (array $cards) => count(array_unique(array_map(fn ($c) => $c[1], $cards)));

    expect($lucky['type'])->toBe('three_flushes')
        ->and($lucky['label'])->toBe('3-Flushes')
        ->and($suits($lucky['arrangement']->front))->toBe(1)
        ->and($suits($lucky['arrangement']->middle))->toBe(1)
        ->and($suits($lucky['arrangement']->back))->toBe(1)
        ->and(count($lucky['arrangement']->allCards()))->toBe(13)
        // 8 + 5 of two suits also splits (3 + 5 of one suit, 5 of the other)
        ->and(LuckyHand::threeFlushes(['2H', '3H', '4H', '6H', '7H', '9H', 'JH', 'KH', '2S', '5S', '8S', 'TS', 'QS']))->not->toBeNull()
        // 4 + 4 + 5 cannot
        ->and(LuckyHand::threeFlushes(['2H', '3H', '4H', '6H', '2S', '5S', '8S', 'TS', '4D', '6D', '9D', 'JD', 'AD']))->toBeNull();
});

test('3-Straight: a 3-card straight Front and 5-card straight Middle and Back, the Ace high or low', function () {
    // A-2-3 | 4-5-6-7-8 | 9-T-J-Q-K (mixed suits, face cards: not No Faces, not 3-Flushes)
    $lucky = LuckyHand::detect(['AC', '2D', '3H', '4S', '5C', '6D', '7H', '8S', '9C', 'TD', 'JH', 'QS', 'KC']);
    expect($lucky['type'])->toBe('three_straights')
        ->and($lucky['label'])->toBe('3-Straight')
        ->and(LuckyHand::isStraight($lucky['arrangement']->front))->toBeTrue()
        ->and(LuckyHand::isStraight($lucky['arrangement']->middle))->toBeTrue()
        ->and(LuckyHand::isStraight($lucky['arrangement']->back))->toBeTrue()
        ->and(count($lucky['arrangement']->allCards()))->toBe(13)
        // every dealt card exactly once (no card in two lanes)
        ->and(collect($lucky['arrangement']->allCards())->sort()->values()->all())->toBe(collect(['AC', '2D', '3H', '4S', '5C', '6D', '7H', '8S', '9C', 'TD', 'JH', 'QS', 'KC'])->sort()->values()->all())
        ->and($lucky['arrangement']->isFoul())->toBeFalse();

    // Q-K-A on top, and the cards need not be in order.
    expect(LuckyHand::threeStraights(['KD', '2C', 'QH', '6S', 'AS', '3D', '4C', '5H', '7C', '8D', '9H', 'TC', 'JS']))->not->toBeNull()
        ->and(LuckyHand::isStraight(['QH', 'KD', 'AS']))->toBeTrue()
        ->and(LuckyHand::isStraight(['AS', '2C', '3D']))->toBeTrue()
        ->and(LuckyHand::isStraight(['KD', 'AS', '2C']))->toBeFalse()
        ->and(LuckyHand::isStraight(['AS', '2C', '3D', '4H', '5S']))->toBeTrue()
        ->and(LuckyHand::isStraight(['TS', 'JC', 'QD', 'KH', 'AS']))->toBeTrue()
        // a pair breaks it
        ->and(LuckyHand::isStraight(['5S', '5C', '6D']))->toBeFalse()
        // two straights but no straight Front
        ->and(LuckyHand::threeStraights(['AC', '2D', '5H', '4S', '5C', '6D', '7H', '8S', '9C', 'TD', 'JH', 'QS', 'KC']))->toBeNull();
});

test('No Faces: only 2-10 and Aces, any single J, Q or K disqualifies', function () {
    $hand = ['AC', '2D', '3H', '4S', '5C', '6D', '7H', '8S', '9C', 'TD', 'AH', '3S', '7C'];
    $lucky = LuckyHand::detect($hand);

    expect($lucky['type'])->toBe('no_face_cards')
        ->and($lucky['label'])->toBe('No Faces')
        ->and(count($lucky['arrangement']->allCards()))->toBe(13)
        ->and($lucky['arrangement']->isFoul())->toBeFalse()
        ->and(LuckyHand::hasNoFaceCards([...array_slice($hand, 0, 12), 'JC']))->toBeFalse()
        ->and(LuckyHand::hasNoFaceCards([...array_slice($hand, 0, 12), 'QC']))->toBeFalse()
        ->and(LuckyHand::hasNoFaceCards([...array_slice($hand, 0, 12), 'KC']))->toBeFalse();
});

test('any one of the three combinations is enough; they are not needed together', function () {
    expect(LuckyHand::detect(['2H', '7H', 'KH', '3S', '5S', '8S', 'TS', 'QS', '4D', '6D', '9D', 'JD', 'AD'])['type'])->toBe('three_flushes')
        ->and(LuckyHand::detect(['AC', '2D', '3H', '4S', '5C', '6D', '7H', '8S', '9C', 'TD', 'JH', 'QS', 'KC'])['type'])->toBe('three_straights');
});

test('an ordinary hand is not lucky', function () {
    expect(LuckyHand::detect(['2C', '3D', '4H', 'TC', 'TD', '9H', '8S', '5D', 'AC', 'AD', 'AH', 'KS', 'KD']))->toBeNull();
});
