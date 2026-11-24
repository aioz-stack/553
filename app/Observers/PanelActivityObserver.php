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
 * commission withdrawal or account status changes, a `panel.updated` event goes to the
 * accounts it concerns and their upline (see PanelUpdated). Chips balance changes are
 * signalled by the LedgerService itself.
 */
class PanelActivityObserver
{
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
        if ($ids !== []) {
            event(new PanelUpdated($ids, $kind));
        }
    }
}
