<?php

namespace App\Services\Reports;

use App\Enums\CommissionStatus;
use App\Enums\Currency;
use App\Enums\GameStatus;
use App\Enums\Role;
use App\Enums\TableStatus;
use App\Enums\TransactionType;
use App\Enums\WalletType;
use App\Models\Agent;
use App\Models\AgentCommission;
use App\Models\AgentPlayer;
use App\Models\GameResult;
use App\Models\GameSession;
use App\Models\GameTable;
use App\Models\PlatformFee;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\Game\BankerMatchService;
use App\Services\Game\TableService;
use App\Support\Level;
use App\Support\Points;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Read-only aggregates shared by the web dashboards and the API.
 */
class ReportService
{
    /**
     * @return array<string, mixed>
     */
    public function platformOverview(): array
    {
        $byRole = User::query()->select('role', DB::raw('COUNT(*) as total'))->groupBy('role')->pluck('total', 'role');

        $issued = [];
        $fees = [];
        $circulating = [];

        foreach (Currency::cases() as $currency) {
            $issued[$currency->value] = Points::decimal((int) WalletTransaction::query()
                ->whereNull('source_wallet_id')->where('currency', $currency->value)->sum('amount'));
            $fees[$currency->value] = Points::decimal((int) PlatformFee::query()->where('currency', $currency->value)->sum('amount'));
            $circulating[$currency->value] = Points::decimal((int) Wallet::query()
                ->where('currency', $currency->value)->where('type', WalletType::Player->value)->sum('balance'));
        }

        return [
            'users' => [
                'super_admins' => (int) ($byRole[Role::SuperAdmin->value] ?? 0),
                'administrators' => (int) ($byRole[Role::Administrator->value] ?? 0),
                'agents' => (int) ($byRole[Role::Agent->value] ?? 0),
                'players' => (int) ($byRole[Role::Player->value] ?? 0),
            ],
            'tables' => [
                'waiting' => GameTable::query()->whereIn('status', [TableStatus::WaitingForPlayers->value, TableStatus::Ready->value])->count(),
                'in_game' => GameTable::query()->where('status', TableStatus::InGame->value)->count(),
            ],
            'games' => [
                'today' => GameSession::query()->where('created_at', '>=', now('UTC')->startOfDay())->count(),
                'completed' => GameSession::query()->where('status', GameStatus::Completed->value)->count(),
                'cancelled' => GameSession::query()->where('status', GameStatus::Cancelled->value)->count(),
            ],
            'issued' => $issued,
            'platform_fees' => $fees,
            'player_balances' => $circulating,
            'pending_commissions' => AgentCommission::query()->where('status', CommissionStatus::Pending->value)->count(),
            'games_per_day' => $this->gamesPerDay(14),
        ];
    }

