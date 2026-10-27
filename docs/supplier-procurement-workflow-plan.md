# Supplier Procurement Workflow: AS-IS and TO-BE

Date: 2026-10-22

## AS-IS

- Public supplier applications are persisted through a four-step React form and `POST /api/supplier-applications`.
- Applications have duplicate-active-email protection, private attachments, correction resubmission with replacement history, applicant portal access, event history, meeting-slot selection, meeting evaluation, and an Admin final decision.
- Approval is transactional and retry-safe: it locks the application, requires a completed meeting, creates or links one canonical `suppliers` row, and records the approving actor and decision time.
- The applicant portal is temporary application tracking. It is not an authenticated account for an approved supplier.
- Replenishment requests progress from Plant Manager submission to Admin approval and then to the existing Purchase Order workflow.
- Purchase Orders are linked to a replenishment request and canonical supplier. Receiving, discrepancies, QA inspection, and accepted inventory updates are already separate operational stages.
- Supplier performance is calculated from terminal POs, receiving, discrepancy, and QA data with configurable weights and a minimum-history rule.
- Public Product Display is a separate publication record for the sales/showcase catalog.

## Missing or partial

- No RFQ, RFQ-line, publication-policy, bid/revision, evaluation, or award persistence exists.
- Replenishment approval has no explicit Direct Purchase versus Competitive Bidding sourcing decision.
- No public procurement publication endpoint exists; the current public product endpoint is intentionally a sales/showcase concern.
- Approved suppliers do not receive a supplier-specific account invitation and cannot authenticate to an operational supplier portal.
- Application attachments do not yet have per-document verification state, validity dates, reviewer, or correction reason.
- Meeting records cover the checklist and recommendation but not the full attendance/reschedule/no-show policy model.
- Purchase Orders do not link to an award and suppliers cannot acknowledge them through an authenticated supplier account.
- Performance is computed on demand rather than persisted as a versioned summary/tier history.

## TO-BE ownership

- Supplier/Vendor Management owns applications, document verification, meetings, accreditation, supplier master data, supplier users, compliance, and performance/reward history.
- PSM owns sourcing decisions, RFQs, RFQ lines/publications, bids and immutable revisions, evaluations, and awards.
- Purchase Order Management remains the PO system of record and consumes an approved award idempotently.
- Supplier Portal exposes only the authenticated supplier's eligible RFQs, bids, awards, POs, delivery updates, and performance.
- Warehouse/QA/DTRS remain authoritative for receipt, inspection, logistics evidence, and inventory-affecting events.

## Target workflow

1. An approved replenishment requirement receives a sourcing method: direct purchase or competitive bidding.
2. Competitive bidding creates a private draft RFQ linked to that requirement; approval and publication are separate actions.
3. A publication record exposes only explicitly approved fields. Time-based status is enforced on the server.
4. A visitor may retain RFQ-line interests while applying, but interests are never bids.
5. Approval creates/links the supplier master. A separate expiring, single-use invitation activates an authorized supplier user.
6. An active, accredited, category-eligible supplier submits a quotation batch with per-line offers. A transaction and row lock enforce the live ceiling/decrement and deadline; revisions are append-only.
7. Procurement evaluates mandatory compliance and weighted criteria, then an authorized approver records full, split, or no award.
8. Approved award lines generate POs idempotently through existing PO authorization. Split awards generate supplier-specific POs.
9. Supplier acknowledgment and shipment updates do not modify approved commercial terms.
10. Existing receiving and QA events update inventory and feed versioned supplier performance summaries.

## State separation

- Application: existing states retained initially; add withdrawn/closed only with explicit transitions.
- Accreditation: active, under compliance review, suspended, expired, revoked.
- Supplier account: invitation pending, active, disabled, invitation expired.
- RFQ: draft, pending approval, scheduled, open, closed, under evaluation, awarded, partially awarded, no award, cancelled.
- Bid line/revision: submitted, superseded, valid, disqualified, awarded, unsuccessful, withdrawn where policy permits.

## Implementation impact map

### Phase 2

- Extend supplier-application attachments with verification metadata and replacement lineage.
- Add supplier accreditation and supplier authorized-user/invitation records without changing internal employee authentication semantics.
- Extend Admin application decisions and mail/audit handling.

### Phase 3

- Add sourcing-method fields to replenishment requests.
- Add RFQ, RFQ line, publication, and amendment records plus Admin/public APIs.
- Add the PSM RFQ UI and a distinct Open Supply Needs landing-page section.

### Phase 4

- Add quotation headers, bid lines, immutable revisions, evaluations, and awards.
- Add supplier-scoped middleware/policies and the authenticated supplier portal.

### Phase 5

- Add award linkage/idempotency keys to POs, supplier acknowledgment, and permitted shipment updates.
- Persist performance snapshots, tiers, overrides, and audit history while continuing to derive metrics only from verified operations.

## Critical invariants

- Public Product Display and procurement publication remain independent.
- Monetary values use fixed-precision decimals; comparisons occur inside database transactions.
- Server time controls opening and closing. Client state is advisory only.
- Supplier, application, accreditation, and account statuses are independent.
- A bid never changes stock; an award never bypasses PO approval; a PO never changes stock before accepted receiving/QA.
- Public and competitor-facing responses never contain supplier identity, private files, full quotations, evaluations, or internal budgets.
- Every approval, correction, publication, bid revision, award, PO generation, receipt, QA result, and performance change is attributable and auditable.

## Delivery risk and sequencing note

The working tree already contains overlapping uncommitted changes in procurement, product, route, landing-page, logistics, and test files. Those changes are treated as user-owned. New work should be committed in narrow phases and merged into those shared files only after reviewing their current diff, with focused regression tests after each phase.
