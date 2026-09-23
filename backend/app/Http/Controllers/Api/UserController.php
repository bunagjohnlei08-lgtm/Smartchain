<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoginChallenge;
use App\Models\PasswordResetChallenge;
use App\Models\User;
use App\Models\UserInvitation;
use App\Models\Role;
use App\Models\Department;
use App\Models\Branch;
use App\Models\Warehouse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use App\Policies\UserPolicy;
use App\Support\AuditLogger;
use App\Support\UserInvitations;
use App\Support\PasswordPolicy;

class UserController extends Controller
{
    private const AWAITING_ACTIVATION_MESSAGE = 'This account must be activated by the user through their invitation link.';

    public function index(Request $request)
    {
        $user = $request->user();
        $this->authorize('viewAny', User::class);

        $query = User::query()
            ->where('status', '!=', 'ARCHIVED')
            ->with(['role', 'department', 'branch', 'warehouse']);

        if ($user->isPlantManager()) {
            $query->where('branch_id', $user->branch_id);
        } elseif ($user->isQaSupervisor()) {
            $query->where('branch_id', $user->branch_id)
                ->where('warehouse_id', $user->warehouse_id);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('employee_id', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('role')) {
            $query->whereHas('role', function ($q) use ($request) {
                $q->where('slug', $request->role);
            });
        }

        $users = $query->paginate(15);

        return response()->json($users);
    }

    public function statistics(Request $request)
    {
        $user = $request->user();
        $this->authorize('viewAny', User::class);

        $query = User::query()->where('status', '!=', 'ARCHIVED');

        if ($user->isPlantManager()) {
            $query->where('branch_id', $user->branch_id);
        } elseif ($user->isQaSupervisor()) {
            $query->where('branch_id', $user->branch_id)
                ->where('warehouse_id', $user->warehouse_id);
        }

        $total = $query->count();
        $active = (clone $query)->where('status', 'ACTIVE')->count();
        $pending = (clone $query)->where('status', 'PENDING')->count();
        $suspended = (clone $query)->where('status', 'SUSPENDED')->count();

        return response()->json([
            'total' => $total,
            'active' => $active,
            'pending' => $pending,
            'suspended' => $suspended,
        ]);
    }

    public function show(Request $request, $id)
    {
        $targetUser = User::with(['role', 'department', 'branch', 'warehouse'])->findOrFail($id);
        $this->authorize('view', $targetUser);

        return response()->json($targetUser);
    }

    /**
     * Admin-only account creation. The account always starts PENDING with no
     * password; the invitee sets their own password through the emailed link.
     */
    public function store(Request $request)
    {
        $this->authorize('create', User::class);

        if (is_string($request->input('email'))) {
            $request->merge(['email' => Str::lower(trim($request->input('email')))]);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'role_id' => $this->roleAssignmentRules($request, true),
            'department_id' => 'nullable|exists:departments,id',
            'branch_id' => 'nullable|exists:branches,id',
            'warehouse_id' => 'nullable|exists:warehouses,id',
            // Server-controlled: never accepted from the client.
            'employee_id' => 'prohibited',
            'password' => 'prohibited',
            'password_confirmation' => 'prohibited',
            'status' => 'prohibited',
            'email_verified_at' => 'prohibited',
            'invited_at' => 'prohibited',
            'activated_at' => 'prohibited',
        ]);

        // New accounts belong to the single Main Warehouse unless one is given.
        $validated['warehouse_id'] ??= $this->mainWarehouseId();

        [$user, $invitation, $token] = DB::transaction(function () use ($validated, $request) {
            $user = new User($validated);
            $user->forceFill(['status' => 'PENDING'])->save();
            // Derived from the database-assigned primary key, so concurrent
            // creations can never compute the same value.
            $user->forceFill(['employee_id' => $this->generateEmployeeId($user)])->save();

            [$invitation, $token] = UserInvitations::issue($user, $request->user());

            AuditLogger::success('USER_CREATED', AuditLogger::MODULE_USERS, [
                'resource' => $user,
                'resource_label' => $user->employee_id,
                'details' => sprintf(
                    'Created %s account for %s with status %s',
                    $user->role?->slug ?? 'user',
                    $user->name,
                    $user->status,
                ),
                'metadata' => [
                    'role' => $user->role?->slug,
                    'status' => $user->status,
                    'warehouse' => $user->warehouse?->code,
                ],
            ]);

            return [$user, $invitation, $token];
        });

        // Mail goes out only after commit, so a rollback never leaves a live link.
        $sent = UserInvitations::send($user, $invitation, $token);
        $this->auditInvitation('INVITATION_SENT', $user, $invitation, $sent);

        return response()->json(array_merge(
            $user->fresh()->load(['role', 'department', 'branch', 'warehouse'])->toArray(),
            [
                'invitation' => ['sent' => $sent, 'expires_at' => $invitation->expires_at->toIso8601String()],
                'message' => $sent
                    ? 'User created. An activation invitation has been sent to their email.'
                    : 'User created, but the invitation email could not be sent. Use Resend Invitation to try again.',
            ],
        ), 201);
    }

