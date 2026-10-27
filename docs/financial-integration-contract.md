# Proposed SmartChain ? Financial Integration Contract

**Status:** proposed handoff draft; not an existing or agreed API contract
**Version:** `v1` proposal
**Prepared:** 2026-10-19 (Asia/Manila)
**Host placeholders:** `https://financial.example` and `https://smartchain.example` must be replaced through controlled environment configuration.

## Responsibilities

### SmartChain owns

- Stock-based replenishment candidates and Plant Manager requests.
- Admin approval/decline and local PO records.
- Supplier selection snapshot, delivery destination, and locally captured pricing.
- Physical receiving, receipt evidence, QA, quarantine/rejection, stock-in, and inventory.
- Shortage/rejection evidence and internal audit trail.
- Ensuring a promise never changes inventory and a discount never silently changes the original PO.

### Financial owns

- Receiving SmartChain messages and returning durable acknowledgments/external references.
- Any Financial processing decision within the meaning agreed by both teams.
- Supplier communication/negotiation.
- Returning supplier acceptance/decline/change request/schedule/quotation as supported.
- Returning shortage/rejection case acknowledgment, supplier response, and proposed/agreed remedy.
- Idempotently correlating PO revisions and multiple cases to the correct PO/line/receipt.

### Explicitly out of scope

Accounting, payment execution, budgeting, fleet management, shared database access, and supplier portal redesign.

## Decision dimensions (must remain separate)

| Dimension | Proposed values | Owner / meaning |
|---|---|---|
| SmartChain Admin | `APPROVED`, `DECLINED` | Existing local replenishment/PO authorization. Never overwritten by callback. |
| Transport | `PENDING`, `ACKNOWLEDGED`, `RETRYABLE_FAILED`, `PERMANENTLY_REJECTED` | Whether Financial API accepted/recorded the message. Not business approval. |
| Financial processing | `PENDING`, `APPROVED`, `REJECTED`, `NEEDS_INFORMATION` | Only if Financial truly makes this decision; pending partner confirmation. |
| Supplier response | `PENDING`, `ACCEPTED`, `DECLINED`, `CHANGES_REQUESTED`, `QUOTED`, `SCHEDULED`, `NEEDS_INFORMATION` | Supplier response relayed by Financial. Working interpretation of ?response ni client?; pending confirmation. |
| Remedy | `OFFERED`, `AGREED`, `DECLINED`, `FULFILLED`, `APPLIED`, `CANCELLED` | Separate from case and transport state. |

Successful HTTP receipt means only that the receiver durably accepted the message for processing. It must never imply payment, Financial approval, supplier acceptance, delivery, QA acceptance, inventory receipt, discount application, or case closure.

## Proposed exchange topology

Use push + callback only for v1:

1. SmartChain sends a versioned message to Financial over HTTPS.
2. Financial durably validates/deduplicates it and returns `202 Accepted` with `financial_reference`.
3. Financial later calls one SmartChain event endpoint with decisions/responses/remedies.
4. SmartChain acknowledges the callback only after durable validation and persistence.

Polling is not proposed concurrently. If callbacks cannot be supported, replace?not supplement?this mechanism with an agreed polling resource and cursor.

## Endpoint inventory

### Existing SmartChain endpoints (not partner endpoints)

| Endpoint | Auth | Actual effect |
|---|---|---|
| `PATCH /api/purchase-orders/{purchaseOrder}/send` | Browser Sanctum + active Admin | Emails PDF directly to registered supplier and marks `Sent to Supplier`. This conflicts with confirmed Financial destination. |
| `PATCH /api/admin/receiving-discrepancies/{id}` | Browser Sanctum + Admin | Manually records direct supplier contact/response or closure. |
| `POST /api/admin/rejected-items/{case}/send` | Browser Sanctum + Admin + throttle | Emails rejection report directly to original supplier. |
| `POST /api/admin/rejected-items/{case}/resolve` | Browser Sanctum + Admin | Creates replacement expectation or closes without replacement. |

