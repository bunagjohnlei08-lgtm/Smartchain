<?php

namespace App\Policies;

use App\Models\User;
use App\Models\User as UserModel;

class UserPolicy
{
    public function viewAny(User $authUser): bool
    {
        if ($authUser->isAdmin()) {
            return true;
        }

        if ($authUser->isPlantManager()) {
            return $authUser->hasPermission('users.view');
        }

        if ($authUser->isQaSupervisor()) {
            return $authUser->hasPermission('users.view');
        }

        return false;
    }

    public function view(User $authUser, UserModel $user): bool
    {
        if ($authUser->isAdmin()) {
            return true;
        }

        if ($authUser->isPlantManager()) {
            return $authUser->hasPermission('users.view') && $user->branch_id === $authUser->branch_id;
        }

        if ($authUser->isQaSupervisor()) {
            return $authUser->hasPermission('users.view')
                && $user->branch_id === $authUser->branch_id
                && $user->warehouse_id === $authUser->warehouse_id;
        }

        return false;
    }

    public function create(User $authUser): bool
    {
        if ($authUser->isAdmin()) {
            return true;
        }

        if ($authUser->isPlantManager()) {
            return $authUser->hasPermission('users.create');
        }

        return false;
    }

    public function update(User $authUser, UserModel $user): bool
    {
        if ($authUser->isAdmin()) {
            return true;
        }

        if ($authUser->isPlantManager()) {
            return $authUser->hasPermission('users.update') && $user->branch_id === $authUser->branch_id;
        }

        return false;
    }

    public function approve(User $authUser, UserModel $user): bool
    {
        if ($authUser->isAdmin()) {
            return true;
        }

        if ($authUser->isPlantManager()) {
            return $authUser->hasPermission('users.approve') && $user->branch_id === $authUser->branch_id;
        }

        return false;
    }

    public function suspend(User $authUser, UserModel $user): bool
    {
        if ($authUser->isAdmin()) {
            return true;
        }

        if ($authUser->isPlantManager()) {
            return $authUser->hasPermission('users.suspend') && $user->branch_id === $authUser->branch_id;
        }

        return false;
    }

    public function activate(User $authUser, UserModel $user): bool
    {
        if ($authUser->isAdmin()) {
            return true;
        }

        if ($authUser->isPlantManager()) {
            return $authUser->hasPermission('users.activate') && $user->branch_id === $authUser->branch_id;
        }

        return false;
    }
}