    /**
     * EMP-<id zero-padded to 3>. Legacy IDs were typed by hand, so if one
     * already holds the derived value a numeric suffix keeps it unique.
     */
    private function generateEmployeeId(User $user): string
    {
        $base = 'EMP-'.str_pad((string) $user->getKey(), 3, '0', STR_PAD_LEFT);
        $candidate = $base;

        for ($suffix = 2; User::query()->where('employee_id', $candidate)->whereKeyNot($user->getKey())->exists(); $suffix++) {
            $candidate = $base.'-'.$suffix;
        }

        return $candidate;
    }

    public function resendInvitation(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('resendInvitation', $user);

        if ($user->status !== 'PENDING') {
            return response()->json(['message' => 'Only pending accounts can be sent a new invitation.'], 422);
        }

        $cooldownKey = 'invitation-resend-user:'.$user->id;
        if (RateLimiter::tooManyAttempts($cooldownKey, 1)) {
            $retryAfter = RateLimiter::availableIn($cooldownKey);

            return response()->json([
                'message' => 'An invitation was sent recently. Please wait before sending another.',
                'retry_after' => $retryAfter,
            ], 429)->header('Retry-After', (string) $retryAfter);
        }
        RateLimiter::hit($cooldownKey, max(1, (int) config('invitations.resend_cooldown_seconds', 60)));

        $issued = DB::transaction(function () use ($user, $request) {
            $locked = User::query()->whereKey($user->id)->lockForUpdate()->first();
            if (! $locked || $locked->status !== 'PENDING') {
                return null;
            }

            [$invitation, $token] = UserInvitations::issue($locked, $request->user());

            return [$locked, $invitation, $token];
        });

        if (! $issued) {
            return response()->json(['message' => 'Only pending accounts can be sent a new invitation.'], 422);
        }

        [$user, $invitation, $token] = $issued;
        $sent = UserInvitations::send($user, $invitation, $token);
        $this->auditInvitation('INVITATION_RESENT', $user, $invitation, $sent);

        return response()->json([
            'sent' => $sent,
            'expires_at' => $invitation->expires_at->toIso8601String(),
            'message' => $sent
                ? 'A new activation invitation has been sent. Previous invitation links no longer work.'
                : 'A new invitation was created, but the email could not be sent. Please try again shortly.',
        ], $sent ? 200 : 502);
    }

