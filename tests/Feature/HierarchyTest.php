<?php

use App\Enums\Ability;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\Agent;
use App\Models\User;
use App\Services\Users\ReferralService;
use App\Services\Users\UserManagementService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class));

/** Admin → Incorporator (agent) → Master Agent → Player, built through the links. */
function hyChain(): array
{
    $super = superAdmin();
    $refs = app(ReferralService::class);
    $join = function (string $code, string $type, string $username) use ($refs, $super) {
        return $refs->approve($super, $refs->register(['name' => $username, 'username' => $username, 'email' => "{$username}@t.test", 'password' => 'secret123'], $code, $type));
    };
    $agent = $join($refs->codeFor($super), 'agent', 'hyagent');
    $master = $join($agent->referral_code, 'agent', 'hymaster');
    $player = $join($master->referral_code, 'player', 'hyplayer');
    $admin = User::factory()->create(['role' => Role::Administrator]);
    $admin->permissions()->attach(\App\Models\Permission::query()->where('key', Ability::ManageAgents->value)->pluck('id'));

    return compact('super', 'admin', 'agent', 'master', 'player');
}

function hyPayload(string $username): array
{
    return ['name' => $username, 'username' => $username, 'email' => "{$username}@t.test", 'password' => 'secret123', 'password_confirmation' => 'secret123'];
}

test('registration links: each role gets exactly the links its level may use', function () {
    $t = hyChain();
    $links = fn (User $u) => app(ReferralService::class)->links($u->fresh());

    // [creator, agent link level, player link?]
    foreach ([['super', 'Incorporator', false], ['admin', 'Incorporator', false], ['agent', 'Master Agent', true], ['master', null, true], ['player', null, false]] as [$who, $level, $players]) {
        $l = $links($t[$who]);
        expect($l['agent_level'])->toBe($level, "{$who} agent level")
            ->and($l['agent'] !== null)->toBe($level !== null, "{$who} agent link")
            ->and($l['player'] !== null)->toBe($players, "{$who} player link");
    }
});

test('registering through a link creates only what the link owner may create, under the owner', function () {
    $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class); // many sign-ups in a row
    $t = hyChain();
    $register = fn (User $owner, string $type, string $username) => $this->postJson('/api/v1/auth/register', hyPayload($username) + ['referral_code' => app(ReferralService::class)->codeFor($owner), 'account_type' => $type]);

    // Allowed: Admin → Incorporator, Incorporator → Master + Player, Master → Player.
    foreach ([['super', 'agent'], ['admin', 'agent'], ['agent', 'agent'], ['agent', 'player'], ['master', 'player']] as $i => [$who, $type]) {
        $register($t[$who], $type, "ok{$i}")->assertCreated();
        $new = User::query()->where('username', "ok{$i}")->firstOrFail();
        expect($new->sponsor_id)->toBe($t[$who]->id)->and($new->status)->toBe(UserStatus::Pending);
        $approved = app(ReferralService::class)->approve($t['super'], $new);
        if ($type === 'agent') {
            $expected = ['super' => 'agent', 'admin' => 'agent', 'agent' => 'master'][$who];
            expect($approved->agent->level->value)->toBe($expected)
                ->and($approved->agent->parent_agent_id)->toBe($t[$who]->isAgent() ? $t[$who]->agent->id : null);
        } else {
            expect($approved->agentLink->agent_id)->toBe($t[$who]->agent->id);
        }
    }

    // Refused: Admins → Players, Master Agents → Agents (no Silver Agents any more), Players → anything.
    foreach ([['super', 'player'], ['admin', 'player'], ['master', 'agent'], ['player', 'player'], ['player', 'agent']] as $i => [$who, $type]) {
        $register($t[$who], $type, "no{$i}")->assertStatus(422)->assertJsonPath('error', 'invalid_referral');
    }
    expect(User::query()->where('username', 'like', 'no%')->count())->toBe(0);

    // The request cannot choose a role or level, a sponsor or a parent: extra fields are ignored.
    $register($t['agent'], 'agent', 'sneaky')->assertCreated();
    $this->postJson('/api/v1/auth/register', hyPayload('sneaky2') + ['referral_code' => $t['master']->referral_code, 'account_type' => 'admin'])->assertStatus(422);
    $this->postJson('/api/v1/auth/register', hyPayload('sneaky3') + ['referral_code' => $t['master']->referral_code, 'role' => 'admin', 'level' => 'silver', 'sponsor_id' => $t['super']->id])->assertCreated();
    $sneaky3 = User::query()->where('username', 'sneaky3')->firstOrFail();
    expect($sneaky3->role)->toBe(Role::Player)->and($sneaky3->sponsor_id)->toBe($t['master']->id);
});

test('approval re-checks the hierarchy: a sponsor that lost the right cannot add the account', function () {
    $t = hyChain();
    $refs = app(ReferralService::class);
    $pending = $refs->register(hyPayload('late'), $t['agent']->referral_code, 'agent');
    // The Incorporator is moved down to Master Agent before approval: it may no longer create agents.
    Agent::query()->whereKey($t['agent']->agent->id)->update(['level' => 'master']);

    expect(fn () => $refs->approve($t['super'], $pending->fresh()))->toThrow(BusinessRuleException::class, 'no longer register agents');
    expect($pending->fresh()->status)->toBe(UserStatus::Pending);
});

