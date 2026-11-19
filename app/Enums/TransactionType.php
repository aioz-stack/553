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
    /** Out of Gold: the free 1,000 Gold claim (Single Player). */
    case OutOfGoldReward = 'OUT_OF_GOLD_REWARD';
    /** History only: Gold Points converted into Gold before Gold Points were retired. */
    case GoldConversion = 'GOLD_CONVERSION';
    case Reversal = 'REVERSAL';
}
