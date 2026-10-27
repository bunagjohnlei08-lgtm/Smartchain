# Proposed SmartChain ? Logistics Partner Exchange Contract

Status: **SmartChain v1 implemented locally; partner-facing values remain pending partner agreement/configuration**
Version: implemented SmartChain draft `v1`
Inspection basis: SmartChain repository as of 2026-10-18. No live endpoint has been verified.

Implementation authority: `docs/openapi/logistics-partner-v1.yaml` defines the actual SmartChain callback schema and `docs/logistics-partner-handoff.md` is the current shareable handoff. Where this earlier proposal differs, those implemented documents take precedence. No public callback or live partner exchange has yet been verified.

## Responsibilities

### SmartChain owns

- Customer order references and the data needed for delivery.
- Admin assignment to Plant Manager.
- Inventory validation and the existing stock-out operation.
- Packing and Ready for Shipment.
- Internal handoff to Admin Logistics.
- Partner selection and one delivery-request submission.
- Validation and display of authenticated delivery-status events.

### Logistics partner owns

- Recording the accepted delivery request idempotently.
- Vehicle, driver, route, pickup, dispatch schedule, and delivery execution.
- Reporting In Transit and Delivered with stable event IDs and timezone-aware event times.
- Retrying failed callbacks without creating duplicate side effects.

Neither party requires shared database access, SmartChain user passwords, or browser-visible service credentials.

## Proposed endpoint list

| Direction | Method and endpoint | Purpose | Status |
|---|---|---|---|
| SmartChain ? partner | `POST https://<partner-test-host>/api/v1/delivery-requests` | Create/record one delivery request | PROPOSED ? partner must confirm host, path, and version |
| Partner ? SmartChain | `POST https://<smartchain-test-host>/api/integrations/logistics/v1/status-events` | Report In Transit or Delivered | Implemented locally; deployment/public reachability pending |

Polling is not currently implemented. A callback/webhook is the preferred minimal mechanism because the partner originates delivery progress. Do not add polling unless the partner cannot reliably call the callback endpoint.

## Partner readiness checklist

| Topic | Partner must provide/confirm | Current status |
|---|---|---|
| Receiving endpoint | Public HTTPS test and production base URLs, `POST` path, API version, `application/json`, and synchronous versus asynchronous acceptance | Requires partner confirmation |
| Authentication | Supported server-to-server method; credential provisioning/rotation/revocation; separate non-production credentials; scope limited to SmartChain delivery requests | Requires partner confirmation |
| Request schema | Acceptance of the fields and validation rules below | Requires partner confirmation |
| Correlation | Store SmartChain `delivery_request_id` unchanged and return a unique `partner_delivery_request_id` | Proposed |
| Acceptance response | Stable success/error JSON and meaning of accepted state | Proposed |
| Duplicate handling | Unique constraint/idempotent behavior on `(source_system, delivery_request_id)` | Proposed |
| Status reporting | Callback support, retry schedule, timeout, maximum attempts, and operator escalation | Requires partner confirmation |
| Test environment | Reachable HTTPS URL, securely exchanged test credentials, synthetic order support, and named technical contact | Requires partner confirmation |

## What SmartChain must provide

- Source-system identifier: proposed `SMARTCHAIN`.
- Stable `delivery_request_id` per logical dispatch.
- SmartChain order reference and, when available, package/shipment reference.
- This versioned outbound schema and validation behavior.
- Test and production callback URLs after implementation.
- Callback authentication/signature instructions and key rotation process.
- Supported partner status mapping: only `IN_TRANSIT` and `DELIVERED` for the minimal exchange.
- Callback acknowledgment/error format.
- Synthetic test data, test instructions, and a SmartChain integration contact.

## Outbound authentication proposal

Prefer a partner-issued server-to-server credential scoped to SmartChain and the delivery-request API. Use an `Authorization` header (for example, a short-lived OAuth client-credentials token or a partner-issued opaque bearer token) over TLS. Store the credential only in the backend secret manager/deployment environment and reference it from server-side partner configuration.