### Proposed Financial endpoints (Financial hosts)

| Method/path | Sender ? receiver | Trigger | Idempotency |
|---|---|---|---|
| `POST /api/smartchain/v1/purchase-orders` | SmartChain ? Financial | Admin submits a locally approved, integration-ready PO/revision | Unique `message_id`; business uniqueness `(source_system, po_number, po_revision)` |
| `POST /api/smartchain/v1/shortage-cases` | SmartChain ? Financial | Authorized user confirms true shortage for a receipt expectation | Unique `message_id`; business uniqueness `issue_id` |
| `POST /api/smartchain/v1/rejection-cases` | SmartChain ? Financial | Completed inbound supplier QA has rejected quantity and evidence readiness | Unique `message_id`; business uniqueness `issue_id` |

### Proposed SmartChain callback (SmartChain hosts)

| Method/path | Sender ? receiver | Purpose |
|---|---|---|
| `POST /api/integrations/financial/v1/events` | Financial ? SmartChain | PO/case acknowledgments, Financial decision, supplier response, remedy offer/agreement/update |

These paths are proposals. The teams may rename them before implementation, but must retain versioning and semantics.

## Authentication and transport proposal

- TLS 1.2+ with public HTTPS test and production hosts.
- Separate scoped service credentials per environment and direction; never browser/Admin login credentials.
- SmartChain outbound: `Authorization: Bearer <partner-issued-token>` or mutually agreed OAuth2 client credentials. Token must be encrypted at rest and excluded from frontend/logs.
- Financial callback: partner identifier plus timestamped HMAC-SHA256 signature over exact raw body, or mTLS/OAuth2 if already standard on both sides. If HMAC: `X-Partner-Id`, `X-Timestamp`, `X-Signature`; reject stale timestamps and compare signatures in constant time.
- Rotate credentials with overlap (`current` + `next`) and an owner/runbook. Exchange secrets through an approved secret channel, never email/chat/source control/URL.
- Rate-limit by partner and IP without using IP as identity.

## Common envelope

All requests/events use JSON UTF-8 and ISO 8601 timestamps with explicit offset, preferably UTC (`Z`). Unknown properties should be rejected once schemas are agreed, and schema validation must happen before state changes.

| Field | Type | Rule |
|---|---|---|
| `schema_version` | string | Required; exact supported value such as `1.0`. |
| `message_id` | UUID/ULID string | Required; stable across retries of the same semantic message. |
| `message_type` | enum | Required; e.g. `PURCHASE_ORDER_SUBMITTED`. |
| `source_system` | string | Required; `SMARTCHAIN` outbound, agreed Financial identifier inbound. |
| `occurred_at` | datetime | Required; business event time, not receive time. |
| `correlation_id` | string | Required; root workflow correlation. |
| `causation_id` | string/null | Message that caused this event, when applicable. |
| `payload` | object | Required; type-specific schema. |

## Acknowledgment and error rules

### Immediate success

Return `202 Accepted` only after durable validation/deduplication:

```json
{
  "acknowledged": true,
  "duplicate": false,
  "message_id": "01K7SYNTHETICPO00000000001",
  "financial_reference": "FIN-PO-TEST-00042",
  "received_at": "2026-10-19T03:15:12Z"
}
```

For an exact duplicate, return the same successful outcome with `duplicate: true`. If a reused `message_id` has a different payload hash, return `409` and do not process it.

### Errors

```json
{
  "acknowledged": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The message did not match schema version 1.0.",
    "retryable": false,
    "fields": {
      "payload.lines[0].quantity": ["Must be greater than zero."]
    }
  }
}
```

- `400/422`: schema/business validation; do not retry unchanged payload.
- `401/403`: authentication/authorization; alert and do not rapidly retry.
- `404`: unknown referenced resource; reconcile mapping.
- `409`: idempotency payload conflict, stale revision, or illegal state transition; manual reconciliation.
- `429`: retry using `Retry-After`.
- `5xx`, connection failure, timeout: retry with bounded exponential backoff and jitter.
- A timeout is ambiguous: Financial may already have recorded the message. Retry with the **same `message_id`**, never create a new PO/case.
- Callback response follows the same model. Financial retries callbacks until `2xx`, preserving `event_id`/`message_id`.