    public function update(Request $request, $id)
    {
        $user = User::with(['role', 'department', 'branch', 'warehouse'])->findOrFail($id);
        $this->authorize('update', $user);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => PasswordPolicy::rules(confirmed: false, required: false),
            'employee_id' => ['sometimes', 'string', Rule::unique('users', 'employee_id')->ignore($user->id)],
            'role_id' => $this->roleAssignmentRules($request),
            'department_id' => ['sometimes', 'nullable', 'exists:departments,id'],
            'branch_id' => ['sometimes', 'nullable', 'exists:branches,id'],
            'warehouse_id' => ['sometimes', 'nullable', 'exists:warehouses,id'],
            'status' => ['sometimes', 'in:ACTIVE,PENDING,SUSPENDED'],
        ]);

        if ($this->awaitingActivation($user)
            && (isset($validated['password']) || ($validated['status'] ?? null) === 'ACTIVE')) {
            throw ValidationException::withMessages([
                'status' => self::AWAITING_ACTIVATION_MESSAGE,
            ]);
        }

        $before = $user->only(['name', 'email', 'employee_id', 'role_id', 'department_id', 'branch_id', 'warehouse_id', 'status']);
        $passwordChanged = isset($validated['password']);

        if ($passwordChanged) {
            $validated['password'] = Hash::make($validated['password']);
        }

        $user->update($validated);

        // Issued tokens must not outlive a security-relevant change: leaving
        // ACTIVE, a role (privilege) change, or an admin password reset.
        if (($user->wasChanged('status') && $user->status !== 'ACTIVE')
            || $user->wasChanged('role_id')
            || $passwordChanged) {
            $user->tokens()->delete();
        }

        $this->auditUserUpdate($user, $before, $validated, $passwordChanged);

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
    }

    public function approve(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('approve', $user);

        if ($this->awaitingActivation($user)) {
            return response()->json(['message' => self::AWAITING_ACTIVATION_MESSAGE], 422);
        }

        $previous = $user->status;
        $user->update(['status' => 'ACTIVE']);
        $this->auditStatusChange('ACCOUNT_ENABLED', $user, $previous);

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
    }

    public function suspend(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('suspend', $user);

        $previous = $user->status;
        $user->update(['status' => 'SUSPENDED']);
        $user->tokens()->delete();
        $this->auditStatusChange('ACCOUNT_DISABLED', $user, $previous);

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
    }

    public function activate(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('activate', $user);

        if ($this->awaitingActivation($user)) {
            return response()->json(['message' => self::AWAITING_ACTIVATION_MESSAGE], 422);
        }

        $previous = $user->status;
        $user->update(['status' => 'ACTIVE']);
        $this->auditStatusChange('ACCOUNT_ENABLED', $user, $previous);

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
    }

    /**
     * Preserve the user row and every historical foreign-key reference while
     * permanently removing the account from active use.
     */
    public function destroy(Request $request, $id)
    {
        $target = User::with('role')->findOrFail($id);
        $this->authorize('delete', $target);

        if ((int) $request->user()->getKey() === (int) $target->getKey()) {
            return response()->json(['message' => 'You cannot archive your own account.'], 422);
        }

        $result = DB::transaction(function () use ($target) {
            // Lock the ADMIN role first to serialize concurrent last-admin checks.
            $adminRole = Role::query()->where('slug', 'ADMIN')->lockForUpdate()->first();
            $locked = User::query()->with('role')->whereKey($target->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->status === 'ARCHIVED') {
                return null;
            }

            if ($adminRole && $locked->role_id === $adminRole->id) {
                $activeAdmins = User::query()
                    ->where('role_id', $adminRole->id)
                    ->where('status', 'ACTIVE')
                    ->count();

                if ($locked->status === 'ACTIVE' && $activeAdmins <= 1) {
                    throw ValidationException::withMessages([
                        'user' => 'The last active administrator cannot be archived.',
                    ]);
                }
            }

            $previousStatus = $locked->status;
            $revokedAt = now();

            $locked->forceFill(['status' => 'ARCHIVED'])->save();
            $locked->tokens()->delete();
            DB::table('sessions')->where('user_id', $locked->id)->delete();
            LoginChallenge::query()->where('user_id', $locked->id)->outstanding()->update(['revoked_at' => $revokedAt]);
            PasswordResetChallenge::query()->where('user_id', $locked->id)->outstanding()->update(['revoked_at' => $revokedAt]);
            UserInvitation::query()->where('user_id', $locked->id)->outstanding()->update(['revoked_at' => $revokedAt]);

            AuditLogger::success('USER_ARCHIVED', AuditLogger::MODULE_USERS, [
                'resource' => $locked,
                'resource_label' => $locked->employee_id,
                'details' => sprintf('Archived account for %s', $locked->name),
                'metadata' => [
                    'previous_status' => $previousStatus,
                    'role' => $locked->role?->slug,
                ],
            ]);

            return $locked;
        });

        if (! $result) {
            return response()->json(['message' => 'This account has already been archived.'], 409);
        }

        return response()->json(['message' => 'User account deleted successfully.']);
    }

    public function roles()
    {
        return response()->json(Role::all(['id', 'name', 'slug', 'description']));
    }

    public function departments()
    {
        return response()->json(Department::all(['id', 'name', 'code']));
    }

    public function branches()
    {
        return response()->json(Branch::all(['id', 'name', 'code']));
    }

    public function warehouses(Request $request)
    {
        $query = Warehouse::query()->with('branch');

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        return response()->json($query->get(['id', 'name', 'code', 'branch_id']));
    }

    /**
     * An invited account that has never set a password can only become
     * ACTIVE through its invitation link, not by an admin status change.
     */
    private function awaitingActivation(User $user): bool
    {
        return $user->password === null;
    }

    /** Never records the token or its hash; only delivery outcome and expiry. */
    private function auditInvitation(string $action, User $user, UserInvitation $invitation, bool $sent): void
    {
        AuditLogger::log($action, AuditLogger::MODULE_USERS, [
            'status' => $sent ? AuditLog::STATUS_SUCCESS : AuditLog::STATUS_FAILED,
            'resource' => $user,
            'resource_label' => $user->employee_id,
            'details' => $sent
                ? sprintf('Account invitation %s; expires in %d hours', $action === 'INVITATION_RESENT' ? 'resent' : 'sent', UserInvitations::expirationHours())
                : 'Account invitation could not be emailed',
            'metadata' => [
                'email_delivered' => $sent,
                'expires_at' => $invitation->expires_at->toIso8601String(),
            ],
        ]);
    }

    private function mainWarehouseId(): ?int
    {
        return Warehouse::query()->where('code', 'WH-MAIN')->value('id')
            ?? Warehouse::query()->where('name', 'Main Warehouse')->value('id');
    }

    /**
     * Records a summary of what changed (never the password value). Role,
     * account-status and password changes are recorded as their own
     * ROLE_CHANGED, ACCOUNT_ENABLED/ACCOUNT_DISABLED and PASSWORD_CHANGED
     * events instead of being repeated in USER_UPDATED.
     */
    private function auditUserUpdate(User $user, array $before, array $validated, bool $passwordChanged): void
    {
        $changes = AuditLogger::diff($before, $validated, [
            'name' => 'name',
            'email' => 'email',
            'employee_id' => 'employee ID',
            'status' => 'status',
            'department_id' => 'department',
            'branch_id' => 'branch',
            'warehouse_id' => 'warehouse',
        ]);

        $statusAction = $this->statusChangeAction($before['status'] ?? null, $user->status);
        if ($statusAction) {
            unset($changes['status']);
            $this->auditStatusChange($statusAction, $user, $before['status'] ?? null);
        }

        if ($passwordChanged) {
            AuditLogger::success('PASSWORD_CHANGED', AuditLogger::MODULE_USERS, [
                'resource' => $user,
                'resource_label' => $user->employee_id,
                'details' => 'Password changed',
                'metadata' => ['method' => 'admin_reset'],
            ]);
        }

        $roleChange = AuditLogger::diff($before, $validated, ['role_id' => 'role'])['role'] ?? null;

        if ($roleChange) {
            $from = Role::find($roleChange['from'])?->slug;
            $to = Role::find($roleChange['to'])?->slug;

            AuditLogger::success('ROLE_CHANGED', AuditLogger::MODULE_USERS, [
                'resource' => $user,
                'resource_label' => $user->employee_id,
                'details' => AuditLogger::describeChanges(['role' => ['from' => $from, 'to' => $to]]),
                'metadata' => ['from' => $from, 'to' => $to],
            ]);
        }

        if ($changes === []) {
            return;
        }

        AuditLogger::success('USER_UPDATED', AuditLogger::MODULE_USERS, [
            'resource' => $user,
            'resource_label' => $user->employee_id,
            'details' => AuditLogger::describeChanges($changes),
            'metadata' => [
                'changed_fields' => array_keys($changes),
            ],
        ]);
    }

    /**
     * Leaving ACTIVE (or being suspended) disables sign-in; returning to
     * ACTIVE enables it. Other transitions stay in the USER_UPDATED summary.
     */
    private function statusChangeAction(?string $from, ?string $to): ?string
    {
        if ($from === $to) {
            return null;
        }

        if ($to === 'ACTIVE') {
            return 'ACCOUNT_ENABLED';
        }

        return $from === 'ACTIVE' || $to === 'SUSPENDED' ? 'ACCOUNT_DISABLED' : null;
    }

    private function auditStatusChange(string $action, User $user, ?string $previous): void
    {
        AuditLogger::success($action, AuditLogger::MODULE_USERS, [
            'resource' => $user,
            'resource_label' => $user->employee_id,
            'details' => AuditLogger::describeChanges(['status' => ['from' => $previous, 'to' => $user->status]]),
            'metadata' => ['from' => $previous, 'to' => $user->status],
        ]);
    }

    private function roleAssignmentRules(Request $request, bool $creating = false): array
    {
        return [
            $creating ? 'required' : 'sometimes',
            'exists:roles,id',
            function ($attribute, $value, $fail) use ($request, $creating) {
                $role = Role::find($value);

                if ($role?->slug !== 'ADMIN') {
                    return;
                }

                if ($creating) {
                    $fail('Creating ADMIN accounts via this flow is not permitted.');
                    return;
                }

                if (! $request->user()?->isAdmin()) {
                    $fail('Only an ADMIN may assign the ADMIN role.');
                }
            },
        ];
    }
}
