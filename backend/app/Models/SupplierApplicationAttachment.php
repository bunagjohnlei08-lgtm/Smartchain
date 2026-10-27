<?php

namespace App\Models;

use App\Support\BusinessTime;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierApplicationAttachment extends Model
{
    public const STATUS_PENDING = 'PENDING_VERIFICATION';
    public const STATUS_VERIFIED = 'VERIFIED';
    public const STATUS_CORRECTION_REQUIRED = 'CORRECTION_REQUIRED';
    public const STATUS_EXPIRED = 'EXPIRED';
    public const STATUS_REJECTED = 'REJECTED';
    public const VERIFICATION_STATUSES = [self::STATUS_PENDING, self::STATUS_VERIFIED, self::STATUS_CORRECTION_REQUIRED, self::STATUS_EXPIRED, self::STATUS_REJECTED];
    public const TYPE_BUSINESS_CERTIFICATE = 'BUSINESS_CERTIFICATE';

    public const TYPE_BUSINESS_PERMIT = 'BUSINESS_PERMIT';

    public const TYPE_PRODUCT_SERVICE_IMAGE = 'PRODUCT_SERVICE_IMAGE';

    public const TYPES = [
        self::TYPE_BUSINESS_CERTIFICATE,
        self::TYPE_BUSINESS_PERMIT,
        self::TYPE_PRODUCT_SERVICE_IMAGE,
    ];

    /** Persist with an explicit offset; see BusinessTime::DB_DATE_FORMAT. */
    protected $dateFormat = BusinessTime::DB_DATE_FORMAT;

    protected $fillable = [
        'supplier_application_id',
        'attachment_type',
        'original_name',
        'stored_path',
        'mime_type',
        'file_size',
        'file_sha256',
        'is_current',
        'replaced_at',
        'verification_status', 'verified_by_id', 'verified_at', 'valid_from',
        'expires_on', 'verification_reason', 'replaces_attachment_id',
    ];

    protected $hidden = ['stored_path', 'file_sha256'];

    protected function casts(): array
    {
        return [
            'file_size' => 'integer', 'is_current' => 'boolean', 'replaced_at' => 'datetime',
            'verified_at' => 'datetime', 'valid_from' => 'date', 'expires_on' => 'date',
        ];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(SupplierApplication::class, 'supplier_application_id');
    }

    public function verifiedBy(): BelongsTo { return $this->belongsTo(User::class, 'verified_by_id'); }
    public function replaces(): BelongsTo { return $this->belongsTo(self::class, 'replaces_attachment_id'); }
}
