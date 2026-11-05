<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExcessDeliveryDocument extends Model
{
    protected $fillable = [
        'excess_delivery_review_id', 'internal_reference', 'purpose', 'document_type',
        'external_reference', 'original_name', 'stored_path', 'mime_type', 'file_size',
        'file_sha256', 'uploaded_by_id',
    ];

    protected $hidden = ['stored_path', 'file_sha256'];

    protected function casts(): array { return ['file_size' => 'integer']; }
    public function review(): BelongsTo { return $this->belongsTo(ExcessDeliveryReview::class, 'excess_delivery_review_id'); }
    public function uploadedBy(): BelongsTo { return $this->belongsTo(User::class, 'uploaded_by_id'); }
}
