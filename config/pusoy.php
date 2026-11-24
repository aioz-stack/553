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
    | Two currencies only (App\Enums\Currency): Gold (Single Player) and Chips
    | (Multiplayer). Neither is cash — there are no deposits, withdrawals,
    | redemption or payouts of any kind.
    */
    'features' => [],

    // Player-created private rooms play for Chips, fee-free, and use this
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
    | Single Player — Round Bank, you + 3 bots (App\Services\Game\PracticeService).
    | rounds: rounds per match; the banker rotates seat by seat (you first).
    | min_gold: Gold balance (in points) the player must hold to pick the tier.
    | bets: the bet options offered before every round (Gold points).
    | Settlement follows the 'banker' section below. Every round moves Gold (GD,
    | free-play, never cash) automatically: App\Services\Game\GoldService.
    | out_of_gold_reward: free Gold Points claimed when the player is Out of Gold.
    | Every bot arranges with App\Game\BotArranger (exhaustive search for the best
    | expected Round Bank result; calibrate with `php artisan pusoy:calibrate-bots`).
    */
    'practice' => [
        'rounds' => (int) env('SINGLE_PLAYER_ROUNDS', 12),
        'out_of_gold_reward' => (int) env('SINGLE_PLAYER_GOLD_REWARD', 1_000),
        // Banker advantage: an identical lane goes to the banker (no ties).
        'banker_wins_ties' => true,
        'tiers' => [
            'beginner' => ['name' => 'Beginner', 'stars' => 1, 'crown' => false, 'min_gold' => 1_000, 'bets' => [50, 100, 500]],
            'intermediate' => ['name' => 'Intermediate', 'stars' => 2, 'crown' => false, 'min_gold' => 10_000, 'bets' => [500, 1_000, 5_000]],
            'advanced' => ['name' => 'Advance', 'stars' => 3, 'crown' => false, 'min_gold' => 100_000, 'bets' => [5_000, 10_000, 50_000]],
            'mastery' => ['name' => 'Mastery', 'stars' => 3, 'crown' => true, 'min_gold' => 1_000_000, 'bets' => [50_000, 100_000, 500_000]],
        ],
    ],

    /*
    | Multiplayer lobbies (Choose Your Seat): a player who has been gone this long loses their
    | seat before the match starts (never during the countdown).
    */
    'lobby' => [
        'seat_release_seconds' => (int) env('LOBBY_SEAT_RELEASE_SECONDS', 60),
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
