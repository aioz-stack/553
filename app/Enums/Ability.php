<?php

namespace App\Enums;

enum Ability: string
{
    case ManagePlayers = 'manage_players';
    case ManageAgents = 'manage_agents';
    case AllocatePoints = 'allocate_points';
    case ManageRooms = 'manage_rooms';
    case ReviewTransactions = 'review_transactions';
    case ViewReports = 'view_reports';
    case ManageCommissions = 'manage_commissions';
    case ManageGames = 'manage_games';
    case ViewAuditLogs = 'view_audit_logs';
    case FreezeAllocations = 'freeze_allocations';

    public function description(): string
    {
        return match ($this) {
            self::ManagePlayers => 'Create, edit and suspend players',
            self::ManageAgents => 'Create agents and assign players',
            self::AllocatePoints => 'Allocate CP/VC from own allocation balance',
            self::ManageRooms => 'Create and configure game rooms',
            self::ReviewTransactions => 'View wallets and ledger transactions',
            self::ViewReports => 'View platform reports',
            self::ManageCommissions => 'Approve, reject and reverse commissions',
            self::ManageGames => 'Cancel games and retry settlements',
            self::ViewAuditLogs => 'Review audit logs',
            self::FreezeAllocations => 'Freeze or unfreeze allocation wallets',
        };
    }
}
