<?php

use App\Game\Arrangement;
use App\Game\ArrangementValidator;
use App\Game\AutoArranger;
use App\Game\Deck;
use App\Game\Exceptions\InvalidArrangementException;

function arr(string $front, string $middle, string $back): Arrangement
{
    return new Arrangement(explode(' ', $front), explode(' ', $middle), explode(' ', $back));
}

test('a correctly ordered arrangement is not a foul', function () {
    expect(arr('2C 3D 4H', 'TC TD 9H 8S 5D', 'AC AD AH KS KD')->isFoul())->toBeFalse();
});

test('back weaker than middle is a foul', function () {
    expect(arr('2C 3D 4H', 'AC AD AH KS KD', 'TC TD 9H 8S 5D')->isFoul())->toBeTrue();
});

test('middle weaker than front is a foul', function () {
    expect(arr('QC QD QH', 'TC TD 9H 8S 5D', 'AC AD AH KS KD')->isFoul())->toBeTrue();
});

test('equal-strength front and middle are allowed', function () {
    // Front pair of 9s with K kicker vs middle pair of 9s with K,4,3 kickers: equal over shared ranks.
    expect(arr('9C 9D KH', '9H 9S KS 4D 3C', 'AC AD AH 2S 2D')->isFoul())->toBeFalse();
});

test('front pair beating middle pair kicker is a foul', function () {
    expect(arr('9C 9D AH', '9H 9S KS 4D 3C', 'AC AD AS 2S 2D')->isFoul())->toBeTrue();
});

test('the validator requires exactly the dealt cards', function () {
    $dealt = explode(' ', '2C 3D 4H TC TD 9H 8S 5D AC AD AH KS KD');

    $ok = ArrangementValidator::build($dealt, ['2C', '3D', '4H'], ['TC', 'TD', '9H', '8S', '5D'], ['AC', 'AD', 'AH', 'KS', 'KD']);
    expect($ok)->toBeInstanceOf(Arrangement::class);

    expect(fn () => ArrangementValidator::build($dealt, ['2C', '3D'], ['TC', 'TD', '9H', '8S', '5D'], ['AC', 'AD', 'AH', 'KS', 'KD', '4H']))
        ->toThrow(InvalidArrangementException::class);

    expect(fn () => ArrangementValidator::build($dealt, ['2C', '2C', '4H'], ['TC', 'TD', '9H', '8S', '5D'], ['AC', 'AD', 'AH', 'KS', 'KD']))
        ->toThrow(InvalidArrangementException::class);

    expect(fn () => ArrangementValidator::build($dealt, ['2C', '3D', 'QS'], ['TC', 'TD', '9H', '8S', '5D'], ['AC', 'AD', 'AH', 'KS', 'KD']))
        ->toThrow(InvalidArrangementException::class);

    expect(fn () => ArrangementValidator::build($dealt, ['2C', '3D', 'ZZ'], ['TC', 'TD', '9H', '8S', '5D'], ['AC', 'AD', 'AH', 'KS', 'KD']))
        ->toThrow(InvalidArrangementException::class);
});

test('the auto arranger always produces a valid non-fouled arrangement', function () {
    for ($i = 0; $i < 25; $i++) {
        $hand = Deck::deal(Deck::shuffled(Deck::newSeed()))[1];
        $arrangement = AutoArranger::arrange($hand);

        $used = $arrangement->allCards();
        sort($used);
        sort($hand);

        expect($used)->toBe($hand)
            ->and($arrangement->isFoul())->toBeFalse();
    }
});
