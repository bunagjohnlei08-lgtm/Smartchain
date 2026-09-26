<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Metadata-only record of a report preview or export. */
class ReportExport extends Model
{
    public const ACTION_PREVIEW = 'PREVIEW';
    public const ACTION_EXPORT = 'EXPORT';

    public const SOURCE_STANDARD = 'STANDARD';
    public const SOURCE_CUSTOM = 'CUSTOM';
    public const SOURCE_RAW = 'RAW';
    public const SOURCE_SCHEDULED = 'SCHEDULED';
    public const SOURCES = [self::SOURCE_STANDARD, self::SOURCE_CUSTOM, self::SOURCE_RAW];

    public const STATUS_SUCCESS = 'SUCCESS';
    public const STATUS_FAILED = 'FAILED';

    protected $fillable = [
        'user_id', 'report_schedule_id', 'action', 'source', 'report_key', 'report_name',
        'category', 'format', 'filters', 'status', 'row_count', 'file_name', 'file_size',
        'error_message', 'generated_at',
    ];

    protected function casts(): array
    {
        return [
            'filters' => 'array',
            'row_count' => 'integer',
            'file_size' => 'integer',
            'generated_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function schedule(): BelongsTo { return $this->belongsTo(ReportSchedule::class, 'report_schedule_id'); }
}
