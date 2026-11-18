<?php

use App\Game\Arrangement;
use App\Game\Banker\BankerRound;

/*
 * "strong" beats "weak" on every lane:
 *   strong: front pair of aces, middle straight, back four kings
 *   weak:   front high card,    middle pair,     back two pair
 */
function strongHand(): Arrangement
{
    return new Arrangement(['AC', 'AD', '2H'], ['5C', '6D', '7H', '8S', '9C'], ['KC', 'KD', 'KH', 'KS', '3D']);
}

function weakHand(): Arrangement
{
    return new Arrangement(['4C', '7D', '9H'], ['QC', 'QD', '2C', '3C', '4D'], ['JC', 'JD', 'TC', 'TD', '6S']);
}

test('settlement table multiples', function () {
    $calc = new BankerRound;

    expect($calc->multiple(['front' => 1, 'middle' => 1, 'back' => 1]))->toBe(2)
        ->and($calc->multiple(['front' => -1, 'middle' => -1, 'back' => -1]))->toBe(-2)
        ->and($calc->multiple(['front' => 1, 'middle' => 1, 'back' => -1]))->toBe(1)
        ->and($calc->multiple(['front' => -1, 'middle' => -1, 'back' => 1]))->toBe(-1)
        ->and($calc->multiple(['front' => 1, 'middle' => -1, 'back' => 0]))->toBe(0)
        ->and($calc->multiple(['front' => 1, 'middle' => 1, 'back' => 0]))->toBe(0)
        ->and($calc->multiple(['front' => -1, 'middle' => -1, 'back' => 0]))->toBe(0)
        ->and($calc->multiple(['front' => 1, 'middle' => 0, 'back' => 0]))->toBe(0)
        ->and($calc->multiple(['front' => 0, 'middle' => 0, 'back' => 0]))->toBe(0);
});

test('a player winning all lanes gets 2x from the banker and reserves balance exactly', function () {
    $r = (new BankerRound)->settle(1, [2 => 1000, 3 => 500], [1 => weakHand(), 2 => strongHand(), 3 => weakHand()]);

    expect($r['players'][2]['multiple'])->toBe(2)
        ->and($r['players'][2]['payout'])->toBe(2000 + 2000)
        ->and($r['players'][3]['multiple'])->toBe(0) // identical strength: three ties
        ->and($r['players'][3]['payout'])->toBe(1000)
        ->and($r['banker']['net'])->toBe(-2000)
        ->and($r['banker']['payout'])->toBe(3000 - 2000);

    $paid = $r['banker']['payout'] + array_sum(array_column($r['players'], 'payout'));
    expect($paid)->toBe(2000 + 1000 + 3000);
});

test('the platform fee comes from each positive net win and stays zero-sum', function () {
    $r = (new BankerRound(feeBps: 1000))->settle(1, [2 => 1000, 3 => 1000], [1 => strongHand(), 2 => weakHand(), 3 => weakHand()]);

    expect($r['players'][2]['net'])->toBe(-2000)
        ->and($r['banker']['gross'])->toBe(4000)
        ->and($r['banker']['fee'])->toBe(400)
        ->and($r['banker']['net'])->toBe(3600);

    $paid = $r['banker']['payout'] + array_sum(array_column($r['players'], 'payout'));
    expect($paid + $r['banker']['fee'])->toBe(4000 + 2000 + 2000);
});

test('a fouled hand loses every lane; two fouls tie', function () {
    $foul = new Arrangement(['AC', 'AD', 'AH'], ['2C', '3D', '5H', '7S', '9C'], ['KC', 'QD', 'JH', '8S', '4D']);
    expect($foul->isFoul())->toBeTrue();

    $r = (new BankerRound)->settle(1, [2 => 100, 3 => 100], [1 => $foul, 2 => weakHand(), 3 => $foul]);

    expect($r['players'][2]['lanes'])->toBe(['front' => 1, 'middle' => 1, 'back' => 1])
        ->and($r['players'][2]['multiple'])->toBe(2)
        ->and($r['players'][3]['multiple'])->toBe(0)
        ->and($r['banker']['is_foul'])->toBeTrue();
});

test('lucky hands pay the lucky multiple and replace the lane comparison', function () {
    $r = (new BankerRound)->settle(1, [2 => 100, 3 => 100], [1 => strongHand(), 2 => weakHand(), 3 => weakHand()], [], [2 => 'six_pairs']);

    expect($r['players'][2]['multiple'])->toBe(2)
        ->and($r['players'][2]['lanes'])->toBeNull()
        ->and($r['players'][2]['lucky_bonus'])->toBe(200)
        ->and($r['players'][3]['multiple'])->toBe(-2);

    // A lucky banker wins 2x from every non-lucky player; lucky vs lucky = 0.
    $b = (new BankerRound)->settle(1, [2 => 100, 3 => 100], [1 => weakHand(), 2 => strongHand(), 3 => strongHand()], [], [1 => 'three_flushes', 3 => 'six_pairs']);

    expect($b['players'][2]['multiple'])->toBe(-2)
        ->and($b['players'][3]['multiple'])->toBe(0)
        ->and($b['banker']['lucky_bonus'])->toBe(200);
});

test('banker advantage: identical lanes go to the banker (opt-in), so 3 identical lanes = −2 × bet', function () {
    $same = new App\Game\Arrangement(['2C', '3D', '5H'], ['7C', '8D', '9H', 'JS', 'KC'], ['AC', 'AD', '4S', '6C', 'TH']);
    $copy = new App\Game\Arrangement(['2D', '3H', '5S'], ['7D', '8H', '9S', 'JC', 'KD'], ['AH', 'AS', '4C', '6D', 'TS']);

    $plain = (new BankerRound)->settle(1, [2 => 100], [1 => $same, 2 => $copy]);
    expect($plain['players'][2]['lanes'])->toBe(['front' => 0, 'middle' => 0, 'back' => 0])->and($plain['players'][2]['gross'])->toBe(0);

    $adv = (new BankerRound(bankerWinsTies: true))->settle(1, [2 => 100], [1 => $same, 2 => $copy]);
    expect($adv['players'][2]['lanes'])->toBe(['front' => -1, 'middle' => -1, 'back' => -1])
        ->and($adv['players'][2]['gross'])->toBe(-200)->and($adv['banker']['gross'])->toBe(200);
});
