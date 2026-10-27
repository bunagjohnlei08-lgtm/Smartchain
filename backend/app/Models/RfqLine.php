<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class RfqLine extends Model
{
    protected $fillable=['replenishment_request_id','product_id','product_name','category','unit','required_quantity','public_specification','reference_unit_price','publish_reference_price','public_image_path'];
    protected function casts(): array { return ['reference_unit_price'=>'decimal:2','publish_reference_price'=>'boolean']; }
    public function rfq(): BelongsTo { return $this->belongsTo(Rfq::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function replenishmentRequest(): BelongsTo { return $this->belongsTo(ReplenishmentRequest::class); }
    public function bidLines(): HasMany { return $this->hasMany(SupplierBidLine::class); }
}