## Purchase order submission mapping

| Field | Format | Rule/source |
|---|---|---|
| `po_number` | string | Required; existing SmartChain unique human reference. |
| `po_revision` | integer >=1 | Required; proposed because none exists. |
| `admin_approval` | object | Required; status, time, actor display/reference. Never mutated by Financial. |
| `request_reference` | string/null | Required when PO originates from replenishment. |
| `supplier.code` | string | Required shared identity; existing `supplier_code`. |
| `supplier.name` | string | Required snapshot. |
| `delivery.location_reference` | string/null | Proposed warehouse reference. |
| `delivery.instructions` | string | Existing free text. |
| `delivery.expected_date` | `YYYY-MM-DD` | Required. |
| `pricing.status` | `DRAFT_UNPRICED`/`FINAL` | Required proposal. |
| `pricing.currency` | ISO 4217/null | Required when final; not currently stored. |
| `lines[].po_line_id` | string | Required; opaque SmartChain line ID. |
| `lines[].product_reference` | string | Required shared mapping or SmartChain catalog reference. |
| `lines[].description` | string | Required product snapshot. |
| `lines[].classification` | enum | Required `RAW_MATERIAL`/`FINISHED_PRODUCT`. Same flow for both. |
| `lines[].quantity` | integer >0 | Required; current system whole quantities only. |
| `lines[].unit` | string | Required exact catalog unit; no conversion. |
| `lines[].unit_price` | decimal string/null | Required when final. Use strings for monetary interchange. |
| `lines[].line_total` | decimal string/null | Required when final. |
| `order_total` | decimal string/null | Required when final. |
| `document` | object/null | Optional agreed document ID/hash/download exchange. Never an internal path. |

### Synthetic PO submission

```json
{
  "schema_version": "1.0",
  "message_id": "01K7SYNTHETICPO00000000001",
  "message_type": "PURCHASE_ORDER_SUBMITTED",
  "source_system": "SMARTCHAIN",
  "occurred_at": "2026-10-19T03:15:00Z",
  "correlation_id": "RR-TEST-20261019-A1B2C3",
  "causation_id": null,
  "payload": {
    "po_number": "PO-TEST-2026-0042",
    "po_revision": 1,
    "request_reference": "RR-TEST-20261019-A1B2C3",
    "admin_approval": {
      "status": "APPROVED",
      "approved_at": "2026-10-19T03:10:00Z",
      "approved_by_reference": "SMARTCHAIN-USER-TEST-7"
    },
    "supplier": {
      "code": "SUP-TEST-001",
      "name": "Synthetic Supply Co."
    },
    "delivery": {
      "location_reference": "WH-TEST-MAIN",
      "instructions": "Deliver to synthetic test warehouse",
      "expected_date": "2026-10-26"
    },
    "pricing": {
      "status": "FINAL",
      "currency": "PHP"
    },
    "lines": [
      {
        "po_line_id": "SC-POL-TEST-4201",
        "product_reference": "SKU-TEST-RM-001",
        "description": "Synthetic Raw Material",
        "classification": "RAW_MATERIAL",
        "quantity": 5,
        "unit": "KG",
        "unit_price": "125.50",
        "line_total": "627.50"
      }
    ],
    "order_total": "627.50",
    "document": null
  }
}
```

### Synthetic Financial and supplier decision callback

