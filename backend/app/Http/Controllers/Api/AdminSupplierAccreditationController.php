<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\SupplierAccreditationDocument;
use App\Models\SupplierAccreditationRequest;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminSupplierAccreditationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);
        $v=$request->validate(['supplier_id'=>['nullable','integer','exists:suppliers,id'],'status'=>['nullable',Rule::in([SupplierAccreditationRequest::PENDING,SupplierAccreditationRequest::NEEDS_REVISION,SupplierAccreditationRequest::APPROVED,SupplierAccreditationRequest::REJECTED])]]);
        $rows=SupplierAccreditationRequest::with(['supplier','submittedBy:id,name','reviewedBy:id,name','documents.verifiedBy:id,name','events.actor:id,name'])
            ->when($v['supplier_id']??null,fn($q,$id)=>$q->where('supplier_id',$id))->when($v['status']??null,fn($q,$status)=>$q->where('status',$status))->latest('submitted_at')->get();
        return response()->json(['data'=>$rows->map(fn($row)=>$this->data($row))]);
    }

    public function supplier(Request $request,Supplier $supplier):JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);
        $supplier->load(['accreditationRequests'=>fn($q)=>$q->with(['submittedBy:id,name','reviewedBy:id,name','documents.verifiedBy:id,name','events.actor:id,name'])->latest('submitted_at')]);
        return response()->json(['data'=>['supplier'=>$this->supplierData($supplier),'requests'=>$supplier->accreditationRequests->map(fn($row)=>$this->data($row)),'categories'=>$this->categories()]]);
    }

    public function correctLegacy(Request $request,Supplier $supplier):JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);
        $v=$request->validate(['reason'=>['required','string','min:10','max:2000']]);
        abort_if($supplier->accreditation_expires_on,422,'This supplier already has an accreditation expiry.');
        abort_if($supplier->accreditationRequests()->whereIn('status',SupplierAccreditationRequest::OPEN_STATUSES)->exists(),409,'Resolve the open accreditation request first.');
        $evidence=$this->evidence($supplier,null);$expiry=$this->expiry($evidence);
        $row=DB::transaction(function()use($request,$supplier,$v,$expiry){
            $row=SupplierAccreditationRequest::create(['supplier_id'=>$supplier->id,'submitted_by_id'=>$request->user()->id,'request_type'=>SupplierAccreditationRequest::COMPLETION,'status'=>SupplierAccreditationRequest::PENDING,'supplier_reason'=>'Admin-initiated legacy accreditation completion.','admin_reason'=>trim($v['reason']),'proposed_expires_on'=>$expiry,'previous_state'=>$this->supplierState($supplier),'submitted_at'=>now()]);
            $this->event($row,$request->user()->id,'LEGACY_CORRECTION_INITIATED','Admin initiated a documented missing-expiry correction.',['proposed_expires_on'=>$expiry->toDateString()]);
            AuditLogger::success('SUPPLIER_ACCREDITATION_LEGACY_CORRECTION_INITIATED',AuditLogger::MODULE_SUPPLIERS,['actor'=>$request->user(),'resource'=>$row,'resource_label'=>$supplier->supplier_code,'details'=>$v['reason']]);
            return$row;
        });
        return response()->json(['data'=>$this->data($row->load(['supplier','documents','events.actor:id,name']))],201);
    }

    public function verifyDocument(Request $request,SupplierAccreditationDocument $document):JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);
        $v=$request->validate(['verification_status'=>['required',Rule::in([SupplierAccreditationDocument::VERIFIED,SupplierAccreditationDocument::CORRECTION_REQUIRED,SupplierAccreditationDocument::REJECTED])],'valid_from'=>['nullable','date'],'expires_on'=>['nullable','date','after_or_equal:valid_from'],'reason'=>['nullable','string','max:2000',Rule::requiredIf(fn()=>in_array($request->input('verification_status'),[SupplierAccreditationDocument::CORRECTION_REQUIRED,SupplierAccreditationDocument::REJECTED],true))],'document_updated_at'=>['required','date']]);
        if($v['verification_status']===SupplierAccreditationDocument::VERIFIED&&in_array($document->document_type,[SupplierAccreditationDocument::BUSINESS_CERTIFICATE,SupplierAccreditationDocument::BUSINESS_PERMIT],true)&&empty($v['expires_on']))throw ValidationException::withMessages(['expires_on'=>['A verified mandatory document requires an expiry date.']]);
        DB::transaction(function()use($request,$document,$v){
            $locked=SupplierAccreditationDocument::lockForUpdate()->findOrFail($document->id);$row=SupplierAccreditationRequest::lockForUpdate()->findOrFail($locked->supplier_accreditation_request_id);
            abort_unless($row->status===SupplierAccreditationRequest::PENDING,422,'Documents can only be reviewed while the request is pending.');
            abort_unless($locked->updated_at->equalTo($v['document_updated_at']),409,'This document changed in another session. Refresh before saving.');
            $locked->update(['verification_status'=>$v['verification_status'],'valid_from'=>$v['valid_from']??null,'expires_on'=>$v['expires_on']??null,'verification_reason'=>$v['reason']??null,'verified_by_id'=>$request->user()->id,'verified_at'=>now()]);
            $this->event($row,$request->user()->id,'DOCUMENT_REVIEWED',"{$locked->document_type} marked {$locked->verification_status}.",['document_id'=>$locked->id]);
            AuditLogger::success('SUPPLIER_ACCREDITATION_DOCUMENT_REVIEWED',AuditLogger::MODULE_SUPPLIERS,['actor'=>$request->user(),'resource'=>$locked,'metadata'=>['request_id'=>$row->id,'status'=>$locked->verification_status]]);
        });
        return response()->json(['data'=>$document->fresh()]);
    }

    public function decide(Request $request,int $accreditationRequest):JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);
        $accreditationRequest=SupplierAccreditationRequest::findOrFail($accreditationRequest);
        $v=$request->validate(['decision'=>['required',Rule::in([SupplierAccreditationRequest::APPROVED,SupplierAccreditationRequest::NEEDS_REVISION,SupplierAccreditationRequest::REJECTED])],'reason'=>['required','string','min:5','max:2000'],'lock_version'=>['required','integer','min:1']]);
        DB::transaction(function()use($request,$accreditationRequest,$v){
            $row=SupplierAccreditationRequest::with('documents')->lockForUpdate()->findOrFail($accreditationRequest->id);$supplier=Supplier::lockForUpdate()->findOrFail($row->supplier_id);
            abort_unless($row->status===SupplierAccreditationRequest::PENDING,409,'This request has already been decided or returned.');
            abort_unless($row->lock_version===(int)$v['lock_version'],409,'This request changed in another session. Refresh before deciding.');
            $approvedState=null;
            if($v['decision']===SupplierAccreditationRequest::APPROVED){
                $updates=[];
                if(in_array($row->request_type,[SupplierAccreditationRequest::COMPLETION,SupplierAccreditationRequest::RENEWAL],true)){$expiry=$this->expiry($this->evidence($supplier,$row));$updates=['accreditation_status'=>'ACTIVE','accredited_at'=>$supplier->accredited_at??now(),'accreditation_expires_on'=>$expiry];$row->proposed_expires_on=$expiry;}
                if($row->request_type===SupplierAccreditationRequest::CATEGORY_EXPANSION){$known=$this->categories()->map(fn($v)=>mb_strtoupper($v));foreach($row->requested_categories??[]as$category)abort_unless($known->contains(mb_strtoupper($category)),422,'A requested category no longer exists in the Product Catalog.');$merged=collect(explode(',',(string)$supplier->supply_category))->merge($row->requested_categories??[])->map(fn($v)=>trim($v))->filter()->unique(fn($v)=>mb_strtoupper($v))->values()->join(', ');$updates['supply_category']=$merged;}
                if($updates!==[])$supplier->update($updates);$approvedState=$this->supplierState($supplier->fresh());
            }
            $row->forceFill(['status'=>$v['decision'],'admin_reason'=>trim($v['reason']),'approved_state'=>$approvedState,'reviewed_by_id'=>$request->user()->id,'reviewed_at'=>now(),'lock_version'=>$row->lock_version+1])->save();
            $this->event($row,$request->user()->id,$v['decision'],"Accreditation request {$v['decision']}.");
            AuditLogger::success('SUPPLIER_ACCREDITATION_REQUEST_'.$v['decision'],AuditLogger::MODULE_SUPPLIERS,['actor'=>$request->user(),'resource'=>$row,'resource_label'=>$supplier->supplier_code,'details'=>$v['reason'],'metadata'=>['request_type'=>$row->request_type,'approved_state'=>$approvedState]]);
        });
        return response()->json(['data'=>$this->data($accreditationRequest->fresh(['supplier','submittedBy:id,name','reviewedBy:id,name','documents.verifiedBy:id,name','events.actor:id,name']))]);
    }

    private function evidence(Supplier $supplier,?SupplierAccreditationRequest $row):array
    {
        $application=SupplierApplication::where('approved_supplier_id',$supplier->id)->where('status',SupplierApplication::STATUS_APPROVED)->first();abort_unless($application,422,'An approved supplier application is required.');
        $result=[];foreach([SupplierAccreditationDocument::BUSINESS_CERTIFICATE,SupplierAccreditationDocument::BUSINESS_PERMIT]as$type){$fresh=$row?->documents->where('document_type',$type)->sortByDesc('id')->first();if($fresh){abort_unless($fresh->verification_status===SupplierAccreditationDocument::VERIFIED&&$fresh->expires_on&&!$fresh->expires_on->lt(today()),422,"{$type} must be verified and current.");$result[$type]=$fresh->expires_on;continue;}$old=SupplierApplicationAttachment::where('supplier_application_id',$application->id)->where('is_current',true)->where('attachment_type',$type)->where('verification_status',SupplierApplicationAttachment::STATUS_VERIFIED)->whereNotNull('expires_on')->whereDate('expires_on','>=',today())->orderByDesc('id')->first();abort_unless($old,422,"A current verified {$type} with an expiry date is required.");$result[$type]=$old->expires_on;}return$result;
    }
    private function expiry(array $evidence){return collect($evidence)->min();}
    private function categories(){return Product::query()->whereNotNull('category')->where('category','!=','')->distinct()->orderBy('category')->pluck('category');}
    private function event($row,?int$actor,string$type,string$message,array$metadata=[]):void{$row->events()->create(['actor_user_id'=>$actor,'event_type'=>$type,'message'=>$message,'metadata'=>$metadata?:null,'created_at'=>now()]);}
    private function supplierState(Supplier$supplier):array{return['accreditation_status'=>$supplier->accreditation_status,'accredited_at'=>$supplier->accredited_at?->toIso8601String(),'accreditation_expires_on'=>$supplier->accreditation_expires_on?->toDateString(),'categories'=>collect(explode(',',(string)$supplier->supply_category))->map(fn($v)=>trim($v))->filter()->values()->all()];}
    private function supplierData(Supplier$supplier):array{return[...$supplier->only(['id','supplier_code','name','status','accreditation_status','accredited_at','accreditation_expires_on','supply_category']),'stored_state'=>$this->supplierState($supplier),'legacy_correction_available'=>!$supplier->accreditation_expires_on];}
    private function data(SupplierAccreditationRequest$row):array{$row->loadMissing(['supplier','submittedBy:id,name','reviewedBy:id,name','documents.verifiedBy:id,name','events.actor:id,name']);return[...$row->only(['id','supplier_id','request_type','status','requested_categories','supplier_reason','admin_reason','proposed_expires_on','previous_state','approved_state','submitted_at','reviewed_at','lock_version']),'supplier'=>$row->supplier?->only(['id','supplier_code','name','status','accreditation_status','accreditation_expires_on','supply_category']),'submitted_by'=>$row->submittedBy?->name,'reviewed_by'=>$row->reviewedBy?->name,'documents'=>$row->documents->map(fn($d)=>[...$d->only(['id','document_type','original_name','mime_type','file_size','verification_status','valid_from','expires_on','verification_reason','updated_at']),'download_url'=>URL::temporarySignedRoute('accreditation-documents.download',now()->addMinutes(10),['document'=>$d]),'verified_by'=>$d->verifiedBy?->name]),'events'=>$row->events->map(fn($e)=>[...$e->only(['id','event_type','message','metadata','created_at']),'actor'=>$e->actor?->name])];}
}
