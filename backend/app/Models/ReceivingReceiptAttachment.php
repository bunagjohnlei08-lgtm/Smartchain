<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceivingReceiptAttachment extends Model
{
    protected $fillable = [
        'receiving_id',
        'original_name',
        'stored_path',
        'mime_type',
        'file_size',
        'file_sha256',
        'uploaded_by',
    ];

    protected $hidden = ['stored_path', 'file_sha256'];

    protected function casts(): array
    {
        return ['file_size' => 'integer'];
    }

    public function receiving(): BelongsTo
    {
        return $this->belongsTo(Receiving::class);
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
