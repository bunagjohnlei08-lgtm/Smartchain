<?php

namespace App\Services;

use App\Models\{CustomerReturn, Inventory, OrderItem, Product, StockOutTransaction, User, Warehouse};
use App\Support\{AuditLogger, WarehouseCapacity};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Validator;

/** Internal entry point reused by role-scoped controllers; no partner acknowledgments or refunds. */
class CustomerReturnService
{
    public static function actionRules(string $action): array
    {
        return match($action) {
            'approve'=>['verification_reference'=>['required','string','min:5','max:2000'],'delivery_verified'=>['required','accepted']],
            'reject','cancel'=>['reason'=>['required','string','min:5','max:2000']],
            'receive'=>['quantity'=>['required','integer','min:1','max:2147483647'],'received_at'=>['required','date','before_or_equal:now'],
                'condition'=>['required',Rule::in(['SEALED','DAMAGED','OPENED','LEAKING','OTHER'])],'qa_user_id'=>['required','integer','exists:users,id'],'shortage_reason'=>['nullable','string','min:5','max:2000']],
            'inspect'=>['passed_quantity'=>['required','integer','min:0','max:2147483647'],'failed_quantity'=>['required','integer','min:0','max:2147483647'],
                'findings'=>['required','string','min:5','max:2000'],'policy_reference'=>['required','string','min:5','max:2000'],'suitability_confirmed'=>['nullable','boolean']],
            'dispose'=>['reason'=>['required','string','min:5','max:2000'],'disposal_date'=>['required','date','before_or_equal:today'],
                'policy_reference'=>['required','string','min:5','max:2000'],'physical_disposal_confirmed'=>['required','accepted']],
            default=>[],
        };
    }

    private function ensure(bool $valid, string $field, string $message): void
    {
        if (!$valid) throw ValidationException::withMessages([$field=>$message]);
    }

    public function scope($query, User $actor)
    {
        abort_unless($actor->isAdmin() || $actor->isPlantManager() || $actor->isQaSupervisor(), 403);
        if ($actor->isPlantManager()) { abort_unless($actor->warehouse_id, 403); $query->where('warehouse_id', $actor->warehouse_id); }
        if ($actor->isQaSupervisor()) $query->where('qa_user_id', $actor->id);
        return $query;
    }

    public function eligibleLine(OrderItem $item, int $warehouseId): array
    {
        $transactions = StockOutTransaction::where('order_item_id', $item->id)->where('warehouse_id', $warehouseId)->get();
        $unit = WarehouseCapacity::normalizeUnit($item->unit);
        $this->ensure(in_array($unit, Product::PACKAGE_UNITS, true) && $item->product && WarehouseCapacity::normalizeUnit($item->product->unit) === $unit,
            'order_item_id', 'The original order and current catalog must have the same supported PCS, SACK or DRUM unit. Historical units cannot be converted.');
        $this->ensure($transactions->isNotEmpty() && $transactions->every(fn ($transaction) => $transaction->order_id === $item->order_id && $transaction->product_id === $item->product_id && $transaction->quantity > 0 && WarehouseCapacity::normalizeUnit($transaction->unit) === $unit), 'order_item_id', 'An exact order/product/unit Stock Out history is required.');
        $this->ensure($transactions->pluck('inventory_id')->unique()->count() === 1, 'warehouse_id', 'Multiple inventory identities require review before registering a return.');
        $fulfilled = min((int) $transactions->sum('quantity'), (int) $item->quantity);
        $reserved = (int) CustomerReturn::where('order_item_id', $item->id)->where('warehouse_id', $warehouseId)
            ->whereNotIn('status', ['REJECTED','CANCELLED'])->sum('reserved_quantity');
        $globalReserved = (int) CustomerReturn::where('order_item_id',$item->id)->whereNotIn('status',['REJECTED','CANCELLED'])->sum('reserved_quantity');
        $inventory = Inventory::find($transactions->first()->inventory_id);
        $this->ensure($inventory && $inventory->product_id === $item->product_id && $inventory->warehouse_id === $warehouseId,'inventory_id','The fulfilled inventory identity requires review.');
        return ['fulfilled_quantity'=>$fulfilled,'previously_returned_quantity'=>$reserved,'remaining_returnable_quantity'=>max(0,min($fulfilled-$reserved,(int)$item->quantity-$globalReserved)),
            'inventory_id'=>(int)$transactions->first()->inventory_id,'unit'=>$unit];
    }

