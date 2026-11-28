<?php

namespace App\Services\Users;

use App\Enums\AgentLevel;
use App\Exceptions\BusinessRuleException;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Who may approve or reject a registration. The one rule, used by every list, count, approval,
 * rejection and deletion of a registration — web and API, Admin Panel and Agent Panel:
 *
 *   A registration is reviewed by the owner of the registration link it was made through
 *   (users.sponsor_id, fixed at registration and never changed), and only for what that
 *   owner's role may approve:
 *
 *     Administrator (and Super Admin, for its own links) → Incorporators and Players
 *     Incorporator                                       → Master Agents and Players
 *     Master Agent                                       → Players
 *     Player / Loader                                    → nothing
 *
 * So an Administrator never sees or approves another Administrator's registrations, nor the
 * Master Agents and Players who registered through an Incorporator's link; an Incorporator
 * never sees another Incorporator's, nor those of its Master Agents; and so on.
 *
 * Super Admin: full platform authority (AGENTS.md §6) — may review every registration. A link
 * owner who is no longer active cannot review anything; its pending applicants can then only be
 * rejected by a Super Admin (approval still needs an active owner to join under — see
 * ReferralService::approve()).
 */
final class RegistrationReview
{
    /** The applicant types (player | agent = Incorporator | master) $reviewer may approve. */
    public static function reviewableTypes(User $reviewer): array
    {
        if (! $reviewer->isActive()) {
            return [];
        }

        if ($reviewer->isSuperAdmin() || $reviewer->isAdministrator()) {
            return ['agent', 'player'];
        }

        if ($reviewer->isAgent()) {
            $agent = $reviewer->agent;

            return match (true) {
                $agent === null => [],
                $agent->level === AgentLevel::Agent => ['master', 'player'],
                // Master Agents, and older agent rows without a level (they register Players only).
                default => ['player'],
            };
        }

        return [];
    }

    /** Whether $reviewer may approve / reject (or see) this registration. */
    public static function canReview(User $reviewer, User $applicant): bool
    {
        if ($applicant->registered_as === null || $applicant->id === $reviewer->id || ! $reviewer->isActive()) {
            return false;
        }

        if ($reviewer->isSuperAdmin()) {
            return true;
        }

        return $applicant->sponsor_id === $reviewer->id
            && in_array(self::applicantType($applicant), self::reviewableTypes($reviewer), true);
    }

    public static function assertCanReview(User $reviewer, User $applicant): void
    {
        if (! self::canReview($reviewer, $applicant)) {
            throw new BusinessRuleException('You are not allowed to review this registration.', 403, 'forbidden');
        }
    }

    /**
     * Limit a users query to the registrations $reviewer may review (any registration state).
     *
     * @template T of Builder
     *
     * @param  T  $query
     * @return T
     */
    public static function scope(Builder $query, User $reviewer): Builder
    {
        $query->whereNotNull('users.registered_as')->where('users.id', '!=', $reviewer->id);

        if ($reviewer->isSuperAdmin() && $reviewer->isActive()) {
            return $query;
        }

        $types = self::reviewableTypes($reviewer);
        if ($types === []) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where('users.sponsor_id', $reviewer->id)->whereIn('users.applicant_type', $types);
    }

    /**
     * What the applicant registered as: player | agent (Incorporator) | master. The snapshot taken
     * at registration; for older rows without one, derived from the link owner.
     */
    public static function applicantType(User $applicant): ?string
    {
        if ($applicant->applicant_type) {
            return $applicant->applicant_type;
        }

        if ($applicant->registered_as === 'player') {
            return 'player';
        }

        if ($applicant->registered_as === 'agent') {
            $sponsor = $applicant->sponsor;

            return $sponsor ? Hierarchy::agentLevelFor($sponsor)?->value : null;
        }

        return null;
    }

    public static function typeLabel(?string $type): string
    {
        return match ($type) {
            'player' => 'Player',
            'agent' => 'Incorporator',
            'master' => 'Master Agent',
            default => 'Unknown',
        };
    }
}
