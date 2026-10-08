<?php

namespace App\Providers;

use App\Mail\Transport\BrevoApiTransport;
use App\Models\PersonalAccessToken;
use App\Support\BrevoTransactionalMail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

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
        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

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

        RateLimiter::for('password-reset-request', function (Request $request) {
            $email = mb_strtolower(trim((string) $request->input('email')));

            return [
                Limit::perMinutes(15, 5)->by('password-reset-request-ip:'.$request->ip()),
                Limit::perMinutes(15, 5)->by('password-reset-request-account:'.hash('sha256', $email)),
                Limit::perMinutes(15, 5)->by('password-reset-request-client:'.hash('sha256', $email.'|'.$request->ip())),
            ];
        });

        RateLimiter::for('password-reset-verify', fn (Request $request) => [
            Limit::perMinute(10)->by('password-reset-verify-ip:'.$request->ip()),
            Limit::perMinute(5)->by('password-reset-verify-flow:'.hash('sha256', (string) $request->input('flow_id'))),
        ]);

        RateLimiter::for('password-reset-resend', fn (Request $request) => [
            Limit::perMinute(5)->by('password-reset-resend-ip:'.$request->ip()),
            Limit::perMinute(2)->by('password-reset-resend-flow:'.hash('sha256', (string) $request->input('flow_id'))),
        ]);

        RateLimiter::for('password-reset-complete', fn (Request $request) => [
            Limit::perMinute(10)->by('password-reset-complete-ip:'.$request->ip()),
            Limit::perMinute(5)->by('password-reset-complete-token:'.hash('sha256', (string) $request->input('reset_token'))),
        ]);

        // Admin resend: per admin, on top of the per-account cooldown.
        RateLimiter::for('invitation-resend', fn (Request $request) => Limit::perMinute(10)->by(
            'invitation-resend:'.($request->user()?->id ?: $request->ip())
        ));

        RateLimiter::for('session-activity', fn (Request $request) => Limit::perMinute(12)->by(
            'session-activity:'.($request->user()?->currentAccessToken()?->getKey() ?: $request->ip())
        ));

        RateLimiter::for('session-status', fn (Request $request) => Limit::perMinute(60)->by(
            'session-status:'.($request->user()?->currentAccessToken()?->getKey() ?: $request->ip())
        ));

        RateLimiter::for('supplier-rejection-send', fn (Request $request) => Limit::perMinute(6)->by(
            'supplier-rejection-send:'.($request->user()?->id ?: $request->ip())
        ));

        RateLimiter::for('supplier-applications', fn (Request $request) => Limit::perHour(5)
            ->by('supplier-applications-ip:'.$request->ip())
            ->response(fn (Request $request, array $headers) => response()->json([
                'message' => 'Too many application attempts were submitted. Please try again later.',
            ], 429, $headers)));

        RateLimiter::for('supplier-portal-access', fn (Request $request) => [
            Limit::perMinute(10)->by('supplier-portal-access-ip:'.$request->ip()),
            Limit::perMinute(5)->by('supplier-portal-access-token:'.hash('sha256', (string) $request->input('access_token'))),
        ]);

        RateLimiter::for('supplier-portal', fn (Request $request) => Limit::perMinute(60)->by(
            'supplier-portal-session:'.hash('sha256', (string) $request->header('X-Supplier-Portal-Session', $request->ip()))
        ));

        RateLimiter::for('supplier-portal-selection', fn (Request $request) => [
            Limit::perMinute(10)->by('supplier-portal-selection-ip:'.$request->ip()),
            Limit::perMinute(5)->by('supplier-portal-selection-session:'.hash('sha256', (string) $request->header('X-Supplier-Portal-Session'))),
        ]);
    }
}