    public function register(User $actor, array $values): CustomerReturn
    {
        abort_unless($actor->isAdmin() && $actor->status === 'ACTIVE', 403);
        $values = Validator::make($values, ['submission_key'=>['required','uuid'],'order_item_id'=>['required','integer'],'warehouse_id'=>['required','integer'],'quantity'=>['required','integer','min:1','max:2147483647'],'reason'=>['required',Rule::in(CustomerReturn::REASONS)]])->validate();
        $values['quantity'] = (int) $values['quantity'];
        $values['order_item_id'] = (int) $values['order_item_id'];
        $values['warehouse_id'] = (int) $values['warehouse_id'];
        $this->ensure(is_int($values['quantity']) && $values['quantity'] > 0 && in_array($values['reason'],CustomerReturn::REASONS,true),'quantity','A positive whole return quantity and recognized reason are required.');
        $hash = hash('sha256', json_encode([$values['order_item_id'],$values['warehouse_id'],$values['quantity'],$values['reason']], JSON_THROW_ON_ERROR));
        return DB::transaction(function () use ($actor,$values,$hash) {
            $item = OrderItem::with(['order','product'])->lockForUpdate()->findOrFail($values['order_item_id']);
            $existing = CustomerReturn::where('submission_key', $values['submission_key'])->first();
            if ($existing) {
                abort_unless($existing->requested_by === $actor->id && hash_equals($existing->request_hash,$hash),409,'This return submission key belongs to another request.');
                return $existing;
            }
            $line = $this->eligibleLine($item,(int)$values['warehouse_id']);
            $this->ensure($values['quantity'] <= $line['remaining_returnable_quantity'],'quantity','Requested quantity exceeds the fulfilled quantity remaining after pending and completed returns.');
            $return = CustomerReturn::create(['reference'=>'CR-'.now()->format('Ymd').'-'.Str::upper((string)Str::ulid()),
                'submission_key'=>$values['submission_key'],'request_hash'=>$hash,'order_id'=>$item->order_id,'order_item_id'=>$item->id,
                'product_id'=>$item->product_id,'warehouse_id'=>$values['warehouse_id'],'inventory_id'=>$line['inventory_id'],
                'unit'=>$line['unit'],'reason'=>$values['reason'],'status'=>'REQUESTED',
                'verification_status'=>$item->order->status === 'DELIVERED' ? 'ORDER_DELIVERED' : 'DELIVERY_VERIFICATION_HOLD',
                'requested_quantity'=>$values['quantity'],'reserved_quantity'=>$values['quantity'],'requested_by'=>$actor->id]);
            $this->event($return,$actor,'REQUESTED',['quantity'=>$values['quantity'],'unit'=>$return->unit,'verification_status'=>$return->verification_status]);
            return $return;
        });
    }

