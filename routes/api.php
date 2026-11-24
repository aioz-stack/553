<?php

use App\Http\Controllers\Api\V1\Admin\CommissionController as AdminCommissionController;
use App\Http\Controllers\Api\V1\Admin\GameController as AdminGameController;
use App\Http\Controllers\Api\V1\Admin\ReportController as AdminReportController;
use App\Http\Controllers\Api\V1\Admin\RoomController as AdminRoomController;
use App\Http\Controllers\Api\V1\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\V1\Admin\WalletController as AdminWalletController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\FriendController;
use App\Http\Controllers\Api\V1\GameController;
use App\Http\Controllers\Api\V1\LobbyController;
use App\Http\Controllers\Api\V1\AgentPanelController;
use App\Http\Controllers\Api\V1\Admin\PanelController;
use App\Http\Controllers\Api\V1\PayoutController;
use App\Http\Controllers\Api\V1\Admin\EmployeeController;
use App\Http\Controllers\Api\V1\LoaderPanelController;
use App\Http\Controllers\Api\V1\MaintenanceController;
use App\Http\Controllers\Api\V1\TeamController;
use App\Http\Controllers\Api\V1\PlayerController;
use App\Http\Controllers\Api\V1\PracticeController;
use App\Http\Controllers\Api\V1\RoomController;
use App\Http\Controllers\Api\V1\TableController;
use App\Http\Controllers\Api\V1\WalletController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pusoy 13 API v1 — shared by the Laravel web app and the mobile app.
|--------------------------------------------------------------------------
| Auth: Sanctum. Mobile sends `Authorization: Bearer <token>`; the Inertia
| web app is authenticated by its session cookie (stateful Sanctum).
| Responses: `{ data, meta?, links?, message? }`; errors: `{ message, error?, errors? }`.
*/

