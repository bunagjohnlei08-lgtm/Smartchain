<?php

namespace App\Support;

use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAccess;
use Illuminate\Support\Str;

final class SupplierPortalAccess
{
    public static function issueLink(SupplierApplication $application): array
    {
        $token = Str::random(64);

        SupplierApplicationAccess::query()->updateOrCreate(
            ['supplier_application_id' => $application->id],
            [
                'link_token_hash' => self::hash($token),
                'link_expires_at' => now()->addDays((int) config('supplier_portal.link_expiration_days', 30)),
                'link_consumed_at' => null,
                'revoked_at' => null,
            ],
        );

        return [
            'token' => $token,
            // URL fragments are not sent to the frontend web server, keeping
            // the raw magic-link token out of ordinary HTTP access logs.
            'url' => rtrim((string) config('supplier_portal.frontend_url'), '/').'/supplier-portal#token='.$token,
        ];
    }

    public static function issueSession(SupplierApplicationAccess $access): array
    {
        $token = Str::random(64);
        $expiresAt = now()->addMinutes((int) config('supplier_portal.session_expiration_minutes', 60));

        $access->forceFill([
            'session_token_hash' => self::hash($token),
            'session_expires_at' => $expiresAt,
            'last_accessed_at' => now(),
        ])->save();

        return ['token' => $token, 'expires_at' => $expiresAt];
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function revoke(SupplierApplication $application): void
    {
        $application->portalAccess()->update([
            'revoked_at' => now(),
            'session_token_hash' => null,
            'session_expires_at' => null,
        ]);
    }
}
