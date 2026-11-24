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

/** Admin → Agent → Master → Silver, built through the links. */
function hyChain(): array
{
    $super = superAdmin();
    $refs = app(ReferralService::class);
    $join = function (string $code, string $type, string $username) use ($refs, $super) {
        return $refs->approve($super, $refs->register(['name' => $username, 'username' => $username, 'email' => "{$username}@t.test", 'password' => 'secret123'], $code, $type));
    };
    $agent = $join($refs->codeFor($super), 'agent', 'hyagent');
    $master = $join($agent->referral_code, 'agent', 'hymaster');
    $silver = $join($master->referral_code, 'agent', 'hysilver');
    $player = $join($silver->referral_code, 'player', 'hyplayer');
    $admin = User::factory()->create(['role' => Role::Administrator]);
    $admin->permissions()->attach(\App\Models\Permission::query()->where('key', Ability::ManageAgents->value)->pluck('id'));

    return compact('super', 'admin', 'agent', 'master', 'silver', 'player');
}

function hyPayload(string $username): array
{
    return ['name' => $username, 'username' => $username, 'email' => "{$username}@t.test", 'password' => 'secret123', 'password_confirmation' => 'secret123'];
}

test('registration links: each role gets exactly the links its level may use', function () {
    $t = hyChain();
    $links = fn (User $u) => app(ReferralService::class)->links($u->fresh());

    // [creator, agent link level, player link?]
    foreach ([['super', 'Incorporator', false], ['admin', 'Incorporator', false], ['agent', 'Master Agent', true], ['master', 'Silver Agent', true], ['silver', null, true], ['player', null, false]] as [$who, $level, $players]) {
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

    // Allowed: Admin → Agent, Agent → Master + Player, Master → Silver + Player, Silver → Player.
    foreach ([['super', 'agent'], ['admin', 'agent'], ['agent', 'agent'], ['agent', 'player'], ['master', 'agent'], ['master', 'player'], ['silver', 'player']] as $i => [$who, $type]) {
        $register($t[$who], $type, "ok{$i}")->assertCreated();
        $new = User::query()->where('username', "ok{$i}")->firstOrFail();
        expect($new->sponsor_id)->toBe($t[$who]->id)->and($new->status)->toBe(UserStatus::Pending);
        $approved = app(ReferralService::class)->approve($t['super'], $new);
        if ($type === 'agent') {
            $expected = ['super' => 'agent', 'admin' => 'agent', 'agent' => 'master', 'master' => 'silver'][$who];
            expect($approved->agent->level->value)->toBe($expected)
                ->and($approved->agent->parent_agent_id)->toBe($t[$who]->isAgent() ? $t[$who]->agent->id : null);
        } else {
            expect($approved->agentLink->agent_id)->toBe($t[$who]->agent->id);
        }
    }

    // Refused: Admins → Players, Silver → Agents, Players → anything.
    foreach ([['super', 'player'], ['admin', 'player'], ['silver', 'agent'], ['player', 'player'], ['player', 'agent']] as $i => [$who, $type]) {
        $register($t[$who], $type, "no{$i}")->assertStatus(422)->assertJsonPath('error', 'invalid_referral');
    }
    expect(User::query()->where('username', 'like', 'no%')->count())->toBe(0);

    // The request cannot choose a role or level, a sponsor or a parent: extra fields are ignored.
    $register($t['agent'], 'agent', 'sneaky')->assertCreated();
    $this->postJson('/api/v1/auth/register', hyPayload('sneaky2') + ['referral_code' => $t['silver']->referral_code, 'account_type' => 'admin'])->assertStatus(422);
    $this->postJson('/api/v1/auth/register', hyPayload('sneaky3') + ['referral_code' => $t['silver']->referral_code, 'role' => 'admin', 'level' => 'agent', 'sponsor_id' => $t['super']->id])->assertCreated();
    $sneaky3 = User::query()->where('username', 'sneaky3')->firstOrFail();
    expect($sneaky3->role)->toBe(Role::Player)->and($sneaky3->sponsor_id)->toBe($t['silver']->id);
});

test('approval re-checks the hierarchy: a sponsor that lost the right cannot add the account', function () {
    $t = hyChain();
    $refs = app(ReferralService::class);
    $pending = $refs->register(hyPayload('late'), $t['master']->referral_code, 'agent');
    // The Master Agent is moved down to Silver before approval: it may no longer create agents.
    Agent::query()->whereKey($t['master']->agent->id)->update(['level' => 'silver']);

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
        'master' => [Role::Agent, Role::Player],
        'silver' => [Role::Player],
        'player' => [],
    ];
    foreach ($allowed as $who => $roles) {
        foreach (Role::cases() as $role) {
            $made = $try($t[$who], $role);
            expect($made !== null)->toBe(in_array($role, $roles, true), "{$who} → {$role->value}");
            if ($made && $role === Role::Agent) {
                $expected = ['super' => 'agent', 'admin' => 'agent', 'agent' => 'master', 'master' => 'silver'][$who];
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
        ->and($t['player']->fresh()->sponsor_id)->toBe($t['silver']->id)
        ->and($t['silver']->fresh()->agent->parent_agent_id)->toBe($t['master']->agent->id);
});
