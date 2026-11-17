<?php

namespace App\Http\Resources;

use App\Models\WalletTransaction;
use App\Support\Points;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Ledger row. For player-facing lists pass `viewer_wallet_ids` via
 * `additional` context so the direction and the viewer's own balance
 * before/after are shown (never another party's balance).
 *
 * @mixin WalletTransaction
 */
class TransactionResource extends JsonResource
{
    /**
     * @var list<int>|null
     */
    public static ?array $viewerWalletIds = null;

    public function toArray(Request $request): array
    {
        $staff = $request->user()?->can('review_transactions');
        $mine = self::$viewerWalletIds;
        $incoming = $mine !== null && in_array($this->destination_wallet_id, $mine, true);

        $base = [
            'id' => $this->id,
            'reference' => $this->reference,
            'type' => $this->type->value,
            'currency' => $this->currency->value,
            'amount' => Points::decimal($this->amount),
            'amount_minor' => $this->amount,
            'status' => $this->status->value,
            'reason' => $this->reason,
            'game_session_id' => $this->game_session_id,
            'reversal_of_id' => $this->reversal_of_id,
            // Game context only (role in a banker round, round number) — no other users' data.
            'game_role' => $this->metadata['role'] ?? null,
            'round' => $this->metadata['round'] ?? null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];

        if ($mine !== null && ! $staff) {
            return $base + [
                'direction' => $incoming ? 'in' : 'out',
                'balance_before' => Points::decimal((int) ($incoming ? $this->destination_balance_before : $this->source_balance_before)),
                'balance_after' => Points::decimal((int) ($incoming ? $this->destination_balance_after : $this->source_balance_after)),
            ];
        }

        return $base + [
            'direction' => $mine !== null ? ($incoming ? 'in' : 'out') : null,
            'source_wallet_id' => $this->source_wallet_id,
            'destination_wallet_id' => $this->destination_wallet_id,
            'source' => $this->whenLoaded('source', fn () => $this->walletLabel($this->source)),
            'destination' => $this->whenLoaded('destination', fn () => $this->walletLabel($this->destination)),
            'source_balance_before' => $this->source_balance_before !== null ? Points::decimal($this->source_balance_before) : null,
            'source_balance_after' => $this->source_balance_after !== null ? Points::decimal($this->source_balance_after) : null,
            'destination_balance_before' => $this->destination_balance_before !== null ? Points::decimal($this->destination_balance_before) : null,
            'destination_balance_after' => $this->destination_balance_after !== null ? Points::decimal($this->destination_balance_after) : null,
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->only(['id', 'name', 'username'])),
            'approved_by' => $this->approved_by,
            'related_player_id' => $this->related_player_id,
            'related_agent_id' => $this->related_agent_id,
            'idempotency_key' => $staff ? $this->idempotency_key : null,
            'metadata' => $staff ? $this->metadata : null,
        ];
    }

    private function walletLabel($wallet): ?string
    {
        if ($wallet === null) {
            return 'ISSUANCE';
        }

        if ($wallet->system_key) {
            return strtoupper($wallet->system_key);
        }

        return ($wallet->user?->username ?? 'user#'.$wallet->user_id).' / '.$wallet->type->value;
    }
}
