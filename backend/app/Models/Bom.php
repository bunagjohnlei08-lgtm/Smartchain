<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class Bom extends Model
{
    protected $attributes = ['minimum_processing_minutes' => 30];
    protected $fillable = ['product_id', 'output_quantity', 'updated_by_id', 'minimum_processing_minutes'];
    protected function casts(): array { return ['output_quantity' => 'integer', 'minimum_processing_minutes' => 'integer']; }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function materials(): HasMany { return $this->hasMany(BomMaterial::class); }
}
