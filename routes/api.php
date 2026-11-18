<?php

use App\Http\Controllers\Api\V1\Admin\CommissionController as AdminCommissionController;
use App\Http\Controllers\Api\V1\Admin\GameController as AdminGameController;
use App\Http\Controllers\Api\V1\Admin\ReportController as AdminReportController;
use App\Http\Controllers\Api\V1\Admin\RoomController as AdminRoomController;
use App\Http\Controllers\Api\V1\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\V1\Admin\WalletController as AdminWalletController;
use App\Http\Controllers\Api\V1\AgentController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\FriendController;
use App\Http\Controllers\Api\V1\GameController;
use App\Http\Controllers\Api\V1\PayoutController;
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
    Route::prefix('auth')->middleware('throttle:auth')->group(function () {
        Route::post('register', [AuthController::class, 'register']);
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
        Route::get('profile/stats', [PlayerController::class, 'stats']);
        Route::get('profile/games', [PlayerController::class, 'history']);
        Route::get('leaderboard', [PlayerController::class, 'leaderboard']);
        Route::get('notifications', [PlayerController::class, 'notifications']);
        Route::post('notifications/read', [PlayerController::class, 'markNotificationsRead']);

        // Own wallet
        Route::get('wallet', [WalletController::class, 'balances']);
        Route::get('wallet/transactions', [WalletController::class, 'transactions']);
        Route::post('wallet/daily-reward', [WalletController::class, 'claimDailyReward'])->middleware('throttle:wallet-actions');
        Route::post('wallet/deposit', [WalletController::class, 'cashDisabled']);
        Route::post('wallet/withdraw', [WalletController::class, 'cashDisabled']);

        // Allocation (Super Admin / Administrator / Agent; rules in AllocationService)
        Route::post('wallet/allocate', [AdminWalletController::class, 'allocate'])->middleware(['role:super_admin,admin,agent', 'throttle:wallet-actions']);

        // Rooms & tables
        Route::get('rooms', [RoomController::class, 'index']);
        Route::post('rooms/private', [RoomController::class, 'storePrivate']);
        Route::post('rooms/host', [RoomController::class, 'host'])->middleware('throttle:game-actions');
        Route::get('rooms/{room}', [RoomController::class, 'show']);
        Route::post('rooms/{room}/join', [RoomController::class, 'join'])->middleware('throttle:game-actions');
        Route::post('rooms/{room}/invite', [RoomController::class, 'invite']);

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
        Route::post('games/{session}/bet', [GameController::class, 'bet'])->middleware('throttle:game-actions');
        Route::post('games/{session}/lucky', [GameController::class, 'lucky'])->middleware('throttle:game-actions');

        // Single Player: Round Bank Pusoy vs one bot (12 rounds, alternating banker)
        Route::get('practice/tiers', [PracticeController::class, 'tiers']);
        Route::post('practice/matches', [PracticeController::class, 'startMatch'])->middleware('throttle:game-actions');
        Route::get('practice/matches/current', [PracticeController::class, 'currentMatch']);
        Route::get('practice/matches/{practiceMatch}', [PracticeController::class, 'showMatch']);
        Route::post('practice/matches/{practiceMatch}/deal', [PracticeController::class, 'deal'])->middleware('throttle:game-actions');
        Route::get('practice/{practiceGame}', [PracticeController::class, 'show']);
        Route::post('practice/{practiceGame}/preview', [PracticeController::class, 'preview']);
        Route::post('practice/{practiceGame}/suggest', [PracticeController::class, 'suggest']);
        Route::post('practice/{practiceGame}/lucky', [PracticeController::class, 'lucky'])->middleware('throttle:game-actions');
        Route::post('practice/{practiceGame}/submit', [PracticeController::class, 'submit'])->middleware('throttle:game-actions');

        // Friends
        Route::get('friends', [FriendController::class, 'index']);
        Route::post('friends', [FriendController::class, 'store'])->middleware('throttle:game-actions');
        Route::post('friends/{friendship}/accept', [FriendController::class, 'accept']);
        Route::delete('friends/{friendship}', [FriendController::class, 'destroy']);
        Route::post('friends/{user}/invite', [FriendController::class, 'invite'])->middleware('throttle:game-actions');
        Route::get('games/{session}/results', [GameController::class, 'results']);

        // Agent
        Route::prefix('agent')->middleware('can:agent')->group(function () {
            Route::get('dashboard', [AgentController::class, 'dashboard']);
            Route::get('players', [AgentController::class, 'players']);
            Route::post('players', [AgentController::class, 'registerPlayer']);
            Route::get('players/{player}', [AgentController::class, 'player']);
            Route::get('wallet', [AgentController::class, 'wallets']);
            Route::get('transactions', [AgentController::class, 'transactions']);
            Route::get('commissions', [AgentController::class, 'commissions']);
            Route::get('referral-codes', [AgentController::class, 'referralCodes']);
            Route::post('referral-codes', [AgentController::class, 'createReferralCode']);
            Route::get('activity', [AgentController::class, 'activity']);
            Route::get('payout-requests', [PayoutController::class, 'index']);
            Route::post('payout-requests', [PayoutController::class, 'store'])->middleware('throttle:wallet-actions');
            Route::get('reports', [AgentController::class, 'dashboard']);
        });

        // Admin (Super Admin + Administrators; per-endpoint abilities)
        Route::prefix('admin')->middleware('can:staff')->group(function () {
            Route::get('users', [AdminUserController::class, 'index']);
            Route::post('users', [AdminUserController::class, 'store']);
            foreach (['players' => 'player', 'agents' => 'agent', 'administrators' => 'admin'] as $path => $role) {
                Route::get($path, [AdminUserController::class, 'index'])->defaults('role', $role);
                Route::post($path, [AdminUserController::class, 'store'])->defaults('role', $role);
            }
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