```json
{
  "schema_version": "1.0",
  "message_id": "01K7SYNTHETICFIN0000000001",
  "message_type": "PURCHASE_ORDER_RESPONSE_UPDATED",
  "source_system": "FINANCIAL_TEST",
  "occurred_at": "2026-10-19T05:30:00Z",
  "correlation_id": "RR-TEST-20261019-A1B2C3",
  "causation_id": "01K7SYNTHETICPO00000000001",
  "payload": {
    "po_number": "PO-TEST-2026-0042",
    "po_revision": 1,
    "financial_reference": "FIN-PO-TEST-00042",
    "financial_decision": {
      "status": "APPROVED",
      "decided_at": "2026-10-19T04:00:00Z",
      "note": "Synthetic processing approval"
    },
    "supplier_response": {
      "status": "ACCEPTED",
      "responded_at": "2026-10-19T05:25:00Z",
      "supplier_reference": "SUP-ACK-TEST-777",
      "expected_delivery_date": "2026-10-26",
      "note": "Synthetic acceptance only"
    }
  }
}
```

If Financial does not make a business approval, omit `financial_decision` from the final agreed schema rather than populating it from transport acknowledgment.

## Shortage report mapping

| Field | Rule |
|---|---|
| `issue_id`, `case_reference` | Required stable SmartChain case identity. |
| `po_number`, `po_revision`, `financial_reference` | Required correlation. |
| `receiving_reference`, `supplier_delivery_reference` | Required where available. |
| `reported_at` | Required timestamp. |
| `lines[]` | At least one; each includes PO line, receipt line, expected-for-this-delivery, physically delivered, and short quantity. |
| `reason_code`, `notes` | Required/optional per agreed codes. |
| `evidence[]` | Metadata plus scoped transfer reference/hash; never internal path or permanent public URL. |

### Synthetic shortage report

```json
{
  "schema_version": "1.0",
  "message_id": "01K7SYNTHETICSHORT00000001",
  "message_type": "DELIVERY_SHORTAGE_REPORTED",
  "source_system": "SMARTCHAIN",
  "occurred_at": "2026-10-28T02:20:00Z",
  "correlation_id": "SC-ISSUE-TEST-SHORT-001",
  "causation_id": null,
  "payload": {
    "issue_id": "SC-ISSUE-TEST-SHORT-001",
    "case_reference": "SH-TEST-000001",
    "po_number": "PO-TEST-2026-0042",
    "po_revision": 1,
    "financial_reference": "FIN-PO-TEST-00042",
    "receiving_reference": "RCV-TEST-00051",
    "supplier_delivery_reference": "DR-TEST-9001",
    "reported_at": "2026-10-28T02:20:00Z",
    "lines": [
      {
        "po_line_id": "SC-POL-TEST-4201",
        "receiving_line_id": "SC-RLI-TEST-5101",
        "unit": "KG",
        "ordered_quantity": 5,
        "previously_received_quantity": 0,
        "expected_for_this_delivery": 5,
        "physically_delivered_quantity": 3,
        "short_quantity": 2
      }
    ],
    "reason_code": "QUANTITY_SHORT",
    "notes": "Synthetic test case",
    "evidence": []
  }
}
```

An outstanding PO balance is not automatically a dispute. SmartChain must open this message only after the agreed delivery expectation/confirmation rule is satisfied.

## Rejection report mapping

| Field | Rule |
|---|---|
| `issue_id`, `case_reference` | Required stable rejection identity. |
| `po_number`, `po_line_id` | Required. |
| `receiving_reference`, `receiving_line_id` | Required and must refer to physical supplier delivery. |
| `inspection_reference`, `inspection_line_id` | Required. |
| quantities | Delivered, accepted, rejected and unit required; accepted + rejected = delivered for completed QA. |
| `reason_code`, `reason_text`, `disposition` | Agreed code required; text/evidence as needed. |
| `evidence[]` | Scoped transfer metadata; no private filesystem path. |

### Synthetic rejection report

