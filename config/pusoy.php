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
    'features' => [
        // Players may sign in (in the Mobile Game). Set PLAYER_LOGIN_ENABLED=false to shut players out
        // everywhere (sign-in and any existing app token are refused).
        'player_login' => (bool) env('PLAYER_LOGIN_ENABLED', true),
        // Platform lock: Players only in the Mobile Game (app token); Admins, staff and every agent
        // level only in the Web App (browser session). See App\Support\PlatformAccess.
        'platform_lock' => (bool) env('PLATFORM_LOGIN_LOCK', true),
    ],

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
    /*
    | Shop: players buy Keys with Chips at a fixed 5 Chips = 1 Key (packages keyed by id). Final and
    | non-refundable; Keys are never turned back into Chips. The Chips paid are shared with the
    | player's hierarchy by the player's direct upline (percent, totalling 100%), into each
    | recipient's Revenue wallet (moved into their Chips with Self Convert Revenue to Chips):
    |   direct upline Admin        → Admin 100%
    |   direct upline Incorporator → Admin 40%, Incorporator 60%
    |   direct upline Master Agent → Admin 40%, Incorporator 10%, Master Agent 50%
    | These are only the defaults: the Administrator sets the live rates in the Admin Panel
    | (Revenue Sharing Rates → Shop Revenue Sharing; ShopRevenueShares, stored in system_settings).
    */
    'shop' => [
        'chips_per_key' => 5,
        'key_packages' => [
            'k1' => ['keys' => 1, 'chips' => 5],
            'k2' => ['keys' => 2, 'chips' => 10],
            'k5' => ['keys' => 5, 'chips' => 25],
            'k10' => ['keys' => 10, 'chips' => 50],
        ],
        'revenue_shares' => [
            'admin' => ['admin' => 100],
            'incorporator' => ['admin' => 40, 'incorporator' => 60],
            'master' => ['admin' => 40, 'incorporator' => 10, 'master' => 50],
        ],
    ],

    /*
    | Self Convert Revenue to Chips (Overview of Admins, Incorporators and Master Agents): Chips
    | credited per 1 Revenue, in basis points. 10000 = 1:1 (1 Revenue = 1 Chip).
    */
    'revenue_conversion' => [
        'rate_bps' => (int) env('REVENUE_TO_CHIPS_RATE_BPS', 10000),
        // Smallest amount of Revenue one conversion may move.
        'min_amount' => 20,
    ],

    /*
    | One active login per Player account (PlayerSessions): a session used within this many minutes
    | counts as active. Signing in while another one is active disconnects every session.
    */
    'sessions' => [
        'active_minutes' => (int) env('PLAYER_SESSION_ACTIVE_MINUTES', 15),
    ],

    'lobby' => [
        'seat_release_seconds' => (int) env('LOBBY_SEAT_RELEASE_SECONDS', 60),
        // Legacy only: lobbies created before the entry tiers used these percentages of their
        // Minimum Entry as betting chips. New lobbies use the tiers below.
        'bet_chip_percents' => [5, 10, 15],
        // Entry tiers (Create Lobby). Key: Minimum Entry = the Chips a player must hold to join.
        // bets = the only bets allowed (Chips, 1:1); keys = the Keys each player pays to play,
        // deducted when the game starts. A player must also hold 2× the bet they select.
        'tiers' => [
            100 => ['bets' => [5, 10, 15], 'keys' => 1],
            500 => ['bets' => [20, 30, 40], 'keys' => 2],
            1000 => ['bets' => [50, 75, 100], 'keys' => 5],
        ],
        // Chips a player must hold to play: this multiple of the bet they selected.
        'player_bet_multiple' => 2,
        // Keys are refunded when a match ends before any round was completed (it never really began).
        'refund_keys_if_no_round_completed' => true,
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
        // Banker eligibility: a player may bank only with a Chips wallet balance of at least this
        // multiple of the maximum permitted bet (3 players × 2× reserve of the biggest bet = 6×).
        // Ineligible players are skipped clockwise until an eligible banker is found.
        'banker_reserve_multiple' => 6,
        // Lucky Hand (six pairs / three flushes / three straights) pays this multiple.
        'lucky_multiplier' => 2,
        'default_betting_seconds' => (int) env('BANKER_BETTING_SECONDS', 15),
        // Pause between rounds so players can see the result.
        // Pause between rounds: long enough for the reveal show (cards turn lane by lane, PUSOY! effects).
        'intermission_seconds' => (int) env('BANKER_INTERMISSION_SECONDS', 14),
        // Seconds the shuffle + clockwise deal animation takes; added to the arranging time.
        'deal_animation_seconds' => (int) env('BANKER_DEAL_ANIMATION_SECONDS', 6),
        // Default max bet when a room sets none: minimum bet × this.
        'max_bet_multiple' => 10,
        // A seated player offline at the start of this many rounds in a row is removed.
        'max_missed_rounds' => 2,
        // No eligible banker (nobody holds 6× the maximum bet): the match pauses and retries every
        // pause_retry_seconds; if still nobody qualifies after pause_timeout_seconds it ends.
        'pause_retry_seconds' => (int) env('BANKER_PAUSE_RETRY_SECONDS', 15),
        'pause_timeout_seconds' => (int) env('BANKER_PAUSE_TIMEOUT_SECONDS', 300),
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
