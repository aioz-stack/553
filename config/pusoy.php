<?php

/*
|--------------------------------------------------------------------------
| Pusoy 13 platform configuration
|--------------------------------------------------------------------------
|
| Amounts on this platform are stored as integer "minor units" (1 point =
| 100 minor units) so no floating point arithmetic touches balances. Use
| App\Support\Points to convert between display values and minor units.
|
*/

return [

    /*
    | Feature flags. Every cash-related capability is OFF by default and must
    | stay off until Philippine legal, regulatory and payment-provider
    | approvals have been obtained. VC free-play is always available.
    */
    'features' => [
        // Real-money deposits into CP wallets.
        'cash_deposits' => (bool) env('FEATURE_CASH_DEPOSITS', false),
        // Cash withdrawals / redemption of CP.
        'cash_withdrawals' => (bool) env('FEATURE_CASH_WITHDRAWALS', false),
        // Playing CP-denominated rooms (wagering CP points).
        'cp_wagering' => (bool) env('FEATURE_CP_WAGERING', false),
        // Paying agent commissions out in CP.
        'cp_commission_payouts' => (bool) env('FEATURE_CP_COMMISSION_PAYOUTS', false),
        // Optional free daily VC reward for players.
        'daily_vc_reward' => (bool) env('FEATURE_DAILY_VC_REWARD', true),
    ],

    'daily_vc_reward_amount' => (int) env('DAILY_VC_REWARD_AMOUNT', 100),

    // Player-created private rooms are VC-only, fee-free, and use this
    // platform-chosen payout mode (players never choose payout modes).
    'private_room_payout_mode' => env('PRIVATE_ROOM_PAYOUT_MODE', 'winner_takes_all'),

    'game' => [
        // Every Pusoy 13 table seats exactly four players.
        'seats' => 4,
        'default_arrangement_seconds' => (int) env('GAME_ARRANGEMENT_SECONDS', 90),
        // Seconds a seated player may stay un-ready on a full table before being removed.
        'ready_timeout_seconds' => (int) env('GAME_READY_TIMEOUT_SECONDS', 60),
        // A seated player with no heartbeat for this long is marked disconnected.
        'disconnect_after_seconds' => (int) env('GAME_DISCONNECT_AFTER_SECONDS', 30),
        // Scoring: points per pairwise comparison.
        'score_win' => 1,
        'score_loss' => -1,
        'score_tie' => 0,
    ],

    /*
    | Development helpers (seat demo players at a table, etc). Only honoured
    | when APP_ENV=local.
    */
    'dev_tools' => (bool) env('PUSOY_DEV_TOOLS', false),
];