```json
{
  "schema_version": "1.0",
  "message_id": "01K7SYNTHETICREJECT0000001",
  "message_type": "SUPPLIER_ITEM_REJECTION_REPORTED",
  "source_system": "SMARTCHAIN",
  "occurred_at": "2026-10-28T06:40:00Z",
  "correlation_id": "SC-ISSUE-TEST-RJ-0007",
  "causation_id": null,
  "payload": {
    "issue_id": "SC-ISSUE-TEST-RJ-0007",
    "case_reference": "RJ-TEST-000007",
    "po_number": "PO-TEST-2026-0042",
    "po_revision": 1,
    "financial_reference": "FIN-PO-TEST-00042",
    "po_line_id": "SC-POL-TEST-4201",
    "receiving_reference": "RCV-TEST-00051",
    "receiving_line_id": "SC-RLI-TEST-5101",
    "inspection_reference": "SC-QA-TEST-0088",
    "inspection_line_id": "SC-QAI-TEST-0088-1",
    "unit": "KG",
    "delivered_quantity": 3,
    "accepted_quantity": 2,
    "rejected_quantity": 1,
    "reason_code": "FAILED_QUALITY_CHECK",
    "reason_text": "Synthetic QA rejection",
    "disposition": "QUARANTINED",
    "evidence": [
      {
        "evidence_id": "SC-EVID-TEST-1001",
        "file_name": "synthetic-proof.jpg",
        "media_type": "image/jpeg",
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "transfer": "PENDING_AGREEMENT"
      }
    ]
  }
}
```

## Case acknowledgment and remedy callbacks

### Synthetic case acknowledgment / more information

```json
{
  "schema_version": "1.0",
  "message_id": "01K7SYNTHETICCASEACK000001",
  "message_type": "ISSUE_CASE_UPDATED",
  "source_system": "FINANCIAL_TEST",
  "occurred_at": "2026-10-28T07:00:00Z",
  "correlation_id": "SC-ISSUE-TEST-RJ-0007",
  "causation_id": "01K7SYNTHETICREJECT0000001",
  "payload": {
    "issue_id": "SC-ISSUE-TEST-RJ-0007",
    "case_reference": "RJ-TEST-000007",
    "financial_case_reference": "FIN-CASE-TEST-555",
    "case_status": "NEEDS_INFORMATION",
    "supplier_response": {
      "status": "NEEDS_INFORMATION",
      "note": "Please provide a synthetic batch image."
    }
  }
}
```

### Synthetic replacement response

```json
{
  "schema_version": "1.0",
  "message_id": "01K7SYNTHETICREMEDY000001",
  "message_type": "ISSUE_REMEDY_UPDATED",
  "source_system": "FINANCIAL_TEST",
  "occurred_at": "2026-10-29T01:00:00Z",
  "correlation_id": "SC-ISSUE-TEST-RJ-0007",
  "causation_id": "01K7SYNTHETICREJECT0000001",
  "payload": {
    "issue_id": "SC-ISSUE-TEST-RJ-0007",
    "financial_case_reference": "FIN-CASE-TEST-555",
    "supplier_response": {
      "status": "ACCEPTED",
      "note": "Synthetic supplier response"
    },
    "remedy": {
      "remedy_id": "FIN-REM-TEST-901",
      "version": 1,
      "type": "REPLACEMENT",
      "status": "OFFERED",
      "po_line_id": "SC-POL-TEST-4201",
      "quantity": 1,
      "unit": "KG",
      "expected_date": "2026-11-05",
      "conditions": "Subject to SmartChain acceptance"
    }
  }
}
```

Receiving this callback must not create stock. After authorized acceptance it may idempotently create an expected replacement receiving; physical receipt, QA, and stock-in remain mandatory.

### Synthetic future-order discount response

```json
{
  "schema_version": "1.0",
  "message_id": "01K7SYNTHETICDISCOUNT00001",
  "message_type": "ISSUE_REMEDY_UPDATED",
  "source_system": "FINANCIAL_TEST",
  "occurred_at": "2026-10-29T01:05:00Z",
  "correlation_id": "SC-ISSUE-TEST-SHORT-001",
  "causation_id": "01K7SYNTHETICSHORT00000001",
  "payload": {
    "issue_id": "SC-ISSUE-TEST-SHORT-001",
    "financial_case_reference": "FIN-CASE-TEST-556",
    "supplier_response": {
      "status": "ACCEPTED",
      "note": "Synthetic supplier remedy offer"
    },
    "remedy": {
      "remedy_id": "FIN-REM-TEST-902",
      "version": 1,
      "type": "FUTURE_ORDER_DISCOUNT",
      "status": "OFFERED",
      "supplier_code": "SUP-TEST-001",
      "discount": {
        "kind": "PERCENTAGE",
        "value": "5.00",
        "currency": null
      },
      "conditions": "One use on the next eligible synthetic order",
      "valid_until": "2027-01-31"
    }
  }
}
```

