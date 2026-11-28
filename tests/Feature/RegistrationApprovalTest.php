<?php

use App\Enums\AgentLevel;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Exceptions\BusinessRuleException;
use App\Models\Agent;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\Users\ReferralService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->withoutMiddleware(ThrottleRequests::class);
});

/** Register through $owner's link (web/mobile API). Returns the pending applicant. */
function raRegister($test, User $owner, string $type, string $username): User
{
    $test->postJson('/api/v1/auth/register', [
        'name' => ucfirst($username), 'username' => $username, 'email' => "{$username}@t.test",
        'password' => 'secret123', 'password_confirmation' => 'secret123',
        'referral_code' => app(ReferralService::class)->codeFor($owner), 'account_type' => $type,
    ])->assertCreated()->assertJsonPath('data.status', 'pending');

    return User::query()->where('username', $username)->firstOrFail();
}

/**
 * Two of every level, each pair under its own upline, built through the links:
 *   adminA → incA → masterA        adminB → incB → masterB
 */
function raTree($test): array
{
    $super = superAdmin();
    $refs = app(ReferralService::class);
    $adminA = User::factory()->create(['role' => Role::Administrator, 'username' => 'admina']);
    $adminB = User::factory()->create(['role' => Role::Administrator, 'username' => 'adminb']);
    $incA = $refs->approve($adminA, raRegister($test, $adminA, 'agent', 'inca'));
    $incB = $refs->approve($adminB, raRegister($test, $adminB, 'agent', 'incb'));
    $masterA = $refs->approve($incA, raRegister($test, $incA, 'agent', 'mastera'));
    $masterB = $refs->approve($incB, raRegister($test, $incB, 'agent', 'masterb'));

    return compact('super', 'adminA', 'adminB', 'incA', 'incB', 'masterA', 'masterB');
}

function raApprove($test, User $actor, User $applicant)
{
    $panel = $actor->isAgent() ? 'agent' : 'admin';

    return $test->actingAs($actor)->postJson("/api/v1/{$panel}/panel/registrations/{$applicant->id}/approve");
}

function raReject($test, User $actor, User $applicant, ?string $reason = 'Incomplete details')
{
    $panel = $actor->isAgent() ? 'agent' : 'admin';

    return $test->actingAs($actor)->postJson("/api/v1/{$panel}/panel/registrations/{$applicant->id}/reject", array_filter(['reason' => $reason]));
}

/** @return list<string> usernames on the reviewer's list for a status */
function raList($test, User $actor, string $status = 'pending'): array
{
    $panel = $actor->isAgent() ? 'agent' : 'admin';

    return collect($test->actingAs($actor)->getJson("/api/v1/{$panel}/panel/registrations?status={$status}")->assertOk()->json('data'))->pluck('username')->sort()->values()->all();
}

test('the tree is built by each link owner: levels and uplines come from the link', function () {
    $t = raTree($this);

    expect($t['incA']->agent->level)->toBe(AgentLevel::Agent)->and($t['incA']->approved_by)->toBe($t['adminA']->id)
        ->and($t['masterA']->agent->level)->toBe(AgentLevel::Master)->and($t['masterA']->agent->parent_agent_id)->toBe($t['incA']->agent->id)
        ->and($t['masterA']->approved_by)->toBe($t['incA']->id)
        ->and($t['masterA']->registration_status)->toBe('approved')
        ->and($t['masterA']->registration_code)->toBe($t['incA']->referral_code)
        ->and($t['masterA']->applicant_type)->toBe('master');
});

