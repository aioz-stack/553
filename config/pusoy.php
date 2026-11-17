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
    | Banker modes (Round Bank = rotating banker, Banker Mode = fixed banker).
    | Settlement is per player vs the banker, in multiples of the player's bet,
    | keyed by "wins-losses-ties" across Front/Middle/Back. Missing keys pay 0
    | (so any result containing a tie pays nothing by default).
    */
    'banker' => [
        'rounds' => (int) env('BANKER_ROUNDS', 12),
        'settlement' => [
            '3-0-0' => 2,
            '0-3-0' => -2,
            '2-1-0' => 1,
            '1-2-0' => -1,
        ],
        // Each side reserves this multiple of the bet in escrow (the worst case).
        'reserve_multiplier' => 2,
        // Lucky Hand (six pairs / three flushes / three straights) pays this multiple.
        'lucky_multiplier' => 2,
        'default_betting_seconds' => (int) env('BANKER_BETTING_SECONDS', 15),
        // Pause between rounds so players can see the result.
        'intermission_seconds' => (int) env('BANKER_INTERMISSION_SECONDS', 8),
        // Default max bet when a room sets none: minimum bet × this.
        'max_bet_multiple' => 10,
        // A seated player offline at the start of this many rounds in a row is removed.
        'max_missed_rounds' => 2,
        'min_players' => 2,
    ],

    // Player levels: xp per round played, bonus per round won, xp per level.
    'xp' => ['per_round' => 10, 'per_win' => 15, 'per_level' => 100],

    // A user counts as online when seen within this many seconds.
    'online_seconds' => 120,

    /*
    | Development helpers (seat demo players at a table, etc). Only honoured
    | when APP_ENV=local.
    */
    'dev_tools' => (bool) env('PUSOY_DEV_TOOLS', false),
];
