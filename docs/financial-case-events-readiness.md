# Financial case-event readiness

Status: **internal preparation implemented; all external case-event contracts pending**.

This document covers Excess Delivery, QA Rejected Items and Receiving Discrepancies. The working Financial PO intake and the separate AP/disbursement integration are unchanged. This is not an agreement with Financial and does not authorize external transmission.

## A. Authoritative source workflows

### Excess Delivery

`ExcessDeliveryReview`, `ExcessDeliveryReviewItem` and `ExcessDeliveryDocument` are populated by `ExcessDeliveryReviewController`. The physical Receiving has separate authorized and held ReceivingItem rows. The review item stores the PO balance and actual delivery snapshot; do not add the held portion to available stock.

Existing statuses include `PENDING_REVIEW`, `DOCUMENTATION_REQUESTED`, `DOCUMENTATION_SUBMITTED`, `AWAITING_FINANCIAL_RECONCILIATION`, `APPROVED_FOR_QA`, `REJECTED_RETURN_REQUIRED`, `RETURN_IN_PROGRESS`, and `RETURNED_TO_SUPPLIER`. Admin review and the existing QA, supplier-return and Stock In rules own these transitions.

The preparation handoff is an Admin-reviewed `AWAITING_FINANCIAL_RECONCILIATION` case with a recorded review reason. Preparation does not lift its hold or decide whether it is chargeable. `cost_resolution` remains its actual nullable source value. Historical PO unit prices are context, not authorization to bill excess.

### QA Rejected Items

`SupplierRejectionWorkflow::syncInspection()` / `syncCompleted()` create one `SupplierRejectionCase` per positive rejected `QaInspectionItem` after QA completion. Source relationships are case → inspection item → inspection/ReceivingItem → Receiving → original PurchaseOrder.

`AdminSupplierRejectionController` retains the independent supplier report lifecycle: `PENDING_REVIEW` → `SENDING` → `SENT` or `FAILED`, with existing ambiguous-send reconciliation. Existing replacement routing uses `REPLACEMENT_PENDING`; existing resolution uses `RESOLVED`.

A Financial notice does not change those states, send email, create replacement Receiving, or resolve the case. Completed, reconciled QA quantities and a recorded reason are needed for source readiness. Resolved cases are held as historical records. Email may be SENDING/SENT/FAILED independently of Financial readiness.

### Delivery Discrepancies

`ReceivingController` automatically creates an aggregate `ReceivingDiscrepancy` when a receipt leaves outstanding PO quantities. `ExcessDeliveryReviewController::recordMixedShortage()` can also create an aggregate for mixed deliveries. `ReceivingDiscrepancyController` manages supplier contact/response/closure. States include `REPORTED`, `SUPPLIER_CONTACTED`, `AWAITING_SUPPLIER_RESPONSE`, `AWAITING_BALANCE_DELIVERY`, `UNDER_RESOLUTION`, `RESOLVED`, and `CLOSED_WITH_SHORTAGE`.

**Existing records cannot prove that a specific delivery was short rather than a planned partial shipment.** There is no shipment-plan/current-delivery expectation or per-product/unit shortage allocation. Even a supplier's WILL_NOT_FULFILL response or final balance closure does not reconstruct the original shipment agreement. These records are always source-held for this integration. Their recorded aggregate balance is exposed as an unvalidated draft, never asserted as a confirmed shipment shortage.

## B. Exact field mapping

### Shared envelope

- `schema_version`: SmartChain internal `1.0`; `source_system`: `SMARTCHAIN`. Neither defines a Financial request contract.
- `event_type`: internal `EXCESS_DELIVERY`, `QA_REJECTED_ITEMS`, or `DELIVERY_DISCREPANCY`.
- `event_id`: deterministic `smartchain:financial:{event_type}:{case_primary_key}:v1`. Repeated previews do not allocate new IDs or records. It identifies this source event; changed content changes the preview hash, not its identity.
- `external_reference_id`: excess `reference`; rejection `SupplierRejectionWorkflow::reference()` (`RJ-%06d`); discrepancy `receiving_discrepancies:{id}` because no dedicated source reference exists.
- `purchase_order_reference`: related `PurchaseOrder.po_number`, including historical numbers. Do not require its current status to still be Approved after physical Receiving.
- `financial_reference`: `PurchaseOrder.financialSubmission.financial_reference` only when that submission is ACKNOWLEDGED; otherwise null. This is the **PO** reference, not a case receipt.
- `supplier.supplier_id`, `supplier_code`, `name`: original PO supplier resolved through existing `PurchaseOrderSupplier::resolve()`. Ambiguous/missing identities hold readiness. No backfill or supplier mutation is performed. Receiving's free-text supplier snapshot is not used as authority. A case's explicit supplier ID must agree with the resolved supplier.
- `receiving_reference`: authoritative `Receiving.receiving_no`, with a matching PO link required.
- `occurred_at`: excess `created_at`, QA rejection inspection `completed_at`, or discrepancy `reported_at`, formatted ISO 8601. Missing event dates remain invalid; current time is not substituted.

