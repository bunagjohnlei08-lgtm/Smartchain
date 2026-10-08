<?php

namespace App\Support;

use Carbon\CarbonInterface;

/** Single formatter for business-facing times; always converts to Asia/Manila first. */
final class BusinessTime
{
    public const TIMEZONE = 'Asia/Manila';

    /**
     * Eloquent date format for models with timestamptz columns. Without the
     * offset, PostgreSQL reads the UTC value in its session timezone (+08 here)
     * and stores an instant 8 hours early.
     */
    public const DB_DATE_FORMAT = 'Y-m-d H:i:sP';

    /** e.g. "October 9, 2026, 3:00 PM – 4:00 PM" */
    public static function meetingRange(CarbonInterface $startsAt, ?CarbonInterface $endsAt = null): string
    {
        $start = $startsAt->copy()->setTimezone(self::TIMEZONE);
        $end = ($endsAt ?? $startsAt->copy()->addHour())->copy()->setTimezone(self::TIMEZONE);

        return $start->format('F j, Y, g:i A').' – '.$end->format('g:i A');
    }
}
