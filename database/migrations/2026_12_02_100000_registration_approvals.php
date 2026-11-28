<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Registration approval by the registration-link owner (see App\Services\Users\RegistrationReview).
 *
 * Every registration through a link now keeps a snapshot of how it was made, written once at
 * registration and never changed:
 *   - registration_code: the referral code used (the link owner is users.sponsor_id);
 *   - applicant_type:    what the applicant registered as — player | agent (Incorporator) | master;
 *   - registration_status: pending → approved | rejected (once only);
 *   - rejected_at / rejected_by / rejection_reason for rejections (approvals already have
 *     approved_at / approved_by).
 *
 * Existing registrations are backfilled from their sponsor and current state.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('registration_code', 16)->nullable()->after('registered_as');
            $table->string('applicant_type', 8)->nullable()->after('registration_code');
            $table->string('registration_status', 10)->nullable()->after('applicant_type');
            $table->timestamp('rejected_at')->nullable()->after('approved_by');
            $table->foreignId('rejected_by')->nullable()->after('rejected_at')->constrained('users')->nullOnDelete();
            $table->string('rejection_reason', 255)->nullable()->after('rejected_by');
            // The approver's queue: registrations of one link owner by state.
            $table->index(['sponsor_id', 'registration_status']);
        });

        $users = DB::table('users')->whereNotNull('registered_as')->orderBy('id')
            ->get(['id', 'sponsor_id', 'registered_as', 'status', 'approved_at']);

        foreach ($users as $u) {
            $sponsor = $u->sponsor_id ? DB::table('users')->where('id', $u->sponsor_id)->first(['id', 'role', 'referral_code']) : null;
            $type = 'player';

            if ($u->registered_as === 'agent') {
                $own = DB::table('agents')->where('user_id', $u->id)->value('level');
                $sponsorLevel = $sponsor && $sponsor->role === 'agent' ? DB::table('agents')->where('user_id', $sponsor->id)->value('level') : null;
                $type = $own ?? ($sponsorLevel === 'agent' ? 'master' : 'agent');
            }

            DB::table('users')->where('id', $u->id)->update([
                'registration_code' => $sponsor?->referral_code,
                'applicant_type' => $type,
                'registration_status' => $u->status === 'pending' ? 'pending' : ($u->approved_at ? 'approved' : null),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('users')->where('status', 'rejected')->update(['status' => 'archived']);

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['sponsor_id', 'registration_status']);
            $table->dropConstrainedForeignId('rejected_by');
            $table->dropColumn(['registration_code', 'applicant_type', 'registration_status', 'rejected_at', 'rejection_reason']);
        });
    }
};