test('direct account creation follows the same rule for every creator', function () {
    $t = hyChain();
    $users = app(UserManagementService::class);
    $n = 0;
    $try = function (?User $creator, Role $role) use ($users, &$n) {
        $n++;
        try {
            return $users->create($creator, $role, ['name' => "d{$n}", 'username' => "direct{$n}", 'email' => "direct{$n}@t.test", 'password' => 'secret123']);
        } catch (BusinessRuleException) {
            return null;
        }
    };

    $allowed = [
        'super' => [Role::SuperAdmin, Role::Administrator, Role::Loader, Role::Agent],
        'admin' => [Role::Loader, Role::Agent], // Loader Accounts: employees of Admins
        'agent' => [Role::Agent, Role::Player],
        'master' => [Role::Player],
        'player' => [],
    ];
    foreach ($allowed as $who => $roles) {
        foreach (Role::cases() as $role) {
            $made = $try($t[$who], $role);
            expect($made !== null)->toBe(in_array($role, $roles, true), "{$who} → {$role->value}");
            if ($made && $role === Role::Agent) {
                $expected = ['super' => 'agent', 'admin' => 'agent', 'agent' => 'master'][$who];
                expect($made->agent->level->value)->toBe($expected)->and($made->sponsor_id)->toBe($t[$who]->id);
            }
            if ($made && $role === Role::Player) {
                expect($made->agentLink->agent_id)->toBe($t[$who]->agent->id)->and($made->sponsor_id)->toBe($t[$who]->id);
            }
        }
    }
    // Nobody creates accounts anonymously; an Administrator without manage_agents cannot create Agents.
    expect($try(null, Role::Player))->toBeNull()
        ->and($try(User::factory()->create(['role' => Role::Administrator]), Role::Agent))->toBeNull();
});

test('the staff API cannot be used to bypass the links', function () {
    $t = hyChain();
    foreach (['player', 'agent'] as $role) {
        $this->actingAs($t['super'])->postJson('/api/v1/admin/users', hyPayload("api{$role}") + ['role' => $role])->assertStatus(422);
    }
    $this->actingAs($t['admin'])->postJson('/api/v1/admin/users', hyPayload('apiadmin') + ['role' => 'admin'])->assertForbidden();
    expect($this->actingAs($t['agent'])->postJson('/api/v1/admin/users', hyPayload('apiag') + ['role' => 'player'])->status())->toBe(403);
    expect(User::query()->where('username', 'like', 'api%')->count())->toBe(0);
});

test('existing accounts keep their sponsor and place in the hierarchy', function () {
    // An older player registered directly under an Administrator stays exactly where it is.
    $super = superAdmin();
    $old = User::factory()->player()->create(['sponsor_id' => $super->id]);
    $t = hyChain();

    expect($old->fresh()->sponsor_id)->toBe($super->id)
        ->and($t['player']->fresh()->sponsor_id)->toBe($t['master']->id)
        ->and($t['master']->fresh()->agent->parent_agent_id)->toBe($t['agent']->agent->id);
});

test('Silver Agent no longer exists: no level, no link, no API value', function () {
    expect(array_map(fn ($l) => $l->value, \App\Enums\AgentLevel::cases()))->toBe(['agent', 'master'])
        ->and(\App\Enums\AgentLevel::tryFrom('silver'))->toBeNull();
    $t = hyChain();
    // A Master Agent's code registers players only.
    $this->getJson("/api/v1/auth/referral/{$t['master']->referral_code}?type=agent")->assertStatus(422);
    // Filters and rate settings no longer accept it.
    $this->actingAs($t['super'])->getJson('/api/v1/admin/panel/accounts?kind=agents&level=silver')->assertStatus(422);
    $this->actingAs($t['super'])->putJson('/api/v1/admin/panel/commission-rates', ['agent' => 50, 'master' => 40, 'silver' => 30])->assertOk()->assertJsonMissingPath('data.silver');
});

test('existing Silver Agents become Master Agents under the Incorporator, keeping players, wallets and history', function () {
    $t = hyChain();
    // A Silver Agent as it existed before the removal (level written directly).
    $silverUser = User::factory()->agent()->create(['sponsor_id' => $t['master']->id]);
    $silver = $silverUser->agent;
    \Illuminate\Support\Facades\DB::table('agents')->where('id', $silver->id)->update(['level' => 'silver', 'parent_agent_id' => $t['master']->agent->id]);
    $p = User::factory()->player()->create(['sponsor_id' => $silverUser->id]);
    \App\Models\AgentPlayer::query()->create(['player_id' => $p->id, 'agent_id' => $silver->id, 'assigned_at' => now()]);
    fund($silverUser, 12_345);
    $before = \App\Models\Wallet::query()->where("user_id", $silverUser->id)->orderBy("id")->pluck("balance", "id")->all();

    $migration = require base_path('database/migrations/2026_11_25_160000_remove_silver_agent_level.php');
    $migration->up();

    $row = \Illuminate\Support\Facades\DB::table('agents')->where('id', $silver->id)->first();
    expect($row->level)->toBe('master')->and($row->parent_agent_id)->toBe($t['agent']->agent->id)
        ->and($silverUser->fresh()->sponsor_id)->toBe($t['agent']->id)
        ->and(\App\Models\AgentPlayer::query()->where('player_id', $p->id)->value('agent_id'))->toBe($silver->id)
        ->and(\App\Models\Wallet::query()->where("user_id", $silverUser->id)->orderBy("id")->pluck("balance", "id")->all())->toBe($before)->and(array_sum($before))->toBe(12_345)
        ->and(\App\Models\AuditLog::query()->where('action', 'agent.silver_level_removed')->where('subject_id', $silverUser->id)->exists())->toBeTrue()
        ->and(\Illuminate\Support\Facades\DB::table('agents')->where('level', 'silver')->count())->toBe(0);
});