test('Admins approve Incorporators and Players of their own links only', function () {
    $t = raTree($this);
    $incNew = raRegister($this, $t['adminA'], 'agent', 'incnew');
    $plA = raRegister($this, $t['adminA'], 'player', 'pla');
    $plB = raRegister($this, $t['adminB'], 'player', 'plb');
    $masterNew = raRegister($this, $t['incA'], 'agent', 'masternew');
    $plInc = raRegister($this, $t['incA'], 'player', 'plinc');

    // The dashboard lists only Admin A's own applicants.
    expect(raList($this, $t['adminA']))->toBe(['incnew', 'pla'])
        ->and(raList($this, $t['adminB']))->toBe(['plb']);

    // Another Admin's registration, and an Incorporator's Master Agent / Player: invisible and refused.
    raApprove($this, $t['adminA'], $plB)->assertNotFound();
    raApprove($this, $t['adminA'], $masterNew)->assertNotFound();
    raApprove($this, $t['adminA'], $plInc)->assertNotFound();
    raReject($this, $t['adminA'], $masterNew)->assertNotFound();
    // The older Admin Panel approve route applies the same rule.
    $this->actingAs($t['adminA'])->postJson("/api/v1/admin/panel/accounts/{$masterNew->id}/approve")->assertForbidden();
    $this->actingAs($t['adminA'])->deleteJson("/api/v1/admin/panel/accounts/{$plB->id}")->assertForbidden();

    raApprove($this, $t['adminA'], $incNew)->assertOk()->assertJsonPath('data.applicant_type', 'agent')->assertJsonPath('data.approved_by.username', 'admina');
    raApprove($this, $t['adminA'], $plA)->assertOk()->assertJsonPath('data.applicant_type', 'player');
    expect($incNew->fresh()->agent->level)->toBe(AgentLevel::Agent)->and($plA->fresh()->isActive())->toBeTrue()
        ->and($masterNew->fresh()->status)->toBe(UserStatus::Pending)->and($plB->fresh()->status)->toBe(UserStatus::Pending);
});

test('Incorporators approve Master Agents and Players of their own link only', function () {
    $t = raTree($this);
    $mA = raRegister($this, $t['incA'], 'agent', 'ma2');
    $pA = raRegister($this, $t['incA'], 'player', 'pa2');
    $mB = raRegister($this, $t['incB'], 'agent', 'mb2');
    $pMaster = raRegister($this, $t['masterA'], 'player', 'pm2');
    $incAdmin = raRegister($this, $t['adminA'], 'agent', 'inc2');

    expect(raList($this, $t['incA']))->toBe(['ma2', 'pa2']);

    raApprove($this, $t['incA'], $mB)->assertNotFound();      // another Incorporator's
    raApprove($this, $t['incA'], $pMaster)->assertNotFound(); // its own Master Agent's player
    raApprove($this, $t['incA'], $incAdmin)->assertNotFound(); // an Incorporator registration

    raApprove($this, $t['incA'], $mA)->assertOk();
    raApprove($this, $t['incA'], $pA)->assertOk();
    expect($mA->fresh()->agent->level)->toBe(AgentLevel::Master)
        ->and($mA->fresh()->agent->parent_agent_id)->toBe($t['incA']->agent->id)
        ->and($pA->fresh()->agentLink->agent_id)->toBe($t['incA']->agent->id);
});

test('Master Agents approve Players of their own link only', function () {
    $t = raTree($this);
    $mine = raRegister($this, $t['masterA'], 'player', 'mine');
    $other = raRegister($this, $t['masterB'], 'player', 'other');
    $incPlayer = raRegister($this, $t['incA'], 'player', 'incplayer');
    $master = raRegister($this, $t['incA'], 'agent', 'peer');

    expect(raList($this, $t['masterA']))->toBe(['mine']);

    raApprove($this, $t['masterA'], $other)->assertNotFound();
    raApprove($this, $t['masterA'], $incPlayer)->assertNotFound();
    raApprove($this, $t['masterA'], $master)->assertNotFound();

    raApprove($this, $t['masterA'], $mine)->assertOk();
    expect($mine->fresh()->isActive())->toBeTrue()->and($mine->fresh()->agentLink->agent_id)->toBe($t['masterA']->agent->id);
});

test('players, loaders and pending applicants cannot reach the approval endpoints', function () {
    $t = raTree($this);
    $pending = raRegister($this, $t['adminA'], 'player', 'waiting');
    $player = app(ReferralService::class)->approve($t['adminA'], raRegister($this, $t['adminA'], 'player', 'already'));
    $loader = User::factory()->create(['role' => Role::Loader]);

    $this->actingAs($player)->getJson('/api/v1/admin/panel/registrations')->assertForbidden();
    $this->actingAs($player)->postJson("/api/v1/agent/panel/registrations/{$pending->id}/approve")->assertForbidden();
    $this->actingAs($loader)->postJson("/api/v1/admin/panel/registrations/{$pending->id}/approve")->assertForbidden();
    $this->actingAs($pending)->postJson("/api/v1/admin/panel/registrations/{$pending->id}/approve")->assertForbidden();
    expect($pending->fresh()->status)->toBe(UserStatus::Pending);
});

