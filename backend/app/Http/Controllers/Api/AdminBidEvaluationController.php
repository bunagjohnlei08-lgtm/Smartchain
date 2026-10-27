<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{BidEvaluation,Rfq,Supplier,SupplierApplication,SupplierApplicationAttachment,SupplierAward,SupplierBidLine,SupplierBidRevision,SupplierQuotation};
use App\Notifications\WorkflowNotification;
use App\Services\SupplierPerformanceService;
use App\Support\{AuditLogger,WorkflowNotificationSender};
use Illuminate\Http\{JsonResponse,Request};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class AdminBidEvaluationController extends Controller
{
    public function show(Request $request, Rfq $rfq, SupplierPerformanceService $performance): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $rfq->load('lines');
        $bids = SupplierBidLine::whereHas('quotation', fn ($query) => $query->where('rfq_id', $rfq->id))
            ->with(['quotation.supplier.approvedApplication.attachments', 'rfqLine', 'activeRevision', 'revisions', 'evaluation'])->get();
        $performanceBySupplier = $bids->pluck('quotation.supplier')->unique('id')->mapWithKeys(function (Supplier $supplier) use ($performance) {
            $summary = $performance->summarizeSupplier($supplier);
            return [$supplier->id => [
                'status' => $summary['overall_score'] === null ? 'NOT_YET_RATED' : 'RATED',
                'label' => $summary['overall_score'] === null ? 'Not Yet Rated' : number_format($summary['overall_score'], 2).'/100',
                'overall_score' => $summary['overall_score'],
                'eligibility_status' => $summary['eligibility_status'],
                'eligible_deliveries' => $summary['counts']['eligible_deliveries'],
                'message' => $summary['scoring_message'],
            ]];
        });

        $lastActivity = $bids->flatMap->revisions->max('submitted_at');

        return response()->json(['data' => [
            'rfq' => $rfq->only(['id','rfq_number','title','status','opens_at','closes_at','required_delivery_date','currency','partial_offers_allowed','split_awards_allowed','show_reference_price','show_lowest_bid','eligibility_criteria','mandatory_compliance','evaluation_criteria']),
            'effective_status' => $rfq->effectiveStatus(),
            'supplier_count' => $bids->pluck('quotation.supplier_id')->unique()->count(),
            'quotation_count' => $bids->pluck('supplier_quotation_id')->unique()->count(),
            'submission_count' => $bids->count(),
            'active_revision_count' => $bids->whereNotNull('activeRevision')->count(),
            'last_activity_at' => $lastActivity?->toIso8601String(),
            'lines' => $rfq->lines,
            'bids' => $bids->map(fn (SupplierBidLine $bid) => $this->bid($bid, $performanceBySupplier[$bid->quotation->supplier_id], $rfq)),
        ]]);
    }

    public function evaluate(Request $request, SupplierBidLine $bidLine, SupplierPerformanceService $performance): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'mandatory_results' => ['required','array','min:1'],
            'criterion_scores' => ['required','array'], 'criterion_scores.*' => ['numeric','min:0','max:100'],
            'qualification_reason' => ['required_without:finding_codes','nullable','string','min:5','max:3000'],
            'finding_codes' => ['sometimes','array','min:1'],
            'finding_codes.*' => ['string',Rule::in(array_keys($this->findingLabels()))],
            'qualification_comments' => ['nullable','string','max:2000'],
        ]);
        $bidLine->load(['quotation.rfq','quotation.supplier.approvedApplication.attachments','rfqLine','activeRevision','evaluation']);
        $rfq = $bidLine->quotation->rfq;
        abort_unless(in_array($rfq->effectiveStatus(), [Rfq::CLOSED,Rfq::UNDER_EVALUATION], true), 422, 'Evaluation begins only after bidding closes.');
        $criteria = collect($rfq->evaluation_criteria ?? []);
        $approvedKeys = $criteria->pluck('name')->map(fn ($name) => (string) $name)->sort()->values()->all();
        $submittedKeys = collect(array_keys($validated['criterion_scores']))->map(fn ($name) => (string) $name)->sort()->values()->all();
        if ($approvedKeys !== $submittedKeys) {
            throw ValidationException::withMessages(['criterion_scores' => ['Scores must match the approved RFQ criteria exactly.']]);
        }
        $mandatoryResults = collect($validated['mandatory_results'])->map(function ($value, $key) {
            if (is_bool($value)) return $value ? 'PASSED' : 'FAILED';
            if (! in_array($value, ['PASSED','FAILED','NEEDS_VERIFICATION'], true)) {
                throw ValidationException::withMessages(["mandatory_results.{$key}" => ['Select Passed, Failed, or Needs Verification.']]);
            }
            return $value;
        })->all();
        $checks = collect($this->complianceChecks($bidLine, $rfq));
        foreach ($checks->where('source', 'SYSTEM') as $check) $mandatoryResults[$check['key']] = $check['status'];
        if (array_key_exists('finding_codes', $validated)) {
            $manualKeys = $checks->where('source', 'MANUAL')->pluck('key');
            foreach ($manualKeys as $key) {
                if (! array_key_exists($key, $mandatoryResults)) throw ValidationException::withMessages(["mandatory_results.{$key}" => ['Complete this mandatory review.']]);
            }
            $this->validateFindings($validated['finding_codes'], $mandatoryResults);
            foreach ($validated['finding_codes'] as $code) $mandatoryResults["finding_{$code}"] = 'PASSED';
            $validated['qualification_reason'] = $this->qualificationNarrative($validated['finding_codes'], $validated['qualification_comments'] ?? null);
        }
        $performanceSummary = $performance->summarizeSupplier($bidLine->quotation->supplier);
        foreach ($criteria as $criterion) {
            if ($this->isPerformanceCriterion($criterion['name']) && $performanceSummary['overall_score'] !== null) {
                $validated['criterion_scores'][$criterion['name']] = $performanceSummary['overall_score'];
            }
        }
        $passed = ! collect($mandatoryResults)->contains(fn ($status) => $status !== 'PASSED');
        $weighted = $passed ? round($criteria->sum(fn ($criterion) => (float) $validated['criterion_scores'][$criterion['name']] * (float) $criterion['weight'] / 100), 4) : null;
        $evaluation = BidEvaluation::updateOrCreate(['supplier_bid_line_id' => $bidLine->id], [
            'supplier_bid_revision_id' => $bidLine->activeRevision->id, 'mandatory_passed' => $passed,
            'mandatory_results' => $mandatoryResults, 'criterion_scores' => $validated['criterion_scores'],
            'weighted_score' => $weighted, 'qualification_reason' => $validated['qualification_reason'],
            'evaluated_by' => $request->user()->id, 'evaluated_at' => now(),
        ]);
        $bidLine->update(['status' => $passed ? 'QUALIFIED' : 'DISQUALIFIED']);
        if (in_array($rfq->status, [Rfq::SCHEDULED,Rfq::OPEN], true)) $rfq->update(['status' => Rfq::UNDER_EVALUATION]);
        AuditLogger::success('SUPPLIER_BID_EVALUATED', AuditLogger::MODULE_PROCUREMENT, ['actor'=>$request->user(),'resource'=>$bidLine,'resource_label'=>$bidLine->quotation->quotation_number,'metadata'=>['mandatory_passed'=>$passed,'weighted_score'=>$weighted]]);
        return response()->json(['data' => $evaluation]);
    }

    public function award(Request $request, Rfq $rfq): JsonResponse
    {
        try {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'idempotency_key'=>['required','string','min:16','max:80'],
            'outcome'=>['required',Rule::in(['FULL_AWARD','PARTIAL_AWARD','SPLIT_AWARD','NO_AWARD','REBID'])],
            'justification'=>['required','string','min:10','max:5000'], 'lines'=>['array','max:100'],
            'lines.*.rfq_line_id'=>['required','integer'], 'lines.*.supplier_bid_revision_id'=>['required','integer'],
            'lines.*.awarded_quantity'=>['required','integer','min:1'], 'lines.*.override_reason'=>['nullable','string','min:10','max:2000'],
        ]);
        $award = DB::transaction(function () use ($request, $rfq, $validated) {
            if ($existing = SupplierAward::where('idempotency_key', $validated['idempotency_key'])->first()) {
                abort_unless($existing->rfq_id === $rfq->id, 409, 'This idempotency key belongs to a different RFQ decision.');
                return $existing->load('lines');
            }
            $locked = Rfq::query()->lockForUpdate()->with('lines')->findOrFail($rfq->id);
            abort_if(SupplierAward::where('rfq_id', $locked->id)->exists(), 409, 'An award decision already exists.');
            abort_unless(in_array($locked->effectiveStatus(), [Rfq::CLOSED,Rfq::UNDER_EVALUATION], true), 422, 'Only a closed RFQ can be awarded.');
            $allocations = collect($validated['lines'] ?? []);
            if (in_array($validated['outcome'], ['NO_AWARD','REBID'], true)) abort_unless($allocations->isEmpty(), 422, 'No-award and rebid decisions cannot contain award lines.');
            else abort_if($allocations->isEmpty(), 422, 'At least one award line is required.');
            $award = SupplierAward::create(['award_number'=>'AWD-'.now()->format('Ymd').'-'.strtoupper(substr((string) Str::uuid(),0,8)),'rfq_id'=>$locked->id,'outcome'=>$validated['outcome'],'status'=>'APPROVED','justification'=>$validated['justification'],'idempotency_key'=>$validated['idempotency_key'],'approved_by'=>$request->user()->id,'approved_at'=>now()]);
            foreach ($allocations->groupBy('rfq_line_id') as $rfqLineId => $lineAllocations) {
                $rfqLine = $locked->lines->firstWhere('id', (int) $rfqLineId);
                abort_unless($rfqLine, 422, 'An award line does not belong to this RFQ.');
                $total = $lineAllocations->sum('awarded_quantity');
                abort_if($total > $rfqLine->required_quantity, 422, 'Awarded quantity exceeds the approved requirement.');
                abort_if(! $locked->split_awards_allowed && $lineAllocations->count() > 1, 422, 'This RFQ does not permit split awards.');
                abort_if(! $locked->partial_offers_allowed && $total !== $rfqLine->required_quantity, 422, 'This RFQ requires full quantity coverage.');
                foreach ($lineAllocations as $allocation) {
                    $revision = SupplierBidRevision::with(['bidLine.quotation.supplier.approvedApplication.attachments','bidLine.evaluation'])->lockForUpdate()->findOrFail($allocation['supplier_bid_revision_id']);
                    abort_unless($revision->status === 'ACTIVE' && $revision->bidLine->rfq_line_id === $rfqLine->id && $revision->bidLine->evaluation?->mandatory_passed && $revision->bidLine->evaluation->supplier_bid_revision_id === $revision->id, 422, 'Awards require the active revision to have a current passing evaluation.');
                    $supplier = Supplier::query()->lockForUpdate()->findOrFail($revision->bidLine->quotation->supplier_id);
                    $this->assertAwardEligible($supplier, $rfqLine->category);
                    abort_if($allocation['awarded_quantity'] > $revision->offered_quantity, 422, 'Award quantity exceeds supplier offered capacity.');
                    $best = SupplierBidRevision::where('status','ACTIVE')->whereHas('bidLine',fn($query)=>$query->where('rfq_line_id',$rfqLine->id)->whereHas('evaluation',fn($evaluation)=>$evaluation->where('mandatory_passed',true)))->min('unit_price');
                    if ($best !== null && $this->moneyCents($revision->unit_price) > $this->moneyCents($best) && ! filled($allocation['override_reason'] ?? null)) throw ValidationException::withMessages(['lines'=>['Selecting a higher-priced qualified bid requires an override reason.']]);
                    $award->lines()->create(['rfq_line_id'=>$rfqLine->id,'supplier_id'=>$supplier->id,'supplier_bid_revision_id'=>$revision->id,'awarded_quantity'=>$allocation['awarded_quantity'],'awarded_unit_price'=>$revision->unit_price,'evaluation_snapshot'=>['evaluation'=>$revision->bidLine->evaluation->toArray(),'approved_criteria'=>$locked->evaluation_criteria??[],'performance_policy'=>'SupplierPerformanceService score when sufficient history exists; otherwise authorized evaluator assessment','override_reason'=>$allocation['override_reason']??null]]);
                }
            }
            $covered = $award->lines()->sum('awarded_quantity'); $required = $locked->lines->sum('required_quantity');
            abort_if($validated['outcome'] === 'FULL_AWARD' && $covered !== $required, 422, 'A full award must cover every required quantity.');
            abort_if($validated['outcome'] === 'PARTIAL_AWARD' && $covered >= $required, 422, 'A partial award must leave an unawarded quantity.');
            SupplierBidLine::whereHas('quotation',fn($query)=>$query->where('rfq_id',$locked->id))->whereIn('status',['SUBMITTED','QUALIFIED'])->update(['status'=>'UNSUCCESSFUL']);
            $winnerRevisionIds = $award->lines()->pluck('supplier_bid_revision_id');
            SupplierBidLine::whereHas('revisions',fn($query)=>$query->whereIn('id',$winnerRevisionIds))->update(['status'=>'AWARDED']);
            foreach (SupplierQuotation::where('rfq_id',$locked->id)->with('lines')->lockForUpdate()->get() as $quotation) $quotation->update(['status'=>$quotation->lines->contains('status','AWARDED')?'AWARDED':'UNSUCCESSFUL']);
            $locked->update(['status'=>in_array($validated['outcome'],['NO_AWARD','REBID'],true)?Rfq::NO_AWARD:($covered===$required?Rfq::AWARDED:Rfq::PARTIALLY_AWARDED)]);
            AuditLogger::success('RFQ_AWARD_APPROVED',AuditLogger::MODULE_PROCUREMENT,['actor'=>$request->user(),'resource'=>$award,'resource_label'=>$award->award_number,'details'=>$validated['justification'],'metadata'=>['outcome'=>$validated['outcome']]]);
            return $award->load(['lines.rfqLine','rfq']);
        }, 3);
        if ($award->wasRecentlyCreated) $this->notifyResults($award);
        return response()->json(['data'=>$award], 201);
        } catch (Throwable $exception) {
            AuditLogger::failure('RFQ_AWARD_APPROVAL_REJECTED',AuditLogger::MODULE_PROCUREMENT,[
                'actor'=>$request->user(),'resource'=>$rfq,'resource_label'=>$rfq->rfq_number,
                'details'=>$this->awardRejectionDetail($exception),'metadata'=>['rejection_category'=>$this->awardRejectionCategory($exception),'requested_outcome'=>$request->input('outcome')],
            ]);
            throw $exception;
        }
    }

    private function assertAwardEligible(Supplier $supplier, ?string $category): void
    {
        abort_unless($supplier->status === Supplier::STATUS_ACTIVE && $supplier->accreditation_status === 'ACTIVE', 422, "Supplier {$supplier->supplier_code} is not active and accredited.");
        abort_unless($supplier->accreditation_expires_on && ! $supplier->accreditation_expires_on->lt(today()), 422, "Supplier {$supplier->supplier_code} accreditation is missing or expired.");
        $categories = collect(explode(',', (string) $supplier->supply_category))->map(fn($value)=>mb_strtoupper(trim($value)))->filter();
        abort_unless($categories->contains(mb_strtoupper((string) $category)), 422, "Supplier {$supplier->supplier_code} is not accredited for this category.");
        $application = SupplierApplication::query()->where('approved_supplier_id',$supplier->id)->where('status',SupplierApplication::STATUS_APPROVED)->lockForUpdate()->first();
        abort_unless($application, 422, "Supplier {$supplier->supplier_code} has no approved accreditation application.");
        $documents = SupplierApplicationAttachment::query()->where('supplier_application_id',$application->id)->where('is_current',true)->lockForUpdate()->get();
        foreach ([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE,SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT] as $type) {
            $valid = $documents->where('attachment_type',$type)->contains(fn($document)=>$document->verification_status===SupplierApplicationAttachment::STATUS_VERIFIED && ! $document->expires_on?->lt(today()));
            abort_unless($valid, 422, "Supplier {$supplier->supplier_code} has no current verified {$type}.");
        }
    }

    private function notifyResults(SupplierAward $award): void
    {
        $quotations = SupplierQuotation::where('rfq_id',$award->rfq_id)->with(['supplier.authorizedUsers','rfq'])->get();
        foreach ($quotations as $quotation) {
            $won = $quotation->status === 'AWARDED';
            $rebid = $award->outcome === 'REBID';
            WorkflowNotificationSender::send($quotation->supplier->authorizedUsers, new WorkflowNotification(
                $won ? 'Supplier Award Approved' : ($rebid ? 'RFQ Rebid Decision' : 'RFQ Result Available'),
                $won ? "Your quotation received an authorized award for {$quotation->rfq->rfq_number}." : ($rebid ? "Procurement concluded {$quotation->rfq->rfq_number} without an award and will issue a new bidding opportunity if requirements continue." : "Your quotation for {$quotation->rfq->rfq_number} was not selected."),
                $won ? 'success' : 'info', $award->award_number, 'Supplier Bidding', ['rfq_id'=>$award->rfq_id,'award_id'=>$award->id,'quotation_id'=>$quotation->id,'decision'=>$award->outcome]
            ));
        }
    }

    private function bid(SupplierBidLine $bid, array $performance, Rfq $rfq): array
    {
        $revision = $bid->activeRevision;
        $active = $revision?->only(['id','revision_number','unit_price','offered_quantity','lead_time_days','delivery_available_on','submitted_at']);
        if ($active) $active['total_offered_amount'] = $this->lineTotal((string) $revision->unit_price, (int) $revision->offered_quantity);
        $evaluation = $bid->evaluation?->toArray();
        if ($evaluation) $evaluation['finding_codes'] = collect($bid->evaluation->mandatory_results ?? [])->keys()->filter(fn ($key) => str_starts_with((string) $key, 'finding_'))->map(fn ($key) => substr((string) $key, 8))->values()->all();

        return [
            'id'=>$bid->id,'quotation_number'=>$bid->quotation->quotation_number,
            'supplier'=>['id'=>$bid->quotation->supplier->id,'supplier_code'=>$bid->quotation->supplier->supplier_code,'name'=>$bid->quotation->supplier->name,'accreditation_status'=>$bid->quotation->supplier->accreditation_status],
            'line'=>$bid->rfqLine->only(['id','product_name','category','unit','required_quantity']),
            'active_revision'=>$active,'revision_count'=>$bid->revisions->count(),'status'=>$bid->status,
            'revisions'=>$bid->revisions->sortByDesc('revision_number')->take(25)->map(fn (SupplierBidRevision $row)=>[
                ...$row->only(['id','revision_number','unit_price','offered_quantity','lead_time_days','delivery_available_on','submitted_at','status']),
                'total_offered_amount'=>$this->lineTotal((string) $row->unit_price, (int) $row->offered_quantity),
            ])->values(),
            'revision_history_truncated'=>$bid->revisions->count()>25,
            'evaluation'=>$evaluation,'performance'=>$performance,
            'compliance_checks'=>$this->complianceChecks($bid, $rfq),
        ];
    }
    private function complianceChecks(SupplierBidLine $bid, Rfq $rfq): array
    {
        $supplier = $bid->quotation->supplier;
        $results = collect($bid->evaluation?->mandatory_results ?? []);
        $application = $supplier->approvedApplication;
        $documents = $application?->attachments ?? collect();
        $validAccreditation = $supplier->status === Supplier::STATUS_ACTIVE
            && $supplier->accreditation_status === 'ACTIVE'
            && $supplier->accreditation_expires_on
            && ! $supplier->accreditation_expires_on->lt(today());
        $validDocuments = $application?->status === SupplierApplication::STATUS_APPROVED
            && collect([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE,SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT])->every(
                fn ($type) => $documents->where('attachment_type',$type)->contains(fn ($document) => $document->is_current && $document->verification_status === SupplierApplicationAttachment::STATUS_VERIFIED && ! $document->expires_on?->lt(today()))
            );
        $categories = collect(explode(',', (string) $supplier->supply_category))->map(fn ($value) => mb_strtoupper(trim($value)))->filter();
        $categoryEligible = ! filled($bid->rfqLine->category) || $categories->contains(mb_strtoupper((string) $bid->rfqLine->category));
        $quantityValid = $bid->activeRevision && $bid->activeRevision->offered_quantity > 0
            && ($rfq->partial_offers_allowed || $bid->activeRevision->offered_quantity >= $bid->rfqLine->required_quantity);
        $system = [
            ['key'=>'system_accreditation','label'=>'Supplier accreditation is active and unexpired','source'=>'SYSTEM','status'=>$validAccreditation?'PASSED':'FAILED','detail'=>$validAccreditation?'Verified from the supplier account.':'The supplier account is inactive, unaccredited, or expired.'],
            ['key'=>'system_documents','label'=>'Required accreditation documents are current and verified','source'=>'SYSTEM','status'=>$validDocuments?'PASSED':'FAILED','detail'=>$validDocuments?'Verified business registration and permit are current.':'Required verified documents are missing or expired.'],
            ['key'=>'system_category','label'=>'Supplier is accredited for the RFQ category','source'=>'SYSTEM','status'=>$categoryEligible?'PASSED':'FAILED','detail'=>$categoryEligible?'Category eligibility verified.':'Supplier category does not cover this RFQ line.'],
            ['key'=>'system_quantity','label'=>'Offered quantity satisfies the RFQ quantity rules','source'=>'SYSTEM','status'=>$quantityValid?'PASSED':'FAILED','detail'=>$quantityValid?'Quantity is valid under the approved partial-offer setting.':'Offered quantity does not satisfy the approved RFQ rules.'],
        ];
        $manualLabels = collect($rfq->mandatory_compliance ?? [])->filter(fn ($label) => filled($label))->values();
        if ($manualLabels->isEmpty()) $manualLabels = collect(['Product specification matches the RFQ requirement','Delivery terms are acceptable']);
        $manual = $manualLabels->map(fn ($label,$index) => [
            'key'=>"manual_{$index}",'label'=>(string)$label,'source'=>'MANUAL',
            'status'=>$this->mandatoryStatus($results->get("manual_{$index}")),'detail'=>'Admin review required against the quotation and supporting evidence.',
        ]);
        return collect($system)->concat($manual)->values()->all();
    }
    private function mandatoryStatus(mixed $value): string
    {
        if ($value === true) return 'PASSED';
        if ($value === false) return 'FAILED';
        return in_array($value, ['PASSED','FAILED','NEEDS_VERIFICATION'], true) ? $value : 'NEEDS_VERIFICATION';
    }
    private function findingLabels(): array
    {
        return [
            'MANDATORY_QUALIFIED'=>'Meets mandatory supplier qualification',
            'SPECIFICATION_COMPLIANT'=>'Product specifications compliant',
            'QUANTITY_SATISFIED'=>'Quantity requirement satisfied',
            'DELIVERY_ACCEPTABLE'=>'Delivery terms acceptable',
            'PRICE_WITHIN_LIMITS'=>'Price complies with approved limits',
            'EVIDENCE_INCOMPLETE'=>'Supporting evidence incomplete',
            'MANDATORY_FAILED'=>'Mandatory requirement failed',
            'VERIFICATION_REQUIRED'=>'Additional verification required',
        ];
    }
    private function validateFindings(array $codes, array $mandatoryResults): void
    {
        $positive = collect($codes)->intersect(['MANDATORY_QUALIFIED','SPECIFICATION_COMPLIANT','QUANTITY_SATISFIED','DELIVERY_ACCEPTABLE','PRICE_WITHIN_LIMITS'])->isNotEmpty();
        $negative = collect($codes)->intersect(['EVIDENCE_INCOMPLETE','MANDATORY_FAILED','VERIFICATION_REQUIRED'])->isNotEmpty();
        if ($positive && $negative) throw ValidationException::withMessages(['finding_codes'=>['Qualification findings cannot contain both qualified and unresolved or failed conclusions.']]);
        $hasFailure = collect($mandatoryResults)->contains('FAILED');
        $hasPending = collect($mandatoryResults)->contains('NEEDS_VERIFICATION');
        if (($hasFailure || $hasPending) && in_array('MANDATORY_QUALIFIED',$codes,true)) throw ValidationException::withMessages(['finding_codes'=>['The supplier cannot be marked qualified while mandatory checks are failed or awaiting verification.']]);
        if ($hasFailure && ! in_array('MANDATORY_FAILED',$codes,true)) throw ValidationException::withMessages(['finding_codes'=>['A failed mandatory check requires the mandatory-requirement-failed finding.']]);
        if ($hasPending && collect($codes)->intersect(['EVIDENCE_INCOMPLETE','VERIFICATION_REQUIRED'])->isEmpty()) throw ValidationException::withMessages(['finding_codes'=>['Checks awaiting verification require an incomplete-evidence or additional-verification finding.']]);
        if (! $hasFailure && in_array('MANDATORY_FAILED',$codes,true)) throw ValidationException::withMessages(['finding_codes'=>['A mandatory-failure finding requires at least one failed mandatory check.']]);
    }
    private function qualificationNarrative(array $codes, ?string $comments): string
    {
        $labels = $this->findingLabels();
        $summary = collect($codes)->map(fn ($code) => $labels[$code])->implode('; ').'.';
        return filled($comments) ? $summary.' Additional remarks: '.trim($comments) : $summary;
    }
    private function lineTotal(string $unitPrice, int $quantity): string { $cents=$this->moneyCents($unitPrice)*$quantity;return intdiv($cents,100).'.'.str_pad((string)($cents%100),2,'0',STR_PAD_LEFT); }
    private function isPerformanceCriterion(string $name): bool { $normalized=mb_strtolower($name);return collect(['performance','history','track record','delivery record'])->contains(fn($term)=>str_contains($normalized,$term)); }
    private function moneyCents(string|int|float $value): int { [$whole,$decimal]=array_pad(explode('.',(string)$value,2),2,'');return ((int)$whole*100)+(int)str_pad($decimal,2,'0'); }
    private function awardRejectionCategory(Throwable $exception): string { $message=mb_strtolower($exception->getMessage());$status=method_exists($exception,'getStatusCode')?$exception->getStatusCode():null;return match(true){str_contains($message,'accredit')=>'ACCREDITATION_INELIGIBLE',str_contains($message,'verified')||str_contains($message,'document')=>'DOCUMENT_INELIGIBLE',str_contains($message,'active revision')||str_contains($message,'bid revision')=>'INVALID_BID_REVISION',str_contains($message,'quantity')=>'INVALID_AWARD_QUANTITY',str_contains($message,'already exists')||str_contains($message,'idempotency')=>'DUPLICATE_OR_CONFLICTING_APPROVAL',$status===403=>'UNAUTHORIZED',str_contains($message,'deadlock')||str_contains($message,'lock')=>'TRANSACTION_CONFLICT',default=>'VALIDATION_REJECTED'}; }
    private function awardRejectionDetail(Throwable $exception): string { $category=$this->awardRejectionCategory($exception);return in_array($category,['TRANSACTION_CONFLICT','VALIDATION_REJECTED'],true)?"Award approval rejected: {$category}.":$exception->getMessage(); }
}
