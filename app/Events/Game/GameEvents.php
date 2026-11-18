<?php

namespace App\Events\Game;

/**
 * Catalog of real-time event names (the `broadcastAs` value). Clients
 * listen with a leading dot, e.g. `channel.listen('.player.joined', ...)`.
 */
final class GameEvents
{
    // presence channel: table.{tableId}
    public const PLAYER_JOINED = 'player.joined';

    public const PLAYER_LEFT = 'player.left';

    public const PLAYER_READY = 'player.ready';

    public const TABLE_FULL = 'table.full';

    public const GAME_STARTED = 'game.started';

    public const TIMER_UPDATED = 'game.timer';

    public const PLAYER_SUBMITTED = 'player.submitted';

    public const ALL_SUBMITTED = 'game.all_submitted';

    public const GAME_REVEALED = 'game.revealed';

    public const SCORING_COMPLETED = 'game.scored';

    public const GAME_RESULTS = 'game.results';

    public const PLAYER_DISCONNECTED = 'player.disconnected';

    public const PLAYER_RECONNECTED = 'player.reconnected';

    public const GAME_CANCELLED = 'game.cancelled';

    // banker modes (table channel)
    public const MATCH_STARTED = 'match.started';

    public const ROUND_STARTED = 'round.started';

    public const BANKER_ASSIGNED = 'banker.assigned';

    public const PLAYER_BET = 'player.bet';

    public const BETTING_CLOSED = 'betting.closed';

    public const PLAYER_LUCKY = 'player.lucky';

    public const ROUND_COMPLETED = 'round.completed';

    public const MATCH_COMPLETED = 'match.completed';

    // a seated player changed their profile (e.g. avatar): refresh their seat
    public const PLAYER_UPDATED = 'player.updated';

    // multiplayer lobbies (Choose Your Seat): a player confirmed / changed seat; the synchronized
    // pre-match countdown started (payload: ends_at) or was cancelled (payload: reason).
    public const PLAYER_SEATED = 'player.seated';

    public const COUNTDOWN_STARTED = 'match.countdown';

    public const COUNTDOWN_CANCELLED = 'match.countdown_cancelled';

    // private channel: user.{userId}
    public const WALLET_UPDATED = 'wallet.updated';

    public const CARDS_DEALT = 'cards.dealt';
}
