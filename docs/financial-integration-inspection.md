# SmartChain Financial Integration Inspection

**Inspection date:** 2026-10-19 (Asia/Manila)
**Scope:** repository inspection and partner handoff only; no application, migration, business-record, deployment, or live-message changes were made.
**Working terminology:** ?response ni client? is treated as **supplier response returned through Financial**, pending business confirmation. ?Approved? remains unresolved between **Financial processing approval**, **supplier acceptance**, or both; neither is the same as Admin approval or HTTP receipt.

## Executive finding

SmartChain already has a coherent local chain for replenishment request, Admin decision, PO creation, partial receiving, QA, stock-in, shortage tracking, supplier-item rejection, and replacement receiving. Raw Materials and Finished Products use the same request/PO path and carry `item_classification`; there is no second replenishment workflow.

The Financial integration does **not** exist. The action labelled **Send PO to Supplier** currently emails the PO PDF directly to the registered supplier. Shortage and rejection workflows also model direct Admin-to-supplier contact/email. No Financial-specific routes, services, configuration, credentials, delivery attempts, callbacks, polling, external references, event IDs, PO revisions, or Financial/supplier decision records were found. Therefore the confirmed destination requirement is an implementation mismatch, and end-to-end Financial exchange must not be represented as working.

The safest minimum future design is one versioned HTTPS push from SmartChain to Financial plus authenticated Financial callbacks to SmartChain. Polling should not also be built unless the teams reject callbacks.

## Evidence boundaries

- The five screenshots are UI observations only and were not correlated as a single transaction. Their product names and request/PO references were not joined.
- Receiving, QA, and integration conclusions below come from repository source, schema, and tests, not screenshots.
- Existing automated tests use isolated databases and mocked mail. They demonstrate intended local behavior, not connectivity to Financial.
- No secrets or live supplier/customer records were inspected or reproduced.
- The worktree already contained unrelated modified/untracked files. This inspection changed only the two Financial documentation files.

## Screenshot observations versus code

| Screenshot observation | Code evidence | Conclusion |
|---|---|---|
| PO is Admin-approved, has 5 KG ordered, 0 received, zero amounts, and ?Send PO to Supplier.? | `frontend/src/page/admin/PurchaseOrders.tsx` initializes linked PO lines with `unitPrice: 0` (lines 140-145, 161-172), calls `PATCH /purchase-orders/{id}/send` (395-405), and renders that label (775-783). `PurchaseOrderController::store` accepts `unit_price >= 0`, rounds to two decimals, and immediately creates status `Approved`. `send` resolves the supplier email and sends `PurchaseOrderMail`. | UI matches local behavior, but destination is the supplier?not Financial. Zero is accepted and indistinguishable from ?not priced.? Admin approval does not prove Financial receipt/approval. |
| Plant Manager candidates appear at or below 30 and can be forwarded. | `PlantManagerProcurementController::options` queries `available_stock <= 30`; `StockLevel::needsReplenishment` uses the same rule. Priorities are Critical at <=10 (including out-of-stock), High at 11-20, Medium at 21-30. | Implemented. Threshold is hard-coded, not partner-configured. |
| Pending Approval / Not Submitted and recent Completed activity appear. | Candidate detection does not create a request. `store`, `bulkStore`, and `submit` create/submit it. `index?scope=history` returns the five latest submitted records. `ReplenishmentLifecycle` marks the request `completed` when the linked PO is `Completed` **or** `Closed with Shortage`. | Implemented, but ?Completed? means local replenishment lifecycle terminal state; it can include a PO closed with shortage. Issue detail remains in discrepancy/rejection records, not the summary label. |
| Admin can Approve/Decline. | `AdminProcurementController::approve/decline` is policy-protected; only `pending` can be decided. Approval persists reviewer/time/decision and moves to `for_purchase_order`; decline moves to `rejected`. | Implemented and separate from all future Financial/supplier decisions. |
| ?For Purchase Order? and ?PO Created/Ordered? counts exist. | Summary counts come from request statuses; `awaitingPurchaseOrder()` excludes already-linked POs. PO creation uniquely consumes `replenishment_request_id` and sets `po_created`. | Implemented local counts only; they do not evidence transmission or acceptance by Financial/supplier. |