Do not put credentials in the JSON body, frontend bundle, URL/query string, logs, or Admin session. The exact scheme is **Requires partner confirmation**.

## Delivery request field mapping

| Payload field | Meaning | Type/format | Required or optional | Actual SmartChain source | Validation | Existing or proposed |
|---|---|---|---|---|---|---|
| `schema_version` | Contract version | string, `1.0` | Required | Constant | Exact supported version | Proposed |
| `source_system` | Sending system | string, proposed `SMARTCHAIN` | Required | New server config | 1?50 stable characters | Proposed |
| `delivery_request_id` | Stable logical dispatch/idempotency identity | UUID string | Required | New delivery-request record | UUID; immutable; unique with source system | Proposed |
| `order_reference` | SmartChain business order number | string | Required | `orders.order_no` | Existing unique value; max length to be agreed | Existing source, proposed field |
| `shipment_reference` | Packing/shipment reference | string | Optional until legacy orders are excluded | `shipment_packings.package_id`; current UI also labels `order_no` as shipment number | Must be stable; do not use local PK | Partial |
| `upstream_order_reference` | Original external customer-order reference if genuinely needed | string | Optional | `orders.reference_no` | Send only if partner confirms need; not unique | Existing |
| `partner_code` | Selected routing partner | string | Required internally; optional in partner body | New partner registry | Must match the authenticated/configured partner | Proposed |
| `pickup.location_code` | SmartChain warehouse reference | string | Required | `warehouses.code` through assigned manager | Non-empty configured warehouse | Existing |
| `pickup.name` | Warehouse name | string | Required | `warehouses.name` | Non-empty | Existing |
| `pickup.address` | Physical pickup address | string | Required before send | `warehouses.address` | Non-empty; block submission if absent | Existing nullable field |
| `pickup.contact.name` | Authorized pickup contact | string | Optional pending decision | No verified dedicated field | Must be explicitly configured/approved | Proposed |
| `pickup.contact.phone` | Necessary pickup phone | string | Optional pending decision | No verified dedicated field | Partner-agreed phone format; minimize sharing | Proposed |
| `recipient.name` | Delivery recipient/customer | string | Required | `orders.customer_name` | Non-empty; max length agreed | Existing |
| `recipient.address` | Delivery destination | string | Required | `orders.customer_address` | Non-empty | Existing |
| `recipient.contact` | Necessary delivery contact | string | Optional | `orders.customer_contact` | Send only when present and required | Existing |
| `required_delivery_at` | Requested delivery deadline | RFC 3339 timestamp with offset | Required | `orders.required_delivery_date` | Valid timestamp; agreed interpretation/window | Existing source |
| `pickup_window.start` | Earliest pickup time | RFC 3339 timestamp with offset | Optional | No persisted source | Must precede end | Proposed, only if needed |
| `pickup_window.end` | Latest pickup time | RFC 3339 timestamp with offset | Optional | No persisted source | Must follow start | Proposed, only if needed |
| `packages.count` | Number of boxes/packages | positive integer | Optional/required if partner needs it | `shipment_packings.number_of_boxes` | 1?100000 in current SmartChain validation | Existing |
| `packages.estimated_weight_kg` | Total estimated weight | decimal number | Optional/required if partner needs it | `shipment_packings.estimated_weight_kg` | Greater than 0; current maximum `99999999.99` | Existing |
| `packages.fragile` | Fragility flag | boolean | Optional | `shipment_packings.is_fragile` | Boolean | Existing |
| `delivery_instructions` | Delivery/handling note | string | Optional | No dedicated field; packing notes are not automatically delivery instructions | Max length to agree; do not silently repurpose internal notes | Proposed |
| `items[].product_id` | SmartChain product identity | string containing a positive integer | Required | `order_items.product_id` / `products.id` | Existing Product ID; interpreted in the `SMARTCHAIN` source-system namespace | Implemented |
| `items[].product_name` | Product name/description | string | Required | Related `products.name`, with the stored order-item name retained as historical display data | Non-empty | Implemented |
| `items[].partner_item_reference` | Partner-specific product reference | string | Optional; only when that partner's verified contract requires/provides it | Optional `logistics_item_mappings.partner_item_reference` | 1?100 characters when present | Implemented optional extension |
| `items[].quantity` | Actual quantity shipped | decimal number | Required | Sum of successful stock-out quantities per order item, bounded by ordered quantity | Positive; max 3 decimals only if operationally supported | Existing source; mapping needs implementation |
| `items[].unit` | Stored stock/order unit | string | Required | `order_items.unit` | Send stored canonical value; current catalog recognizes `PCS`, `SACK`, `DRUM`; no conversion | Existing |
| `callback.url` | SmartChain status-event endpoint | HTTPS URI | Optional if preconfigured | New server config | HTTPS allowlisted SmartChain host | Proposed |