    /**
     * @return array{labels: list<string>, values: list<int>}
     */
    public function gamesPerDay(int $days): array
    {
        $start = now('UTC')->subDays($days - 1)->startOfDay();
        $counts = GameSession::query()
            ->where('created_at', '>=', $start)
            ->selectRaw('DATE(created_at) as day, COUNT(*) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $labels = [];
        $values = [];

        for ($i = 0; $i < $days; $i++) {
            $day = $start->copy()->addDays($i)->toDateString();
            $labels[] = Carbon::parse($day)->format('M d');
            $values[] = (int) ($counts[$day] ?? 0);
        }

        return ['labels' => $labels, 'values' => $values];
    }

    /**
     * @return array<string, mixed>
     */
    public function agentOverview(Agent $agent): array
    {
        $playerIds = AgentPlayer::query()->where('agent_id', $agent->id)->pluck('player_id');
        $wallets = Wallet::query()->where('user_id', $agent->user_id)->get();

        $commission = AgentCommission::query()->where('agent_id', $agent->id)
            ->select('status', 'currency', DB::raw('SUM(amount) as total'))
            ->groupBy('status', 'currency')->get()
            ->map(fn ($row) => ['status' => $row->status->value, 'currency' => $row->currency->value, 'total' => Points::decimal((int) $row->total)]);

        $balance = fn (WalletType $type, Currency $c) => Points::decimal((int) $wallets->first(fn ($w) => $w->type === $type && $w->currency === $c)?->balance);

        return [
            'agent' => ['id' => $agent->id, 'code' => $agent->code, 'status' => $agent->status],
            'players' => $playerIds->count(),
            'active_players_7d' => GameResult::query()->whereIn('user_id', $playerIds)->where('created_at', '>=', now()->subDays(7))->distinct('user_id')->count('user_id'),
            'allocation' => ['CP' => $balance(WalletType::Allocation, Currency::CP), 'VC' => $balance(WalletType::Allocation, Currency::VC)],
            'commission_wallet' => ['CP' => $balance(WalletType::Commission, Currency::CP), 'VC' => $balance(WalletType::Commission, Currency::VC)],
            'allocation_frozen' => $wallets->where('type', WalletType::Allocation)->contains('is_frozen', true),
            'commissions' => $commission->values(),
            'distributed' => [
                'CP' => Points::decimal((int) WalletTransaction::query()->where('type', TransactionType::AgentAllocation->value)->where('related_agent_id', $agent->user_id)->where('currency', 'CP')->sum('amount')),
                'VC' => Points::decimal((int) WalletTransaction::query()->where('type', TransactionType::AgentAllocation->value)->where('related_agent_id', $agent->user_id)->where('currency', 'VC')->sum('amount')),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function playerStats(User $user): array
    {
        $profile = $user->profile;
        $results = GameResult::query()->where('user_id', $user->id);

        $rounds = GameResult::query()->where('user_id', $user->id)->whereNotNull('role')
            ->whereHas('session', fn ($q) => $q->where('status', 'COMPLETED'));
        $asPlayer = (clone $rounds)->where('role', 'player');
        $asBanker = (clone $rounds)->where('role', 'banker');
        $sum = fn ($q, string $expr) => (int) (clone $q)->sum(DB::raw($expr));
        $seat = app(TableService::class)->activeSeat($user);

        $banker = [
            'rounds' => (clone $asBanker)->count(),
            'bets_received' => Points::decimal($sum($asBanker, 'bet_amount')),
            // What the banker paid to winning players (sum of their gross wins this banker covered).
            'payouts' => Points::decimal((int) GameResult::query()->where('role', 'player')->where('net_amount', '>', 0)
                ->whereIn('game_session_id', (clone $asBanker)->select('game_session_id'))->sum(DB::raw('net_amount + platform_fee'))),
            'winnings' => Points::decimal($sum($asBanker, 'CASE WHEN net_amount > 0 THEN net_amount ELSE 0 END')),
            'losses' => Points::decimal(-$sum($asBanker, 'CASE WHEN net_amount < 0 THEN net_amount ELSE 0 END')),
            'remaining_rounds' => $seat ? app(BankerMatchService::class)->remainingBankerRounds($seat->table, $user->id) : 0,
        ];

        return [
            'level' => Level::fromXp((int) ($profile?->xp ?? 0)),
            'rounds' => [
                'played' => (clone $rounds)->count(),
                'won' => (clone $rounds)->where('net_amount', '>', 0)->count(),
                'lost' => (clone $rounds)->where('net_amount', '<', 0)->count(),
                'tied' => (clone $rounds)->where('net_amount', 0)->count(),
                'total_bets' => Points::decimal($sum($asPlayer, 'bet_amount')),
                'total_winnings' => Points::decimal($sum($rounds, 'CASE WHEN net_amount > 0 THEN net_amount ELSE 0 END')),
                'total_losses' => Points::decimal(-$sum($rounds, 'CASE WHEN net_amount < 0 THEN net_amount ELSE 0 END')),
                'lucky_hands' => (clone $rounds)->whereNotNull('lucky_type')->count(),
                'lucky_bonuses' => Points::decimal($sum($rounds, 'lucky_bonus')),
            ],
            'banker' => $banker,
            'balances' => Wallet::query()->where('user_id', $user->id)->where('type', 'player')->pluck('balance', 'currency')
                ->map(fn ($b) => Points::decimal((int) $b)),
            'games_played' => $profile?->games_played ?? 0,
            'games_won' => $profile?->games_won ?? 0,
            'total_score' => $profile?->total_score ?? 0,
            'win_rate' => $profile && $profile->games_played ? round($profile->games_won / $profile->games_played * 100, 1) : 0,
            'fouls' => (clone $results)->where('is_foul', true)->count(),
            'best_score' => (int) (clone $results)->max('score'),
            'recent_scores' => (clone $results)->latest('id')->limit(10)->pluck('score')->reverse()->values(),
        ];
    }
}
