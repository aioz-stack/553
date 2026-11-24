<?php

namespace App\Events;

use App\Models\User;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * "Something on your panel changed" — sent after commit for a Chips load, a Chips wallet
 * balance change, a commission, a withdrawal or a registration. It goes to the accounts
 * concerned and their whole upline (whose Team Overview and logs include them) and to the
 * staff channel. It carries no balances or personal data: open Admin / Agent Panels simply
 * refetch through the same authorized API. The upline is worked out by the queue worker,
 * so the request that changed the data pays nothing for it.
 */
class PanelUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets;

    private const UPLINE_DEPTH = 12;

    public bool $afterCommit = true;

    /** @param  list<int>  $userIds  the accounts the change is about */
    public function __construct(public array $userIds, public string $kind) {}

    /** @return list<PrivateChannel> */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('staff'),
            ...array_map(fn (int $id) => new PrivateChannel('user.'.$id), $this->recipients()),
        ];
    }

    /**
     * The accounts concerned plus everyone above them (sponsor chain and agent chain).
     *
     * @return list<int>
     */
    public function recipients(): array
    {
        $all = array_values(array_unique(array_map('intval', array_filter($this->userIds))));
        $frontier = $all;

        for ($i = 0; $i < self::UPLINE_DEPTH && $frontier !== []; $i++) {
            $up = User::query()->whereIn('users.id', $frontier)->whereNotNull('users.sponsor_id')->pluck('users.sponsor_id')->all();
            $up = array_merge($up, User::query()->whereIn('users.id', $frontier)
                ->join('agent_players', 'agent_players.player_id', '=', 'users.id')
                ->join('agents', 'agents.id', '=', 'agent_players.agent_id')->pluck('agents.user_id')->all());
            $up = array_merge($up, User::query()->whereIn('users.id', $frontier)
                ->join('agents as mine', 'mine.user_id', '=', 'users.id')
                ->join('agents as parent', 'parent.id', '=', 'mine.parent_agent_id')->pluck('parent.user_id')->all());
            $frontier = array_values(array_diff(array_unique(array_map('intval', $up)), $all));
            $all = array_merge($all, $frontier);
        }

        return $all;
    }

    public function broadcastAs(): string
    {
        return 'panel.updated';
    }

    /** @return array<string, string> */
    public function broadcastWith(): array
    {
        return ['kind' => $this->kind];
    }
}
