<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\ReplenishmentRequest;
use App\Models\Product;
use App\Models\Rfq;
use App\Models\Warehouse;
use App\Support\AuditLogger;
use App\Support\RfqCatalogImageSnapshot;
use App\Support\RfqLineUnits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\URL;

class AdminRfqEditingController extends Controller
{
    private const SOURCING_STATUSES = [
        'READY_FOR_RFQ', 'RFQ_DRAFT',
        'PENDING_APPROVAL', 'PUBLISHED_OPEN', 'CLOSED', 'EVALUATION', 'AWARDED', 'CANCELLED',
    ];

    public function sourcingProducts(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],
            'classification' => ['nullable', Rule::in(Product::CLASSIFICATIONS)],
            'sourcing_status' => ['nullable', Rule::in(self::SOURCING_STATUSES)],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Product::query()
            ->with(['replenishmentRequests' => fn ($q) => $q
                ->with(['warehouse:id,name', 'purchaseOrder:id,replenishment_request_id', 'rfqLine.rfq:id,rfq_number,status,published_at,opens_at,closes_at'])
                ->latest('id')]);
        if ($search = $validated['search'] ?? null) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")
                ->orWhere('category', 'like', "%{$search}%"));
        }
        if ($category = $validated['category'] ?? null) $query->where('category', $category);
        if ($classification = $validated['classification'] ?? null) $query->where('item_classification', $classification);

        $rows = $query->orderBy('name')->get()->map(fn (Product $product) => $this->sourcingProductData($product))
            ->reject(fn (array $row) => in_array($row['sourcing_status'], ['NO_APPROVED_REQUIREMENT', 'DIRECT_PURCHASE'], true))->values();
        if ($status = $validated['sourcing_status'] ?? null) {
            $rows = $rows->where('sourcing_status', $status)->values();
        }
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 20);
        $total = $rows->count();

        return response()->json([
            'data' => $rows->forPage($page, $perPage)->values(),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
            'filters' => [
                'categories' => Product::query()->whereNotNull('category')->distinct()->orderBy('category')->pluck('category'),
                'classifications' => Product::CLASSIFICATIONS,
                'sourcing_statuses' => self::SOURCING_STATUSES,
            ],
        ]);
    }

    public function eligibleRequirements(Request $request): JsonResponse { abort_unless($request->user()->isAdmin(),403);$rows=ReplenishmentRequest::query()->whereIn('status',ReplenishmentRequest::AWAITING_PURCHASE_ORDER_STATUSES)->where('sourcing_method',ReplenishmentRequest::SOURCING_COMPETITIVE)->whereDoesntHave('purchaseOrder')->whereDoesntHave('rfqLine')->with(['product:id,name,category,unit,image_path','warehouse:id,name','requester:id,name'])->get();$main=Warehouse::configuredMain();if($main?->status!=='Active')$main=null;return response()->json(['data'=>$rows->map(fn($r)=>['id'=>$r->id,'request_no'=>$r->request_no,'product_id'=>$r->product_id,'product_name'=>$r->product?->name,'category'=>$r->product?->category,'unit'=>RfqLineUnits::canonical($r->product?->unit),'requested_qty'=>$r->requested_qty,'warehouse_name'=>$r->warehouse?->name,'requested_by'=>$r->requester?->name,'sourcing_method'=>$r->sourcing_method,'image_url'=>$r->product?->image_path?route('public.products.image',$r->product):null]),'delivery_destination'=>$main?['name'=>$main->name,'address'=>$main->address]:null]); }
    public function show(Request $request,Rfq $rfq): JsonResponse { abort_unless($request->user()->isAdmin(),403);return response()->json(['data'=>$this->data($rfq->load(['lines','creator:id,name','amendments.creator:id,name']))]); }
    public function update(Request $request,Rfq $rfq): JsonResponse { return $this->save($request,$rfq,false); }
    public function amend(Request $request,Rfq $rfq): JsonResponse { return $this->save($request,$rfq,true); }
    private function save(Request $request,Rfq $rfq,bool $amend): JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);RfqLineUnits::normalizeRequest($request);$v=$request->validate($this->rules($amend));$this->validateCriteriaWeights($v);
        $row=DB::transaction(function()use($request,$rfq,$v,$amend){$row=Rfq::query()->lockForUpdate()->findOrFail($rfq->id);abort_if($row->version!==(int)$v['version'],409,'This RFQ changed after you opened it. Reload before saving.');if($amend){abort_unless($row->published_at&&in_array($row->status,[Rfq::SCHEDULED,Rfq::OPEN],true)&&$row->closes_at->isFuture(),422,'Only an active published RFQ can be amended.');abort_if($row->quotations()->exists(),409,'An RFQ with submitted bids cannot be amended. Cancel it and issue a new RFQ instead.');}else abort_unless($row->status===Rfq::DRAFT,422,'Only draft RFQs can be edited directly.');
            $before=$this->snapshot($row->load('lines'));$requirements=ReplenishmentRequest::query()->whereIn('id',collect($v['lines'])->pluck('replenishment_request_id'))->with('product')->lockForUpdate()->get()->keyBy('id');abort_unless($requirements->count()===count($v['lines']),422,'Every line must reference an available requirement.');foreach($v['lines'] as $index=>$line){$req=$requirements[$line['replenishment_request_id']];$existing=$req->rfqLine;abort_unless(in_array($req->status,ReplenishmentRequest::AWAITING_PURCHASE_ORDER_STATUSES,true)&&$req->sourcing_method===ReplenishmentRequest::SOURCING_COMPETITIVE&&!$req->purchaseOrder()->exists()&&(!$existing||$existing->rfq_id===$row->id),422,"Requirement {$req->request_no} is unavailable.");RfqLineUnits::assertMatches($req,$line,$index);}
            $row->lines()->whereNotIn('replenishment_request_id',collect($v['lines'])->pluck('replenishment_request_id'))->delete();foreach($v['lines'] as $line){$product=$requirements[$line['replenishment_request_id']]->product;$rfqLine=$row->lines()->updateOrCreate(['replenishment_request_id'=>$line['replenishment_request_id']],[...$line,'product_name'=>$product->name,'category'=>$product->category]);RfqCatalogImageSnapshot::copy($product,$rfqLine);}$row->update([...collect($v)->except(['lines','version','reason'])->all(),'version'=>$row->version+1]);$after=$this->snapshot($row->fresh('lines'));$row->amendments()->create(['version'=>$row->version,'reason'=>$amend?$v['reason']:'Draft edited','changes'=>['before'=>$before,'after'=>$after],'created_by'=>$request->user()->id]);return $row->fresh(['lines','creator:id,name','amendments.creator:id,name']);});
        AuditLogger::success($amend?'RFQ_AMENDED':'RFQ_DRAFT_UPDATED',AuditLogger::MODULE_PROCUREMENT,['actor'=>$request->user(),'resource'=>$row,'resource_label'=>$row->rfq_number,'details'=>$amend?$v['reason']:'Draft edited','metadata'=>['version'=>$row->version]]);return response()->json(['data'=>$this->data($row)]);
    }
    private function rules(bool $amend): array { return ['version'=>['required','integer','min:1'],'reason'=>$amend?['required','string','min:5','max:2000']:['prohibited'],'title'=>['required','string','max:255'],'description'=>['nullable','string','max:5000'],'opens_at'=>['required','date'],'closes_at'=>['required','date','after:opens_at'],'required_delivery_date'=>['required','date','after:closes_at'],'delivery_destination'=>['required','string','max:2000'],'partial_offers_allowed'=>['required','boolean'],'split_awards_allowed'=>['required','boolean'],'minimum_decrement'=>['required','decimal:0,2','min:0'],'currency'=>['required','string','size:3','regex:/^[A-Z]{3}$/'],'show_reference_price'=>['required','boolean'],'show_lowest_bid'=>['required','boolean'],'eligibility_criteria'=>['nullable','array'],'eligibility_criteria.*'=>['string','max:500'],'mandatory_compliance'=>['nullable','array'],'mandatory_compliance.*'=>['string','max:500'],'evaluation_criteria'=>['nullable','array'],'evaluation_criteria.*.name'=>['required_with:evaluation_criteria','string','max:150'],'evaluation_criteria.*.weight'=>['required_with:evaluation_criteria','numeric','min:0','max:100'],'procurement_remarks'=>['nullable','string','max:5000'],'lines'=>['required','array','min:1','max:50'],'lines.*.replenishment_request_id'=>['required','integer','distinct'],'lines.*.product_id'=>['required','integer','exists:products,id'],'lines.*.unit'=>['required',Rule::in([...Product::PACKAGE_UNITS,'KG','L'])],'lines.*.required_quantity'=>['required','integer','min:1'],'lines.*.public_specification'=>['required','string','max:5000'],'lines.*.reference_unit_price'=>['nullable','decimal:0,2','min:0'],'lines.*.publish_reference_price'=>['required','boolean']]; }
    private function validateCriteriaWeights(array $data): void { $criteria=$data['evaluation_criteria']??[];if($criteria!==[]&&abs((float)collect($criteria)->sum('weight')-100)>0.001)throw ValidationException::withMessages(['evaluation_criteria'=>['Evaluation criteria weights must total 100%.']]); }
    private function snapshot(Rfq $r): array { return ['title'=>$r->title,'description'=>$r->description,'opens_at'=>$r->opens_at?->toIso8601String(),'closes_at'=>$r->closes_at?->toIso8601String(),'required_delivery_date'=>$r->required_delivery_date?->toDateString(),'delivery_destination'=>$r->delivery_destination,'minimum_decrement'=>(string)$r->minimum_decrement,'lines'=>$r->lines->map(fn($l)=>$l->only(['replenishment_request_id','product_id','product_name','category','unit','required_quantity','public_specification','reference_unit_price','publish_reference_price']))->all()]; }
    private function data(Rfq $r): array { $data=$r->toArray();$data['status']=$r->effectiveStatus();if($r->relationLoaded('lines'))$data['lines']=$r->lines->map(fn($line)=>[...$line->toArray(),'image_url'=>$line->public_image_path?URL::temporarySignedRoute('rfq-lines.image.preview',now()->addMinutes(10),['rfqLine'=>$line]):null]);$data['amendments']=$r->relationLoaded('amendments')?$r->amendments->map(fn($a)=>['id'=>$a->id,'version'=>$a->version,'reason'=>$a->reason,'created_by'=>$a->creator?->name,'created_at'=>$a->created_at?->toIso8601String()]):[];return $data; }

    private function sourcingProductData(Product $product): array
    {
        $requirements = $product->replenishmentRequests;
        $eligible = $requirements->first(fn ($r) => in_array($r->status, ReplenishmentRequest::AWAITING_PURCHASE_ORDER_STATUSES, true)
            && $r->sourcing_method === ReplenishmentRequest::SOURCING_COMPETITIVE && ! $r->purchaseOrder && ! $r->rfqLine);
        $direct = $requirements->first(fn ($r) => in_array($r->status, ReplenishmentRequest::AWAITING_PURCHASE_ORDER_STATUSES, true)
            && $r->sourcing_method === ReplenishmentRequest::SOURCING_DIRECT);
        $linked = $requirements->first(fn ($r) => $r->rfqLine?->rfq !== null);
        $requirement = $eligible ?? $direct ?? $linked;
        $rfq = $linked?->rfqLine?->rfq;
        [$status, $label] = $eligible ? ['READY_FOR_RFQ', 'Ready for RFQ']
            : ($direct ? ['DIRECT_PURCHASE', 'Direct Purchase'] : $this->rfqSourcingStatus($rfq));

        return [
            'id' => $product->id,
            'name' => $product->name,
            'category' => $product->category,
            'classification' => $product->item_classification,
            'unit' => RfqLineUnits::canonical($product->unit),
            'image_url' => $product->image_path ? route('public.products.image', $product) : null,
            'specifications' => null,
            'sourcing_status' => $status,
            'sourcing_status_label' => $label,
            'approved_requirement' => $requirement ? [
                'id' => $requirement->id,
                'request_no' => $requirement->request_no,
                'requested_qty' => $requirement->requested_qty,
                'warehouse_name' => $requirement->warehouse?->name,
                'sourcing_method' => $requirement->sourcing_method,
            ] : null,
            'eligible_requirements' => $requirements->filter(fn ($r) => in_array($r->status, ReplenishmentRequest::AWAITING_PURCHASE_ORDER_STATUSES, true)
                && $r->sourcing_method === ReplenishmentRequest::SOURCING_COMPETITIVE && ! $r->purchaseOrder && ! $r->rfqLine)
                ->map(fn ($r) => ['id'=>$r->id,'request_no'=>$r->request_no,'product_id'=>$product->id,'product_name'=>$product->name,'category'=>$product->category,'unit'=>RfqLineUnits::canonical($product->unit),'requested_qty'=>$r->requested_qty,'warehouse_name'=>$r->warehouse?->name,'image_url'=>$product->image_path?route('public.products.image',$product):null])
                ->values(),
            'rfq' => $rfq ? ['id'=>$rfq->id,'rfq_number'=>$rfq->rfq_number,'status'=>$rfq->effectiveStatus()] : null,
        ];
    }

    private function rfqSourcingStatus(?Rfq $rfq): array
    {
        if (! $rfq) return ['NO_APPROVED_REQUIREMENT', 'No Approved Requirement'];
        return match ($rfq->effectiveStatus()) {
            Rfq::DRAFT => ['RFQ_DRAFT', 'RFQ Draft'],
            Rfq::PENDING_APPROVAL => ['PENDING_APPROVAL', 'Pending Approval'],
            Rfq::SCHEDULED => $rfq->published_at ? ['PUBLISHED_OPEN', 'Published / Open'] : ['PENDING_APPROVAL', 'Pending Approval'],
            Rfq::OPEN => ['PUBLISHED_OPEN', 'Published / Open'],
            Rfq::CLOSED => ['CLOSED', 'Closed'],
            Rfq::UNDER_EVALUATION, Rfq::NO_AWARD => ['EVALUATION', 'Evaluation'],
            Rfq::AWARDED, Rfq::PARTIALLY_AWARDED => ['AWARDED', 'Awarded'],
            Rfq::CANCELLED => ['CANCELLED', 'Cancelled'],
            default => ['NO_APPROVED_REQUIREMENT', 'No Approved Requirement'],
        };
    }
}
