<?php

namespace App\Services\Users;

use App\Enums\Ability;
use App\Enums\AgentLevel;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\Agent;
use App\Models\AgentPlayer;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Services\Audit\AuditLogger;
use App\Services\Wallet\WalletService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Permanent referral links, registration through them, and approval.
 *
 * Every account has ONE permanent referral code (users.referral_code) and two links:
 *   {APP_URL}/register/player?ref=CODE  — registers a Player under the account;
 *   {APP_URL}/register/agent?ref=CODE   — registers the next agent level under it
 *     (Administrator → Agent → Master Agent → Silver Agent; Silver Agents have no Agent link).
 *
 * Registration through a link creates a PENDING account whose sponsor (users.sponsor_id)
 * is fixed at that moment and never changes. Approval activates it and builds the
 * hierarchy: an agent row with its level and upline, or the player's link to its agent
 * (a Player under the Administrator has no agent). All codes are validated here, on the
 * server; nothing the client sends decides the sponsor or the level.
 */
class ReferralService
{
    public function __construct(private readonly WalletService $wallets) {}

    // ------------------------------------------------------------------ links

    /** A new, unique, readable code: up to 8 letters/digits of the username + 3 digits. */
    public static function newCode(string $username): string
    {
        $base = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $username) ?: 'USER', 0, 8));
        do {
            $code = $base.str_pad((string) random_int(0, 999), 3, '0', STR_PAD_LEFT);
        } while (User::query()->where('referral_code', $code)->exists());

        return $code;
    }

    /** The account's permanent code (created once, on first use, if it predates referral links). */
    public function codeFor(User $user): string
    {
        if (! $user->referral_code) {
            $user->forceFill(['referral_code' => self::newCode($user->username)])->save();
        }

        return $user->referral_code;
    }

    /** The level an Agent link of $user registers (null = $user cannot recruit agents). */
    public function recruitLevel(User $user): ?AgentLevel
    {
        if ($user->isSuperAdmin() || $user->isAdministrator()) {
            return AgentLevel::Agent;
        }

        if ($user->isAgent()) {
            return $user->agent?->level?->recruits();
        }

        return null;
    }

    /**
     * @return array{code: string, player: string|null, agent: string|null, agent_level: string|null}
     */
    public function links(User $user): array
    {
        $code = $this->codeFor($user);
        $base = rtrim((string) config('app.url'), '/');
        $level = $this->recruitLevel($user);
        $canRefer = ! $user->isPlayer();

        return [
            'code' => $code,
            'player' => $canRefer ? "{$base}/register/player?ref={$code}" : null,
            'agent' => $level ? "{$base}/register/agent?ref={$code}" : null,
            'agent_level' => $level?->label(),
        ];
    }

    /**
     * Who a code belongs to and what it can register (public: the registration page shows it).
     *
     * @return array{sponsor: User, type: string, level: AgentLevel|null}
     */
    public function resolve(string $code, string $type): array
    {
        $code = strtoupper(trim($code));
        $sponsor = User::query()->where('referral_code', $code)->first();

        // Only the permanent registration links (users.referral_code) register accounts; the
        // retired per-agent referral codes no longer do.
        if ($sponsor === null || $sponsor->isPlayer() || $sponsor->status !== UserStatus::Active) {
            throw new BusinessRuleException('This referral link is invalid or no longer active.', 422, 'invalid_referral');
        }

        if ($type === 'agent') {
            $level = $this->recruitLevel($sponsor);
            if ($level === null) {
                throw new BusinessRuleException('This account cannot register agents.', 422, 'invalid_referral');
            }

            return ['sponsor' => $sponsor, 'type' => 'agent', 'level' => $level];
        }

        if ($type !== 'player') {
            throw new BusinessRuleException('Choose a valid account type.', 422, 'invalid_referral');
        }

        return ['sponsor' => $sponsor, 'type' => 'player', 'level' => null];
    }

    // ------------------------------------------------------------------ registration

    /**
     * Public registration: a pending account (no sign-in until approved), only through a
     * registration link — Player links register players, Agent links agents of the next level —
     * so every new account has its referrer and place in the hierarchy.
     *
     * @param  array{name: string, username: string, email: string, password: string, phone?: string|null}  $data
     */
    public function register(array $data, ?string $code, string $type = 'player'): User
    {
        if ($code === null || trim($code) === '') {
            throw new BusinessRuleException('Registration is only possible through a registration link.', 422, 'invalid_referral');
        }

        return DB::transaction(function () use ($data, $code, $type) {
            $resolved = $this->resolve($code, $type);

            $user = new User($data);
            $user->forceFill([
                'role' => $type === 'agent' ? Role::Agent : Role::Player,
                'status' => UserStatus::Pending,
                'sponsor_id' => $resolved['sponsor']->id ?? null,
                'registered_as' => $type,
                'referral_code' => self::newCode($data['username']),
            ])->save();

            $this->wallets->provision($user);

            if ($type === 'player') {
                $user->profile()->create(['display_name' => $user->name]);
            }

            AuditLogger::log($user, 'user.registered', $user, null, [
                'type' => $type,
                'sponsor_id' => $user->sponsor_id,
                'level' => $resolved['level']?->value ?? null,
            ]);

            return $user;
        });
    }

    // ------------------------------------------------------------------ approval

    /** Approve a pending registration: activate it and attach it to its sponsor. */
    public function approve(User $actor, User $user): User
    {
        $this->authorizeReview($actor, $user);

        return DB::transaction(function () use ($actor, $user) {
            /** @var User $user */
            $user = User::query()->lockForUpdate()->findOrFail($user->id);

            if ($user->status !== UserStatus::Pending) {
                throw new BusinessRuleException('Only pending registrations can be approved.', 409, 'invalid_state');
            }

            $sponsor = $user->sponsor;

            if ($user->isAgent()) {
                // The level comes from the sponsor (Administrator → Agent → Master → Silver), checked again now.
                $level = $sponsor ? $this->recruitLevel($sponsor) : AgentLevel::Agent;
                if ($level === null) {
                    throw new BusinessRuleException('The sponsor can no longer register agents.', 409, 'invalid_state');
                }

                Agent::query()->firstOrCreate(['user_id' => $user->id], [
                    'code' => $this->uniqueAgentCode(),
                    'level' => $level->value,
                    'parent_agent_id' => $sponsor?->isAgent() ? $sponsor->agent?->id : null,
                    'status' => 'active',
                    'created_by' => $actor->id,
                ]);
            } elseif ($sponsor?->isAgent() && $sponsor->agent) {
                AgentPlayer::query()->firstOrCreate(['player_id' => $user->id], [
                    'agent_id' => $sponsor->agent->id,
                    'assigned_by' => $actor->id,
                    'assigned_at' => now(),
                ]);
            }

            $user->forceFill([
                'status' => UserStatus::Active,
                'approved_at' => now(),
                'approved_by' => $actor->id,
                'status_changed_at' => now(),
                'status_changed_by' => $actor->id,
            ])->save();

            AuditLogger::log($actor, 'user.approved', $user, ['status' => 'pending'], ['status' => 'active', 'sponsor_id' => $user->sponsor_id]);

            return $user->fresh(['agent', 'sponsor']);
        });
    }

    /** Delete a pending registration that never became active (no ledger history can exist). */
    public function deletePending(User $actor, User $user): void
    {
        $this->authorizeReview($actor, $user);

        DB::transaction(function () use ($actor, $user) {
            /** @var User $user */
            $user = User::query()->lockForUpdate()->findOrFail($user->id);

            if ($user->status !== UserStatus::Pending) {
                throw new BusinessRuleException('Only pending registrations can be deleted. Archive active accounts instead.', 409, 'invalid_state');
            }

            $walletIds = $user->wallets()->pluck('id');
            $hasHistory = WalletTransaction::query()->whereIn('source_wallet_id', $walletIds)->orWhereIn('destination_wallet_id', $walletIds)->exists();
            if ($hasHistory) {
                throw new BusinessRuleException('This account has transaction history and cannot be deleted. Archive it instead.', 409, 'has_history');
            }

            AuditLogger::log($actor, 'user.registration_deleted', $user, ['username' => $user->username, 'email' => $user->email, 'sponsor_id' => $user->sponsor_id]);

            DB::table('wallets')->whereIn('id', $walletIds)->delete();
            $user->profile()->delete();
            $user->tokens()->delete();
            $user->delete();
        });
    }

    private function authorizeReview(User $actor, User $user): void
    {
        $ability = $user->isAgent() ? Ability::ManageAgents : Ability::ManagePlayers;

        if (! $actor->isSuperAdmin() && ! ($actor->isAdministrator() && $actor->hasAbility($ability))) {
            throw new BusinessRuleException('You are not allowed to review this registration.', 403, 'forbidden');
        }
    }

    private function uniqueAgentCode(): string
    {
        do {
            $code = 'AG'.strtoupper(Str::random(6));
        } while (Agent::query()->where('code', $code)->exists());

        return $code;
    }
}
