<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class ProductionBatchMaterial extends Model
{
    protected $fillable = ['product_id', 'product_name', 'unit', 'bom_quantity', 'required_quantity', 'required_quantity_exact', 'blocking_reason', 'issued_quantity', 'disposition'];
    protected function casts(): array { return ['required_quantity' => 'integer', 'issued_quantity' => 'integer', 'bom_quantity' => 'decimal:6']; }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