## Traceability matrix

| Step | File/symbol or schema evidence | Actual behavior | Status | Minimum gap |
|---|---|---|---|---|
| Detect replenishment | `PlantManagerProcurementController::options`; `StockLevel` | Assigned-warehouse inventory at <=30 is listed; no request is auto-created. | Implemented | Threshold remains local policy; no integration change needed. |
| Create/forward request | `PlantManagerProcurementController::store`, `bulkStore`, `submit`; `ReplenishmentRequestPolicy` | Plant Manager only, assigned warehouse only, integer qty 1..1,000,000, eligible inventory only. Transaction and row locks are used. | Implemented | None for partner exchange. |
| Prevent duplicate active request | `ensureNoOpenRequest`; `ReplenishmentRequest::ACTIVE_STATUSES` | Blocks another active request for same product+warehouse through `po_created`; terminal history permits a new cycle. | Implemented | Database has no matching composite unique constraint, so the lock strategy depends on warehouse-row serialization. |
| Admin review | `AdminProcurementController`; `ReplenishmentRequestPolicy` | Admin-only decision; pending request becomes `for_purchase_order` or `rejected`; audit and notifications recorded. | Implemented | Keep this status separate from Financial/supplier decisions. |
| Request-to-PO link | `PurchaseOrderController::store`; unique `purchase_orders.replenishment_request_id` | Approved request can create one PO; supplier must be ACTIVE; product names must exist. | Implemented | PO allows unlinked manual creation; contract must say whether such POs are eligible for Financial. |
| Supplier selection | `Product::activePrimarySupplier`; Admin PO form; `supplier_id` migration | Primary supplier is a suggestion. Admin selects an ACTIVE supplier; server snapshots supplier name and stores authoritative ID. | Implemented | Financial needs a stable shared supplier code/mapping, not SmartChain numeric ID alone. |
| Pricing and totals | `PurchaseOrders.tsx`; `PurchaseOrderController::store`; PO migrations | Admin manually enters unit price; linked line defaults to 0; server permits 0 and calculates decimal(14,2) totals. Currency, tax, line discount, quote state, and ?price pending? flag do not exist. | Partial | Decide price owner/readiness. Add explicit pricing state and currency before financially final submission; do not infer zero means missing. |
| PO approval | `PurchaseOrderController::store` | Creation itself sets PO `Approved` with current Admin as approver; no separate PO approval transition. | Partial | Clarify whether Admin approved request only, PO commercial data, or both. Preserve this as a local decision. |
| PDF | `PurchaseOrderController::pdf`; `PurchaseOrderPdf`; `PurchaseOrderSendTest` | Admin downloads the same generated PDF attached to outbound supplier mail. | Implemented locally | Financial contract should treat structured JSON as authoritative; document reference/transfer is optional and must be agreed. |
| ?Send PO to Supplier? | `PurchaseOrderController::send`; `PurchaseOrderSupplier`; `PurchaseOrderMail`; `PurchaseOrderSendTest` | Admin-only; resolves registered supplier; emails supplier via configured mail transport; marks `Sent to Supplier` only after mail call succeeds. | **Implementation mismatch** | Replace future action semantics with SmartChain?Financial submission, persist acknowledgment/external reference, and later relabel ?Send PO to Financial.? Do not reuse email acceptance as Financial acceptance. |
| Financial receipt/decision | No Financial code found in `backend` or `frontend/src` | No route, model, callback, polling, or manual Financial state. | Missing | Versioned submission and authenticated callback, with separate acknowledgment and business decision fields. |
| PO revision | PO schema/model/controller | `po_number` is unique but no revision/version, supersession, cancellation message, or immutable submitted snapshot exists. Resend repeats the same email. | Missing | Add `po_revision`, immutable payload hash, submission identity, and stale-response protection. |
| Receive delivery | `ReceivingController::store`; `ReceivingPurchaseOrderTest` | Plant Manager selects active PO; submitted item IDs must exactly match PO; deliveries cannot exceed remaining quantities; replacement receipts do not consume PO balance. | Implemented | Correlate each receiving and line in partner messages using stable line IDs. |
| Detect shortage | `ReceivingController::store` lines 346-469; `receiving_discrepancies` | Every receiving compares all current remaining PO quantities to quantities in this receipt. If less, one aggregate discrepancy is created per receiving. | Partial / rule defect for integration | It cannot distinguish an intentional partial shipment and can open a case prematurely. Case stores aggregate totals, not per-line shortage allocations. Business trigger and per-line issue data are required. |
| Follow-up shortage delivery | `ReceivingDiscrepancyController`; `ReceivingDiscrepancyTest` | Admin manually records supplier contact/response. Full cumulative receipt resolves all open PO shortage cases and links resolution receiving. | Partial | Route communications through Financial; avoid auto-resolving unrelated line-level cases; persist external case/event IDs. |
| QA inspection | `QaInspectionController::persistInspection`; `StockInController` | QA-only mutation; accepted+rejected must equal delivered on submit; only accepted quantities are stockable. Evidence is private local storage. | Implemented | Financial needs controlled evidence exchange (scoped download or upload), not internal paths. |
| Supplier rejection case | `SupplierRejectionWorkflow::syncInspection`; `supplier_rejection_cases` | One case per QA inspection item with rejected qty >0. Internal production QA uses separate production endpoints/models. | Implemented locally | Add Financial case/report exchange and source-type validation so only supplier-delivered items are reported. |
| Send rejection report | `AdminSupplierRejectionController::send`; `AdminSupplierRejectionTest` | Directly emails original PO supplier, with generated PDF; throttled/resend-aware locally. | **Implementation mismatch** | Submit case to Financial and record acknowledgment/response. Financial, not SmartChain, contacts supplier. |
| Replacement remedy | `SupplierRejectionWorkflow::routeToReceiving`, `completeReplacement`; replacement migration | Admin can create exactly one linked expected replacement receiving. Promise does not add stock; Plant Manager confirms delivery; normal QA/stock-in applies; full QA pass resolves original case. | Implemented locally, decision provenance partial | Model offered vs agreed remedy and who accepted it; Financial response should create/authorize expectation but never inventory. |
| Future-order discount | No procurement/rejection schema or service | Not represented. `NO_REPLACEMENT` is only free-text closure. | Missing | Add a single-use agreed-discount reference with supplier, value/type, conditions, validity, source case, and later application reference?without building accounting. |
| Authentication/reliability | Sanctum for browser routes; no Financial middleware/config | Machine integration absent. Existing Logistics integration demonstrates HMAC callback/idempotency patterns but is not wired to procurement. | Missing | Dedicated service credentials, TLS, request/event IDs, retries, replay protection, partner-scoped dedupe, monotonic transitions, audit trail. |

