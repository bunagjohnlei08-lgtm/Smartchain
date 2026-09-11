<?php

namespace App\Support;

use App\Notifications\WorkflowNotification;
use Illuminate\Support\Facades\Notification;
use Throwable;

class WorkflowNotificationSender
{
    public static function send(mixed $notifiables, WorkflowNotification $notification): void
    {
        try {
            Notification::send($notifiables, $notification);
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
