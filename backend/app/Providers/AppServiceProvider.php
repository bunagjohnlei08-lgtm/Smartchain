<?php

namespace App\Providers;

use App\Mail\Transport\BrevoApiTransport;
use App\Support\BrevoTransactionalMail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(BrevoTransactionalMail::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Transactional email over the Brevo HTTPS API (MAIL_MAILER=brevo).
        // Registering it as a mail driver keeps every Mailable, Blade template
        // and Mail::to(...)->send(...) call site unchanged; only the transport
        // differs, because Railway blocks outbound SMTP.
        Mail::extend('brevo', fn (array $config) => new BrevoApiTransport(
            $this->app->make(BrevoTransactionalMail::class),
        ));

        // Public activation-link endpoints: per client IP.
        RateLimiter::for('invitations', fn (Request $request) => Limit::perMinute(10)->by('invitations:'.$request->ip()));

        // Login code endpoints: per client IP, so rotating challenge ids does
        // not help, plus per challenge. Each challenge is also capped by its
        // own attempt/resend limits and every limit decays within a minute.
        RateLimiter::for('login-otp-verify', fn (Request $request) => [
            Limit::perMinute(10)->by('login-otp-verify-ip:'.$request->ip()),
            Limit::perMinute(5)->by('login-otp-verify-challenge:'.hash('sha256', (string) $request->input('challenge_id'))),
        ]);

        RateLimiter::for('login-otp-resend', fn (Request $request) => [
            Limit::perMinute(5)->by('login-otp-resend-ip:'.$request->ip()),
            Limit::perMinute(2)->by('login-otp-resend-challenge:'.hash('sha256', (string) $request->input('challenge_id'))),
        ]);

        // Admin resend: per admin, on top of the per-account cooldown.
        RateLimiter::for('invitation-resend', fn (Request $request) => Limit::perMinute(10)->by(
            'invitation-resend:'.($request->user()?->id ?: $request->ip())
        ));
    }
}
