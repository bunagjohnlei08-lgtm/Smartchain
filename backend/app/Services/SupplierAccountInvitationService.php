<?php

namespace App\Services;

use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\UserInvitation;
use App\Support\AuditLogger;
use App\Support\UserInvitations;
use Illuminate\Support\Facades\DB;

class SupplierAccountInvitationService
{
    /** @return array{status:string, can_invite:bool, reason:string, expires_at:?string} */
    public function state(Supplier $supplier, ?bool $emailConflict = null): array
    {
        $supplier->loadMissing('authorizedAccount.role', 'authorizedAccount.latestInvitation');
        $user = $supplier->authorizedAccount;

        if ($supplier->status !== Supplier::STATUS_ACTIVE) {
            return $this->stateData('UNAVAILABLE', false, 'Only active supplier records can receive account invitations.');
        }

        if (! filter_var(trim((string) $supplier->email), FILTER_VALIDATE_EMAIL)) {
            return $this->stateData('EMAIL_REQUIRED', false, 'Add a valid supplier email before sending an activation invitation.');
        }

        if (! $user) {
            if ($emailConflict ?? User::query()->whereRaw('LOWER(email) = ?', [mb_strtolower(trim($supplier->email))])->exists()) {
                return $this->stateData('CONFLICT', false, 'The supplier email already belongs to another user account. Resolve the account before inviting.');
            }

            return $this->stateData('NO_ACCOUNT', true, 'No Supplier Account is linked to this supplier.');
        }

        if (! $user->isSupplier()) {
            return $this->stateData('CONFLICT', false, 'The linked user is not a Supplier Account. Resolve the account before inviting.');
        }

        if ($user->status === 'ACTIVE') {
            return $this->stateData('ACCOUNT_ACTIVE', false, 'This supplier already has an active Supplier Account.');
        }

        if ($user->status !== 'PENDING') {
            return $this->stateData('UNAVAILABLE', false, 'This Supplier Account is disabled and cannot receive an invitation.');
        }

        if (mb_strtolower($user->email) !== mb_strtolower(trim($supplier->email))) {
            return $this->stateData('CONFLICT', false, 'The linked Supplier Account email does not match the supplier registered email. Resolve the account before inviting.');
        }

        $invitation = $user->latestInvitation;
        if ($invitation?->isUsable()) {
            return $this->stateData('INVITATION_PENDING', true, 'An activation invitation is already pending for this supplier.', $invitation);
        }

        return $this->stateData('INVITATION_EXPIRED', true, 'The previous invitation is unavailable or expired. Send a new activation link.');
    }

    /** @return array{user:User, invitation:UserInvitation, token:string, resent:bool} */
    public function issue(Supplier $supplier, User $admin): array
    {
        return DB::transaction(function () use ($supplier, $admin) {
            $locked = Supplier::query()->lockForUpdate()->findOrFail($supplier->id);
            abort_unless($locked->status === Supplier::STATUS_ACTIVE, 422, 'Only active supplier records can receive account invitations.');

            $email = mb_strtolower(trim((string) $locked->email));
            abort_unless(filter_var($email, FILTER_VALIDATE_EMAIL), 422, 'Add a valid supplier email before sending an activation invitation.');

            $user = User::query()->with('role')->where('supplier_id', $locked->id)->lockForUpdate()->first();
            $resent = $user !== null;

            if ($user) {
                abort_unless($user->isSupplier(), 409, 'The linked user is not a Supplier Account. Resolve the account before inviting.');
                abort_if($user->status === 'ACTIVE', 422, 'This supplier already has an active Supplier Account.');
                abort_unless($user->status === 'PENDING', 422, 'This Supplier Account is disabled and cannot receive an invitation.');
                abort_if(mb_strtolower($user->email) !== $email, 409, 'The linked Supplier Account email does not match the supplier registered email. Resolve the account before inviting.');
            } else {
                $role = Role::query()->where('slug', 'SUPPLIER')->lockForUpdate()->firstOrFail();
                $conflict = User::query()->whereRaw('LOWER(email) = ?', [$email])->lockForUpdate()->first();
                abort_if($conflict, 409, 'The supplier email already belongs to another user account. Resolve the account before inviting.');

                $user = User::query()->create([
                    'name' => filled($locked->contact_person) ? $locked->contact_person : $locked->name,
                    'email' => $email,
                    'password' => null,
                    'role_id' => $role->id,
                    'supplier_id' => $locked->id,
                    'status' => 'PENDING',
                    'employee_id' => null,
                ]);
            }

            // Check under the supplier/user locks so duplicate clicks cannot
            // rotate a link that is still being delivered by the first request.
            $latest = $user->invitations()->latest('id')->first();
            $cooldown = max(1, (int) config('invitations.resend_cooldown_seconds', 60));
            abort_if($latest && $latest->created_at->gt(now()->subSeconds($cooldown)), 429,
                'An invitation was sent recently. Please wait before sending another.');

            [$invitation, $token] = UserInvitations::issue($user, $admin);

            AuditLogger::success($resent ? 'SUPPLIER_ACCOUNT_INVITATION_REISSUED' : 'SUPPLIER_ACCOUNT_PROVISIONED', AuditLogger::MODULE_SUPPLIERS, [
                'actor' => $admin,
                'resource' => $user,
                'resource_label' => $locked->supplier_code,
                'details' => $resent ? 'A new Supplier Account activation invitation was issued.' : 'A pending Supplier Account was linked to the existing supplier.',
                'metadata' => ['supplier_id' => $locked->id, 'invitation_id' => $invitation->id],
            ]);

            return compact('user', 'invitation', 'token', 'resent');
        });
    }

    private function stateData(string $status, bool $canInvite, string $reason, ?UserInvitation $invitation = null): array
    {
        return [
            'status' => $status,
            'can_invite' => $canInvite,
            'reason' => $reason,
            'expires_at' => $invitation?->expires_at?->toIso8601String(),
        ];
    }
}
