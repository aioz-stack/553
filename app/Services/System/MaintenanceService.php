<?php

namespace App\Services\System;

use App\Enums\MaintenanceMode;
use App\Events\MaintenanceUpdated;
use App\Exceptions\BusinessRuleException;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * The platform maintenance mode — one database row (system_settings key "maintenance_mode"),
 * changed only by Admins (Super Admin / Administrator) from the Admin Panel.
 *
 * Enforcement is on the server:
 *  - game routes (lobby, rooms, tables, games, Single Player) answer 503 "maintenance" while
 *    the game is blocked (EnsureGameOpen middleware), and app sign-in is refused;
 *  - every wallet / Chips / commission operation of an Agent (any level) or Player calls
 *    assertTransactionsAllowed() inside its own database transaction. The check reads the
 *    setting row with a shared lock and set() takes an exclusive lock, so a transaction is
 *    either committed before a mode change or sees the new mode — nothing slips through.
 * Game settlements of games already being played are not "transactions" here; they finish.
 */
class MaintenanceService
{
    public const KEY = 'maintenance_mode';

    public function current(): MaintenanceMode
    {
        return self::parse(SystemSetting::get(self::KEY));
    }

    /** @return array{mode: string, label: string, game_blocked: bool, transactions_blocked: bool, changed_at: string|null} */
    public function status(): array
    {
        $value = SystemSetting::get(self::KEY);

        return self::present(self::parse($value), is_array($value) ? ($value['changed_at'] ?? null) : null);
    }

    /** @return array{mode: string, label: string, game_blocked: bool, transactions_blocked: bool, changed_at: string|null} */
    public static function present(MaintenanceMode $mode, ?string $changedAt = null): array
    {
        return [
            'mode' => $mode->value,
            'label' => $mode->label(),
            'game_blocked' => $mode->gameBlocked(),
            'transactions_blocked' => $mode->transactionsBlocked(),
            'changed_at' => $changedAt,
        ];
    }

    /** Admin Panel only: switch the mode (audited, broadcast to every open panel and app). */
    public function set(User $actor, MaintenanceMode $mode): array
    {
        if (! $actor->isActive() || (! $actor->isSuperAdmin() && ! $actor->isAdministrator())) {
            throw new BusinessRuleException('Only Admins can change maintenance.', 403, 'forbidden');
        }

        return DB::transaction(function () use ($actor, $mode) {
            SystemSetting::query()->firstOrCreate(['key' => self::KEY], ['value' => ['mode' => MaintenanceMode::Off->value]]);
            /** @var SystemSetting $row */
            $row = SystemSetting::query()->where('key', self::KEY)->lockForUpdate()->firstOrFail();
            $previous = self::parse($row->value);
            $changedAt = now()->toIso8601String();

            $row->forceFill(['value' => ['mode' => $mode->value, 'changed_at' => $changedAt, 'changed_by' => $actor->id], 'updated_by' => $actor->id])->save();
            AuditLogger::log($actor, 'maintenance.mode', $row, ['mode' => $previous->value], ['mode' => $mode->value, 'by' => $actor->username, 'at' => $changedAt]);

            $status = self::present($mode, $changedAt);
            // Best effort: the mode is already saved; clients also poll /status if Reverb is down.
            DB::afterCommit(fn () => rescue(fn () => event(new MaintenanceUpdated($status)), report: false));

            return $status + ['previous' => $previous->value];
        });
    }

    /**
     * Refuse a wallet, Chips or commission operation of an Agent or Player while transactions
     * are in maintenance. Call it inside the operation's database transaction.
     */
    public function assertTransactionsAllowed(?User $actor, ?User ...$accounts): void
    {
        $involved = array_filter([$actor, ...$accounts]);
        if (! collect($involved)->contains(fn (User $u) => $u->isAgent() || $u->isPlayer())) {
            return;
        }

        $value = SystemSetting::query()->where('key', self::KEY)->sharedLock()->value('value');
        $mode = self::parse(is_string($value) ? json_decode($value, true) : $value);

        if ($mode->transactionsBlocked()) {
            throw new BusinessRuleException('Transactions for agents and players are temporarily unavailable during maintenance.', 503, 'maintenance');
        }
    }

    public function assertGameOpen(): void
    {
        if ($this->current()->gameBlocked()) {
            throw new BusinessRuleException('Pusoy553 is currently under maintenance. Please check back soon!', 503, 'maintenance');
        }
    }

    private static function parse(mixed $value): MaintenanceMode
    {
        $mode = is_array($value) ? ($value['mode'] ?? null) : $value;

        return MaintenanceMode::tryFrom((string) $mode) ?? MaintenanceMode::Off;
    }
}
