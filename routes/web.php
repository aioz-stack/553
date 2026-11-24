<?php

use App\Http\Controllers\Auth\Login;
use App\Http\Controllers\Auth\Register;
use App\Http\Controllers\CRUD;
use App\Http\Controllers\Dashboard;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Models\User;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

/*
| Web pages are Inertia shells built on Baseplate. Data and every action go
| through /api/v1 (same business logic as the mobile app), authenticated by
| this session via Sanctum's stateful mode.
*/

// Everything here is for guests (not logged in).
Route::middleware('guest')->group(function () {
    Route::get('/', [Login::class, 'showLoginForm'])->name('login');
    Route::post('/login', [Login::class, 'login'])->middleware('throttle:auth')->name('login.submit');

    Route::get('/register', [Register::class, 'show'])->name('register');
    Route::get('/register/{type}', [Register::class, 'show'])->whereIn('type', ['player', 'agent'])->name('register.link');
    Route::post('/register', [Register::class, 'store'])->middleware('throttle:auth')->name('register.submit');
    Route::get('/forgot-password', [Register::class, 'forgot'])->name('password.request');
    Route::post('/forgot-password', [Register::class, 'sendResetLink'])->middleware('throttle:auth')->name('password.email');
    Route::get('/reset-password/{token}', [Register::class, 'resetForm'])->name('password.reset');
    Route::post('/reset-password', [Register::class, 'reset'])->name('password.update');
});

