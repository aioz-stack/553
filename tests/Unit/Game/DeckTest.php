<?php

use App\Game\Deck;

test('a deck has 52 unique cards with no jokers', function () {
    $deck = Deck::ordered();

    expect($deck)->toHaveCount(52)
        ->and(array_unique($deck))->toHaveCount(52)
        ->and(array_filter($deck, fn ($c) => str_contains($c, 'J') && $c[1] === 'K'))->toBeEmpty();
});

test('a shuffled deck is a permutation of the ordered deck', function () {
    $shuffled = Deck::shuffled(Deck::newSeed());
    $ordered = Deck::ordered();

    sort($shuffled);
    sort($ordered);

    expect($shuffled)->toBe($ordered);
});

test('the shuffle is deterministic for a seed and differs between seeds', function () {
    $seed = Deck::newSeed();

    expect(Deck::shuffled($seed))->toBe(Deck::shuffled($seed))
        ->and(Deck::shuffled($seed))->not->toBe(Deck::shuffled(Deck::newSeed()));
});

test('dealing gives four players thirteen cards each with no duplicates', function () {
    $hands = Deck::deal(Deck::shuffled(Deck::newSeed()));

    expect($hands)->toHaveCount(4);

    $all = [];
    foreach ($hands as $seat => $cards) {
        expect($cards)->toHaveCount(13);
        $all = [...$all, ...$cards];
    }

    expect(array_unique($all))->toHaveCount(52);
});

test('dealing starts at the given seat and goes clockwise one card at a time', function () {
    $deck = Deck::shuffled(Deck::newSeed());
    $hands = Deck::deal($deck, 4, 13, 3);

    // deck[0] → seat 3, deck[1] → 4, deck[2] → 1, deck[3] → 2, deck[4] → 3 …; the last card goes to seat 2.
    expect($hands[3][0])->toBe($deck[0])
        ->and($hands[4][0])->toBe($deck[1])
        ->and($hands[1][0])->toBe($deck[2])
        ->and($hands[2][0])->toBe($deck[3])
        ->and($hands[3][1])->toBe($deck[4])
        ->and($hands[2][12])->toBe($deck[51]);
});

test('the shuffle commitment verifies against the revealed seed', function () {
    $seed = Deck::newSeed();
    $commitment = Deck::commitment($seed, Deck::shuffled($seed));

    expect(Deck::verify($seed, $commitment))->toBeTrue()
        ->and(Deck::verify(Deck::newSeed(), $commitment))->toBeFalse();
});

test('the shuffle is roughly uniform', function () {
    $firstCardCounts = [];

    for ($i = 0; $i < 2600; $i++) {
        $first = Deck::shuffled(Deck::newSeed())[0];
        $firstCardCounts[$first] = ($firstCardCounts[$first] ?? 0) + 1;
    }

    // Expect ~50 occurrences per card; every card should appear.
    expect($firstCardCounts)->toHaveCount(52)
        ->and(max($firstCardCounts))->toBeLessThan(110);
});
