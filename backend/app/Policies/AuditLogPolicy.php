<?php

namespace App\Policies;

use App\Models\User;

class AuditLogPolicy
{
    /**
     * Audit logs are read-only and restricted to Admins. There are deliberately
     * no update/delete abilities: the trail is append-only.
     */
    public function viewAny(User $authUser): bool
    {
        return $authUser->isAdmin();
    }
}
