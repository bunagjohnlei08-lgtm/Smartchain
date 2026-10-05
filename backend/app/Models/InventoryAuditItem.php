<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryAuditItem extends Model
{
    public const STATUS_PASSED = 'PASSED';
    public const STATUS_PENDING = 'PENDING_ADMIN_APPROVAL';
    public const STATUS_RETURNED = 'RETURNED_FOR_REINSPECTION';
    public const STATUS_APPROVED = 'APPROVED_FOR_BACKLOAD';

    protected $fillable = [
        'inventory_audit_cycle_id', 'inventory_id', 'qa_user_id', 'previous_item_id',
        'audit_reference', 'attempt_number', 'audited_quantity', 'failed_quantity',
        'result', 'status', 'failure_reason', 'qa_remarks', 'submitted_at',
        'admin_user_id', 'admin_remarks', 'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'attempt_number' => 'integer',
            'audited_quantity' => 'integer',
            'failed_quantity' => 'integer',
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    public function cycle(): BelongsTo { return $this->belongsTo(InventoryAuditCycle::class, 'inventory_audit_cycle_id'); }
    public function inventory(): BelongsTo { return $this->belongsTo(Inventory::class); }
    public function qaUser(): BelongsTo { return $this->belongsTo(User::class, 'qa_user_id'); }
    public function adminUser(): BelongsTo { return $this->belongsTo(User::class, 'admin_user_id'); }
    public function previousItem(): BelongsTo { return $this->belongsTo(self::class, 'previous_item_id'); }
    public function evidence(): HasMany { return $this->hasMany(InventoryAuditEvidence::class); }
}
