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

    // private channel: user.{userId}
    public const CARDS_DEALT = 'cards.dealt';
}
