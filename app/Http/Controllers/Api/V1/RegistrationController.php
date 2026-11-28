<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Users\ReferralService;
use App\Services\Users\RegistrationReview;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Registration approvals (Admin Panel and Agent Panel): the registrations made through the
 * signed-in account's own registration links — pending, approved and rejected — with Approve and
 * Reject. Every list, count and action is limited by RegistrationReview on the server, so an
 * account only ever sees and reviews the applicants it is authorized for (hidden buttons are
 * only a convenience; a direct API call outside that scope gets 404 / 403).
 */
class RegistrationController extends Controller
{
    public function __construct(private readonly ReferralService $referrals) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', 'in:pending,approved,rejected'],
            'type' => ['nullable', 'in:player,agent,master'],
            'q' => ['nullable', 'string', 'max:64'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'tz' => ['nullable', 'timezone:all'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);
        $me = $request->user();
        $status = $data['status'] ?? 'pending';
        $tz = (string) ($data['tz'] ?? 'UTC');

        $base = RegistrationReview::scope(User::query(), $me);
        $counts = (clone $base)->whereIn('registration_status', ['pending', 'approved', 'rejected'])
            ->selectRaw('registration_status, COUNT(*) as n')->groupBy('registration_status')->pluck('n', 'registration_status');

        $query = (clone $base)->with(['sponsor.agent', 'agent', 'approver.agent', 'rejecter.agent'])
            ->where('registration_status', $status)
            ->when($data['type'] ?? null, fn (Builder $q, string $type) => $q->where('applicant_type', $type))
            // Registration date, in the viewer's timezone (stored in UTC).
            ->when($data['from'] ?? null, fn (Builder $q, string $from) => $q->where('users.created_at', '>=', Carbon::parse($from, $tz)->startOfDay()->utc()))
            ->when($data['to'] ?? null, fn (Builder $q, string $to) => $q->where('users.created_at', '<=', Carbon::parse($to, $tz)->endOfDay()->utc()))
            ->when($data['q'] ?? null, function (Builder $q, string $term) {
                $like = '%'.$term.'%';
                $q->where(fn (Builder $w) => $w->where('username', 'like', $like)->orWhere('name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('users.id', ltrim($term, '#')));
            });

        $order = match ($status) {
            'approved' => 'approved_at',
            'rejected' => 'rejected_at',
            default => 'users.created_at',
        };
        $page = $query->orderByDesc($order)->orderByDesc('users.id')->paginate((int) ($data['per_page'] ?? 20));

        return response()->json([
            'data' => collect($page->items())->map(fn (User $u) => $this->present($u, $me))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'counts' => [
                    'pending' => (int) ($counts['pending'] ?? 0),
                    'approved' => (int) ($counts['approved'] ?? 0),
                    'rejected' => (int) ($counts['rejected'] ?? 0),
                ],
                // What this account may approve (for the filter and the page text).
                'reviewable_types' => $me->isSuperAdmin() ? ['agent', 'master', 'player'] : RegistrationReview::reviewableTypes($me),
            ],
        ]);
    }

    public function approve(Request $request, User $user): JsonResponse
    {
        $this->visible($request->user(), $user);
        $approved = $this->referrals->approve($request->user(), $user);

        return response()->json(['message' => "{$approved->username} approved.", 'data' => $this->present($approved->load(['approver.agent']), $request->user())]);
    }

    public function reject(Request $request, User $user): JsonResponse
    {
        $this->visible($request->user(), $user);
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:255']]);
        $rejected = $this->referrals->reject($request->user(), $user, $data['reason']);

        return response()->json(['message' => "{$rejected->username} rejected.", 'data' => $this->present($rejected->load(['rejecter.agent']), $request->user())]);
    }

    /** Outside the reviewer's scope the registration does not exist for it. */
    private function visible(User $me, User $user): void
    {
        abort_unless(RegistrationReview::canReview($me, $user), 404);
    }

    /** @return array<string, mixed> */
    private function present(User $u, User $me): array
    {
        $type = RegistrationReview::applicantType($u);
        $sponsor = $u->sponsor;
        $who = fn (?User $x) => $x ? ['id' => $x->id, 'username' => $x->username, 'name' => $x->name, 'role_label' => $x->accountTypeLabel()] : null;

        return [
            'id' => $u->id,
            'account_id' => ($u->isPlayer() ? 'PL-' : 'AG-').str_pad((string) $u->id, 6, '0', STR_PAD_LEFT),
            'username' => $u->username,
            'name' => $u->name,
            'email' => $u->email,
            'applicant_type' => $type,
            'applicant_type_label' => RegistrationReview::typeLabel($type),
            'registration_status' => $u->registration_status,
            'account_status' => $u->status->value,
            'registered_at' => $u->created_at?->toIso8601String(),
            'link' => [
                'type' => $u->registered_as,
                'label' => $u->registered_as === 'agent' ? RegistrationReview::typeLabel($type).' Registration Link' : 'Player Registration Link',
                'code' => $u->registration_code ?? $sponsor?->referral_code,
                'owner' => $who($sponsor),
            ],
            'approved_at' => $u->approved_at?->toIso8601String(),
            'approved_by' => $u->registration_status === 'approved' ? $who($u->approver) : null,
            'rejected_at' => $u->rejected_at?->toIso8601String(),
            'rejected_by' => $who($u->rejecter),
            'rejection_reason' => $u->rejection_reason,
            'can_review' => $u->registration_status === 'pending' && RegistrationReview::canReview($me, $u),
        ];
    }
}