### Excess details

- `case_status`, `review_reason`, `cost_resolution`, `financial_reconciliation_status`, `supplier_confirmation_reference`, `reviewed_at`: the corresponding review columns (`review_reason` comes from `review_notes`).
- `currency`: related PO currency, preserving null when absent.
- Each line maps `ExcessDeliveryReviewItem.id`, `purchase_order_item_id`, `product_id`, canonical `unit`, `po_remaining_quantity`, `actual_delivered_quantity`, `authorized_quantity`, and `excess_quantity`.
- Output names explicitly distinguish `original_ordered_quantity` (PO line), `po_remaining_quantity_at_receipt`, `actual_delivered_quantity`, `authorized_quantity`, and `confirmed_excess_quantity`.
- `product_name`, `qa_status`: held ReceivingItem, or authorized ReceivingItem for a contextual line with zero excess.
- `historical_po_unit_price`, `agreement_reference`: original PurchaseOrderItem values. Decimal prices stay exact two-place strings; no float calculation or extra charge is created.
- Validation checks PO/product/Receiving identities, units without conversion, positive original order quantity, authorized/held physical rows, balance reconciliation, and at least one positive excess line. Missing Admin review/reason or required evidence holds readiness.

### Rejection details

- `case_status`, `resolution_request`, `resolution_notes`: case status, actual nullable `resolution_type`, and notes. No Financial decision enum is inferred.
- `qa_inspection_id`, `qa_cycle_number`, `rejection_date`: related QaInspection ID, cycle and completed_at. `inspection_result`, `rejection_reason`, `rejected_quantity`: QaInspectionItem result, remarks and quantity.
- `product_id`, `product_name`, `purchase_order_line_id`, `delivered_quantity`, `unit`: the inspected ReceivingItem; no quantity conversion.
- `supplier_notification.state` and `sent_at`: factual source case state and supplier-email timestamp. These do not populate Financial transport status.
- Validation requires a completed Partial/Rejected inspection, positive rejected quantity, accepted + rejected = delivered, product identity, matching Receiving and any available PO-line identity/unit, reason and evidence. Legacy absent PO-line links remain null; they are not fabricated.

### Discrepancy draft details

- `case_status`, `discrepancy_type`, `supplier_response_code`, `response_notes`, `resolution_notes`: actual discrepancy columns.
- `recorded_aggregate.po_balance_expected`, `delivered`, `short_balance`: `expected_quantity`, `delivered_quantity`, `short_quantity`. Aggregate `unit` is null because source aggregates may mix units.
- `receiving_lines`: actual ReceivingItem IDs, PO-line/product IDs, names, delivered quantities, canonical units and linked PO ordered quantities, where known. These rows describe recorded Receiving portions; they are not inferred shipment shortages.
- `expected_current_delivery_quantity`, `shipment_classification`, per-line `previously_received_quantity`, and `confirmed_short_quantity`: null because the necessary authoritative source snapshots are absent. Both `shipment_confirmation` and `line_allocation` errors remain until the domain captures those facts.
- Recorded aggregate arithmetic is validated, but never promoted to a validated outbound shortage payload.

### Evidence

`ReceivingReceiptAttachment`, `QaInspectionAttachment` and `ExcessDeliveryDocument` remain the authoritative stores. The envelope carries only existing record/internal references, type, filename label, MIME type and source reference. QA evidence is from the case's actual inspection cycle, not simply the latest inspection on the Receiving.

No local storage paths, file hashes, bearer tokens, protected browser-session URLs or public file links are included. Existing report generation, export and private download authorization are unchanged. Financial cannot retrieve documents merely from these metadata references. Machine-to-machine evidence authentication/download and any signed-URL expiry must be agreed separately.

