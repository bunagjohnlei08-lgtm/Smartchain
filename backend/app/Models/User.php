<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    'name',
    'email',
    'password',
    'employee_id',
    'role_id',
    'department_id',
    'branch_id',
    'warehouse_id',
    'status',
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, HasApiTokens;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function permissions(): BelongsToMany
    {
        return $this->permissionsThroughRole();
    }

    public function permissionsThroughRole(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'permission_role', 'role_id', 'permission_id')
            ->using(Role::class)
            ->withPivot('role_id');
    }

    public function isAdmin(): bool
    {
        return $this->role && $this->role->slug === 'ADMIN';
    }

    public function assignedOrders(): HasMany
    {
        return $this->hasMany(Order::class, 'assigned_to');
    }

    public function isPlantManager(): bool
    {
        return $this->role && $this->role->slug === 'PLANT_MANAGER';
    }

    public function isQaSupervisor(): bool
    {
        return $this->role && $this->role->slug === 'QA_SUPERVISOR';
    }

    public function hasPermission(string $slug): bool
    {
        return $this->role && $this->role->permissions()->where('slug', $slug)->exists();
    }
}
