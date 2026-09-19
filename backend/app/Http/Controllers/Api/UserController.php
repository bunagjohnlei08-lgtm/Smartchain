<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Role;
use App\Models\Department;
use App\Models\Branch;
use App\Models\Warehouse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use App\Policies\UserPolicy;
use App\Support\AuditLogger;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $this->authorize('viewAny', User::class);

        $query = User::query()
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

        $query = User::query();

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

    public function store(Request $request)
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'employee_id' => 'required|string|unique:users,employee_id',
            'role_id' => $this->roleAssignmentRules($request, true),
            'department_id' => 'nullable|exists:departments,id',
            'branch_id' => 'nullable|exists:branches,id',
            'warehouse_id' => 'nullable|exists:warehouses,id',
            'status' => 'nullable|in:ACTIVE,PENDING,SUSPENDED',
        ]);

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'ACTIVE';
        // New accounts belong to the single Main Warehouse unless one is given.
        $validated['warehouse_id'] ??= $this->mainWarehouseId();

        $user = User::create($validated);
        $user->load(['role', 'department', 'branch', 'warehouse']);

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

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']), 201);
    }

    public function update(Request $request, $id)
    {
        $user = User::with(['role', 'department', 'branch', 'warehouse'])->findOrFail($id);
        $this->authorize('update', $user);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => 'sometimes|string|min:6',
            'employee_id' => ['sometimes', 'string', Rule::unique('users', 'employee_id')->ignore($user->id)],
            'role_id' => $this->roleAssignmentRules($request),
            'department_id' => ['sometimes', 'nullable', 'exists:departments,id'],
            'branch_id' => ['sometimes', 'nullable', 'exists:branches,id'],
            'warehouse_id' => ['sometimes', 'nullable', 'exists:warehouses,id'],
            'status' => ['sometimes', 'in:ACTIVE,PENDING,SUSPENDED'],
        ]);

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

        $previous = $user->status;
        $user->update(['status' => 'ACTIVE']);
        $this->auditStatusChange('ACCOUNT_ACTIVATED', $user, $previous);

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
    }

    public function suspend(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('suspend', $user);

        $previous = $user->status;
        $user->update(['status' => 'SUSPENDED']);
        $user->tokens()->delete();
        $this->auditStatusChange('ACCOUNT_SUSPENDED', $user, $previous);

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
    }

    public function activate(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('activate', $user);

        $previous = $user->status;
        $user->update(['status' => 'ACTIVE']);
        $this->auditStatusChange('ACCOUNT_REACTIVATED', $user, $previous);

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
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

    private function mainWarehouseId(): ?int
    {
        return Warehouse::query()->where('code', 'WH-MAIN')->value('id')
            ?? Warehouse::query()->where('name', 'Main Warehouse')->value('id');
    }

    /**
     * Records a summary of what changed (never the password value). A role
     * change is also recorded as its own ROLE_CHANGED event.
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

        if ($changes === [] && ! $passwordChanged) {
            return;
        }

        $summary = AuditLogger::describeChanges($changes);
        if ($passwordChanged) {
            $summary = trim($summary.($summary !== '' ? '; ' : '').'Reset password');
        }

        AuditLogger::success('USER_UPDATED', AuditLogger::MODULE_USERS, [
            'resource' => $user,
            'resource_label' => $user->employee_id,
            'details' => $summary,
            'metadata' => [
                'changed_fields' => array_keys($changes),
                'credentials_changed' => $passwordChanged,
            ],
        ]);
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
