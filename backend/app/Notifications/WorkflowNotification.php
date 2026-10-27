<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Notifications\Messages\MailMessage;

class WorkflowNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly string $title,
        public readonly string $message,
        public readonly string $type,
        public readonly string $referenceId,
        public readonly ?string $category = null,
        public readonly array $metadata = [],
        public readonly ?array $deliveryChannels = null,
    ) {}

    public function via(object $notifiable): array
    {
        return $this->deliveryChannels ?? ($this->category === 'Supplier Bidding' ? ['database', 'mail'] : ['database']);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)->subject($this->title)->line($this->message)->line('Reference: '.$this->referenceId);
    }

    public function toDatabase(object $notifiable): array
    {
        return [
            'title' => $this->title,
            'message' => $this->message,
            'type' => $this->type,
            'reference_id' => $this->referenceId,
            'category' => $this->category,
            ...($this->metadata === [] ? [] : ['metadata' => $this->metadata]),
        ];
    }
}
