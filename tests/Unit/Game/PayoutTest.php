<?php

use App\Game\Arrangement;
use App\Game\Payout\PayoutInput;
use App\Game\Payout\RoundBankPayout;
use App\Game\Payout\WinnerTakesAllPayout;

function payoutInput(array $scores, string $tie = 'split_equally', int $feeBps = 1000, int $entry = 9000, int $carryIn = 0, array $arrangements = [], int $pointValue = 1000): PayoutInput
{
    $ids = array_keys($scores);

    return new PayoutInput(
        entries: array_fill_keys($ids, $entry),
        scores: $scores,
        seats: array_combine($ids, range(1, count($ids))),
        arrangements: $arrangements,
        fouls: array_fill_keys($ids, false),
        feeBps: $feeBps,
        pointValue: $pointValue,
        tieHandling: $tie,
        carryIn: $carryIn,
    );
}

test('winner takes all pays the net pool to the single top scorer', function () {
    $result = (new WinnerTakesAllPayout)->calculate(payoutInput([1 => 5, 2 => -1, 3 => -2, 4 => -2]));

    // pot 36000, fee 10% = 3600, net 32400
    expect($result->platformFee)->toBe(3600)
        ->and($result->payouts)->toBe([1 => 32400, 2 => 0, 3 => 0, 4 => 0])
        ->and(array_sum($result->feeAttribution))->toBe(3600);
});

test('winner takes all ties split equally with remainder in seat order', function () {
    $result = (new WinnerTakesAllPayout)->calculate(payoutInput([1 => 3, 2 => 3, 3 => -3, 4 => -3], feeBps: 0, entry: 2501));

    // pot 10004, split two ways = 5002 each
    expect($result->payouts[1] + $result->payouts[2])->toBe(10004)
        ->and($result->payouts[1])->toBe(5002);

    $odd = (new WinnerTakesAllPayout)->calculate(payoutInput([1 => 2, 2 => 2, 3 => 2, 4 => -6], feeBps: 0, entry: 2500));
    // 10000 / 3 = 3333 r1 -> seat 1 gets 3334
    expect($odd->payouts)->toBe([1 => 3334, 2 => 3333, 3 => 3333, 4 => 0]);
});

test('winner takes all carry forward holds the pool for the next game', function () {
    $tied = (new WinnerTakesAllPayout)->calculate(payoutInput([1 => 3, 2 => 3, 3 => -3, 4 => -3], tie: 'carry_forward'));

    expect(array_sum($tied->payouts))->toBe(0)
        ->and($tied->carryOut)->toBe(32400);

    $next = (new WinnerTakesAllPayout)->calculate(payoutInput([1 => 4, 2 => 0, 3 => -2, 4 => -2], tie: 'carry_forward', carryIn: 32400));

    expect($next->payouts[1])->toBe(32400 + 32400)
        ->and($next->carryOut)->toBe(0);
});

test('winner takes all tie breaker uses the back hand', function () {
    $strongBack = new Arrangement(['2C', '3D', '4H'], ['5C', '5D', '6H', '7S', '8D'], ['AC', 'AD', 'AH', 'KS', 'KD']);
    $weakBack = new Arrangement(['2D', '3C', '4S'], ['5H', '5S', '6C', '7D', '8C'], ['QC', 'QD', 'QH', 'JS', 'JD']);

    $result = (new WinnerTakesAllPayout)->calculate(payoutInput(
        [1 => 2, 2 => 2, 3 => -2, 4 => -2],
        tie: 'tie_breaker',
        feeBps: 0,
        arrangements: [1 => $weakBack, 2 => $strongBack, 3 => $weakBack, 4 => $weakBack],
    ));

    expect($result->payouts[2])->toBe(36000)->and($result->payouts[1])->toBe(0);
});

test('round bank pays entry plus score times point value and conserves the bank', function () {
    $result = (new RoundBankPayout)->calculate(payoutInput([1 => 6, 2 => 0, 3 => -2, 4 => -4], feeBps: 1000, entry: 9000, pointValue: 1000));

    // gains: p1 +6000 -> fee 600; p3 -2000; p4 -4000
    expect($result->payouts)->toBe([1 => 9000 + 6000 - 600, 2 => 9000, 3 => 7000, 4 => 5000])
        ->and($result->platformFee)->toBe(600)
        ->and($result->feeAttribution[1])->toBe(600)
        ->and(array_sum($result->payouts) + $result->platformFee)->toBe(36000);
});

test('round bank caps point value so nobody loses more than their entry', function () {
    $result = (new RoundBankPayout)->calculate(payoutInput([1 => 9, 2 => 3, 3 => -3, 4 => -9], feeBps: 0, entry: 9000, pointValue: 5000));

    expect($result->payouts[4])->toBe(0) // capped at 9000/9 = 1000 per point
        ->and(min($result->payouts))->toBeGreaterThanOrEqual(0)
        ->and(array_sum($result->payouts))->toBe(36000);
});
