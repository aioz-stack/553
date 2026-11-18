<?php

namespace App\Enums;

enum TransactionType: string
{
    case AdminAllocation = 'ADMIN_ALLOCATION';
    case AgentAllocation = 'AGENT_ALLOCATION';
    case PlayerCredit = 'PLAYER_CREDIT';
    case PlayerDebit = 'PLAYER_DEBIT';
    case GameEntry = 'GAME_ENTRY';
    case GameRefund = 'GAME_REFUND';
    case GameReward = 'GAME_REWARD';
    case PlatformFee = 'PLATFORM_FEE';
    case CommissionPayment = 'COMMISSION_PAYMENT';
    case CommissionPayout = 'COMMISSION_PAYOUT';
    case ManualAdjustment = 'MANUAL_ADJUSTMENT';
    case DailyReward = 'DAILY_REWARD';
    case LuckyBonus = 'LUCKY_BONUS';
    /** Out of Gold: the free 1,000 Gold Points claim (Single Player). */
    case GoldPointsReward = 'GOLD_POINTS_REWARD';
    /** Gold Points converted 1:1 into Gold (one way). */
    case GoldConversion = 'GOLD_CONVERSION';
    case Reversal = 'REVERSAL';
}
