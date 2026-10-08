<?php

namespace App\Models;

use App\Support\BusinessTime;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierApplicationAttachment extends Model
{
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
    ];

    protected $hidden = ['stored_path', 'file_sha256'];

    protected function casts(): array
    {
        return ['file_size' => 'integer', 'is_current' => 'boolean', 'replaced_at' => 'datetime'];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(SupplierApplication::class, 'supplier_application_id');
    }
}