## C. Integration architecture and reuse

`FinancialCaseEventPayloadBuilder` reads authoritative source relations and produces a provisional envelope, source eligibility errors and content hash. `FinancialCaseEventService` applies authorization and returns consistent read-only previews. `FinancialCaseEventAdapter` is the explicit unmapped partner boundary: outbound mapping throws, default acknowledgment rejects all responses, and a final validator checks the correlation and nonempty reference/status of a future mapper's normalized receipt without applying business decisions.

The design reuses original PO supplier resolution, Financial PO reference relationships, Laravel validation/JSON response conventions, active-session authorization and the existing case screens. It follows the PO adapter's distinction between payload construction and acknowledgment interpretation. It does not refactor or retarget the successful PO adapter, its configured endpoint, authentication headers, timeout behavior, retries, snapshots or attempts.

There is no second generic HTTP integration framework. No case-event HTTP client, endpoint setting, send route or background sender exists. Existing `financial.enabled`, `financial.contract_confirmed` and disbursement flags cannot activate this operation. `submit()` rejects Admin calls with a contract-pending validation error and rejects unauthorized roles. No unconfirmed partner statuses are accepted.

No new operational tables or migrations are needed for read-only preparation. The preview hash is **not** a durable snapshot or send audit log; previews deliberately do not create attempts or successful transmissions. Once sending is approved, reuse the existing PO service's immutable-snapshot/attempt patterns in separate case-event records. Do not reuse PO/AP rows or supplier-email status columns for case transmission. Durable tracking and an agreed ambiguity/retry policy are mandatory before introducing any transport; this is an activation dependency, not a claim that live tracking is already implemented.

## D. Provisional examples

See `financial-case-events.examples.json`. All examples are **synthetic documentation fixtures**, using the implemented SmartChain field names. They are NOT YET PARTNER-APPROVED and are not real operational records, successful exchanges or endpoint contracts. The discrepancy example is intentionally source-held.

The API always labels `contract_status=CONTRACT_PENDING`, `transport_status=NOT_SUBMITTED`, `can_submit=false`. `source_ready=true` means internal preparation passed, not that transmission or commercial approval occurred. `financial_event_reference` and `external_status` remain null.

## E. Readiness

- Excess: validated internal payload preparation is available for Admin-reviewed Financial-hold cases with reconciled authoritative lines, identities and evidence. Draft/ordinary unreviewed cases remain held.
- Rejected Items: validated internal preparation is available for unresolved completed QA rejections with reconciled quantities, reason, identities and evidence. Supplier-email state is independent.
- Discrepancies: internal draft and precise missing-data reporting are available. No existing aggregate-only discrepancy can be declared ready as a confirmed shipment shortage. Capturing shipment classification/expected delivery and confirmed per-line quantities is additional domain work requiring approval.
- All three: live mapping, transmission, partner receipt persistence and status retrieval remain unavailable pending confirmed contracts and transport implementation. No new migration is required for this preparation.

## F. Information Financial must provide

1. Separate accepted event operations, exact HTTPS hosts/paths/methods/version and sandbox credentials. Explicitly confirm event intake rather than PO intake or AP/disbursement.
2. Authentication scheme, required header names, credential scopes/rotation, environment identity and rate limits. Existing PO API-key conventions must not be assumed to apply.
3. Request schemas: required/nullable fields, source/supplier/product IDs, numeric/decimal formats, supported units/currency, line allocation, occurrence timestamps/timezone, business reason vocabulary and evidence metadata.
4. Success/error response schemas, HTTP status meanings, event-ID echo/correlation and partner case reference. Confirm receipt versus processing/decision semantics separately and supply actual status enums.
5. Idempotency-key scope and retention, changed-source revisions, duplicate response behavior, conflicts, timeout/5xx ambiguity, safe retries and reconciliation lookup. Do not assume PO retry guarantees cover case events.
6. One authoritative response-status mechanism: polling or authenticated callbacks, including correlation, signature/token validation, replay handling and terminal meanings.
7. Authenticated evidence exchange, document scopes, MIME/size limits, transfer/download ownership and link expiration. No browser-session or unrestricted-public-file fallback.
8. Which commercial decisions are advisory and which permit a separate authorized SmartChain action. No acknowledgment may automatically change Receiving/QA/inventory/PO/AP or close a source case.

## G. UI and authorization