test('Super Admin reviews every registration (platform authority)', function () {
    $t = raTree($this);
    $p = raRegister($this, $t['masterB'], 'player', 'deep');
    raRegister($this, $t['adminB'], 'agent', 'incc');

    expect(raList($this, $t['super']))->toContain('deep', 'incc');
    raApprove($this, $t['super'], $p)->assertOk();
    expect($p->fresh()->agentLink->agent_id)->toBe($t['masterB']->agent->id); // still under its link owner
});

test('rejection: reason required, final, account stays inactive, audited', function () {
    $t = raTree($this);
    $p = raRegister($this, $t['incA'], 'player', 'nope');

    raReject($this, $t['incA'], $p, null)->assertStatus(422)->assertJsonValidationErrors('reason');
    raReject($this, $t['incA'], $p, 'Duplicate person')->assertOk()->assertJsonPath('data.registration_status', 'rejected')->assertJsonPath('data.rejection_reason', 'Duplicate person');

    $p->refresh();
    expect($p->status)->toBe(UserStatus::Rejected)->and($p->rejected_by)->toBe($t['incA']->id)->and($p->rejected_at)->not->toBeNull();

    // No sign-in, no game, no wallet.
    $this->postJson('/api/v1/auth/login', ['username' => 'nope', 'password' => 'secret123'])->assertForbidden()->assertJsonPath('error', 'account_rejected');
    $this->actingAs($p)->getJson('/api/v1/wallet')->assertForbidden()->assertJsonPath('error', 'account_rejected');

    // Once only: no approval or second rejection afterwards, and staff cannot "reactivate" it.
    raApprove($this, $t['incA'], $p)->assertStatus(409);
    raReject($this, $t['incA'], $p)->assertStatus(409);
    raApprove($this, $t['super'], $p)->assertStatus(409);
    $this->actingAs($t['super'])->postJson("/api/v1/admin/panel/accounts/{$p->id}/status", ['action' => 'reactivate'])->assertStatus(409);
    $this->actingAs($t['super'])->postJson("/api/v1/admin/panel/accounts/{$p->id}/status", ['action' => 'restore'])->assertStatus(409);

    // It shows under Rejected, not Pending; the same username / email cannot register again.
    expect(raList($this, $t['incA'], 'rejected'))->toBe(['nope'])->and(raList($this, $t['incA']))->toBe([]);
    $this->postJson('/api/v1/auth/register', ['name' => 'N', 'username' => 'nope', 'email' => 'nope@t.test', 'password' => 'secret123', 'password_confirmation' => 'secret123', 'referral_code' => $t['incA']->referral_code])->assertStatus(422);

    $log = AuditLog::query()->where('action', 'user.rejected')->where('subject_id', $p->id)->sole();
    expect($log->actor_id)->toBe($t['incA']->id)->and($log->new_values['reason'])->toBe('Duplicate person')
        ->and($log->new_values['applicant'])->toBe('nope')->and($log->created_at)->not->toBeNull();
});

test('approval is once only and audited with approver, applicant and link', function () {
    $t = raTree($this);
    $p = raRegister($this, $t['masterA'], 'player', 'twice');

    raApprove($this, $t['masterA'], $p)->assertOk();
    raApprove($this, $t['masterA'], $p)->assertStatus(409);
    raReject($this, $t['masterA'], $p)->assertStatus(409);

    $log = AuditLog::query()->where('action', 'user.approved')->where('subject_id', $p->id)->sole();
    expect($log->actor_id)->toBe($t['masterA']->id)
        ->and($log->new_values)->toMatchArray(['applicant' => 'twice', 'applicant_type' => 'player', 'approver' => 'mastera', 'approver_role' => 'master', 'registration_code' => $t['masterA']->referral_code]);
    expect(raList($this, $t['masterA'], 'approved'))->toBe(['twice']);
});

