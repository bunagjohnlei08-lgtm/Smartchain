<?php

namespace App\Services;

use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\UserInvitation;
use App\Support\AuditLogger;
use App\Support\UserInvitations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Collection;

class SupplierAccountInvitationService
{
    /** Account access and accreditation are independent; this method is read-only. */
    public function state(Supplier $supplier, ?bool $emailConflict = null, ?Collection $matchingUsers = null): array
    {
        $supplier->loadMissing('authorizedAccount.role', 'authorizedAccount.latestInvitation');
        $user = $supplier->authorizedAccount;

        if ($user && ! $user->isSupplier()) {
            return $this->conflictState('LINKED_ROLE_MISMATCH', 'The linked user is not a Supplier Account.',
                'An account administrator must verify the existing relationship. Do not change a staff role or reassign the account to make activation possible.', $user, $supplier);
        }
        if ($user?->status === 'ACTIVE') {
            return $this->stateData('ACCOUNT_ACTIVE', false, 'A linked Supplier login account is already active. Do not send another activation link. Supplier business status and accreditation are checked separately.');
        }

        if ($supplier->status !== Supplier::STATUS_ACTIVE) {
            return $this->stateData('UNAVAILABLE', false, 'Only active supplier records can receive account invitations.');
        }

        if (! filter_var(trim((string) $supplier->email), FILTER_VALIDATE_EMAIL)) {
            return $this->stateData('EMAIL_REQUIRED', false, 'Add a valid supplier email before sending an activation invitation.');
        }

        if (! $user) {
            if ($emailConflict !== false) {
                $matchingUsers ??= User::query()->with('role:id,slug')
                    ->whereRaw('LOWER(email) = ?', [mb_strtolower(trim($supplier->email))])
                    ->limit(2)->get(['id','email','role_id','status','supplier_id']);
                if ($matchingUsers->isNotEmpty()) return $this->unlinkedConflict($supplier, $matchingUsers);
            }

            return $this->stateData('NO_ACCOUNT', true, 'No Supplier Account is linked to this supplier.');
        }

        if ($user->status !== 'PENDING') {
            return $this->stateData('UNAVAILABLE', false, 'This Supplier Account is disabled and cannot receive an invitation.');
        }

        if (mb_strtolower($user->email) !== mb_strtolower(trim($supplier->email))) {
            return $this->conflictState('LINKED_EMAIL_MISMATCH', 'The pending linked Supplier Account email does not match the registered supplier email.',
                'Verify the supplier contact email and the existing invitation owner. Correct supplier contact details only when verified; account email or linkage changes require an authorized account review.', $user, $supplier);
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
                $matches = User::query()->with('role:id,slug')->whereRaw('LOWER(email) = ?', [$email])->lockForUpdate()->limit(2)->get();
                if ($matches->isNotEmpty()) {
                    $conflict = $this->unlinkedConflict($locked, $matches);
                    abort(409, $conflict['reason'].' '.$conflict['conflict']['next_action']);
                }

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

    private function unlinkedConflict(Supplier $supplier, Collection $matches): array
    {
        if ($matches->count() > 1) {
            return $this->conflictState('AMBIGUOUS_EMAIL', 'More than one user account matches the registered email ignoring case.',
                'An account administrator must verify email ownership and review the duplicate records. Do not merge, reset or link accounts automatically.');
        }
        $user = $matches->first();
        if (! $user->isSupplier()) {
            return $this->conflictState('EMAIL_ROLE_CONFLICT', 'The registered supplier email already belongs to a non-Supplier user account.',
                'Verify the supplier contact email. If it was entered incorrectly, correct it through Edit Supplier using a verified supplier-owned address. Keep the existing user and staff role unchanged.', $user, $supplier);
        }
        if ($user->supplier_id !== null) {
            return $this->conflictState('EMAIL_LINKED_TO_OTHER_SUPPLIER', 'The matching Supplier user is already linked to another supplier.',
                'An account administrator must verify ownership and the supplier records. Do not transfer the user, replace credentials or merge supplier records based on email alone.', $user, $supplier);
        }
        return $this->conflictState('SUPPLIER_LINK_MISSING', 'A Supplier user already exists for this email, but it has no supplier relationship.',
            'Verify ownership using independent account, registration or invitation records. An authorized account administrator must review any one-time linkage correction; matching email alone is insufficient. No account was linked or reset.', $user, $supplier);
    }

    private function conflictState(string $code, string $reason, string $nextAction, ?User $user = null, ?Supplier $supplier = null): array
    {
        return $this->stateData('CONFLICT', false, $reason, null, [
            'code' => $code,
            'next_action' => $nextAction,
            // Only Admin supplier endpoints use this service. Do not serialize credentials or invitations.
            'account' => $user ? ['user_id'=>$user->id, 'role'=>$user->role?->slug, 'status'=>$user->status,
                'supplier_id'=>$user->supplier_id, 'linked_to_this_supplier'=>$supplier && $user->supplier_id === $supplier->id] : null,
        ]);
    }

    private function stateData(string $status, bool $canInvite, string $reason, ?UserInvitation $invitation = null, ?array $conflict = null): array
    {
        return [
            'status' => $status,
            'can_invite' => $canInvite,
            'reason' => $reason,
            'expires_at' => $invitation?->expires_at?->toIso8601String(),
            'conflict' => $conflict,
        ];
    }
}
