<?php

namespace App\Support;

use App\Notifications\WorkflowNotification;
use Illuminate\Support\Facades\Notification;
use Throwable;

class WorkflowNotificationSender
{
    public static function send(mixed $notifiables, WorkflowNotification $notification): void
    {
        self::attempt($notifiables, new WorkflowNotification(
            $notification->title, $notification->message, $notification->type,
            $notification->referenceId, $notification->category, $notification->metadata, ['database']
        ));

        if ($notification->category === 'Supplier Bidding') {
            self::attempt($notifiables, new WorkflowNotification(
                $notification->title, $notification->message, $notification->type,
                $notification->referenceId, $notification->category, $notification->metadata, ['mail']
            ));
        }
    }

    private static function attempt(mixed $notifiables, WorkflowNotification $notification): void
    {
        try {
            Notification::send($notifiables, $notification);
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
