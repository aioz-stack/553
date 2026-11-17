<?php

namespace App\Services\Agent;

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientBalanceException;
use App\Models\Agent;
use App\Models\AgentPayoutRequest;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\LedgerService;
use App\Services\Wallet\TransferRequest;
use App\Services\Wallet\WalletService;
use Illuminate\Support\Facades\DB;

/**
 * Cash payout of an agent's CP commission balance.
 *
 * DISABLED BY DEFAULT: requires both FEATURE_CP_COMMISSION_PAYOUTS and
 * FEATURE_CASH_WITHDRAWALS, which must stay off until Philippine legal,
 * regulatory and payment-provider approvals exist. VC is never paid out.
 *
 * Flow: agent requests (balance checked) → staff with manage_commissions
 * approves (ledger COMMISSION_PAYOUT debits the commission wallet; the cash
 * transfer itself happens outside the platform) or rejects. Agents can never
 * approve their own requests.
 */
class PayoutService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly WalletService $wallets,
    ) {}

    public static function enabled(): bool
    {
        return (bool) config('pusoy.features.cp_commission_payouts') && (bool) config('pusoy.features.cash_withdrawals');
    }

    public function request(Agent $agent, Currency $currency, int $amount): AgentPayoutRequest
    {
        $this->assertEnabled($currency);

        $wallet = $this->wallets->for($agent->user, $currency, WalletType::Commission);
        $pending = (int) AgentPayoutRequest::query()->where('agent_id', $agent->id)->where('currency', $currency->value)->where('status', 'pending')->sum('amount');

        if ($amount <= 0 || $wallet->balance - $pending < $amount) {
            throw new InsufficientBalanceException('Amount exceeds your available commission balance.');
        }

        $request = AgentPayoutRequest::create(['agent_id' => $agent->id, 'currency' => $currency, 'amount' => $amount, 'status' => 'pending']);
        AuditLogger::log($agent->user, 'payout.request', $request, null, ['amount' => $amount, 'currency' => $currency->value]);

        return $request;
    }

    public function approve(User $actor, AgentPayoutRequest $request): AgentPayoutRequest
    {
        $this->authorizeReview($actor, $request);
        $this->assertEnabled($request->currency);

        return DB::transaction(function () use ($actor, $request) {
            $request = AgentPayoutRequest::query()->lockForUpdate()->findOrFail($request->id);

            if ($request->status !== 'pending') {
                throw new BusinessRuleException('Only pending payout requests can be approved.', 409, 'invalid_state');
            }

            $agentUser = $request->agent->user;
            $transaction = $this->ledger->transfer(new TransferRequest(
                type: TransactionType::CommissionPayout,
                currency: $request->currency,
                source: $this->wallets->for($agentUser, $request->currency, WalletType::Commission),
                destination: null,
                amount: $request->amount,
                reason: "Commission payout request #{$request->id}",
                actor: $actor,
                idempotencyKey: "payout-request:{$request->id}",
                relatedAgentId: $agentUser->id,
                approvedBy: $actor->id,
            ));

            $request->forceFill(['status' => 'paid', 'reviewed_by' => $actor->id, 'wallet_transaction_id' => $transaction->id])->save();
            AuditLogger::log($actor, 'payout.approve', $request, null, ['reference' => $transaction->reference]);

            return $request;
        });
    }

    public function reject(User $actor, AgentPayoutRequest $request): AgentPayoutRequest
    {
        $this->authorizeReview($actor, $request);

        if ($request->status !== 'pending') {
            throw new BusinessRuleException('Only pending payout requests can be rejected.', 409, 'invalid_state');
        }

        $request->forceFill(['status' => 'rejected', 'reviewed_by' => $actor->id])->save();
        AuditLogger::log($actor, 'payout.reject', $request);

        return $request;
    }

    private function assertEnabled(Currency $currency): void
    {
        if (! self::enabled() || $currency !== Currency::CP) {
            throw new BusinessRuleException('Commission cash payouts are disabled pending regulatory approval. VC is never paid out.', 403, 'feature_disabled');
        }
    }

    private function authorizeReview(User $actor, AgentPayoutRequest $request): void
    {
        if (! $actor->hasAbility(Ability::ManageCommissions) || $request->agent->user_id === $actor->id) {
            throw new BusinessRuleException('You are not allowed to review this payout request.', 403, 'forbidden');
        }
    }
}