    public function transition(User $actor, CustomerReturn $record, string $action, array $data, callable $storeEvidence): CustomerReturn
    {
        return DB::transaction(function () use ($actor,$record,$action,$data,$storeEvidence) {
            // All return reservations/actions use the same item -> return -> warehouse -> inventory lock order.
            OrderItem::whereKey($record->order_item_id)->lockForUpdate()->firstOrFail();
            $return = $this->scope(CustomerReturn::query(),$actor)->lockForUpdate()->findOrFail($record->id);
            $roles = ['approve'=>'admin','reject'=>'admin','cancel'=>'admin','receive'=>'manager','inspect'=>'qa','restock'=>'manager','dispose'=>'admin'];
            abort_unless(match($roles[$action] ?? '') { 'admin'=>$actor->isAdmin(), 'manager'=>$actor->isPlantManager(), 'qa'=>$actor->isQaSupervisor(), default=>false },403);
            abort_unless($actor->status === 'ACTIVE',403);
            $data = Validator::make($data,self::actionRules($action))->validate();
            foreach (['quantity','passed_quantity','failed_quantity','qa_user_id'] as $field) {
                if (array_key_exists($field,$data)) $data[$field] = (int) $data[$field];
            }
            // A retry of a committed action returns current state; it never repeats a movement.
            if ($return->events()->where('action',strtoupper($action))->exists()) return $return;
            $details = [];
            if (in_array($action,['approve','reject','cancel'],true)) {
                $this->ensure($action === 'cancel' ? in_array($return->status,['REQUESTED','AWAITING_RETURN'],true) : $return->status === 'REQUESTED','status','This return is no longer awaiting this decision.');
                if ($action === 'approve') {
                    $return->status = 'AWAITING_RETURN';
                    $return->approved_by = $actor->id;
                    $return->verification_reference = $data['verification_reference'];
                    // Explicit evidence-based Admin verification does not alter the original order delivery status.
                    $return->verification_status = 'INTERNAL_DELIVERY_VERIFIED';
                } else {
                    $return->status = $action === 'reject' ? 'REJECTED' : 'CANCELLED';
                    $return->reserved_quantity = 0;
                    $return->closed_at = now();
                }
                $details = $data;
            } else {
                $warehouse = Warehouse::lockForUpdate()->findOrFail($return->warehouse_id);
                $inventory = Inventory::lockForUpdate()->findOrFail($return->inventory_id);
                $product = Product::lockForUpdate()->findOrFail($return->product_id);
                $this->ensure($inventory->warehouse_id === $warehouse->id && $inventory->product_id === $product->id && WarehouseCapacity::normalizeUnit($product->unit) === $return->unit,
                    'product_id','Return, inventory, warehouse and current catalog unit must match exactly.');
                if ($action === 'receive') {
                    $this->ensure($return->status === 'AWAITING_RETURN','status','Only an approved return can be physically received.');
                    $this->ensure($data['quantity'] <= $return->requested_quantity,'quantity','Received quantity cannot exceed the approved return quantity.');
                    $this->ensure($data['quantity'] === $return->requested_quantity || filled($data['shortage_reason'] ?? null),'shortage_reason','Document the unreceived balance before completing this one-time return receipt.');
                    $qa = User::with('role')->findOrFail($data['qa_user_id']);
                    $this->ensure($qa->isQaSupervisor() && $qa->status === 'ACTIVE' && (!$qa->warehouse_id || $qa->warehouse_id === $warehouse->id),'qa_user_id','Choose an active QA Supervisor eligible for this warehouse.');
                    WarehouseCapacity::ensureReturnedAdditionFits($warehouse,(int)$data['quantity']);
                    $inventory->returned_stock += $data['quantity'];
                    $inventory->catalog_setup_at = null;
                    $inventory->has_stock_history = true;
                    $return->received_quantity = $data['quantity'];
                    $return->reserved_quantity = $data['quantity'];
                    $return->receipt_shortage_reason = $data['shortage_reason'] ?? null;
                    $return->received_at = $data['received_at'];
                    $return->received_by = $actor->id;
                    $return->qa_user_id = $qa->id;
                    $return->condition = $data['condition'];
                    $return->status = 'PENDING_QA';
                    $details = $data + ['unreceived_quantity'=>$return->requested_quantity-$return->received_quantity,'quarantine_delta'=>$data['quantity']];
                } elseif ($action === 'inspect') {
                    $this->ensure($return->status === 'PENDING_QA','status','Only a physically received return assigned to you can be inspected.');
                    $this->ensure($data['passed_quantity'] + $data['failed_quantity'] === $return->received_quantity,'passed_quantity','Passed and failed quantities must equal the actual received quantity.');
                    $this->ensure($data['passed_quantity'] === 0 || ($data['suitability_confirmed'] ?? false),'suitability_confirmed','Restockable quantities require explicit QA suitability confirmation under the applicable product/storage policy.');
                    $return->passed_quantity = $data['passed_quantity'];
                    $return->failed_quantity = $data['failed_quantity'];
                    $return->qa_findings = $data['findings'];
                    $return->suitability_reference = $data['policy_reference'];
                    $return->inspected_at = now();
                    $return->restock_status = $return->passed_quantity ? 'PENDING_STOCK_IN' : 'NOT_ELIGIBLE';
                    $return->disposal_status = $return->failed_quantity ? 'FOR_DISPOSAL' : 'NOT_REQUIRED';
                    $return->status = 'PENDING_DISPOSITION';
                    $details = $data;
                } elseif ($action === 'restock') {
                    $this->ensure($return->status === 'PENDING_DISPOSITION' && $return->passed_quantity > 0 && !$return->restocked_quantity,'status','Only QA-approved, unstocked return quantities can be stocked in.');
                    $quantity = $return->passed_quantity;
                    $this->ensure($inventory->returned_stock >= $quantity,'quantity','The return quarantine balance is inconsistent.');
                    WarehouseCapacity::ensureAdditionsFit($warehouse,[$return->unit=>$quantity]);
                    $inventory->returned_stock -= $quantity;
                    $inventory->available_stock += $quantity;
                    $inventory->status = $inventory->available_stock > 0 ? 'Available' : $inventory->status;
                    $return->restocked_quantity = $quantity;
                    $return->restock_status = 'STOCKED_IN';
                    $details = ['quantity'=>$quantity,'unit'=>$return->unit,'inventory_id'=>$inventory->id,'available_delta'=>$quantity,'quarantine_delta'=>-$quantity];
                } elseif ($action === 'dispose') {
                    $this->ensure($return->status === 'PENDING_DISPOSITION' && $return->failed_quantity > 0 && !$return->disposed_quantity,'status','Only failed quarantined return quantities can be documented as disposed.');
                    $quantity = $return->failed_quantity;
                    $this->ensure(\Illuminate\Support\Carbon::parse($data['disposal_date'])->endOfDay()->gte($return->received_at),'disposal_date','Disposal cannot be recorded before physical receipt.');
                    $this->ensure($inventory->returned_stock >= $quantity,'quantity','The return quarantine balance is inconsistent.');
                    $inventory->returned_stock -= $quantity;
                    $return->disposed_quantity = $quantity;
                    $return->disposal_status = 'DISPOSED';
                    $details = $data + ['quantity'=>$quantity,'unit'=>$return->unit,'authorized_by'=>$actor->id,'quarantine_delta'=>-$quantity];
                }
                $inventory->save();
                if (in_array($action,['receive','restock','dispose'],true)) {
                    DB::table('inventory_return_movements')->insert([
                        'inventory_id'=>$inventory->id,'warehouse_id'=>$warehouse->id,'performed_by'=>$actor->id,
                        'direction'=>match($action) { 'receive'=>'EXTERNAL_RECEIPT','restock'=>'RETURN_RESTOCK',default=>'RETURN_DISPOSAL' },
                        'source_bucket'=>$action === 'receive' ? 'external' : 'returned_stock','unit'=>$return->unit,
                        'quantity'=>$action === 'receive' ? $return->received_quantity : $quantity,
                        'source_type'=>'CUSTOMER_RETURN','source_reference'=>$return->reference,
                        'idempotency_key'=>'customer-return:'.$return->id.':'.$action,
                        'notes'=>$action === 'restock' ? 'QA-authorized return stock in' : ($data['reason'] ?? $data['condition'] ?? $action),
                        'created_at'=>now(),'updated_at'=>now(),
                    ]);
                }
                if ($return->inspected_at && $return->restocked_quantity + $return->disposed_quantity === $return->received_quantity) {
                    $return->status = 'COMPLETED'; $return->closed_at = now();
                }
                WarehouseCapacity::recordTransition($warehouse);
            }
            $return->save();
            $storeEvidence($return);
            if (in_array($action,['approve','receive','inspect','dispose'],true)) {
                $this->ensure($return->evidence()->where('stage',$action)->exists(),'evidence','Private supporting evidence is required for this transition.');
            }
            $this->event($return,$actor,strtoupper($action),$details);
            return $return;
        });
    }

    private function event(CustomerReturn $return, User $actor, string $action, array $details): void
    {
        $return->events()->create(['action'=>$action,'actor_id'=>$actor->id,'details'=>$details,'created_at'=>now()]);
        AuditLogger::success('CUSTOMER_RETURN_'.$action,AuditLogger::MODULE_ORDERS,['actor'=>$actor,'resource'=>$return,'resource_label'=>$return->reference,
            'metadata'=>['order_id'=>$return->order_id,'product_id'=>$return->product_id,'warehouse_id'=>$return->warehouse_id,'unit'=>$return->unit,'status'=>$return->status]+$details]);
    }
}
