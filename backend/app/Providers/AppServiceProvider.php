<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Public activation-link endpoints: per client IP.
        RateLimiter::for('invitations', fn (Request $request) => Limit::perMinute(10)->by('invitations:'.$request->ip()));

        // Admin resend: per admin, on top of the per-account cooldown.
        RateLimiter::for('invitation-resend', fn (Request $request) => Limit::perMinute(10)->by(
            'invitation-resend:'.($request->user()?->id ?: $request->ip())
        ));
    }
}
