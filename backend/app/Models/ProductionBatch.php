<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class ProductionBatch extends Model
{
    public const STATUSES = ['PLANNED', 'IN_PRODUCTION', 'PENDING_QA', 'QA_COMPLETED', 'STOCKED_IN', 'CANCELLED'];
    protected $fillable = ['batch_number', 'product_id', 'warehouse_id', 'bom_id', 'product_name', 'unit', 'target_quantity', 'bom_output_quantity', 'status', 'created_by_id', 'issued_at', 'actual_quantity', 'output_recorded_at', 'assigned_qa_user_id', 'passed_quantity', 'failed_quantity', 'qa_notes', 'qa_completed_at', 'stocked_in_at', 'cancelled_at', 'cancellation_reason', 'minimum_processing_minutes', 'production_started_at', 'output_available_at'];
    protected function casts(): array { return [
        'target_quantity' => 'integer', 'bom_output_quantity' => 'integer', 'actual_quantity' => 'integer', 'passed_quantity' => 'integer', 'failed_quantity' => 'integer',
        'issued_at' => 'datetime', 'output_recorded_at' => 'datetime', 'qa_completed_at' => 'datetime', 'stocked_in_at' => 'datetime', 'cancelled_at' => 'datetime',
        'minimum_processing_minutes' => 'integer', 'production_started_at' => 'datetime', 'output_available_at' => 'datetime',
    ]; }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function warehouse(): BelongsTo { return $this->belongsTo(Warehouse::class); }
    public function materials(): HasMany { return $this->hasMany(ProductionBatchMaterial::class); }
}
