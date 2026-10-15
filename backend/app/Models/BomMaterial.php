<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class BomMaterial extends Model
{
    protected $fillable = ['product_id', 'required_quantity'];
    protected function casts(): array { return ['required_quantity' => 'decimal:6']; }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
