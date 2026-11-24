<?php

namespace App\Notifications;

use App\Models\ChipLoad;
use App\Support\Points;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Account notification: Chips were withdrawn from the player's wallet by their agent or staff.
 * Only the player's own amount and reference — never another account's balance.
 */
class ChipsWithdrawn extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public ChipLoad $load) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'title' => 'Chips withdrawn',
            'message' => Points::format($this->load->amount).' Chips were withdrawn from your wallet by '.($this->load->processor?->username ?? 'your agent').'.',
            'reference' => $this->load->reference,
            'currency' => 'CH',
        ];
    }
}
