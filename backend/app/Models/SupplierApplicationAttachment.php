<?php

namespace App\Models;

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

    protected $fillable = [
        'supplier_application_id',
        'attachment_type',
        'original_name',
        'stored_path',
        'mime_type',
        'file_size',
    ];

    protected $hidden = ['stored_path'];

    protected function casts(): array
    {
        return ['file_size' => 'integer'];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(SupplierApplication::class, 'supplier_application_id');
    }
}
