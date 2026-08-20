<?php

namespace App\Policies;

use App\Models\Order;
use App\Models\User;

class OrderPolicy
{
    public function before(User $user): ?bool
    {
        return $user->isAdmin() ? true : null;
    }

    public function viewAny(User $user): bool { return false; }
    public function view(User $user, Order $order): bool { return false; }
    public function create(User $user): bool { return false; }
    public function update(User $user, Order $order): bool { return false; }
}