Exclude payment data, prices, inventory balances, barcodes unless explicitly required, BOM/formula data, authentication material, and unrelated customer data.

## Synthetic delivery request

Endpoint: **PROPOSED ? pending agreement** `POST https://<partner-test-host>/api/v1/delivery-requests`

```json
{
  "schema_version": "1.0",
  "source_system": "SMARTCHAIN",
  "delivery_request_id": "6d891fc0-acde-4b21-9df4-cc4b617f61d9",
  "order_reference": "SO-TEST-0001",
  "shipment_reference": "PKG-TEST-0001",
  "upstream_order_reference": "CUSTOMER-TEST-1001",
  "partner_code": "PARTNER_TEST",
  "pickup": {
    "location_code": "WH-TEST",
    "name": "Synthetic Test Warehouse",
    "address": "100 Test Avenue, Test City",
    "contact": {
      "name": "Test Pickup Contact",
      "phone": "+63-900-000-0000"
    }
  },
  "recipient": {
    "name": "Synthetic Customer",
    "address": "200 Example Street, Test City",
    "contact": "+63-900-000-0001"
  },
  "required_delivery_at": "2026-10-21T17:00:00+08:00",
  "packages": {
    "count": 2,
    "estimated_weight_kg": 12.5,
    "fragile": false
  },
  "items": [
    {
      "product_id": "123",
      "product_name": "Synthetic Finished Product",
      "quantity": 10,
      "unit": "PCS"
    }
  ],
  "callback": {
    "url": "https://<smartchain-test-host>/api/integrations/logistics/v1/status-events"
  }
}
```

All people, addresses, references, and credentials in examples are synthetic placeholders.

## Proposed acceptance response

HTTP `202 Accepted` (or `201 Created`, to be agreed) means the partner recorded the request. It does not mean pickup, transit, or delivery.

```json
{
  "accepted": true,
  "delivery_request_id": "6d891fc0-acde-4b21-9df4-cc4b617f61d9",
  "partner_delivery_request_id": "LSP-TEST-849203",
  "status": "ACCEPTED",
  "accepted_at": "2026-10-18T14:35:22+08:00"
}
```

SmartChain should mark Accepted by Logistics only when the response is authenticated, parseable, references the same `delivery_request_id`, contains a non-empty partner ID, and uses the agreed acceptance status. A generic HTTP 2xx with an invalid body is not acceptance.

## Proposed validation-error response

```json
{
  "accepted": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The delivery request is invalid.",
    "fields": {
      "recipient.address": ["A delivery address is required."],
      "items.0.product_id": ["A valid SmartChain Product ID is required."]
    }
  },
  "correlation_id": "req-test-7d3d93"
}
```

The partner must not echo secrets or unnecessary personal data in errors.

## Duplicate and retry rules

