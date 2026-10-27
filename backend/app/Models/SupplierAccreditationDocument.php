<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierAccreditationDocument extends Model
{
    public const BUSINESS_CERTIFICATE = 'BUSINESS_CERTIFICATE';
    public const BUSINESS_PERMIT = 'BUSINESS_PERMIT';
    public const SUPPORTING_EVIDENCE = 'SUPPORTING_EVIDENCE';
    public const TYPES = [self::BUSINESS_CERTIFICATE, self::BUSINESS_PERMIT, self::SUPPORTING_EVIDENCE];
    public const PENDING = 'PENDING_VERIFICATION';
    public const VERIFIED = 'VERIFIED';
    public const CORRECTION_REQUIRED = 'CORRECTION_REQUIRED';
    public const REJECTED = 'REJECTED';

    protected $fillable = ['supplier_accreditation_request_id','document_type','original_name','stored_path','mime_type','file_size','file_sha256','verification_status','valid_from','expires_on','verification_reason','verified_by_id','verified_at'];
    protected $hidden = ['stored_path','file_sha256'];
    protected function casts(): array { return ['file_size'=>'integer','valid_from'=>'date','expires_on'=>'date','verified_at'=>'datetime']; }
    public function request(): BelongsTo { return $this->belongsTo(SupplierAccreditationRequest::class, 'supplier_accreditation_request_id'); }
    public function verifiedBy(): BelongsTo { return $this->belongsTo(User::class, 'verified_by_id'); }
}
