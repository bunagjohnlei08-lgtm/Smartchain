<?php

namespace App\Support;

use App\Mail\UserInvitationMail;
use App\Models\AuditLog;
use App\Models\User;
use App\Models\UserInvitation;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Issues, looks up and delivers account activation invitations.
 *
 * - Tokens are 256-bit values from random_bytes(); only their SHA-256 hash
 *   is stored, so a database read never yields a usable link.
 * - Issuing a new invitation revokes every outstanding one for that user.
 * - The plaintext token is returned to the caller only so it can be mailed;
 *   it is never logged, audited or returned from an API response.
 */
class UserInvitations
{
    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * Must run inside the caller's transaction so the user row, the revocation
     * of older invitations and the new invitation commit together.
     *
     * @return array{0: UserInvitation, 1: string} the invitation and its plaintext token
     */
    public static function issue(User $user, ?User $invitedBy): array
    {
        $now = now();

        UserInvitation::query()
            ->where('user_id', $user->id)
            ->outstanding()
            ->update(['revoked_at' => $now, 'updated_at' => $now]);

        $token = bin2hex(random_bytes(32));

        $invitation = UserInvitation::create([
            'user_id' => $user->id,
            'token_hash' => self::hashToken($token),
            'expires_at' => $now->copy()->addHours(self::expirationHours()),
            'invited_by' => $invitedBy?->id,
        ]);

        $user->forceFill(['invited_at' => $now])->save();

        return [$invitation, $token];
    }

    /**
     * Resolve a plaintext token to an invitation that can still be used by a
     * PENDING account, or null. Callers must not reveal why a token failed.
     */
    public static function findUsable(string $token, bool $lock = false): ?UserInvitation
    {
        $query = UserInvitation::query()->where('token_hash', self::hashToken($token));
        if ($lock) {
            $query->lockForUpdate();
        }

        $invitation = $query->first();
        if (! $invitation) {
            return null;
        }

        if (! $invitation->isUsable()) {
            self::recordExpiry($invitation);

            return null;
        }

        $user = User::query()->whereKey($invitation->user_id);
        if ($lock) {
            $user->lockForUpdate();
        }
        $user = $user->first();

        if (! $user || $user->status !== 'PENDING') {
            return null;
        }

        return $invitation->setRelation('user', $user);
    }

    /**
     * Send the invitation email. Called after the DB transaction commits, so a
     * rollback can never leave a sent link that points at nothing. Returns
     * false when delivery fails; the account stays PENDING and can be re-invited.
     */
    public static function send(User $user, UserInvitation $invitation, string $token): bool
    {
        try {
            Mail::to($user->email)->send(new UserInvitationMail(
                name: $user->name,
                activationUrl: self::activationUrl($token),
                expiresAt: $invitation->expires_at,
                expiresInHours: self::expirationHours(),
            ));

            return true;
        } catch (Throwable $exception) {
            // Transport errors carry no message body, so the token is not logged.
            report($exception);

            return false;
        }
    }

    /**
     * Record INVITATION_EXPIRED the first time an expired (but otherwise
     * outstanding) link is actually presented. Later presentations of the
     * same link find the existing row and write nothing.
     */
    private static function recordExpiry(UserInvitation $invitation): void
    {
        if ($invitation->consumed_at !== null
            || $invitation->revoked_at !== null
            || $invitation->expires_at->isFuture()) {
            return;
        }

        $alreadyRecorded = AuditLog::query()
            ->where('action', 'INVITATION_EXPIRED')
            ->where('resource_type', 'UserInvitation')
            ->where('resource_id', (string) $invitation->getKey())
            ->exists();

        if ($alreadyRecorded) {
            return;
        }

        AuditLogger::log('INVITATION_EXPIRED', AuditLogger::MODULE_USERS, [
            'status' => AuditLog::STATUS_EXPIRED,
            'resource_type' => 'UserInvitation',
            'resource_id' => $invitation->getKey(),
            'resource_label' => User::query()->whereKey($invitation->user_id)->value('employee_id'),
            'details' => 'Account invitation link expired',
        ]);
    }

    public static function activationUrl(string $token): string
    {
        return config('invitations.frontend_url').'/activate-account?token='.urlencode($token);
    }

    public static function expirationHours(): int
    {
        return max(1, (int) config('invitations.expiration_hours', 48));
    }
}