1. The partner enforces uniqueness on `(source_system, delivery_request_id)`.
2. An exact duplicate returns the original `partner_delivery_request_id` and an `accepted: true` response; it does not create another delivery job.
3. SmartChain preserves `delivery_request_id` across every retry. A new attempt/correlation ID may be generated per HTTP attempt.
4. Retryable: connection failure, timeout, HTTP 408, 429 (respect `Retry-After`), and 5xx.
5. Non-retryable without correction: authentication/authorization failures and 4xx validation/schema errors.
6. Use explicit short connect/request timeouts and bounded exponential backoff with jitter. Exact values require operational agreement.
7. After an ambiguous timeout, keep the request in an unknown/pending state and retry with the same identity. Never display Accepted merely because a send was attempted.

## Callback authentication proposal

Endpoint: **Implemented locally; deployment/public reachability pending**
`POST https://<smartchain-test-host>/api/integrations/logistics/v1/status-events`

Use a distinct signing secret per partner with these headers:

- `X-SmartChain-Partner`: configured partner code.
- `X-SmartChain-Timestamp`: Unix seconds or an agreed RFC 3339 timestamp.
- `X-SmartChain-Signature`: lowercase hexadecimal HMAC-SHA256 over `<timestamp>.<exact raw body>` using the partner's inbound secret.

SmartChain must resolve the partner by the presented partner code, verify the signature in constant time, reject timestamps outside a narrow agreed tolerance, and reject/replay-safe duplicate event IDs. Secrets are provisioned and rotated out-of-band. An Admin's Sanctum/browser session must not be used.

Alternative OAuth/mTLS is acceptable if both teams operate it; the final mechanism requires agreement.

## Status-event request

Required fields:

| Field | Type/format | Rule |
|---|---|---|
| `schema_version` | string | Exact supported version |
| `event_id` | string/UUID | Stable, globally unique for that partner event; deduplication key |
| `delivery_request_id` | UUID | SmartChain request identity |
| `partner_delivery_request_id` | string | Must match the accepted request |
| `status` | enum string | Minimal v1: `IN_TRANSIT` or `DELIVERED` |
| `occurred_at` | RFC 3339 timestamp with offset | Actual business event time, not callback send time |
| `note` | string | Optional, bounded, no secrets |
| `proof_reference` | string | Optional only if both teams agree to reference externally stored proof; uploads are out of v1 scope |

### Synthetic In Transit event

```json
{
  "schema_version": "1.0",
  "event_id": "evt-test-0001",
  "delivery_request_id": "6d891fc0-acde-4b21-9df4-cc4b617f61d9",
  "partner_delivery_request_id": "LSP-TEST-849203",
  "status": "IN_TRANSIT",
  "occurred_at": "2026-10-19T09:15:00+08:00",
  "note": "Synthetic shipment departed the test pickup location."
}
```

### Synthetic Delivered event

```json
{
  "schema_version": "1.0",
  "event_id": "evt-test-0002",
  "delivery_request_id": "6d891fc0-acde-4b21-9df4-cc4b617f61d9",
  "partner_delivery_request_id": "LSP-TEST-849203",
  "status": "DELIVERED",
  "occurred_at": "2026-10-19T15:42:10+08:00",
  "note": "Synthetic delivery completed."
}
```

## Callback acknowledgment

Newly applied event:

```json
{
  "acknowledged": true,
  "event_id": "evt-test-0001",
  "result": "APPLIED",
  "smartchain_status": "IN_TRANSIT"
}
```

Duplicate event, returned as success so the partner stops retrying:

```json
{
  "acknowledged": true,
  "event_id": "evt-test-0001",
  "result": "DUPLICATE",
  "smartchain_status": "IN_TRANSIT"
}
```

Out-of-order event after Delivered:

```json
{
  "acknowledged": true,
  "event_id": "evt-test-0003",
  "result": "IGNORED_OUT_OF_ORDER",
  "smartchain_status": "DELIVERED"
}
```

