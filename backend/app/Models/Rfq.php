<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Rfq extends Model
{
    public const DRAFT='DRAFT'; public const PENDING_APPROVAL='PENDING_APPROVAL'; public const SCHEDULED='SCHEDULED'; public const OPEN='OPEN'; public const CLOSED='CLOSED'; public const UNDER_EVALUATION='UNDER_EVALUATION'; public const AWARDED='AWARDED'; public const PARTIALLY_AWARDED='PARTIALLY_AWARDED'; public const NO_AWARD='NO_AWARD'; public const CANCELLED='CANCELLED';
    public const STATUSES=[self::DRAFT,self::PENDING_APPROVAL,self::SCHEDULED,self::OPEN,self::CLOSED,self::UNDER_EVALUATION,self::AWARDED,self::PARTIALLY_AWARDED,self::NO_AWARD,self::CANCELLED];
    protected $fillable=['rfq_number','title','description','status','opens_at','closes_at','required_delivery_date','delivery_destination','partial_offers_allowed','split_awards_allowed','minimum_decrement','currency','show_reference_price','show_lowest_bid','eligibility_criteria','mandatory_compliance','evaluation_criteria','procurement_remarks','version','created_by','approved_by','approved_at','published_by','published_at','cancelled_by','cancelled_at','cancellation_reason'];
    protected function casts(): array { return ['opens_at'=>'datetime','closes_at'=>'datetime','required_delivery_date'=>'date','partial_offers_allowed'=>'boolean','split_awards_allowed'=>'boolean','minimum_decrement'=>'decimal:2','show_reference_price'=>'boolean','show_lowest_bid'=>'boolean','eligibility_criteria'=>'array','mandatory_compliance'=>'array','evaluation_criteria'=>'array','approved_at'=>'datetime','published_at'=>'datetime','cancelled_at'=>'datetime']; }
    public function lines(): HasMany { return $this->hasMany(RfqLine::class); }
    public function amendments(): HasMany { return $this->hasMany(RfqAmendment::class)->orderByDesc('version'); }
    public function quotations(): HasMany { return $this->hasMany(SupplierQuotation::class); }
    public function awards(): HasMany { return $this->hasMany(SupplierAward::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class,'created_by'); }
    public function effectiveStatus(): string { if(in_array($this->status,[self::SCHEDULED,self::OPEN],true)){ if(now()->gte($this->closes_at)) return self::CLOSED; if(now()->gte($this->opens_at) && $this->published_at) return self::OPEN; return self::SCHEDULED; } return $this->status; }
}
