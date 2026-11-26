<?php

use App\Game\Deck;

test('dealTo deals only to the given seats, one card at a time in that order', function () {
    $deck = Deck::shuffled('seed-1');

    // Two players: seats 3 then 1 (banker in seat 1 → seat 3 is "after" when seats 2 and 4 are empty).
    $two = Deck::dealTo($deck, [3, 1]);
    expect(array_keys($two))->toBe([3, 1])
        ->and($two[3])->toHaveCount(13)->and($two[1])->toHaveCount(13)
        ->and($two[3][0])->toBe($deck[0])->and($two[1][0])->toBe($deck[1])->and($two[3][1])->toBe($deck[2])
        ->and(count(array_unique([...$two[3], ...$two[1]])))->toBe(26);

    $three = Deck::dealTo($deck, [2, 4, 1]);
    expect(array_sum(array_map('count', $three)))->toBe(39)->and(count(array_unique(array_merge(...array_values($three)))))->toBe(39);

    // All four seats in order: exactly the classic deal.
    expect(Deck::dealTo($deck, [2, 3, 4, 1]))->toEqual(Deck::deal($deck, 4, 13, 2));
});
