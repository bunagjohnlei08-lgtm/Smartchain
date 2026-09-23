<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QaInspectionAttachment extends Model
{
    protected $fillable = [
        'qa_inspection_id',
        'original_name',
        'stored_path',
        'mime_type',
        'file_size',
        'uploaded_by',
    ];

    protected $hidden = ['stored_path'];

    protected function casts(): array
    {
        return ['file_size' => 'integer'];
    }

    public function inspection(): BelongsTo
    {
        return $this->belongsTo(QaInspection::class, 'qa_inspection_id');
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
