<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupplierAccreditationRequest extends Model
{
    public const COMPLETION = 'COMPLETION';
    public const RENEWAL = 'RENEWAL';
    public const CATEGORY_EXPANSION = 'CATEGORY_EXPANSION';
    public const TYPES = [self::COMPLETION, self::RENEWAL, self::CATEGORY_EXPANSION];
    public const PENDING = 'PENDING';
    public const NEEDS_REVISION = 'NEEDS_REVISION';
    public const APPROVED = 'APPROVED';
    public const REJECTED = 'REJECTED';
    public const OPEN_STATUSES = [self::PENDING, self::NEEDS_REVISION];

    protected $fillable = ['supplier_id','submitted_by_id','request_type','status','requested_categories','supplier_reason','admin_reason','proposed_expires_on','previous_state','approved_state','reviewed_by_id','submitted_at','reviewed_at','lock_version'];
    protected function casts(): array { return ['requested_categories'=>'array','previous_state'=>'array','approved_state'=>'array','proposed_expires_on'=>'date','submitted_at'=>'datetime','reviewed_at'=>'datetime']; }
    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function submittedBy(): BelongsTo { return $this->belongsTo(User::class, 'submitted_by_id'); }
    public function reviewedBy(): BelongsTo { return $this->belongsTo(User::class, 'reviewed_by_id'); }
    public function documents(): HasMany { return $this->hasMany(SupplierAccreditationDocument::class); }
    public function events(): HasMany { return $this->hasMany(SupplierAccreditationEvent::class)->orderBy('created_at'); }
}
