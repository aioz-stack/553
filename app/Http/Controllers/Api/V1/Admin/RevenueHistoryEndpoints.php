<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Role;
use App\Models\KeyExchange;
use App\Models\RevenueConversion;
use App\Support\Points;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Revenue Logs and Revenue Commission Withdrawal (Admin, Incorporator and Master Agent panels):
 * read-only histories straight from the database. No actions.
 *
 *  - Revenue Logs: completed Shop Buy-Ins only (key_exchanges, direction chips_to_keys, status
 *    completed). No conversions, withdrawals, cash-outs or other wallet transactions, and no
 *    commission percentages.
 *  - Revenue Commission Withdrawal: completed Self Convert Revenue to Chips only
 *    (revenue_conversions, status completed).
 *
 * Scope: the Admin Panel sees the whole platform; the Agent Panel overrides the scope hooks to the
 * agent's own downline (AgentPanelController).
 */
trait RevenueHistoryEndpoints
{
    public function revenueLogs(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:64'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'tz' => ['nullable', 'timezone:all'],
            'status' => ['nullable', 'in:completed'],
            'sort' => ['nullable', 'in:newest,oldest,amount_desc,amount_asc'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $query = $this->scopeRevenueLogs(KeyExchange::query())
            ->where('key_exchanges.direction', KeyExchange::CHIPS_TO_KEYS)
            ->where('key_exchanges.status', KeyExchange::COMPLETED)
            ->with('user:id,username');
        $this->dateRange($query, 'key_exchanges.created_at', $data);

        if ($term = trim((string) ($data['q'] ?? ''))) {
            $id = $this->numericId($term, 'SB');
            $query->where(function (Builder $w) use ($term, $id) {
                $w->where('key_exchanges.player_username', 'like', "%{$term}%")
                    ->orWhereHas('user', fn (Builder $u) => $u->where('username', 'like', "%{$term}%"))
                    ->orWhere('key_exchanges.hierarchy', 'like', '%"username":"%'.str_replace(['%', '_'], ['\\%', '\\_'], $term).'%')
                    ->when($id !== null, fn (Builder $x) => $x->orWhere('key_exchanges.id', $id)->orWhere('key_exchanges.user_id', $id));
            });
        }

        $total = (int) (clone $query)->sum('key_exchanges.chips_amount');
        $keys = (int) (clone $query)->sum('key_exchanges.keys_amount');
        $this->sorted($query, $data['sort'] ?? 'newest', 'key_exchanges.chips_amount', 'key_exchanges.id');

        return $this->paged($query->paginate($this->perPage($request)), fn (KeyExchange $x) => $this->presentBuyIn($x), [
            'summary' => ['total_buy_in' => Points::decimal($total), 'total_keys' => Points::decimal($keys)],
        ]);
    }

    public function revenueConversions(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:64'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'tz' => ['nullable', 'timezone:all'],
            'role' => ['nullable', 'in:admin,incorporator,master'],
            'sort' => ['nullable', 'in:newest,oldest,amount_desc,amount_asc'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $query = $this->scopeRevenueConversions(RevenueConversion::query())
            ->where('revenue_conversions.status', RevenueConversion::COMPLETED)
            ->with(['user:id,username', 'transaction:id,reference']);
        $this->dateRange($query, 'revenue_conversions.created_at', $data);

        match ($data['role'] ?? null) {
            'admin' => $query->whereIn('revenue_conversions.role', [Role::SuperAdmin->value, Role::Administrator->value]),
            'incorporator' => $query->where('revenue_conversions.role', Role::Agent->value)->where('revenue_conversions.agent_level', 'agent'),
            'master' => $query->where('revenue_conversions.role', Role::Agent->value)->where('revenue_conversions.agent_level', 'master'),
            default => null,
        };

        if ($term = trim((string) ($data['q'] ?? ''))) {
            $id = $this->numericId($term, '');
            $query->where(function (Builder $w) use ($term, $id) {
                $w->where('revenue_conversions.reference', 'like', "%{$term}%")
                    ->orWhereHas('user', fn (Builder $u) => $u->where('username', 'like', "%{$term}%"))
                    ->orWhereHas('transaction', fn (Builder $t) => $t->where('reference', 'like', "%{$term}%"))
                    ->when($id !== null, fn (Builder $x) => $x->orWhere('revenue_conversions.user_id', $id));
            });
        }

        $total = (int) (clone $query)->sum('revenue_conversions.revenue_amount');
        $this->sorted($query, $data['sort'] ?? 'newest', 'revenue_conversions.revenue_amount', 'revenue_conversions.id');

        return $this->paged($query->paginate($this->perPage($request)), fn (RevenueConversion $c) => $this->presentConversion($c), [
            'summary' => ['total_converted' => Points::decimal($total)],
        ]);
    }

    /** Scope hooks: the whole platform here; the Agent Panel limits them to its downline. */
    protected function scopeRevenueLogs(Builder $query): Builder
    {
        return $query;
    }

    protected function scopeRevenueConversions(Builder $query): Builder
    {
        return $query;
    }

    /** @return array<string, mixed> */
    protected function presentBuyIn(KeyExchange $x): array
    {
        $labels = ['admin' => 'Admin', 'incorporator' => 'Incorporator', 'master' => 'Master Agent'];
        $order = ['master' => 0, 'incorporator' => 1, 'admin' => 2];
        $upline = collect($x->hierarchy ?? [])
            ->filter(fn ($h) => is_array($h) && isset($h['role'], $h['username']))
            ->sortBy(fn ($h) => $order[$h['role']] ?? 9)
            ->map(fn ($h) => ['role' => $labels[$h['role']] ?? ucfirst((string) $h['role']), 'username' => $h['username'], 'user_id' => $h['user_id'] ?? null])
            ->values()->all();

        return [
            'id' => $x->id,
            'transaction_id' => 'SB'.str_pad((string) $x->id, 8, '0', STR_PAD_LEFT),
            'player' => ['id' => $x->user_id, 'username' => $x->user?->username ?? $x->player_username],
            'upline' => $upline,
            'buy_in' => Points::decimal($x->chips_amount),
            'keys' => Points::decimal($x->keys_amount),
            'payment_method' => 'Chips',
            'status' => $x->status,
            'created_at' => $x->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    protected function presentConversion(RevenueConversion $c): array
    {
        $role = match (true) {
            in_array($c->role, [Role::SuperAdmin->value, Role::Administrator->value], true) => 'Admin',
            $c->agent_level === 'master' => 'Master Agent',
            default => 'Incorporator',
        };

        return [
            'id' => $c->id,
            'transaction_id' => $c->reference,
            'reference' => $c->transaction?->reference,
            'account' => ['id' => $c->user_id, 'username' => $c->user?->username, 'role' => $role],
            'revenue_converted' => Points::decimal($c->revenue_amount),
            'chips_credited' => Points::decimal($c->chips_amount),
            'status' => $c->status,
            'created_at' => $c->created_at?->toIso8601String(),
        ];
    }

    /** @param  array<string, mixed>  $data */
    private function dateRange(Builder $query, string $column, array $data): void
    {
        // Dates are calendar days in the viewer's timezone (sent by the page); stored timestamps are UTC.
        $tz = (string) ($data['tz'] ?? 'UTC');
        if (! empty($data['from'])) {
            $query->where($column, '>=', \Illuminate\Support\Carbon::parse($data['from'], $tz)->startOfDay()->utc());
        }
        if (! empty($data['to'])) {
            $query->where($column, '<=', \Illuminate\Support\Carbon::parse($data['to'], $tz)->endOfDay()->utc());
        }
    }

    private function sorted(Builder $query, string $sort, string $amount, string $id): void
    {
        match ($sort) {
            'oldest' => $query->orderBy($id),
            'amount_desc' => $query->orderByDesc($amount)->orderByDesc($id),
            'amount_asc' => $query->orderBy($amount)->orderByDesc($id),
            default => $query->orderByDesc($id),
        };
    }

    /** "SB00000012" / "12" → 12 (for searching by ID), or null. */
    private function numericId(string $term, string $prefix): ?int
    {
        $t = $prefix !== '' && stripos($term, $prefix) === 0 ? substr($term, strlen($prefix)) : $term;

        return ctype_digit($t) && strlen($t) <= 12 ? (int) $t : null;
    }
}