The authenticated read-only endpoint is `GET /api/financial-case-events/{excess|rejection|discrepancy}/{id}/preview`. This is a SmartChain endpoint, not a guessed Financial URL. It returns private/no-store responses.

- Admin Purchase Orders: readiness within existing excess review details and each existing discrepancy section.
- Admin Rejected Items: readiness within existing case details, alongside the unchanged Send to Supplier actions.
- Plant Manager Receiving: readiness for the selected Receiving's excess/discrepancy case. Ownership follows existing submitted_by/prepared_by constraints. Other managers receive 404; QA/supplier roles cannot read these previews. Rejection-case previews remain Admin-only.
- Admin can inspect the internal draft through the endpoint. PM receives only references, readiness/errors and the disabled handoff status, not PO prices, Admin notes or QA evidence metadata.
- The section supports loading, errors, retry, case/status changes, request cancellation, responsive layout and existing light/dark styling. It contains a Refresh readiness action and no working Send to Financial button. Its requests cannot affect existing case action requests.

## H. Changed files

- `backend/app/Services/Financial/FinancialCaseEventPayloadBuilder.php`: source mapping, validation, evidence metadata and stable identity/hash.
- `backend/app/Services/Financial/FinancialCaseEventAdapter.php`: unmapped request/response boundary and normalized receipt validator.
- `backend/app/Services/Financial/FinancialCaseEventService.php`: read-only preparation, ownership/redaction and hard transmission gate.
- `backend/app/Http/Controllers/Api/FinancialCaseEventController.php`: private/no-store preview response.
- `backend/routes/api.php`: one authenticated GET route; prior unrelated and Customer Return changes preserved.
- `backend/tests/Feature/FinancialCaseEventReadinessTest.php`: isolated source/readiness/authorization/non-transmission and synthetic mapper tests.
- `frontend/src/components/financial/FinancialCaseReadiness.tsx`: shared informational section.
- `frontend/src/page/admin/PurchaseOrders.tsx`: excess and discrepancy section entry points.
- `frontend/src/page/admin/RejectedItems.tsx`: rejection case entry point.
- `frontend/src/page/plant-manager/Receiving Management.tsx`: owned excess/discrepancy entry points; prior changes preserved.
- `frontend/src/types/index.ts`: optional discrepancy field already supplied by the real Receiving API.
- This document and `docs/financial-case-events.examples.json`: internal contract handoff and synthetic examples.
- `output/financial-case-event-preflight.php`, generated XML test evidence, implementation verification report and ignored graph/build artifacts: validation support.

## I. Verification

Verification is covered by `backend/tests/Feature/FinancialCaseEventReadinessTest.php` and the existing Financial PO and obligation regression suites. Generated run reports remain local release evidence rather than repository dependencies. All database-writing tests use the repository's fail-closed TestCase guard for `testing`, PostgreSQL and `smartchain_test_db`. HTTP requests are mocked in tests; no live Financial credentials or requests are used.

## J. Preservation

Existing Financial PO and AP services, configuration, models and contracts are unchanged by case-event preparation. Receiving/QA decisions, supplier rejection mail/reconciliation/replacement, stock movement, PO pricing, supplier ownership rules, login/OTP and accreditation/bidding are unchanged by the preview. Preview code reads source records only. Case-event preparation performs no operational migration, reset, record mutation or deployment. A separately authorized development release may include these preview files without enabling partner transmission.

## K. Activation checklist

For **each** event: obtain the agreed contract and sandbox; implement and test its concrete mapping/strict acknowledgment schema; add separate durable immutable event snapshots and attempt history using the existing PO tracking pattern; require explicit Admin authorization and current source eligibility; implement only agreed authentication, timeout, retry and ambiguity reconciliation behavior; agree secure evidence exchange and status retrieval; then obtain separate deployment/migration approval and run joint sandbox Postman/end-to-end tests before enabling live traffic.

For **Excess**, retain the Admin hold and treat historical price as context until an authorized commercial decision follows the existing workflow. For **Rejected Items**, keep every Financial state independent of Send to Supplier and physical replacement/resolution. For **Discrepancies**, first capture/verify shipment expectations, planned-partial classification and canonical per-line confirmed shortages; do not activate existing aggregate drafts as shortage notices.

Turning on a configuration flag alone is insufficient. No event should be sent to `/purchase-orders` or `/request-disbursement` under this preparation.
