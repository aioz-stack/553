<?php

namespace App\Observers;

use App\Events\PanelUpdated;
use App\Models\AgentCommission;
use App\Models\AgentPayoutRequest;
use App\Models\ChipLoad;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Real-time refresh for the Admin and Agent Panels: whenever a Chips load, commission,
 * commission withdrawal or account changes, the accounts it concerns and their whole
 * upline (whose Team Overview and logs include it) get a `panel.updated` event.
 */
class PanelActivityObserver
{
    private const UPLINE_DEPTH = 10;

    public function saved(Model $model): void
    {
        if ($model instanceof User && ! $model->wasRecentlyCreated && ! $model->wasChanged(['status', 'sponsor_id', 'role'])) {
            return; // e.g. last login, profile edits: nothing on the panels changes.
        }

        [$kind, $ids] = match (true) {
            $model instanceof ChipLoad => ['load', [$model->account_id, $model->sender_id]],
            $model instanceof AgentCommission => ['commission', [$model->agent?->user_id]],
            $model instanceof AgentPayoutRequest => ['withdrawal', [$model->agent?->user_id]],
            $model instanceof User => ['account', [$model->id]],
            default => ['other', []],
        };

        $ids = array_values(array_filter($ids));
        if ($ids === []) {
            return;
        }

        event(new PanelUpdated($this->withUpline($ids), $kind));
    }

    /**
     * @param  list<int>  $ids
     * @return list<int>
     */
    private function withUpline(array $ids): array
    {
        $all = $ids;
        $frontier = $ids;
        for ($i = 0; $i < self::UPLINE_DEPTH && $frontier !== []; $i++) {
            $frontier = array_values(array_diff(
                User::query()->whereIn('id', $frontier)->whereNotNull('sponsor_id')->pluck('sponsor_id')->all(),
                $all,
            ));
            $all = array_merge($all, $frontier);
        }

        return array_values(array_unique(array_map('intval', $all)));
    }
}
