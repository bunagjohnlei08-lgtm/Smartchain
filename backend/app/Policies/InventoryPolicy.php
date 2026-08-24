<?php

namespace App\Policies;

use App\Models\Inventory;
use App\Models\User;

class InventoryPolicy
{
    public function viewAny(User $user): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        return ($user->isPlantManager() || $user->isQaSupervisor())
            && ($user->warehouse_id !== null || $user->branch_id !== null);
    }

    public function view(User $user, Inventory $inventory): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        if (! $user->isPlantManager() && ! $user->isQaSupervisor()) {
            return false;
        }

        if ($user->warehouse_id !== null) {
            return $inventory->warehouse_id === $user->warehouse_id;
        }

        return $user->branch_id !== null
            && $inventory->warehouse()->where('branch_id', $user->branch_id)->exists();
    }
}
