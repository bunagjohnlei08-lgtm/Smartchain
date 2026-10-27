<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\SupplierAccreditationDocument;
use App\Models\SupplierAccreditationRequest;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SupplierAccreditationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $supplier = $request->user()->supplier;
        $rows = SupplierAccreditationRequest::where('supplier_id', $supplier->id)
            ->with(['documents.verifiedBy:id,name','events.actor:id,name','reviewedBy:id,name'])
            ->latest('submitted_at')->get();

        return response()->json(['data'=>$rows->map(fn ($row) => $this->data($row)), 'categories'=>$this->categories()])
            ->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $request): JsonResponse
    {
        $supplier = $request->user()->supplier;
        $validated = $request->validate($this->submissionRules());
        $type = $validated['request_type'];
        abort_if(SupplierAccreditationRequest::where('supplier_id',$supplier->id)->where('request_type',$type)->whereIn('status',SupplierAccreditationRequest::OPEN_STATUSES)->exists(), 409, 'An open request of this type already exists.');
        $categories = $this->validatedCategories($validated['requested_categories'] ?? [], $type);
        $stored = [];
        try {
            $row = DB::transaction(function () use ($request,$supplier,$validated,$type,$categories,&$stored) {
                $row = SupplierAccreditationRequest::create([
                    'supplier_id'=>$supplier->id,'submitted_by_id'=>$request->user()->id,'request_type'=>$type,
                    'status'=>SupplierAccreditationRequest::PENDING,'requested_categories'=>$categories,
                    'supplier_reason'=>trim($validated['reason']),'submitted_at'=>now(),
                    'previous_state'=>$this->supplierState($supplier),
                ]);
                $this->storeDocuments($request,$row,$stored);
                $this->event($row,$request->user()->id,'SUBMITTED','Accreditation request submitted for Admin review.');
                AuditLogger::success('SUPPLIER_ACCREDITATION_REQUEST_SUBMITTED',AuditLogger::MODULE_SUPPLIERS,['actor'=>$request->user(),'resource'=>$row,'resource_label'=>$supplier->supplier_code,'metadata'=>['request_type'=>$type]]);
                return $row;
            });
        } catch (\Throwable $exception) {
            foreach ($stored as $path) Storage::disk('local')->delete($path);
            throw $exception;
        }
        return response()->json(['data'=>$this->data($row->load(['documents','events.actor:id,name']))],201);
    }

    public function resubmit(Request $request, SupplierAccreditationRequest $accreditationRequest): JsonResponse
    {
        abort_unless($accreditationRequest->supplier_id === $request->user()->supplier_id, 404);
        abort_unless($accreditationRequest->status === SupplierAccreditationRequest::NEEDS_REVISION, 422, 'Only a request needing revision can be resubmitted.');
        $validated=$request->validate(['reason'=>['required','string','min:5','max:2000'],'requested_categories'=>['nullable','array','max:25'],'requested_categories.*'=>['string','max:255'],...$this->fileRules()]);
        $categories=$this->validatedCategories($validated['requested_categories']??$accreditationRequest->requested_categories??[],$accreditationRequest->request_type);
        $stored=[];
        try {
            DB::transaction(function()use($request,$accreditationRequest,$validated,$categories,&$stored){
                $locked=SupplierAccreditationRequest::lockForUpdate()->findOrFail($accreditationRequest->id);
                abort_unless($locked->status===SupplierAccreditationRequest::NEEDS_REVISION,409,'This request changed. Refresh before resubmitting.');
                $locked->update(['status'=>SupplierAccreditationRequest::PENDING,'supplier_reason'=>trim($validated['reason']),'requested_categories'=>$categories,'submitted_at'=>now(),'admin_reason'=>null,'reviewed_by_id'=>null,'reviewed_at'=>null,'lock_version'=>$locked->lock_version+1]);
                $this->storeDocuments($request,$locked,$stored);
                $this->event($locked,$request->user()->id,'RESUBMITTED','Requested corrections were resubmitted.');
                AuditLogger::success('SUPPLIER_ACCREDITATION_REQUEST_RESUBMITTED',AuditLogger::MODULE_SUPPLIERS,['actor'=>$request->user(),'resource'=>$locked]);
            });
        } catch(\Throwable $exception){foreach($stored as $path)Storage::disk('local')->delete($path);throw$exception;}
        return response()->json(['data'=>$this->data($accreditationRequest->fresh(['documents','events.actor:id,name']))]);
    }

    public function document(Request $request, SupplierAccreditationDocument $document): StreamedResponse
    {
        $row=$document->request;
        abort_unless($request->user()->isAdmin()||$row->supplier_id===$request->user()->supplier_id,404);
        abort_unless(Storage::disk('local')->exists($document->stored_path),404);
        return Storage::disk('local')->download($document->stored_path,$document->original_name,['Cache-Control'=>'private, no-store','X-Content-Type-Options'=>'nosniff']);
    }

    public function signedDocument(SupplierAccreditationDocument $document): StreamedResponse
    {
        abort_unless(Storage::disk('local')->exists($document->stored_path),404);
        return Storage::disk('local')->download($document->stored_path,$document->original_name,['Cache-Control'=>'private, no-store','X-Content-Type-Options'=>'nosniff']);
    }

    private function submissionRules(): array
    {
        return ['request_type'=>['required',Rule::in(SupplierAccreditationRequest::TYPES)],'reason'=>['required','string','min:5','max:2000'],'requested_categories'=>['nullable','array','max:25'],'requested_categories.*'=>['string','max:255'],...$this->fileRules()];
    }
    private function fileRules(): array { return ['business_certificate'=>['nullable','file','mimes:pdf,jpg,jpeg,png','max:5120'],'business_permit'=>['nullable','file','mimes:pdf,jpg,jpeg,png','max:5120'],'supporting_evidence'=>['nullable','file','mimes:pdf,jpg,jpeg,png','max:5120']]; }
    private function validatedCategories(array $values,string $type): array
    {
        $values=collect($values)->map(fn($v)=>trim((string)$v))->filter()->unique(fn($v)=>mb_strtoupper($v))->values();
        if($type===SupplierAccreditationRequest::CATEGORY_EXPANSION&&$values->isEmpty())throw ValidationException::withMessages(['requested_categories'=>['Select at least one catalog category.']]);
        $known=$this->categories()->mapWithKeys(fn($v)=>[mb_strtoupper($v)=>$v]);$unknown=$values->reject(fn($v)=>$known->has(mb_strtoupper($v)));
        if($unknown->isNotEmpty())throw ValidationException::withMessages(['requested_categories'=>['Unknown product categories cannot be requested.']]);
        return $values->map(fn($v)=>$known[mb_strtoupper($v)])->all();
    }
    private function categories(){return Product::query()->whereNotNull('category')->where('category','!=','')->distinct()->orderBy('category')->pluck('category');}
    private function storeDocuments(Request $request,SupplierAccreditationRequest $row,array &$stored):void
    {
        $map=['business_certificate'=>SupplierAccreditationDocument::BUSINESS_CERTIFICATE,'business_permit'=>SupplierAccreditationDocument::BUSINESS_PERMIT,'supporting_evidence'=>SupplierAccreditationDocument::SUPPORTING_EVIDENCE];
        foreach($map as$field=>$type){if(!$request->hasFile($field))continue;$upload=$request->file($field);$path=$upload->getRealPath();$hash=is_string($path)?hash_file('sha256',$path):false;if(!is_string($hash))throw ValidationException::withMessages([$field=>['The uploaded file could not be read.']]);$storedPath=Storage::disk('local')->putFile("supplier-accreditation/{$row->supplier_id}/{$row->id}",$upload);if(!$storedPath)throw new \RuntimeException('Accreditation document storage failed.');$stored[]=$storedPath;$row->documents()->create(['document_type'=>$type,'original_name'=>Str::limit(basename($upload->getClientOriginalName()),255,''),'stored_path'=>$storedPath,'mime_type'=>(string)$upload->getMimeType(),'file_size'=>$upload->getSize(),'file_sha256'=>$hash,'verification_status'=>SupplierAccreditationDocument::PENDING]);}
    }
    private function event(SupplierAccreditationRequest $row,?int $actor,string $type,string $message,array $metadata=[]):void{$row->events()->create(['actor_user_id'=>$actor,'event_type'=>$type,'message'=>$message,'metadata'=>$metadata?:null,'created_at'=>now()]);}
    private function supplierState($supplier):array{return['accreditation_status'=>$supplier->accreditation_status,'accredited_at'=>$supplier->accredited_at?->toIso8601String(),'accreditation_expires_on'=>$supplier->accreditation_expires_on?->toDateString(),'categories'=>collect(explode(',',(string)$supplier->supply_category))->map(fn($v)=>trim($v))->filter()->values()->all()];}
    private function data(SupplierAccreditationRequest $row):array{$row->loadMissing(['documents.verifiedBy:id,name','events.actor:id,name','reviewedBy:id,name']);return[...$row->only(['id','supplier_id','request_type','status','requested_categories','supplier_reason','admin_reason','proposed_expires_on','previous_state','approved_state','submitted_at','reviewed_at','lock_version']),'reviewed_by'=>$row->reviewedBy?->name,'documents'=>$row->documents->map(fn($d)=>[...$d->only(['id','document_type','original_name','mime_type','file_size','verification_status','valid_from','expires_on','verification_reason','updated_at']),'download_url'=>URL::temporarySignedRoute('accreditation-documents.download',now()->addMinutes(10),['document'=>$d]),'verified_by'=>$d->verifiedBy?->name]),'events'=>$row->events->map(fn($e)=>[...$e->only(['id','event_type','message','metadata','created_at']),'actor'=>$e->actor?->name])];}
}
