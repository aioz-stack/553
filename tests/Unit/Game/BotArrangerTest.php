<?php

use App\Game\Arrangement;
use App\Game\AutoArranger;
use App\Game\BotArranger;
use App\Game\Deck;
use App\Game\HandCategory;
use App\Game\HandEvaluator;

/** A random arrangement that is not fouled (what an unthinking player does). */
function randomValid(array $cards): Arrangement
{
    for ($try = 0; $try < 500; $try++) {
        shuffle($cards);
        $a = new Arrangement(array_slice($cards, 0, 3), array_slice($cards, 3, 5), array_slice($cards, 8, 5));
        if (! $a->isFoul()) {
            return $a;
        }
    }

    return AutoArranger::arrange($cards);
}

/** Lanes won by $a against $b (each lane: 1 win, 0.5 tie, 0 loss). */
function lanesWon(Arrangement $a, Arrangement $b): float
{
    $won = 0.0;
    foreach (['front', 'middle', 'back'] as $lane) {
        $c = $a->value($lane)->compare($b->value($lane));
        $won += $c > 0 ? 1 : ($c === 0 ? 0.5 : 0);
    }

    return $won;
}

test('the bot never fouls, uses exactly the 13 dealt cards, decides quickly and scores at least as well as the greedy arranger', function () {
    $better = 0;

    foreach (range(1, 25) as $_) {
        $hands = Deck::deal(Deck::shuffled(Deck::newSeed()));

        foreach ([1, 2] as $seat) {
            $cards = $hands[$seat];
            $start = microtime(true);
            $smart = BotArranger::arrange($cards);
            expect(microtime(true) - $start)->toBeLessThan(1.0);

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

test('the search is exhaustive: no valid split of the 13 cards has a better expected result', function () {
    $cards = Deck::deal(Deck::shuffled(Deck::newSeed()))[3];
    $bestScore = BotArranger::score(BotArranger::arrange($cards));
    $checked = 0;

    for ($back = 0; $back < (1 << 13); $back++) {
        if (substr_count(decbin($back), '1') !== 5) {
            continue;
        }
        $rest = array_values(array_filter(range(0, 12), fn ($i) => ! ($back & (1 << $i))));
        $b = array_map(fn ($i) => $cards[$i], array_values(array_filter(range(0, 12), fn ($i) => (bool) ($back & (1 << $i)))));
        $bv = HandEvaluator::evaluate($b);

        for ($m = 0; $m < 256; $m++) {
            if (substr_count(decbin($m), '1') !== 5) {
                continue;
            }
            $mid = $front = [];
            foreach ($rest as $k => $i) {
                ($m & (1 << $k)) ? $mid[] = $cards[$i] : $front[] = $cards[$i];
            }
            if (HandEvaluator::evaluate($mid)->compare($bv) > 0) {
                continue;
            }
            $a = new Arrangement($front, $mid, $b);
            if ($a->isFoul()) {
                continue;
            }
            $checked++;
            expect(BotArranger::score($a))->toBeLessThanOrEqual($bestScore + 1e-9);
        }
    }

    expect($checked)->toBeGreaterThan(1000);
});

test('lane strengths order hands exactly like the official comparison, including Front vs Middle', function () {
    foreach (range(1, 300) as $_) {
        $deck = Deck::shuffled(Deck::newSeed());
        [$a, $b, $c] = [array_slice($deck, 0, 5), array_slice($deck, 5, 5), array_slice($deck, 10, 3)];
        $va = HandEvaluator::evaluate($a);
        $vb = HandEvaluator::evaluate($b);
        $vc = HandEvaluator::evaluate($c);
        expect(BotArranger::strength($va) <=> BotArranger::strength($vb))->toBe($va->compare($vb));
        // Front above Middle (a foul) exactly when the official rules say so.
        expect(BotArranger::strength($vc) > BotArranger::strength($va))->toBe($va->compare($vc) < 0);
    }
});

test('it plays the obvious strategy: quads go to the Back, the flush to the Middle; trips and a pair make a full house', function () {
    $a = BotArranger::arrange(['AS', 'AH', 'AD', 'AC', '2H', '5H', '8H', 'JH', 'KH', '3C', '6D', '9S', 'QC']);
    expect($a->backValue->category)->toBe(HandCategory::FourOfAKind)
        ->and($a->middleValue->category)->toBe(HandCategory::Flush);

    $b = BotArranger::arrange(['KS', 'KH', 'KD', '7S', '7H', '7D', 'QS', 'QH', '2C', '4D', '9C', 'JD', '5S']);
    expect($b->isFoul())->toBeFalse()
        ->and($b->backValue->category)->toBe(HandCategory::FullHouse)
        ->and($b->middleValue->category->value)->toBeGreaterThanOrEqual(HandCategory::OnePair->value);
});

test('head to head, the bot beats random valid arrangements and the greedy arranger on the same cards', function () {
    $vsRandom = $vsGreedy = $swapped = 0.0;

    foreach (range(1, 60) as $_) {
        $hands = Deck::deal(Deck::shuffled(Deck::newSeed()));
        $bot = BotArranger::arrange($hands[1]);
        $vsRandom += lanesWon($bot, randomValid($hands[2]));
        $vsGreedy += lanesWon($bot, AutoArranger::arrange($hands[2]));
        // Seats swapped: the bot on seat 2's cards vs greedy on seat 1's.
        $swapped += lanesWon(BotArranger::arrange($hands[2]), AutoArranger::arrange($hands[1]));
    }

    // 3 lanes × 60 deals = 180 lanes; 90 would be an even match.
    expect($vsRandom)->toBeGreaterThan(115);
    expect($vsGreedy + $swapped)->toBeGreaterThan(190); // out of 360
});