Route::prefix('v1')->middleware('throttle:api')->group(function () {
    // Public: the current maintenance mode (the mobile game checks it before and after sign-in).
    Route::get('status', [MaintenanceController::class, 'status']);

    Route::prefix('auth')->middleware('throttle:auth')->group(function () {
        Route::post('register', [AuthController::class, 'register']);
        Route::get('referral/{code}', [AuthController::class, 'referral'])->where('code', '[A-Za-z0-9-]{3,24}');
        Route::post('login', [AuthController::class, 'login']);
        Route::post('forgot-password', [AuthController::class, 'forgotPassword']);
        Route::post('reset-password', [AuthController::class, 'resetPassword']);
    });

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::get('auth/devices', [AuthController::class, 'devices']);
        Route::put('auth/devices/push-token', [AuthController::class, 'pushToken']);
        Route::delete('auth/devices/{device}', [AuthController::class, 'revokeDevice']);

        // Player
        Route::get('profile', [PlayerController::class, 'profile']);
        Route::patch('profile', [PlayerController::class, 'updateProfile']);
        Route::put('profile/password', [PlayerController::class, 'updatePassword'])->middleware('throttle:10,1');
        Route::get('profile/preferences', [PlayerController::class, 'preferences']);
        Route::put('profile/preferences', [PlayerController::class, 'updatePreferences']);
        Route::put('profile/avatar', [PlayerController::class, 'updateAvatar'])->middleware('throttle:game-actions');
        Route::put('profile/nickname', [PlayerController::class, 'updateNickname'])->middleware('throttle:game-actions');
        Route::get('profile/stats', [PlayerController::class, 'stats']);
        Route::get('profile/games', [PlayerController::class, 'history']);
        Route::get('leaderboard', [PlayerController::class, 'leaderboard']);
        Route::get('notifications', [PlayerController::class, 'notifications']);
        Route::post('notifications/read', [PlayerController::class, 'markNotificationsRead']);
        Route::post('notifications/{id}/read', [PlayerController::class, 'markNotificationRead'])->whereUuid('id');

        // Own wallet
        Route::get('wallet', [WalletController::class, 'balances']);
        // Shop: Keys → Gold exchange (players; server-validated, idempotent, final).
        Route::get('shop', [\App\Http\Controllers\Api\V1\ShopController::class, 'index']);
        Route::post('shop/key-exchanges', [\App\Http\Controllers\Api\V1\ShopController::class, 'exchange'])->middleware('throttle:wallet-actions');
        Route::get('wallet/transactions', [WalletController::class, 'transactions']);

        // Commission wallet (read only) + Team Overview (Administrators and every agent level).
        // Convert Commission to Wallet was retired: there is no conversion route.
        Route::middleware('role:super_admin,admin,agent')->group(function () {
            Route::get('commission/wallet', [TeamController::class, 'commission']);
            Route::get('team/overview', [TeamController::class, 'overview']);
        });

        // Allocation (Super Admin / Administrator / Agent; rules in AllocationService)
        // Agents load Chips from the Agent Panel (agent/panel/accounts/{user}/load).
        Route::post('wallet/allocate', [AdminWalletController::class, 'allocate'])->middleware(['role:super_admin,admin', 'throttle:wallet-actions']);

        // Game (lobby, rooms, tables, games, Single Player): closed during Full Maintenance and
        // Mobile Game maintenance (503 "maintenance"; the app shows the maintenance screen).
        Route::middleware('game.open')->group(function () {
            // Rooms & tables
            Route::get('rooms', [RoomController::class, 'index']);
            Route::post('rooms/private', [RoomController::class, 'storePrivate']);
            Route::post('rooms/host', [RoomController::class, 'host'])->middleware('throttle:game-actions');
            Route::get('rooms/{room}', [RoomController::class, 'show']);
            Route::post('rooms/{room}/join', [RoomController::class, 'join'])->middleware('throttle:game-actions');
            Route::post('rooms/{room}/invite', [RoomController::class, 'invite']);

            // Multiplayer lobbies (553 Lobby): create / list / join / quick join / owner start
            Route::get('lobbies', [LobbyController::class, 'index']);
            Route::post('lobbies', [LobbyController::class, 'store'])->middleware('throttle:game-actions');
            Route::post('lobbies/quick-join', [LobbyController::class, 'quickJoin'])->middleware('throttle:game-actions');
            Route::get('lobbies/{room}', [LobbyController::class, 'show']);
            Route::patch('lobbies/{room}', [LobbyController::class, 'update'])->middleware('throttle:game-actions');
            Route::post('lobbies/{room}/join', [LobbyController::class, 'join'])->middleware('throttle:lobby-join');
            Route::post('lobbies/{room}/start', [LobbyController::class, 'start'])->middleware('throttle:game-actions');
            Route::post('lobbies/{room}/seat', [LobbyController::class, 'seat'])->middleware('throttle:game-actions');
            Route::post('lobbies/{room}/kick', [LobbyController::class, 'kick'])->middleware('throttle:game-actions');

            Route::get('tables/current', [TableController::class, 'current']);
            Route::get('tables/{table}', [TableController::class, 'show']);
            Route::post('tables/{table}/ready', [TableController::class, 'ready'])->middleware('throttle:game-actions');
            Route::post('tables/{table}/leave', [TableController::class, 'leave'])->middleware('throttle:game-actions');
            Route::post('tables/{table}/heartbeat', [TableController::class, 'heartbeat']);

            // Games
            Route::get('games/{session}', [GameController::class, 'show']);
            Route::get('games/{session}/cards', [GameController::class, 'cards']);
            Route::post('games/{session}/submit', [GameController::class, 'submit'])->middleware('throttle:game-actions');
            Route::post('games/{session}/preview', [GameController::class, 'preview']);
            Route::put('games/{session}/draft', [GameController::class, 'draft'])->middleware('throttle:120,1');
            Route::post('games/{session}/bet', [GameController::class, 'bet'])->middleware('throttle:game-actions');
            Route::post('games/{session}/lucky', [GameController::class, 'lucky'])->middleware('throttle:game-actions');

            // Single Player: Round Bank Pusoy vs one bot (12 rounds, alternating banker)
            Route::get('practice/tiers', [PracticeController::class, 'tiers']);
            Route::get('practice/gold', [PracticeController::class, 'gold']);
            Route::post('practice/gold/claim', [PracticeController::class, 'claimGold'])->middleware('throttle:game-actions');
            Route::post('practice/matches/{practiceMatch}/leave', [PracticeController::class, 'leaveMatch'])->middleware('throttle:game-actions');
            Route::post('practice/matches', [PracticeController::class, 'startMatch'])->middleware('throttle:game-actions');
            Route::get('practice/matches/current', [PracticeController::class, 'currentMatch']);
            Route::get('practice/matches/{practiceMatch}', [PracticeController::class, 'showMatch']);
            Route::post('practice/matches/{practiceMatch}/deal', [PracticeController::class, 'deal'])->middleware('throttle:game-actions');
            Route::get('practice/{practiceGame}', [PracticeController::class, 'show']);
            Route::post('practice/{practiceGame}/preview', [PracticeController::class, 'preview']);
            Route::post('practice/{practiceGame}/suggest', [PracticeController::class, 'suggest']);
            Route::post('practice/{practiceGame}/lucky', [PracticeController::class, 'lucky'])->middleware('throttle:game-actions');
            Route::post('practice/{practiceGame}/submit', [PracticeController::class, 'submit'])->middleware('throttle:game-actions');
        });

        // Friends
        Route::get('friends', [FriendController::class, 'index']);
        Route::post('friends', [FriendController::class, 'store'])->middleware('throttle:game-actions');
        Route::post('friends/{friendship}/accept', [FriendController::class, 'accept']);
        Route::delete('friends/{friendship}', [FriendController::class, 'destroy']);
        Route::post('friends/{user}/invite', [FriendController::class, 'invite'])->middleware(['game.open', 'throttle:game-actions']);
        Route::get('games/{session}/results', [GameController::class, 'results'])->middleware('game.open');

        // Agent
        Route::prefix('agent')->middleware('can:agent')->group(function () {
            // The old agent tools (dashboard, player register, referral codes, transactions, activity,
            // reports) are gone: agents work only in the Agent Panel and register people only
            // through their registration links.
            Route::get('payout-requests', [PayoutController::class, 'index']);
            Route::post('payout-requests', [PayoutController::class, 'store'])->middleware('throttle:wallet-actions');
            // Agent Panel: the Admin Panel screens limited to this agent's own downline (read + own actions only).
            Route::get('panel', [AgentPanelController::class, 'overview']);
            Route::prefix('panel')->group(function () {
                Route::get('overview', [AgentPanelController::class, 'overview']);
                Route::get('load-logs', [AgentPanelController::class, 'loadLogs']);
                Route::get('load-logs/{chipLoad}', [AgentPanelController::class, 'loadLog']);
                Route::get('commission-logs', [AgentPanelController::class, 'commissionLogs']);
                Route::get('withdrawals', [AgentPanelController::class, 'withdrawals']);
                Route::get('accounts', [AgentPanelController::class, 'accounts']);
                Route::get('accounts/{user}', [AgentPanelController::class, 'account']);
                Route::post('accounts/{user}/load', [AgentPanelController::class, 'load'])->middleware('throttle:wallet-actions');
                Route::post('accounts/{user}/withdraw', [AgentPanelController::class, 'withdraw'])->middleware('throttle:wallet-actions');
            });
            Route::post('chip-requests', [AgentPanelController::class, 'requestChips'])->middleware('throttle:wallet-actions');
        });

        // Loader Panel (Loader Accounts): Load Transactions, Commission Transactions, Reset Password —
        // each behind its own Loader permission. Nothing else of the Admin Panel is reachable.
        Route::prefix('loader/panel')->middleware('can:loader')->group(function () {
            Route::get('overview', [LoaderPanelController::class, 'overview']);
            Route::get('accounts', [LoaderPanelController::class, 'accounts']);
            Route::get('accounts/{user}', [LoaderPanelController::class, 'account']);

            Route::middleware('can:loader_loads')->group(function () {
                Route::get('load-logs', [LoaderPanelController::class, 'loadLogs']);
                Route::get('load-logs/{chipLoad}', [LoaderPanelController::class, 'loadLog']);
                Route::post('load-logs/{chipLoad}/approve', [LoaderPanelController::class, 'approveLoad'])->middleware('throttle:wallet-actions');
                Route::post('load-logs/{chipLoad}/reject', [LoaderPanelController::class, 'rejectLoad']);
                Route::post('accounts/{user}/load', [LoaderPanelController::class, 'load'])->middleware('throttle:wallet-actions');
            });
            Route::middleware('can:loader_commissions')->group(function () {
                Route::get('commission-logs', [LoaderPanelController::class, 'commissionLogs']);
                Route::get('withdrawals', [LoaderPanelController::class, 'withdrawals']);
                Route::post('withdrawals/{payout}/approve', [LoaderPanelController::class, 'approveWithdrawal'])->middleware('throttle:wallet-actions');
                Route::post('withdrawals/{payout}/reject', [LoaderPanelController::class, 'rejectWithdrawal']);
            });
            Route::put('accounts/{user}/password', [LoaderPanelController::class, 'resetPassword'])->middleware(['can:loader_passwords', 'throttle:wallet-actions']);
        });

        // Admin (Super Admin + Administrators; per-endpoint abilities)
        Route::prefix('admin')->middleware('can:staff')->group(function () {
            Route::get('users', [AdminUserController::class, 'index']);
            Route::post('users', [AdminUserController::class, 'store']);
            foreach (['players' => 'player', 'agents' => 'agent', 'administrators' => 'admin'] as $path => $role) {
                Route::get($path, [AdminUserController::class, 'index'])->defaults('role', $role);
            }
            // Players and agents register only through registration links; staff create administrators.
            Route::post('administrators', [AdminUserController::class, 'store'])->defaults('role', 'admin');
            Route::get('users/{user}', [AdminUserController::class, 'show']);
            Route::patch('users/{user}', [AdminUserController::class, 'update']);
            Route::post('users/{user}/status', [AdminUserController::class, 'setStatus']);
            Route::post('users/{user}/assign-agent', [AdminUserController::class, 'assignAgent']);
            Route::put('users/{user}/permissions', [AdminUserController::class, 'permissions']);
            Route::put('users/{user}/limits', [AdminUserController::class, 'limits']);

            Route::get('rooms', [AdminRoomController::class, 'index']);
            Route::post('rooms', [AdminRoomController::class, 'store']);
            Route::put('rooms/{room}', [AdminRoomController::class, 'update']);
            Route::get('tables', [AdminRoomController::class, 'tables']);
            Route::post('tables/{table}/close', [AdminRoomController::class, 'closeTable']);

            Route::get('games', [AdminGameController::class, 'index']);
            Route::get('games/{session}', [AdminGameController::class, 'show']);
            Route::post('games/{session}/cancel', [AdminGameController::class, 'cancel']);
            Route::post('games/{session}/retry', [AdminGameController::class, 'retry']);

            Route::get('wallets', [AdminWalletController::class, 'wallets']);
            Route::get('wallets/summary', [AdminWalletController::class, 'summary']);
            Route::post('wallets/{wallet}/freeze', [AdminWalletController::class, 'freeze']);
            Route::get('transactions', [AdminWalletController::class, 'transactions']);
            Route::post('transactions/{transaction}/reverse', [AdminWalletController::class, 'reverse']);
            Route::post('adjustments', [AdminWalletController::class, 'adjust']);
            Route::get('reconcile', [AdminWalletController::class, 'reconcile']);

            Route::get('commissions', [AdminCommissionController::class, 'index']);
            Route::post('commissions/{commission}/approve', [AdminCommissionController::class, 'approve']);
            Route::post('commissions/{commission}/reject', [AdminCommissionController::class, 'reject']);
            Route::post('commissions/{commission}/reverse', [AdminCommissionController::class, 'reverse']);
            Route::get('commission-rules', [AdminCommissionController::class, 'rules']);
            // Users / Employees (Loader Accounts; Administrators for the Super Admin).
            Route::get('employees', [EmployeeController::class, 'index']);
            Route::post('employees', [EmployeeController::class, 'store']);
            Route::patch('employees/{user}', [EmployeeController::class, 'update']);
            Route::put('employees/{user}/permissions', [EmployeeController::class, 'permissions']);
            Route::post('employees/{user}/status', [EmployeeController::class, 'status']);
            Route::put('employees/{user}/password', [EmployeeController::class, 'password'])->middleware('throttle:wallet-actions');
            Route::get('employees/{user}/activity', [EmployeeController::class, 'activity']);
            Route::delete('employees/{user}', [EmployeeController::class, 'destroy']);

            // Maintenance control (Super Admin / Administrators; checked again in the controller and service).
            Route::get('maintenance', [MaintenanceController::class, 'show']);
            Route::put('maintenance', [MaintenanceController::class, 'update'])->middleware('throttle:wallet-actions');

            // Admin Panel (dashboard, logs, accounts, Chips and commission actions).
            Route::prefix('panel')->group(function () {
                Route::get('overview', [PanelController::class, 'overview']);
                Route::post('issue', [PanelController::class, 'issue'])->middleware('throttle:wallet-actions');
                Route::get('load-logs', [PanelController::class, 'loadLogs']);
                Route::get('load-logs/{chipLoad}', [PanelController::class, 'loadLog']);
                Route::post('load-logs/{chipLoad}/approve', [PanelController::class, 'approveLoad'])->middleware('throttle:wallet-actions');
                Route::post('load-logs/{chipLoad}/reject', [PanelController::class, 'rejectLoad']);
                Route::get('commission-logs', [PanelController::class, 'commissionLogs']);
                Route::put('commission-rates', [PanelController::class, 'setRates']);
                Route::get('withdrawals', [PanelController::class, 'withdrawals']);
                Route::post('withdrawals/{payout}/approve', [PanelController::class, 'approveWithdrawal'])->middleware('throttle:wallet-actions');
                Route::post('withdrawals/{payout}/reject', [PanelController::class, 'rejectWithdrawal']);
                Route::get('accounts', [PanelController::class, 'accounts']);
                Route::get('accounts/{user}', [PanelController::class, 'account']);
                Route::post('accounts/{user}/load', [PanelController::class, 'load'])->middleware('throttle:wallet-actions');
                Route::post('accounts/{user}/withdraw', [PanelController::class, 'withdraw'])->middleware('throttle:wallet-actions');
                Route::post('accounts/{user}/withdraw-commission', [PanelController::class, 'withdrawCommission'])->middleware('throttle:wallet-actions');
                Route::put('accounts/{user}/commission-rate', [PanelController::class, 'setAccountRate']);
                Route::post('accounts/{user}/approve', [PanelController::class, 'approve']);
                Route::delete('accounts/{user}', [PanelController::class, 'destroy']);
                Route::post('accounts/{user}/status', [PanelController::class, 'setStatus']);
                Route::put('accounts/{user}/password', [PanelController::class, 'resetPassword'])->middleware('throttle:wallet-actions');
            });

            Route::get('payout-requests', [PayoutController::class, 'index']);
            Route::post('payout-requests/{payout}/approve', [PayoutController::class, 'approve']);
            Route::post('payout-requests/{payout}/reject', [PayoutController::class, 'reject']);
            Route::post('commission-rules', [AdminCommissionController::class, 'storeRule']);

            Route::get('reports/overview', [AdminReportController::class, 'overview']);
            Route::get('audit-logs', [AdminReportController::class, 'auditLogs']);
            Route::get('settings', [AdminReportController::class, 'settings']);
            Route::put('settings', [AdminReportController::class, 'updateSettings']);
        });
    });
});
