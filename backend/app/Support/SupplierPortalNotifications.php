<?php

namespace App\Support;

use App\Mail\SupplierApplicationPortalMail;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationMeetingSlot;
use Illuminate\Support\Facades\Mail;
use Throwable;

final class SupplierPortalNotifications
{
    public static function sendStatus(
        SupplierApplication $application,
        string $subject,
        string $heading,
        string $message,
        array $meetingOptions = [],
    ): bool {
        $link = SupplierPortalAccess::issueLink($application);

        try {
            Mail::to($application->email)->send(new SupplierApplicationPortalMail(
                subjectLine: $subject,
                heading: $heading,
                recipientName: $application->contact_person,
                applicationReference: $application->application_number,
                messageText: $message,
                actionUrl: $link['url'],
                meetingOptions: $meetingOptions,
            ));

            return true;
        } catch (Throwable $exception) {
            report($exception);

            return false;
        }
    }

    public static function sendMeetingConfirmation(
        SupplierApplication $application,
        SupplierApplicationMeetingSlot $slot,
    ): bool {
        $startsAt = $slot->starts_at ?? $slot->scheduled_at;
        $endsAt = $slot->ends_at ?? $startsAt->copy()->addHour();
        $link = SupplierPortalAccess::issueLink($application);

        try {
            Mail::to($application->email)->send(new SupplierApplicationPortalMail(
                subjectLine: 'Supplier Meeting Schedule Confirmed',
                heading: 'Meeting confirmed',
                recipientName: $application->contact_person,
                applicationReference: $application->application_number,
                messageText: 'Your meeting schedule has been confirmed.',
                actionUrl: $link['url'],
                meetingDate: BusinessTime::meetingRange($startsAt, $endsAt).' (Asia/Manila)',
            ));

            return true;
        } catch (Throwable $exception) {
            report($exception);

            return false;
        }
    }
}
