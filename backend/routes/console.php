<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Admin report schedules. Delivery only happens when the production scheduler
// (`php artisan schedule:run` every minute via cron/worker) is configured.
Schedule::command('reports:run-scheduled')->everyFiveMinutes()->withoutOverlapping();
