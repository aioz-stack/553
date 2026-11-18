<?php

use App\Game\AutoArranger;
use App\Game\BotArranger;
use App\Game\Deck;

test('the bot arranger never fouls, uses exactly the 13 dealt cards and scores at least as well as the greedy arranger', function () {
    $better = 0;

    foreach (range(1, 25) as $_) {
        $hands = Deck::deal(Deck::shuffled(Deck::newSeed()));

        foreach ([1, 2] as $seat) {
            $cards = $hands[$seat];
            $start = microtime(true);
            $smart = BotArranger::arrange($cards);
            expect(microtime(true) - $start)->toBeLessThan(2.0);

            expect($smart->isFoul())->toBeFalse();
            expect(count($smart->front))->toBe(3)->and(count($smart->middle))->toBe(5)->and(count($smart->back))->toBe(5);
            $used = $smart->allCards();
            sort($used);
            $dealt = $cards;
            sort($dealt);
            expect($used)->toBe($dealt);

            $greedy = BotArranger::score(AutoArranger::arrange($cards));
            expect(BotArranger::score($smart))->toBeGreaterThanOrEqual($greedy - 1e-9);
            $better += BotArranger::score($smart) > $greedy + 1e-9 ? 1 : 0;
        }
    }

    // On a good share of random hands it finds a better balance than greedy.
    expect($better)->toBeGreaterThan(5);
});
