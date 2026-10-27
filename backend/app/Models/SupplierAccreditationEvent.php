<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierAccreditationEvent extends Model
{
    public $timestamps = false;
    protected $fillable = ['supplier_accreditation_request_id','actor_user_id','event_type','message','metadata','created_at'];
    protected function casts(): array { return ['metadata'=>'array','created_at'=>'datetime']; }
    public function request(): BelongsTo { return $this->belongsTo(SupplierAccreditationRequest::class, 'supplier_accreditation_request_id'); }
    public function actor(): BelongsTo { return $this->belongsTo(User::class, 'actor_user_id'); }
}