// Everything here requires a logged in user.
Route::middleware('auth')->group(function () {
    Route::get('/dashboard', [Dashboard::class, 'index'])->name('dashboard');

    // Shared by every role.
    Route::inertia('/profile', 'Account/Profile')->name('profile');
    Route::inertia('/settings', 'Account/Settings')->name('settings');
    Route::inertia('/notifications', 'Account/Notifications')->name('notifications');

    // Player application.
    Route::middleware('can:play')->group(function () {
        Route::inertia('/lobby', 'Player/Lobby')->name('lobby');
        Route::inertia('/rooms', 'Player/Rooms')->name('rooms');
        Route::get('/play/{table}', fn (GameTable $table) => Inertia::render('Player/Table', ['tableId' => $table->id]))->name('play');
        Route::get('/games/{session}', fn (GameSession $session) => Inertia::render('Player/Results', ['sessionId' => $session->id]))->name('games.results');
        Route::inertia('/wallet', 'Player/Wallet')->name('wallet');
        Route::inertia('/transactions', 'Player/Transactions')->name('transactions');
        Route::inertia('/history', 'Player/History')->name('history');
        Route::inertia('/leaderboard', 'Player/Leaderboard')->name('leaderboard');
    });

    // Agent dashboard.
    Route::prefix('agent')->name('agent.')->middleware('can:agent')->group(function () {
        // Agent Panel (same screens as the Admin Panel, limited to the agent's downline).
        Route::inertia('/', 'AdminPanel/Overview')->name('overview');
        Route::inertia('/load-logs', 'AdminPanel/LoadLogs')->name('load-logs');
        Route::inertia('/commission-logs', 'AdminPanel/CommissionLogs')->name('commission-logs');
        Route::inertia('/commission-withdrawals', 'AdminPanel/Withdrawals')->name('commission-withdrawals');
        foreach (['agents' => 'agents', 'active-players' => 'players', 'pending-users' => 'pending'] as $path => $kind) {
            Route::inertia("/accounts/{$path}", 'AdminPanel/Accounts', ['kind' => $kind])->name("accounts.{$kind}");
        }
        Route::inertia('/change-password', 'AdminPanel/ChangePassword')->name('password');
        Route::inertia('/players', 'Agent/Players')->name('players');
        Route::inertia('/players/create', 'Agent/RegisterPlayer')->name('players.create');
        Route::get('/players/{player}', fn (User $player) => Inertia::render('Agent/PlayerDetail', ['playerId' => $player->id]))->name('players.show');
        Route::inertia('/referral-codes', 'Agent/ReferralCodes')->name('referrals');
        Route::inertia('/allocate', 'Agent/Allocate')->name('allocate');
        Route::inertia('/balances', 'Agent/Balances')->name('balances');
        Route::inertia('/transactions', 'Agent/Transactions')->name('transactions');
        Route::inertia('/activity', 'Agent/Activity')->name('activity');
        Route::inertia('/commissions', 'Agent/Commissions')->name('commissions');
        Route::inertia('/reports', 'Agent/Reports')->name('reports');
    });

    // Super Admin / Administrator dashboard (page access; each API call re-checks abilities).
    Route::prefix('admin')->name('admin.')->middleware('can:staff')->group(function () {
        // Admin Panel (premium dashboard; every number and action comes from the API).
        Route::inertia('/', 'AdminPanel/Overview')->name('overview');
        Route::inertia('/load-logs', 'AdminPanel/LoadLogs')->name('load-logs');
        Route::inertia('/commission-logs', 'AdminPanel/CommissionLogs')->name('commission-logs');
        Route::inertia('/commission-withdrawals', 'AdminPanel/Withdrawals')->name('commission-withdrawals');
        foreach (['agents' => 'agents', 'active-players' => 'players', 'pending-users' => 'pending', 'ban-users' => 'banned', 'archive' => 'archived'] as $path => $kind) {
            Route::inertia("/accounts/{$path}", 'AdminPanel/Accounts', ['kind' => $kind])->name("accounts.{$kind}");
        }
        Route::inertia('/change-password', 'AdminPanel/ChangePassword')->name('password');
        Route::inertia('/platform', 'Admin/Overview')->name('platform');
        Route::inertia('/administrators', 'Admin/Users', ['role' => 'admin'])->middleware('can:super-admin')->name('administrators');
        Route::inertia('/agents', 'Admin/Users', ['role' => 'agent'])->middleware('can:manage_agents')->name('agents');
        Route::inertia('/players', 'Admin/Users', ['role' => 'player'])->middleware('can:manage_players')->name('players');
        Route::get('/users/{user}', fn (User $user) => Inertia::render('Admin/UserDetail', ['userId' => $user->id]))->name('users.show');
        Route::inertia('/rooms', 'Admin/Rooms')->middleware('can:manage_rooms')->name('rooms');
        Route::inertia('/tables', 'Admin/Tables')->middleware('can:manage_games')->name('tables');
        Route::inertia('/sessions', 'Admin/Sessions')->middleware('can:manage_games')->name('sessions');
        Route::get('/sessions/{session}', fn (GameSession $session) => Inertia::render('Admin/SessionDetail', ['sessionId' => $session->id]))->middleware('can:manage_games')->name('sessions.show');
        Route::inertia('/wallets', 'Admin/Wallets')->middleware('can:review_transactions')->name('wallets');
        Route::inertia('/allocations', 'Admin/Allocations')->middleware('can:allocate_points')->name('allocations');
        Route::inertia('/transactions', 'Admin/Transactions')->middleware('can:review_transactions')->name('transactions');
        Route::inertia('/commissions', 'Admin/Commissions')->middleware('can:manage_commissions')->name('commissions');
        Route::inertia('/reports', 'Admin/Reports')->middleware('can:view_reports')->name('reports');
        Route::inertia('/audit-logs', 'Admin/AuditLogs')->middleware('can:view_audit_logs')->name('audit');
        Route::inertia('/settings', 'Admin/Settings')->middleware('can:super-admin')->name('settings');
    });

    // Baseplate's original CRUD example, now restricted to Super Admin.
    Route::resource('crud', CRUD::class)->names('crud')->middleware('can:super-admin');

    Route::post('/logout', [Login::class, 'logout'])->name('logout');
});

// Anything unmatched renders the Inertia 404 page.
Route::fallback(function () {
    return Inertia::render('Errors/NotFound')->toResponse(request())->setStatusCode(404);
});
