<?php

namespace App\Services\Game;

use App\Enums\HoldStatus;
use App\Enums\PayoutMode;
use App\Enums\SettlementStatus;
use App\Enums\TransactionType;
use App\Game\Arrangement;
use App\Game\Payout\PayoutInput;
use App\Game\Payout\PayoutStrategy;
use App\Game\Payout\RoundBankPayout;
use App\Game\Payout\WinnerTakesAllPayout;
use App\Models\GamePayout;
use App\Models\GameResult;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\GameSettlement;
use App\Models\GameSubmission;
use App\Models\PlatformFee;
use App\Models\WalletHold;
use App\Services\Agent\CommissionService;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Converts scored results into wallet movements, atomically and exactly once.
 *
 * All entries sit in the escrow wallet. Settlement pays each player's payout
 * and the platform fee out of escrow, captures the holds, updates the room's
 * carry-forward bank, and creates pending agent commissions. Every ledger
 * movement uses a deterministic idempotency key (payout:{session}:{user},
 * fee:{session}) so a retried settlement never pays twice.
 */
class SettlementService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
        private readonly CommissionService $commissions,
    ) {}

    public function settle(GameSession $session): GameSettlement
    {
        $settlement = GameSettlement::query()->firstOrCreate(
            ['game_session_id' => $session->id],
            ['status' => SettlementStatus::Pending, 'currency' => $session->currency, 'pot' => $session->pot],
        );

        if ($settlement->status === SettlementStatus::Settled) {
            return $settlement;
        }

        try {
            return DB::transaction(fn () => $this->apply($session, $settlement));
        } catch (Throwable $e) {
            $settlement->forceFill([
                'status' => SettlementStatus::Failed,
                'attempts' => $settlement->attempts + 1,
                'last_error' => substr($e->getMessage(), 0, 2000),
            ])->save();

            throw $e;
        }
    }

    public function strategyFor(PayoutMode $mode): PayoutStrategy
    {
        return match ($mode) {
            PayoutMode::RoundBank => new RoundBankPayout,
            PayoutMode::WinnerTakesAll => new WinnerTakesAllPayout,
        };
    }

    private function apply(GameSession $session, GameSettlement $settlement): GameSettlement
    {
        $settlement = GameSettlement::query()->whereKey($settlement->id)->lockForUpdate()->firstOrFail();

        if ($settlement->status === SettlementStatus::Settled) {
            return $settlement;
        }

        $config = $session->config;
        $mode = PayoutMode::from($config['payout_mode']);
        $room = GameRoom::query()->whereKey($session->game_room_id)->lockForUpdate()->firstOrFail();

        $results = GameResult::query()->where('game_session_id', $session->id)->get()->keyBy('user_id');
        $holds = WalletHold::query()->with('wallet')->where('game_session_id', $session->id)
            ->where('status', HoldStatus::Held->value)->lockForUpdate()->get()->keyBy('user_id');
        $submissions = GameSubmission::query()->where('game_session_id', $session->id)->get()->keyBy('user_id');

        $carryIn = $mode === PayoutMode::WinnerTakesAll ? $room->carry_over_amount : 0;

        $input = new PayoutInput(
            entries: $holds->map(fn (WalletHold $h) => $h->amount)->all(),
            scores: $results->map(fn (GameResult $r) => $r->score)->all(),
            seats: $results->map(fn (GameResult $r) => $r->seat)->all(),
            arrangements: $submissions->map(fn (GameSubmission $s) => new Arrangement($s->front, $s->middle, $s->back))->all(),
            fouls: $results->map(fn (GameResult $r) => $r->is_foul)->all(),
            feeBps: (int) $config['platform_fee_bps'],
            pointValue: (int) $config['point_value'],
            tieHandling: $config['tie_handling'],
            carryIn: $carryIn,
        );

        $payout = $this->strategyFor($mode)->calculate($input);
        $escrow = $this->wallets->escrow($session->currency);

        foreach ($payout->payouts as $userId => $amount) {
            $transactionId = null;

            if ($amount > 0) {
                $transactionId = $this->ledger->transfer(new TransferRequest(
                    type: TransactionType::GameReward,
                    currency: $session->currency,
                    source: $escrow,
                    destination: $holds[$userId]->wallet,
                    amount: $amount,
                    reason: "Game #{$session->id} payout",
                    idempotencyKey: "payout:{$session->id}:{$userId}",
                    relatedPlayerId: $userId,
                    gameSessionId: $session->id,
                ))->id;
            }

            GamePayout::query()->updateOrCreate(
                ['game_settlement_id' => $settlement->id, 'user_id' => $userId],
                ['amount' => $amount, 'wallet_transaction_id' => $transactionId],
            );

            $results[$userId]->forceFill([
                'payout_amount' => $amount,
                'net_amount' => $amount - $holds[$userId]->amount,
            ])->save();
        }

        if ($payout->platformFee > 0) {
            $feeTx = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::PlatformFee,
                currency: $session->currency,
                source: $escrow,
                destination: $this->wallets->platform($session->currency),
                amount: $payout->platformFee,
                reason: "Platform fee game #{$session->id}",
                idempotencyKey: "fee:{$session->id}",
                gameSessionId: $session->id,
            ));

            PlatformFee::query()->updateOrCreate(
                ['game_session_id' => $session->id],
                ['currency' => $session->currency, 'amount' => $payout->platformFee, 'wallet_transaction_id' => $feeTx->id],
            );
        }

        if ($mode === PayoutMode::WinnerTakesAll) {
            DB::table('game_rooms')->where('id', $room->id)->update(['carry_over_amount' => $payout->carryOut]);
        }

        WalletHold::query()->whereIn('id', $holds->pluck('id'))->update(['status' => HoldStatus::Captured->value]);

        $session->forceFill(['platform_fee' => $payout->platformFee])->save();

        $settlement->forceFill([
            'status' => SettlementStatus::Settled,
            'carry_in' => $carryIn,
            'platform_fee' => $payout->platformFee,
            'payout_total' => array_sum($payout->payouts),
            'carry_out' => $mode === PayoutMode::WinnerTakesAll ? $payout->carryOut : 0,
            'breakdown' => $payout->notes + ['payouts' => $payout->payouts, 'fee_attribution' => $payout->feeAttribution],
            'attempts' => $settlement->attempts + 1,
            'last_error' => null,
            'settled_at' => now(),
        ])->save();

        $this->commissions->generateForSession($session, $payout->feeAttribution);

        return $settlement;
    }
}
