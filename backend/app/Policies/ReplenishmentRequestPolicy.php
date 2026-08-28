<?php

namespace App\Policies;

use App\Models\ReplenishmentRequest;
use App\Models\User;

class ReplenishmentRequestPolicy
{
    public function before(User $user): ?bool
    {
        return $user->isAdmin() ? true : null;
    }

    public function viewAny(User $user): bool { return false; }
    public function create(User $user): bool { return $user->isPlantManager(); }
    public function view(User $user, ReplenishmentRequest $request): bool
    {
        return $user->isPlantManager() && $request->requested_by === $user->id;
    }
    public function decide(User $user, ReplenishmentRequest $request): bool { return false; }
}
