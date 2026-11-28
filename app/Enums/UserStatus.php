<?php

namespace App\Enums;

/**
 * Account lifecycle. Only Active accounts can sign in, play or move Chips.
 *  - Pending: registered through a registration link, waiting for the link owner's approval
 *    (sign-in refused with account_pending). See App\Services\Users\RegistrationReview.
 *  - Rejected: the approver turned the registration down (reason recorded). Final: the account
 *    never signs in, plays or moves Chips, and its username/email stay taken.
 *  - Suspended / Banned: blocked by staff (reason + date recorded); Reactivate restores Active.
 *  - Archived: retired account kept with its full history and referral links; Restore makes it Active.
 */
enum UserStatus: string
{
    case Active = 'active';
    case Pending = 'pending';
    case Rejected = 'rejected';
    case Suspended = 'suspended';
    case Banned = 'banned';
    case Archived = 'archived';

    public function label(): string
    {
        return ucfirst($this->value);
    }

    /** Message shown when a non-active account tries to sign in or call the API. */
    public function blockedMessage(): string
    {
        return match ($this) {
            self::Pending => 'Your account is waiting for approval.',
            self::Rejected => 'Your registration was not approved.',
            self::Suspended => 'This account is suspended.',
            self::Banned => 'This account is banned.',
            self::Archived => 'This account has been archived.',
            self::Active => '',
        };
    }

    /** Error code for the API (account_pending, account_rejected, suspended, banned, archived). */
    public function blockedCode(): string
    {
        return match ($this) {
            self::Pending => 'account_pending',
            self::Rejected => 'account_rejected',
            default => $this->value,
        };
    }
}
