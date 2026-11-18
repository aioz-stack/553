<?php

namespace App\Models;

use App\Enums\Ability;
use App\Enums\Currency;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Enums\WalletType;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasOneThrough;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Role, status and created_by are intentionally not mass assignable from
     * request data; services set them explicitly.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'username',
        'email',
        'phone',
        'profile_picture',
        'password',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'status' => UserStatus::class,
            'preferences' => 'array',
        ];
    }

    /** Motion quality levels for the game's animations (Settings → Motion Effects). */
    public const MOTION_LEVELS = ['low', 'medium', 'high'];

    /** Default game settings for a player who has never changed them. */
    public const DEFAULT_PREFERENCES = ['bgm' => true, 'sfx' => true, 'motion' => 'high'];

    /**
     * This player's game settings (BGM, sound effects, motion quality), defaults filled in.
     *
     * @return array{bgm: bool, sfx: bool, motion: string}
     */
    public function gamePreferences(): array
    {
        $saved = is_array($this->preferences) ? $this->preferences : [];
        $p = array_merge(self::DEFAULT_PREFERENCES, array_intersect_key($saved, self::DEFAULT_PREFERENCES));

        return [
            'bgm' => (bool) $p['bgm'],
            'sfx' => (bool) $p['sfx'],
            'motion' => in_array($p['motion'], self::MOTION_LEVELS, true) ? $p['motion'] : 'high',
        ];
    }

    public function profile(): HasOne
    {
        return $this->hasOne(PlayerProfile::class);
    }

    public function devices(): HasMany
    {
        return $this->hasMany(UserDevice::class);
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class)->withTimestamps();
    }

    public function administratorLimits(): HasMany
    {
        return $this->hasMany(AdministratorLimit::class);
    }

    public function wallets(): HasMany
    {
        return $this->hasMany(Wallet::class);
    }

    public function agent(): HasOne
    {
        return $this->hasOne(Agent::class);
    }

    /**
     * The agent that owns this player (through agent_players).
     */
    public function owningAgent(): HasOneThrough
    {
        return $this->hasOneThrough(Agent::class, AgentPlayer::class, 'player_id', 'id', 'id', 'agent_id');
    }

    public function agentLink(): HasOne
    {
        return $this->hasOne(AgentPlayer::class, 'player_id');
    }

    public function seats(): HasMany
    {
        return $this->hasMany(GamePlayer::class);
    }

    public function gameResults(): HasMany
    {
        return $this->hasMany(GameResult::class);
    }

    public function scopeRole(Builder $query, Role $role): Builder
    {
        return $query->where('role', $role->value);
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === Role::SuperAdmin;
    }

    public function isAdministrator(): bool
    {
        return $this->role === Role::Administrator;
    }

    public function isAgent(): bool
    {
        return $this->role === Role::Agent;
    }

    public function isPlayer(): bool
    {
        return $this->role === Role::Player;
    }

    public function isActive(): bool
    {
        return $this->status === UserStatus::Active;
    }

    /**
     * Super Admins hold every ability; administrators hold only those granted.
     */
    public function hasAbility(Ability $ability): bool
    {
        if ($this->isSuperAdmin()) {
            return true;
        }

        if (! $this->isAdministrator()) {
            return false;
        }

        return $this->relationLoaded('permissions')
            ? $this->permissions->contains('key', $ability->value)
            : $this->permissions()->where('key', $ability->value)->exists();
    }

    /**
     * @return list<string>
     */
    public function abilityKeys(): array
    {
        if ($this->isSuperAdmin()) {
            return array_map(fn (Ability $a) => $a->value, Ability::cases());
        }

        if (! $this->isAdministrator()) {
            return [];
        }

        return $this->permissions()->pluck('key')->all();
    }

    /**
     * Notifications broadcast on the same private channel as game events.
     */
    public function receivesBroadcastNotificationsOn(): string
    {
        return 'user.'.$this->id;
    }

    public function wallet(Currency $currency, WalletType $type = WalletType::Player): ?Wallet
    {
        return $this->wallets()->where('currency', $currency->value)->where('type', $type->value)->first();
    }
}
