<?php

namespace App\Notifications;

use App\Models\WalletTransaction;
use App\Notifications\Channels\PushChannel;
use App\Support\Points;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Sent to the recipient of an allocation (only the recipient's own amount).
 */
class PointsReceived extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public WalletTransaction $transaction) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast', PushChannel::class];
    }

    private function text(): string
    {
        return 'You received '.Points::format($this->transaction->amount).' '.$this->transaction->currency->value.'.';
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'title' => 'Points received',
            'message' => $this->text(),
            'reference' => $this->transaction->reference,
            'currency' => $this->transaction->currency->value,
        ];
    }

    /**
     * @return array{title: string, body: string, data: array<string, string>}
     */
    public function toPush(object $notifiable): array
    {
        return ['title' => 'Points received', 'body' => $this->text(), 'data' => ['type' => 'points_received', 'reference' => $this->transaction->reference]];
    }
}
