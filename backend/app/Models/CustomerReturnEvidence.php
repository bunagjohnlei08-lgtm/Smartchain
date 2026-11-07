<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class CustomerReturnEvidence extends Model
{
    public $timestamps = false;
    protected $table = 'customer_return_evidence';
    protected $guarded = ['id'];
    protected $hidden = ['stored_path','sha256'];
}
