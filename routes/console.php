<?php

use Illuminate\Support\Facades\Schedule;

// Game safety net: timers, stuck settlements, disconnects, ready timeouts.
Schedule::command('pusoy:sweep')->everyMinute()->withoutOverlapping()->runInBackground();

// Daily ledger reconciliation; failures are written to the log.
Schedule::command('pusoy:reconcile')->dailyAt('03:00')->onFailure(function () {
    logger()->critical('Ledger reconciliation reported mismatches. Run `php artisan pusoy:reconcile`.');
});

Schedule::command('sanctum:prune-expired --hours=24')->daily();