The discount must remain an agreement record until a later eligible PO explicitly references it. Application must be atomic and unique by `remedy_id`; it must not modify the original PO or count as goods received. This is not a credit ledger or payment feature.

## Callback validation and internal effects

1. Authenticate and validate timestamp/signature before JSON processing.
2. Validate exact schema version/message type and reject unknown or malformed properties.
3. Look up partner-scoped `message_id`/event ID.
4. If duplicate with same payload hash, return the original acknowledgment without repeating side effects.
5. If same ID with different hash, return `409 EVENT_ID_CONFLICT`.
6. Correlate source identifiers and `financial_reference`; never trust an internal numeric ID without source/partner context.
7. Reject stale PO revisions and illegal/regressive transitions.
8. Persist raw canonical payload hash, normalized event, receipt time, processing result, and safe audit metadata in one transaction.
9. Update only the relevant integration/decision/remedy dimension. Never overwrite Admin approval.
10. Never call inventory/stock-in from a Financial callback. Replacement fulfillment is recorded only through the existing physical receiving and QA controls.

## Evidence exchange

Pending agreement, choose one:

- SmartChain uploads evidence to a Financial upload endpoint and stores the returned document reference; or
- SmartChain issues a short-lived, single-purpose authenticated download token bound to partner, evidence ID, expiry, and download limits.

Do not send local storage paths, browser session URLs, permanent public URLs, or inline large files in retryable event payloads. Preserve filename, media type, size, SHA-256, uploader/audit provenance, and malware/content validation policy.

## Financial team preparation checklist

- Test and production public HTTPS base URLs and named technical/operational owners.
- Supported message types and exact JSON Schemas/OpenAPI for PO, shortage, rejection, and acknowledgment/errors.
- Clarification whether ?approved? means Financial processing approval, supplier acceptance, or both.
- Confirmation that ?response ni client? means supplier response, not customer-order response.
- Supplier identity mapping strategy using `supplier_code` plus Financial external reference.
- Durable idempotency for `message_id`, `(source_system, po_number, revision)`, and `issue_id`; payload-hash conflict behavior.
- Ability to store multiple shortage/rejection cases per PO/receipt/line and return the right response/remedy.
- Callback support, authentication method, signing canonicalization, clock-skew window, retry schedule, and IP/network requirements.
- Acceptance/error catalog with retryable flag, timeouts, rate limits, and `Retry-After` behavior.
- State-transition rules and handling for duplicate/out-of-order/stale-revision events.
- Secure credential issuance/rotation/revocation process; no shared DB or user login.
- Evidence transfer choice and file constraints.
- Synthetic supplier/product mappings, test credentials, test cases, and named integration-test owner.

## SmartChain team preparation checklist

- Approve business decisions listed below and nominate integration owner/on-call route.
- Add Financial partner configuration and encrypted credentials per environment.
- Add PO revision/pricing readiness/currency without conflating existing Admin approval.
- Add durable outbox/submission-attempt/event/correlation storage and redacted auditing.
- Add stable source references and mappings for PO lines, receipts, inspection lines, issues, and remedies.
- Replace direct supplier PO/rejection communication in this flow with Financial submission after cutover; retain safe feature flag/rollback plan.
- Model per-line delivery expectations and explicit shortage confirmation.
- Add partner callback auth, schema validation, idempotency, replay/stale-event protection, and monotonic transitions.
- Add remedy offer/agreement/fulfillment/application states and single-use discount guard.
- Implement secure evidence transfer without exposing private local paths.
- Add operations/reconciliation UI and alerts; future label should be **Send PO to Financial**.
- Run contract tests with mocked endpoints first, then isolated test environment; never production supplier traffic during testing.

