<?php

namespace App\Enums;

/**
 * Account lifecycle. Only Active accounts can sign in, play or move Chips.
 *  - Pending: registered, waiting for an administrator's approval (sign-in refused with account_pending).
 *  - Suspended / Banned: blocked by staff (reason + date recorded); Reactivate restores Active.
 *  - Archived: retired account kept with its full history and referral links; Restore makes it Active.
 */
enum UserStatus: string
{
    case Active = 'active';
    case Pending = 'pending';
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
            self::Pending => 'Your account is waiting for administrator approval.',
            self::Suspended => 'This account is suspended.',
            self::Banned => 'This account is banned.',
            self::Archived => 'This account has been archived.',
            self::Active => '',
        };
    }

    /** Error code for the API (account_pending, suspended, banned, archived). */
    public function blockedCode(): string
    {
        return $this === self::Pending ? 'account_pending' : $this->value;
    }
}
