<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class CustomerReturnEvent extends Model
{
    public $timestamps = false;
    protected $guarded = ['id'];
    protected function casts(): array { return ['details'=>'array','created_at'=>'datetime']; }
    public function actor(): BelongsTo { return $this->belongsTo(User::class, 'actor_id'); }
}
