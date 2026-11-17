<?php

namespace App\Enums;

enum TableStatus: string
{
    case WaitingForPlayers = 'WAITING_FOR_PLAYERS';
    case Ready = 'READY';
    case InGame = 'IN_GAME';
    case Closed = 'CLOSED';
}