## Remaining business questions

1. Does Financial make an approval decision, merely record/process the PO, or both? Is supplier acceptance a distinct required response?
2. Confirm ?response ni client? means the supplier response relayed by Financial.
3. Who owns/finalizes unit price, taxes, discounts, currency, and quote changes? Can Financial accept an explicitly unpriced quote request?
4. What event proves a partial delivery is a true shortage: ASN expectation, delivery document, or Plant Manager confirmation?
5. Who may accept a remedy and who may close each case in SmartChain?
6. Are replacement and future-order discount the full v1 remedy set? What happens when supplier declines or asks for more information?
7. How will both systems map suppliers/products/warehouses and transfer evidence?
8. What PO changes after submission require a new revision, and can a prior revision be cancelled/superseded?

## Integration test plan

| Scenario | Expected result |
|---|---|
| Valid priced PO | Financial returns durable acknowledgment/reference; SmartChain transport becomes acknowledged only. Admin approval remains unchanged. |
| Missing price / legitimate zero | Explicit pricing policy decides acceptance. No inference from numeric zero; unready final PO is blocked. |
| Duplicate PO revision, same message/payload | Same acknowledgment; no second commitment. |
| Same message ID, different payload | `409`; no state change. |
| Revision 2 then stale revision 1 callback | Revision 1 event recorded/rejected as stale; no regression. |
| Authentication absent/invalid/stale signature | `401/403`; no persistence except safe security telemetry; no secret echoed. |
| Unknown PO/line/receipt/case reference | Non-retryable correlation error or quarantined reconciliation; no guessed mapping. |
| Timeout after Financial persisted PO | Retry same message ID returns duplicate success; one PO commitment. |
| Intentional partial delivery | No shortage case unless agreed shortage trigger is true. PO balance remains open. |
| True per-line shortage | One issue ID with exact expected/delivered/short quantities; retry does not subtract again. |
| Repeated receipts | Cumulative PO balance correct; each receipt distinct; only relevant case resolved. |
| Supplier QA rejection | Rejection event links PO line, receipt line, inspection, qty, reason, private evidence reference. Only accepted qty is stockable. |
| Internal production failure | No Financial supplier case generated. |
| Combined shortage + rejection | Separate case IDs and quantities; rejected delivered units are not counted again as missing. |
| Duplicate/out-of-order case callbacks | Deduped, audited, monotonic; terminal/agreed state does not regress. |
| Supplier/Financial decision separation | Transport acknowledgment, Financial decision, and supplier response display/persist independently. |
| Replacement offered | No receiving/inventory change until authorized acceptance; acceptance creates at most one expectation. |
| Replacement physically delivered | Linked receiving, normal QA, accepted-only stock-in; promise alone never adds stock. |
| Replacement rejected again | Original case not falsely fulfilled; new linked rejection remains traceable. |
| Future discount offered/agreed | Original PO unchanged; no inventory effect. |
| Discount applied twice | Second application rejected atomically; later PO retains application reference. |
| Financial callback attempts to bypass QA/stock-in | Callback accepted/rejected per schema but cannot mutate inventory or mark physical fulfillment. |
| Evidence access expired/wrong partner | Access denied; no permanent public URL or storage path disclosure. |

## Acceptance gates before production

- Both teams sign off exact schemas, terms, transitions, auth, and retry behavior.
- Contract tests pass in both directions with synthetic data.
- Idempotency and timeout recovery are demonstrated, including payload conflict.
- Security review confirms credential storage, callback verification, evidence access, log redaction, and least privilege.
- Business users validate price readiness, partial-delivery/shortage decision, and remedy acceptance/closure.
- Reconciliation/runbook, alert ownership, credential rotation, rollback, and cutover plan are documented.
- No claim of end-to-end success until a test-environment PO, response, shortage, rejection, and remedy each complete with correlated records in both systems.
