<?php

namespace App\Services\Wallet;

use App\Enums\Ability;
use App\Exceptions\BusinessRuleException;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * Shop revenue-sharing rates (who gets which percent of the Chips a player pays for Keys), set
 * centrally by the Administrator. Stored in system_settings ('shop.revenue_shares', basis points);
 * until an Admin saves rates, the defaults from config('pusoy.shop.revenue_shares') apply.
 *
 *  - Only a Super Admin, or an Administrator with the manage_commissions ability, may change them.
 *    Incorporators and Master Agents never can (the route is staff-only and this class checks again).
 *  - Every scenario must total exactly 100%; the roles per scenario are fixed (direct upline).
 *  - Changes apply to future purchases only: each completed exchange already stores its shares
 *    (key_exchange_shares.percent_bps), so history never changes.
 */
class ShopRevenueShares
{
    public const KEY = 'shop.revenue_shares';

    /** The roles that share each scenario (keyed by the player's direct upline). */
    public const ROLES = [
        'admin' => ['admin'],
        'incorporator' => ['admin', 'incorporator'],
        'master' => ['admin', 'incorporator', 'master'],
    ];

    /**
     * Current rates in basis points: scenario => role => bps.
     *
     * @return array<string, array<string, int>>
     */
    public function bps(): array
    {
        $saved = SystemSetting::get(self::KEY);

        return is_array($saved) && $this->valid($saved) ? $saved : $this->defaults();
    }

    /** @return array<string, int> */
    public function forScenario(string $scenario): array
    {
        return $this->bps()[$scenario] ?? throw new BusinessRuleException('The Shop revenue shares are misconfigured.', 500, 'shares_invalid');
    }

    /**
     * For the panel: percents (2 decimals), whether the viewer may edit, and the last change.
     *
     * @return array<string, mixed>
     */
    public function present(User $viewer): array
    {
        $row = SystemSetting::query()->where('key', self::KEY)->first();

        return [
            'rates' => array_map(fn (array $roles) => array_map(fn (int $b) => $b / 100, $roles), $this->bps()),
            'can_edit' => self::canEdit($viewer),
            'updated_at' => $row?->updated_at?->toIso8601String(),
            'is_default' => $row === null,
        ];
    }

    public static function canEdit(User $user): bool
    {
        return $user->isActive() && ($user->isSuperAdmin() || ($user->isAdministrator() && $user->hasAbility(Ability::ManageCommissions)));
    }

    /**
     * Save new rates (percent, up to 2 decimals). Every scenario must be given and total 100%.
     *
     * @param  array<string, array<string, float|int|string>>  $percents
     * @return array<string, array<string, int>>
     */
    public function set(User $actor, array $percents): array
    {
        if (! self::canEdit($actor)) {
            throw new BusinessRuleException('Only the Administrator can change revenue-sharing rates.', 403, 'forbidden');
        }

        $bps = [];
        foreach (self::ROLES as $scenario => $roles) {
            $given = $percents[$scenario] ?? null;
            if (! is_array($given) || array_diff(array_keys($given), $roles) !== [] || array_diff($roles, array_keys($given)) !== []) {
                throw new BusinessRuleException("Give a rate for each role of the {$this->label($scenario)} scenario.", 422, 'invalid_rate');
            }
            foreach ($roles as $role) {
                $value = $given[$role];
                if (! is_numeric($value) || (float) $value < 0 || (float) $value > 100 || abs(round((float) $value * 100) - (float) $value * 100) > 1e-6) {
                    throw new BusinessRuleException('Rates must be between 0% and 100%, with at most 2 decimals.', 422, 'invalid_rate');
                }
                $bps[$scenario][$role] = (int) round((float) $value * 100);
            }
            if (array_sum($bps[$scenario]) !== 10000) {
                throw new BusinessRuleException("The {$this->label($scenario)} rates must total exactly 100%.", 422, 'invalid_total');
            }
        }

        DB::transaction(function () use ($actor, $bps) {
            $row = SystemSetting::query()->where('key', self::KEY)->lockForUpdate()->first();
            $before = $row?->value ?? $this->defaults();
            SystemSetting::query()->updateOrCreate(['key' => self::KEY], ['value' => $bps, 'updated_by' => $actor->id]);
            AuditLogger::log($actor, 'shop.revenue_shares', null, ['bps' => $before], ['bps' => $bps]);
        });

        return $bps;
    }

    /** @return array<string, array<string, int>> */
    private function defaults(): array
    {
        $out = [];
        foreach (self::ROLES as $scenario => $roles) {
            foreach ($roles as $role) {
                $out[$scenario][$role] = (int) round(((float) config("pusoy.shop.revenue_shares.{$scenario}.{$role}", 0)) * 100);
            }
        }

        return $out;
    }

    private function valid(array $bps): bool
    {
        foreach (self::ROLES as $scenario => $roles) {
            if (! isset($bps[$scenario]) || ! is_array($bps[$scenario]) || array_sum(array_map('intval', $bps[$scenario])) !== 10000) {
                return false;
            }
            foreach ($roles as $role) {
                if (! isset($bps[$scenario][$role]) || ! is_int($bps[$scenario][$role])) {
                    return false;
                }
            }
        }

        return true;
    }

    private function label(string $scenario): string
    {
        return ['admin' => 'Admin', 'incorporator' => 'Incorporator', 'master' => 'Master Agent'][$scenario] ?? $scenario;
    }
}