## Existing identifiers and limitations

| Concept | Existing stable value | Limitation / required future value |
|---|---|---|
| Source system | None persisted for procurement exchange | Contract constant such as `SMARTCHAIN`; Financial must return it. |
| Replenishment request | `replenishment_requests.id`, human `request_no` | Send human reference plus opaque SmartChain integration ID; partner must not rely on DB PK alone. |
| PO | `purchase_orders.id`, unique `po_number` | No revision. Add `po_revision` starting at 1 and define `(po_number, revision)` uniqueness externally. |
| PO line | `purchase_order_items.id` | Suitable as an opaque source line ID, but receiving calculations sometimes group by `product_name`; partner contract must use line ID. |
| Supplier | `suppliers.id`, `supplier_code`, name snapshot | Exchange `supplier_code` and agreed Financial mapping; do not expose internal ID as the only key. |
| Receipt/delivery | `receivings.id`, unique-looking human `receiving_no`, optional `reference_no` | Schema does not show a unique constraint on delivery reference; add integration correlation rules. |
| Receipt line | `receiving_items.id`, `purchase_order_item_id` | Good internal linkage when present; expose opaque receipt-line and PO-line references. |
| Inspection | `qa_inspections.id` | No public reference; add opaque source reference in messages. |
| Inspection line/rejection | `qa_inspection_items.id`; rejection `RJ-%06d` from case ID | Rejection reference is deterministic but not stored/versioned. Use it plus opaque case ID and event ID. |
| Shortage case | `receiving_discrepancies.id` | Aggregate per receipt, not per PO line; no durable formatted case reference or external ref. |
| Message/event | None for procurement | Required UUID/ULID `message_id`; unique per semantic message, retained across transport retries. |
| Financial reference | None | Financial must return `financial_reference` for PO/case and echo SmartChain correlation fields. |
| Remedy | Replacement represented indirectly by case+receiving; discount absent | Add immutable remedy ID/version and explicit OFFERED/AGREED/FULFILLED/APPLIED lifecycle. |

