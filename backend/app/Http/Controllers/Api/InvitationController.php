<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserInvitation;
use App\Support\AuditLogger;
use App\Support\PasswordPolicy;
use App\Support\UserInvitations;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Public (unauthenticated, throttled) endpoints behind the emailed
 * activation link. Activation never issues a Sanctum token; the user signs
 * in through the normal login afterwards.
 */
class InvitationController extends Controller
{
    private const INVALID_MESSAGE = 'This invitation link is invalid or has expired. Please ask your administrator for a new invitation.';

    public function check(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string', 'max:128'],
        ]);

        $invitation = UserInvitations::findUsable($validated['token']);
        if (! $invitation) {
            return $this->invalid();
        }

        return response()->json([
            'valid' => true,
            'name' => $invitation->user->name,
            'email' => $invitation->user->email,
            'expires_at' => $invitation->expires_at->toIso8601String(),
        ]);
    }

    public function accept(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string', 'max:128'],
            'password' => PasswordPolicy::rules(),
        ]);

        $user = DB::transaction(function () use ($validated): ?User {
            // Row locks serialise concurrent submits of the same link: the
            // second request waits, then sees consumed_at and is refused.
            $invitation = UserInvitations::findUsable($validated['token'], lock: true);
            if (! $invitation) {
                return null;
            }

            $user = $invitation->user;
            $now = now();

            $user->forceFill([
                'password' => $validated['password'],
                'status' => 'ACTIVE',
                'activated_at' => $now,
                'email_verified_at' => $now,
            ])->save();

            $invitation->forceFill(['consumed_at' => $now])->save();

            UserInvitation::query()
                ->where('user_id', $user->id)
                ->whereKeyNot($invitation->id)
                ->outstanding()
                ->update(['revoked_at' => $now, 'updated_at' => $now]);

            // A PENDING account should hold no tokens; drop any defensively.
            $user->tokens()->delete();

            AuditLogger::success('ACCOUNT_ACTIVATED', AuditLogger::MODULE_AUTH, [
                'actor' => $user,
                'resource' => $user,
                'resource_label' => $user->employee_id,
                'details' => 'Account activated through invitation link',
                'metadata' => ['method' => 'invitation'],
            ]);

            return $user;
        });

        if (! $user) {
            return $this->invalid();
        }

        return response()->json([
            'message' => 'Your account has been activated. You can now sign in.',
        ]);
    }

    private function invalid(): JsonResponse
    {
        return response()->json(['valid' => false, 'message' => self::INVALID_MESSAGE], 422);
    }
}
