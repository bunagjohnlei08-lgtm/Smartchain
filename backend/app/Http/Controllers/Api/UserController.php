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
            'role_id' => [
                'required',
                'exists:roles,id',
                function ($attribute, $value, $fail) {
                    $role = Role::find($value);
                    if ($role && $role->slug === 'ADMIN') {
                        $fail('Creating ADMIN accounts via this flow is not permitted.');
                    }
                },
            ],
            'department_id' => 'nullable|exists:departments,id',
            'branch_id' => 'nullable|exists:branches,id',
            'warehouse_id' => 'nullable|exists:warehouses,id',
            'status' => 'nullable|in:ACTIVE,PENDING,SUSPENDED',
        ]);

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'ACTIVE';

        $user = User::create($validated);

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
            'role_id' => ['sometimes', 'exists:roles,id'],
            'department_id' => ['sometimes', 'nullable', 'exists:departments,id'],
            'branch_id' => ['sometimes', 'nullable', 'exists:branches,id'],
            'warehouse_id' => ['sometimes', 'nullable', 'exists:warehouses,id'],
            'status' => ['sometimes', 'in:ACTIVE,PENDING,SUSPENDED'],
        ]);

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        }

        $user->update($validated);

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
    }

    public function approve(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('approve', $user);

        $user->update(['status' => 'ACTIVE']);

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
    }

    public function suspend(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('suspend', $user);

        $user->update(['status' => 'SUSPENDED']);
        $user->tokens()->delete();

        return response()->json($user->load(['role', 'department', 'branch', 'warehouse']));
    }

    public function activate(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('activate', $user);

        $user->update(['status' => 'ACTIVE']);

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
}