## PO data readiness

| Field | Meaning and format | Rule | Actual source/validation | Status |
|---|---|---|---|---|
| `po_number` | Human PO reference, string <=50 when supplied | Required externally | Generated `PO-YYYY-NNNN`, DB unique | Existing |
| `po_revision` | Submission revision, positive integer | Required for integration | No source | Proposed |
| `request_reference` | Originating replenishment request | Conditional; required when linked | `request_no`, `replenishment_request_id` | Existing/partial |
| `supplier_code` | Shared supplier identity | Required | Supplier has code; PO only presents ID/name today | Existing source, proposed payload |
| `supplier_contact` | Contact Financial may need | Conditional by partner agreement | Supplier email exists but current send uses it directly | Existing source; minimize payload |
| `delivery_location` | Warehouse/address/instructions | Required | Free-text `delivery_details`; linked UI pre-fills warehouse name | Existing, weak structure |
| `expected_delivery_date` | `YYYY-MM-DD` | Required, today or later at creation | Validated server-side | Existing |
| `po_line_id` | Stable line correlation | Required | `purchase_order_items.id` | Existing source, proposed payload |
| `product_id` / SKU | Stable catalog identity | Required shared mapping | Product ID stored; inventory barcode is not on PO line payload | Partial |
| `description` | Human item name | Required | Snapshot `product_name` | Existing |
| `classification` | `RAW_MATERIAL` / `FINISHED_PRODUCT` | Required for context | Snapshot `item_classification` | Existing |
| `quantity` | Whole positive number | Required; no conversions | Integer min 1 | Existing |
| `unit` | Catalog unit | Required | Product snapshot; active catalog rules expose PCS/SACK/DRUM while legacy/current records may retain other units such as KG. No integration conversion should be invented. | Existing |
| `unit_price` | Money, decimal string | Required only when pricing is final | Decimal(14,2), min 0; UI defaults 0 | Existing but readiness ambiguous |
| `line_total` | Quantity ? unit price | Required when priced | Server-calculated decimal(14,2) | Existing |
| `currency` | ISO 4217, e.g. `PHP` only if agreed | Required before financial finalization | UI formats PHP in places, but PO schema has no currency | Proposed; do not assume |
| taxes/discounts | Commercial adjustments | Conditional | Not supported on PO | Proposed only if Financial requires |
| `order_total` | Sum of line totals | Required when priced | Server-calculated decimal(14,2) | Existing |
| `pricing_status` | `DRAFT_UNPRICED` or `FINAL` | Required gate | No field | Proposed |
| `document_reference` | Optional immutable PDF/document locator/hash | Optional | PDF generated on demand; no durable document ID/hash | Proposed |

### Zero-price decision

Zero is currently valid input and cannot be distinguished from missing setup or a quote-pending draft. The repository does not identify who finalizes price. Until the business decides, SmartChain must not submit a zero-price PO as a financially finalized commitment. Minimum rule: an explicit `pricing_status`; `FINAL` requires agreed currency and partner-approved rule for zero-priced lines. Financial must state whether it accepts quote requests/drafts as a different message type. No fabricated price should be used.

## Shortage correctness assessment

The existing cumulative balance guard prevents over-receipt and replacement deliveries do not consume the normal PO balance. However, shortage creation uses:

`expectedNow = sum(all remaining PO lines)` and `shortNow = expectedNow - sum(this receipt)`.

Consequences:

