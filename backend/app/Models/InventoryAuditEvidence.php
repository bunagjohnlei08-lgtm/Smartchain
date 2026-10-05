<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryAuditEvidence extends Model
{
    protected $table = 'inventory_audit_evidence';
    protected $fillable = ['inventory_audit_item_id', 'original_name', 'stored_path', 'mime_type', 'file_size', 'uploaded_by'];
    protected $hidden = ['stored_path'];

    protected function casts(): array { return ['file_size' => 'integer']; }
    public function item(): BelongsTo { return $this->belongsTo(InventoryAuditItem::class, 'inventory_audit_item_id'); }
    public function uploadedBy(): BelongsTo { return $this->belongsTo(User::class, 'uploaded_by'); }
}