Use stable 4xx errors for invalid signature, wrong partner, unknown request/reference, mismatched partner request ID, invalid schema, or unsupported status. Use 5xx only when retry could succeed without correcting the event.

## Status mapping and state rules

| Partner event | SmartChain meaning | Allowed from | SmartChain changes | Must remain unchanged |
|---|---|---|---|---|
| Acceptance response `ACCEPTED` | External system recorded the request | Submission pending/unknown | Delivery-request acceptance fields; optionally display Accepted by Logistics | Inventory, stock-out transactions, order items, packing data |
| `IN_TRANSIT` | Partner reports actual transit | Accepted/current pre-transit state | Delivery request/status event; order status may become `IN_TRANSIT` after implementation | Inventory, stock-out transactions, packing, order contents |
| `DELIVERED` | Partner reports delivery completion | Accepted or In Transit, per agreed policy | Delivery request/status event; order status may become `DELIVERED` after implementation | Inventory, stock-out transactions, packing, order contents |

Status precedence is monotonic: `ACCEPTED < IN_TRANSIT < DELIVERED`. Duplicate/lower-precedence events are recorded or acknowledged as duplicates/out of order without regressing state or repeating side effects.

The authenticated partner identity must match the delivery request's selected partner. Matching only by order reference is insufficient.

## Partner callback retry expectations

- Partner retries network failure, timeout, 408, 429, and 5xx with exponential backoff and jitter.
- Partner does not retry a permanent 4xx until the data/authentication issue is corrected.
- Every retry preserves `event_id` and payload meaning.
- Partner records callback attempts and alerts an operator after the agreed maximum duration/attempt count.
- SmartChain acknowledges duplicates idempotently.

## Test environment and credential exchange

Before integrated testing, both teams must exchange securely:

- Reachable HTTPS test URLs.
- Non-production credentials/signing secrets via an approved secret channel, never chat/source code/request body.
- Test partner code and source-system code.
- One synthetic ready shipment with no real customer data.
- Expected request ID and partner ID correlation.
- Named contacts and a test window.
- Log correlation instructions that reveal IDs and safe errors but no secrets or unnecessary personal data.

## Integration test plan

1. **Accepted once:** prepare and forward one synthetic order, select the test partner, submit once, receive a valid acceptance response, and verify one delivery request and one partner job.
2. **Missing field:** omit `recipient.address`; verify partner 4xx validation response, SmartChain shows rejected/needs correction, and no accepted state appears.
3. **Authentication and partner isolation:** submit with invalid outbound credentials; then send a correctly signed callback from partner B for partner A's request. Both must fail safely with no status change.
4. **Duplicate and ambiguous timeout:** submit, simulate the partner recording it while SmartChain times out, then retry with the same `delivery_request_id`. Verify the same partner ID is returned and only one delivery job exists.
5. **Normal status flow:** send authenticated In Transit then Delivered events with distinct event IDs and timezone offsets. Verify monotonic state and audit/event records.
6. **Duplicate/out-of-order callbacks:** resend the Delivered event and later send In Transit. Verify duplicate/ignored acknowledgments, no repeated notifications, and no regression from Delivered.
7. **Unknown/unsupported:** send an unknown `delivery_request_id` and an unsupported status. Verify stable 4xx responses and no new delivery/order record.
8. **Inventory invariants:** compare stock-out transaction count, inventory quantity, order items, and packing record before/after submission and callbacks. Verify no callback repeats stock-out, creates a second packing/delivery request, or overwrites order data.

All network behavior should be tested with Laravel HTTP fakes/mocks before any partner test system is contacted. A live end-to-end test is not complete until both teams execute and reconcile these cases in the agreed test environment.

## Decisions explicitly out of minimal v1 scope

Unless separately agreed: cancellations, returns, failed delivery, proof-of-delivery uploads, partial delivery, multiple shipments per order, driver/vehicle details, route planning, and polling. These are not existing SmartChain capabilities and must not be implied by the current Admin Logistics UI.