1. An intentional partial delivery is automatically recorded as a shortage.
2. The discrepancy is aggregate and cannot identify each affected PO line.
3. A receipt containing only one scheduled line makes every other remaining line appear short unless business semantics say the receipt was intended to fulfill the entire balance.
4. Multiple receipt-level cases can describe overlapping outstanding quantities; final full receipt resolves all open cases, which is too broad for partner case correlation.

Before integration, add or agree an explicit delivery expectation: shipment/ASN reference with expected quantities per PO line, or a Plant Manager confirmation `report_as_shortage=true` with expected quantities for that delivery. A later shortage case must contain line allocations. Quantities should be derived once from the receipt expectation, and the same `issue_id` must be retried rather than recreated.

A receipt can have both shortage and QA rejection. The shortage quantity is ?expected for this delivery minus physically delivered?; rejection quantity is a subset of physically delivered. They must remain separate and must not be summed as though both were missing.

## Rejection and inventory safety

- QA validates accepted + rejected = delivered on final submission.
- Only `accepted_quantity` on Passed/Partial items is eligible for stock-in.
- A supplier rejection case is created only from completed inbound QA items with rejected quantity >0.
- Production QA is a separate workflow and must never emit supplier claims automatically.
- Evidence resides on the local disk and is returned only by authenticated, role/assignment-scoped endpoints with private/no-store headers. Internal `view_url` and storage paths are not Financial-accessible URLs.
- A replacement promise creates an expected receiving with delivered quantity 0. Inventory changes only after physical confirmation, QA, and stock-in.

## Remedy representation

Existing replacement handling safely separates expectation from receipt, but current Admin action is not backed by a recorded supplier/Financial offer or acceptance. Future minimum records should separate:

1. `OFFERED`: Financial reports supplier proposal; no stock or original PO mutation.
2. `AGREED`: authorized SmartChain role accepts the remedy; expected replacement receiving may be created once.
3. `FULFILLED`: actual replacement receiving passes normal QA; only accepted quantity can be stocked.
4. `APPLIED` (discount only): a later PO references the agreed discount once. This does not alter the original PO or inventory.

The existing `REPLACEMENT_PENDING`/linked receiving can support steps 2-3 after an integration record is added. Future-order discounts and ?more information requested? need new case/remedy states. Who may accept a remedy and close a case is a remaining business decision.

## Prioritized minimum future changes

### P0 ? contract and state safety

1. Confirm Financial/supplier decision meanings, price owner, zero-price policy, shortage trigger, remedy acceptor/closer, and evidence transfer.
2. Add Financial partner config/credentials, partner mapping, integration messages/attempts/events, external references, PO revision, and explicit separate state dimensions.
3. Implement structured `POST /financial-integration/v1/purchase-orders`, shortage reports, and rejection reports through one service/outbox path. Preserve message ID across retries.
4. Implement one authenticated callback endpoint with partner-scoped event dedupe, payload hash conflict detection, monotonic state transitions, and stale revision rejection.

### P1 ? business-data correctness

5. Add PO pricing readiness/currency and block financially-final submission when not ready.
6. Change shortage representation to per-delivery, per-PO-line expectations and affected quantities. Do not auto-dispute intentional partial delivery.
7. Add explicit remedy offers/agreements and single-use future-discount references. Reuse normal replacement receiving/QA/stock-in controls.

### P2 ? usability and operations

8. In a later UI task, rename the action to **Send PO to Financial**, display transport acknowledgment separately from Financial/supplier decisions, and show retryable failures without changing local approval.
9. Add an operations view for message attempts, callback history, reconciliation, and dead-letter/manual retry. Do not expose secrets or raw private evidence.

## Verification performed

- Read repository instructions, AgentMemory (no relevant prior observations), and one focused Graphify trace.
- Inspected relevant frontend handlers, Laravel routes/controllers/policies/models/support classes, migrations, mail transport path, attachment access, and Feature test coverage.
- Confirmed no `financial`/`finance` implementation references under application backend/frontend source.
- Reviewed existing tests by name and implementation where material. Tests were not rerun because this is documentation-only, no application code changed, and existing tests mock supplier mail rather than Financial connectivity.
- No full build, migration, live HTTP/mail, commit, push, or deployment was performed.
