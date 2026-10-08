<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierApplicationOffering extends Model
{
    public const TYPE_PRODUCT = 'PRODUCT';

    public const TYPE_SERVICE = 'SERVICE';

    public const TYPES = [self::TYPE_PRODUCT, self::TYPE_SERVICE];

    public const MAX_PER_APPLICATION = 20;

    protected $fillable = [
        'type', 'name', 'normalized_name', 'category', 'description', 'sort_order',
        'mapped_product_id', 'mapped_at', 'mapped_by_id',
    ];

    protected $hidden = ['normalized_name'];

    protected function casts(): array
    {
        return ['mapped_at' => 'datetime', 'sort_order' => 'integer'];
    }

    public static function normalizeName(string $name): string
    {
        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $name)));
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(SupplierApplication::class, 'supplier_application_id');
    }

    public function mappedProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'mapped_product_id');
    }

    public function mappedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'mapped_by_id');
    }

    /** PRODUCT offerings of approved applications that Admin has not mapped yet. */
    public function scopePendingCatalogMapping(Builder $query): Builder
    {
        return $query->where('type', self::TYPE_PRODUCT)
            ->whereNull('mapped_product_id')
            ->whereHas('application', fn ($application) => $application
                ->where('status', SupplierApplication::STATUS_APPROVED)
                ->whereNotNull('approved_supplier_id'));
    }
}
