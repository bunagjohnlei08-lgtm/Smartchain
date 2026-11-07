<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{CustomerReturn, CustomerReturnEvidence, Order, OrderItem, StockOutTransaction, User};
use App\Services\CustomerReturnService;
use App\Support\ExactFileDuplicateGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class CustomerReturnController extends Controller
{
    public function index(Request $request, CustomerReturnService $service)
    {
        $values = $request->validate(['search'=>['nullable','string','max:255'],'status'=>['nullable',Rule::in(CustomerReturn::STATUSES)],'page'=>['nullable','integer','min:1']]);
        $query = $service->scope(CustomerReturn::query(),$request->user())->with(['order:id,order_no,customer_name','product:id,name','warehouse:id,name','inspector:id,name']);
        if (!empty($values['status'])) $query->where('status',$values['status']);
        if (!empty($values['search'])) {
            $term = '%'.str_replace(['%','_'],['\\%','\\_'],$values['search']).'%';
            $query->where(fn ($q) => $q->where('reference','ilike',$term)->orWhereHas('order',fn ($o) => $o->where('order_no','ilike',$term)->orWhere('customer_name','ilike',$term))->orWhereHas('product',fn ($p) => $p->where('name','ilike',$term)));
        }
        return response()->json($query->orderByDesc('id')->paginate(8)->through(fn ($row) => $this->present($row,false)));
    }

    public function options(Request $request, CustomerReturnService $service)
    {
        abort_unless($request->user()->isAdmin() || $request->user()->isPlantManager(),403);
        if ($request->user()->isPlantManager()) {
            abort_unless($request->user()->warehouse_id,403);
            return response()->json(['qa_users'=>User::where('status','ACTIVE')->whereHas('role',fn ($q) => $q->where('slug','QA_SUPERVISOR'))
                ->where(fn ($q) => $q->whereNull('warehouse_id')->orWhere('warehouse_id',$request->user()->warehouse_id))->get(['id','name'])]);
        }
        $values = $request->validate(['order_id'=>['required','integer','exists:orders,id']]);
        $order = Order::findOrFail($values['order_id']);
        $lines = [];
        foreach (OrderItem::where('order_id',$order->id)->with('product')->get() as $item) {
            $warehouses = StockOutTransaction::where('order_item_id',$item->id)->with('warehouse:id,name')->get()->groupBy('warehouse_id');
            foreach ($warehouses as $warehouseId=>$transactions) {
                try { $eligible = $service->eligibleLine($item,(int)$warehouseId); }
                catch (\Illuminate\Validation\ValidationException $error) { continue; }
                $lines[] = ['order_item_id'=>$item->id,'product'=>$item->product->name,'warehouse_id'=>(int)$warehouseId,'warehouse'=>$transactions->first()->warehouse?->name]+$eligible;
            }
        }
        return response()->json(['order'=>['id'=>$order->id,'order_no'=>$order->order_no,'customer'=>$order->customer_name,'status'=>$order->status],
            'lines'=>$lines,'reasons'=>CustomerReturn::REASONS]);
    }

    public function store(Request $request, CustomerReturnService $service)
    {
        abort_unless($request->user()->isAdmin(),403);
        $values = $request->validate(['submission_key'=>['required','uuid'],'order_item_id'=>['required','integer','exists:order_items,id'],
            'warehouse_id'=>['required','integer','exists:warehouses,id'],'quantity'=>['required','integer','min:1','max:2147483647'],'reason'=>['required',Rule::in(CustomerReturn::REASONS)]]);
        return response()->json(['data'=>$this->present($service->register($request->user(),$values),true)],201);
    }

    public function show(Request $request, CustomerReturn $customerReturn, CustomerReturnService $service)
    {
        $row = $service->scope(CustomerReturn::query(),$request->user())->findOrFail($customerReturn->id);
        return response()->json(['data'=>$this->present($row,true)]);
    }

    public function action(Request $request, CustomerReturn $customerReturn, string $action, CustomerReturnService $service)
    {
        abort_unless(in_array($action,['approve','reject','cancel','receive','inspect','restock','dispose'],true),404);
        // Authorize before validation/upload processing; service checks again under locks.
        $actor = $request->user();
        $service->scope(CustomerReturn::query(),$actor)->findOrFail($customerReturn->id);
        abort_unless(match($action) { 'receive','restock'=>$actor->isPlantManager(), 'inspect'=>$actor->isQaSupervisor(), default=>$actor->isAdmin() },403);
        $rules = CustomerReturnService::actionRules($action);
        $requiresEvidence = in_array($action,['approve','receive','inspect','dispose'],true);
        $values = $request->validate($rules + ['evidence'=>[$requiresEvidence?'required':'nullable','array','min:1','max:5'],
            'evidence.*'=>['file','mimes:jpg,jpeg,png,pdf','mimetypes:image/jpeg,image/png,application/pdf','extensions:jpg,jpeg,png,pdf','max:5120']]);
        unset($values['evidence']);
        $hashes = ExactFileDuplicateGuard::hashes($request->file('evidence',[]),[],'evidence','Duplicate evidence file detected.');
        $stored = [];
        try {
            $return = $service->transition($actor,$customerReturn,$action,$values,function ($row) use ($request,$actor,$action,$hashes,&$stored) {
                foreach ($request->file('evidence',[]) as $index=>$upload) {
                    $path = Storage::disk('local')->putFile('customer-return-evidence/'.$row->id,$upload);
                    abort_unless($path,500,'Evidence could not be stored.');
                    $stored[] = $path;
                    $row->evidence()->create(['uploaded_by'=>$actor->id,'stage'=>$action,'original_name'=>basename($upload->getClientOriginalName()),
                        'stored_path'=>$path,'mime_type'=>$upload->getMimeType(),'file_size'=>$upload->getSize(),'sha256'=>$hashes[$index],'created_at'=>now()]);
                }
            });
        } catch (\Throwable $error) { foreach ($stored as $path) Storage::disk('local')->delete($path); throw $error; }
        return response()->json(['data'=>$this->present($return,true)]);
    }

    public function evidence(Request $request, CustomerReturn $customerReturn, CustomerReturnEvidence $evidence, CustomerReturnService $service)
    {
        $service->scope(CustomerReturn::query(),$request->user())->findOrFail($customerReturn->id);
        abort_unless($evidence->customer_return_id === $customerReturn->id,404);
        abort_unless(preg_match('~^customer-return-evidence/'.(int)$customerReturn->id.'/[A-Za-z0-9]+\.(?:jpe?g|png|pdf)$~i',$evidence->stored_path),404);
        abort_unless(Storage::disk('local')->exists($evidence->stored_path),404);
        return Storage::disk('local')->response($evidence->stored_path,$evidence->original_name,['Content-Type'=>$evidence->mime_type,
            'X-Content-Type-Options'=>'nosniff','Cache-Control'=>'private, no-store','Content-Security-Policy'=>"default-src 'none'; sandbox"]);
    }

    private function present(CustomerReturn $row, bool $detail): array
    {
        $row->loadMissing(['order:id,order_no,customer_name','product:id,name','warehouse:id,name','inspector:id,name']);
        $data = $row->attributesToArray();
        unset($data['submission_key'],$data['request_hash']);
        $data += ['order_no'=>$row->order->order_no,'customer'=>$row->order->customer_name,'product'=>$row->product->name,
            'warehouse'=>$row->warehouse->name,'qa_inspector'=>$row->inspector?->name,
            'quarantine_quantity'=>$row->received_quantity-$row->restocked_quantity-$row->disposed_quantity];
        if ($detail) {
            $data['events'] = $row->events()->with('actor:id,name')->get()->map(fn ($event) => ['id'=>$event->id,'action'=>$event->action,'actor'=>$event->actor?->name,'created_at'=>$event->created_at,'details'=>$event->details]);
            $data['evidence'] = $row->evidence->map(fn ($file) => ['id'=>$file->id,'stage'=>$file->stage,'original_name'=>$file->original_name,'mime_type'=>$file->mime_type,'file_size'=>$file->file_size,
                'view_url'=>"/customer-returns/{$row->id}/evidence/{$file->id}"]);
        }
        return $data;
    }
}
