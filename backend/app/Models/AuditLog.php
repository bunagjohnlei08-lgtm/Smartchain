<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * Append-only audit trail. Rows are written through App\Support\AuditLogger
 * and can never be updated or deleted through the application.
 */
class AuditLog extends Model
{
    public const UPDATED_AT = null;

    public const STATUS_SUCCESS = 'SUCCESS';
    public const STATUS_FAILED = 'FAILED';
    public const STATUS_BLOCKED = 'BLOCKED';
    public const STATUS_EXPIRED = 'EXPIRED';

    public const STATUSES = [
        self::STATUS_SUCCESS,
        self::STATUS_FAILED,
        self::STATUS_BLOCKED,
        self::STATUS_EXPIRED,
    ];

    protected $fillable = [
        'actor_user_id',
        'actor_name',
        'actor_identifier',
        'action',
        'module',
        'resource_type',
        'resource_id',
        'resource_label',
        'status',
        'details',
        'ip_address',
        'user_agent',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (): void {
            throw new LogicException('Audit logs are append-only and cannot be modified.');
        });

        static::deleting(function (): void {
            throw new LogicException('Audit logs are append-only and cannot be deleted.');
        });
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
