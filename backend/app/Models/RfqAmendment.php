<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class RfqAmendment extends Model
{
    protected $fillable=['version','reason','changes','created_by'];
    protected function casts(): array { return ['changes'=>'array']; }
    public function rfq(): BelongsTo { return $this->belongsTo(Rfq::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class,'created_by'); }
}