test('the link owner and applicant role cannot be changed by the applicant or by escalation', function () {
    $t = raTree($this);

    // The request body cannot pick the sponsor, role or level: only the link decides.
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Sly', 'username' => 'sly', 'email' => 'sly@t.test', 'password' => 'secret123', 'password_confirmation' => 'secret123',
        'referral_code' => $t['masterA']->referral_code, 'account_type' => 'player',
        'sponsor_id' => $t['adminA']->id, 'role' => 'admin', 'applicant_type' => 'agent', 'registration_status' => 'approved', 'status' => 'active',
    ])->assertCreated();
    $sly = User::query()->where('username', 'sly')->firstOrFail();
    expect($sly->sponsor_id)->toBe($t['masterA']->id)->and($sly->role)->toBe(Role::Player)->and($sly->applicant_type)->toBe('player')
        ->and($sly->status)->toBe(UserStatus::Pending)->and($sly->registration_status)->toBe('pending');

    // A pending applicant cannot be moved to another approver.
    $agentRow = $t['incB']->agent;
    $this->actingAs($t['super'])->postJson("/api/v1/admin/users/{$sly->id}/assign-agent", ['agent_id' => $agentRow->id])->assertStatus(409);
    expect($sly->fresh()->sponsor_id)->toBe($t['masterA']->id);

    // An Incorporator demoted to Master Agent cannot approve its pending Master Agent registration.
    $pendingMaster = raRegister($this, $t['incA'], 'agent', 'lateMaster');
    Agent::query()->whereKey($t['incA']->agent->id)->update(['level' => AgentLevel::Master->value]);
    raApprove($this, $t['incA']->fresh(), $pendingMaster)->assertNotFound();
    raApprove($this, $t['super'], $pendingMaster)->assertStatus(409);
    expect($pendingMaster->fresh()->status)->toBe(UserStatus::Pending);
});

test('a link owner who is no longer active cannot review; overview counts are scoped', function () {
    $t = raTree($this);
    raRegister($this, $t['adminA'], 'player', 'aone');
    raRegister($this, $t['adminA'], 'agent', 'atwo');
    raRegister($this, $t['adminB'], 'player', 'bone');
    $m = raRegister($this, $t['masterA'], 'player', 'mone');

    $this->actingAs($t['adminA'])->getJson('/api/v1/admin/panel/overview')->assertJsonPath('data.pending_users', 2);
    $this->actingAs($t['adminB'])->getJson('/api/v1/admin/panel/overview')->assertJsonPath('data.pending_users', 1);
    $this->actingAs($t['incA'])->getJson('/api/v1/agent/panel/overview')->assertJsonPath('data.pending_users', 0);
    $this->actingAs($t['masterA'])->getJson('/api/v1/agent/panel/overview')->assertJsonPath('data.pending_users', 1);
    $this->actingAs($t['adminA'])->getJson('/api/v1/admin/panel/accounts?kind=pending')->assertJsonCount(2, 'data');
    $this->actingAs($t['adminA'])->getJson('/api/v1/admin/panel/registrations')->assertJsonPath('meta.counts.pending', 2);

    $t['masterA']->forceFill(['status' => UserStatus::Suspended])->save();
    expect(fn () => app(ReferralService::class)->approve($t['masterA']->fresh(), $m))->toThrow(BusinessRuleException::class);
    // Approving still needs an active link owner (the account would join under it); the Super Admin can reject it.
    raApprove($this, $t['super'], $m)->assertStatus(409);
    raReject($this, $t['super'], $m, 'Sponsor suspended')->assertOk();
});

test('search, role filter and pagination on the approval dashboard', function () {
    $t = raTree($this);
    foreach (range(1, 3) as $i) {
        raRegister($this, $t['incA'], 'player', "plr{$i}");
    }
    raRegister($this, $t['incA'], 'agent', 'agentx');

    $this->actingAs($t['incA'])->getJson('/api/v1/agent/panel/registrations?type=master')->assertJsonCount(1, 'data')->assertJsonPath('data.0.username', 'agentx')
        ->assertJsonPath('data.0.link.label', 'Master Agent Registration Link')->assertJsonPath('data.0.link.owner.username', 'inca')->assertJsonPath('data.0.can_review', true);
    $this->actingAs($t['incA'])->getJson('/api/v1/agent/panel/registrations?q=plr2')->assertJsonCount(1, 'data');
    $this->actingAs($t['incA'])->getJson('/api/v1/agent/panel/registrations?per_page=5&page=1')->assertJsonPath('meta.total', 4)->assertJsonPath('meta.reviewable_types', ['master', 'player']);
    $this->actingAs($t['masterA'])->getJson('/api/v1/agent/panel/registrations')->assertJsonPath('meta.reviewable_types', ['player']);
});
