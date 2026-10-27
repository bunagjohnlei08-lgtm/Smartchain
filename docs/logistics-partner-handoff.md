# SmartChain Logistics Partner Handoff — Phase One

Inspection date: 2026-10-18 (Asia/Manila)
Scope: one whole-order delivery request per SmartChain order. Source code is authoritative. No live order, migration, deployment, or application-data change was performed for this handoff.

## Status and ownership summary

`FORWARDED_TO_LOGISTICS` is only SmartChain's internal Plant Manager → Admin Logistics handoff. It does **not** mean that the external partner accepted the request, picked it up, or placed it in transit.

| Item | Owner | Status on 2026-10-18 |
|---|---|---|
| Callback route, HMAC middleware, schema, deduplication, and status processing | SmartChain | Available in current source; not publicly verified |
| Admin partner list, preview, and send routes | SmartChain | Available in current source; internal only |
| Immutable outbound payload and queued submission | SmartChain | Available in current source; mocked tests exist |
| Public callback base URL `https://tapering-sulfite-knapsack.ngrok-free.dev` | SmartChain | User-provided; reachability/configuration unverified |
| Registered partner code and callback secret | SmartChain | Missing per-partner provisioning; exchange securely |
| Partner receiving URL/path and test environment | Logistics | Awaiting agreement/configuration |
| Partner-issued bearer credential and rotation/revocation process | Logistics | Awaiting agreement/configuration |
| Acceptance/error contract matching SmartChain's parser | Logistics | Awaiting agreement |
| Duplicate-request guarantee for a stable request ID | Logistics | Awaiting written confirmation; required before enablement |
| Rate/payload limits, support contact, and joint fixtures | Both | Awaiting agreement |

The logistics team needs to call exactly **one SmartChain API** in phase one:

`POST https://tapering-sulfite-knapsack.ngrok-free.dev/api/integrations/logistics/v1/status-events`

There is no partner login, order retrieval, inventory, tracking-polling, proof-upload, fleet, driver, or vehicle endpoint. The three `/api/admin/logistics/...` operations are for SmartChain's own Admin UI and must not be used by the partner.

## API matrix

| Method and URL/path | Owner / caller | Purpose and trigger | Authentication / content type | Required fields | Success / errors | Limits | Evidence |
|---|---|---|---|---|---|---|---|
| `POST https://tapering-sulfite-knapsack.ngrok-free.dev/api/integrations/logistics/v1/status-events` | SmartChain / logistics partner | Report `IN_TRANSIT` or `DELIVERED` after the real event | HMAC headers below; `application/json` | `schema_version`, `event_id`, `delivery_request_id`, `partner_delivery_request_id`, `status`, `occurred_at` | `200`; `401/403/404/409/422/429` | 120/min per IP and separately per partner-header value; body-size limit is not set by integration code | `routes/api.php`; callback middleware/controller; `AppServiceProvider.php` |
| `GET /api/admin/logistics/partners` | SmartChain / Admin UI | List enabled partners | Sanctum + `active` + `idle` + Order authorization; JSON | None | `200`; standard auth/authorization errors | No integration-specific limiter | `routes/api.php`; `AdminLogisticsIntegrationController::partners` |
| `POST /api/admin/logistics/shipments/{order}/preview` | SmartChain / Admin UI | Validate/preview; no final request UUID | Same internal controls; JSON | `logistics_partner_id` integer | `200`; `401/403/404/422` | No integration-specific limiter | route/controller |
| `POST /api/admin/logistics/shipments/{order}/send` | SmartChain / Admin UI | Persist one immutable request and queue submission | Same internal controls; JSON | `logistics_partner_id` integer | `202` newly queued; `200` existing; `401/403/404/422/429` | 10/min per user (IP fallback) | route/controller/rate limiter |
| `POST https://<PARTNER-TEST-HOST><PARTNER-REQUEST-PATH>` | Logistics / SmartChain worker | Partner-owned receiver for one whole-order request | HTTPS, partner-issued Bearer token, JSON, `Idempotency-Key`, `X-Correlation-ID` | Delivery schema below | SmartChain accepts only HTTP `2xx` plus the exact acceptance body | Partner must supply limits; SmartChain defaults: 3s connect, 10s total | submission service, builder, config |

The last row is a **required partner-owned API**, not an implemented SmartChain endpoint. Its host, path, version, limits, and agreed status code remain placeholders until Logistics confirms them.

## SmartChain → logistics request

SmartChain sends one immutable JSON snapshot per order. Retries reuse the same payload and `delivery_request_id`; that UUID is also the `Idempotency-Key`. `X-Correlation-ID` changes per HTTP attempt.

```json
{
  "schema_version": "1.0",
  "source_system": "SMARTCHAIN",
  "delivery_request_id": "6d891fc0-acde-4b21-9df4-cc4b617f61d9",
  "order_reference": "SO-TEST-0001",
  "shipment_reference": "PKG-TEST-0001",
  "upstream_order_reference": "CUSTOMER-TEST-1001",
  "partner_code": "PARTNER_TEST",
  "pickup": {"location_code":"WH-TEST","name":"Synthetic Test Warehouse","address":"100 Test Avenue, Test City"},
  "recipient": {"name":"Synthetic Customer","address":"200 Example Street, Test City","contact":"+63-900-000-0001"},
  "required_delivery_at": "2026-10-21T17:00:00+08:00",
  "packages": {"count":2,"estimated_weight_kg":12.5,"fragile":false},
  "items": [{"product_id":"123","product_name":"Synthetic Finished Product","quantity":10,"unit":"PCS"}],
  "callback": {"url":"https://tapering-sulfite-knapsack.ngrok-free.dev/api/integrations/logistics/v1/status-events"}
}
```

Implemented field rules:

- `schema_version` is `"1.0"`; `source_system` defaults to `SMARTCHAIN`.
- `delivery_request_id` is SmartChain's UUID for the logical delivery request and stable idempotency identity.
- `order_reference` is the SmartChain business order number; `shipment_reference` is packing `package_id`, or the order reference for a legacy order. Neither is the idempotency key.
- `upstream_order_reference` is optional; `partner_code` is the registered uppercase partner code.
- Pickup requires warehouse code, name, and address. No approved pickup-contact field exists.
- Recipient requires name/address; contact is omitted when blank.
- `required_delivery_at` is RFC 3339/ISO-8601 with offset.
- `packages` is optional when packing exists: integer box count, kilograms, boolean fragility.
- Each item must be fully stock-out-released. `product_id` is the **string form of SmartChain `products.id`**. No SKU or barcode is used. `product_name` is descriptive; `quantity` is numeric released quantity; `unit` is the stored unit uppercased, with no conversion.
- `partner_item_reference` is optional and appears only when explicitly mapped after agreement; it is not an onboarding prerequisite.

### Exact acceptance SmartChain requires

The partner should return an agreed HTTP `2xx` (current code accepts any `2xx`; jointly choose `201` or `202`) with:

```json
{"accepted":true,"delivery_request_id":"6d891fc0-acde-4b21-9df4-cc4b617f61d9","partner_delivery_request_id":"LSP-TEST-849203","status":"ACCEPTED","accepted_at":"2026-10-18T14:35:22+08:00"}
```

SmartChain requires `accepted === true`, an exactly matching request ID, a non-empty partner ID, and `status === "ACCEPTED"`. `accepted_at` is allowed but not parsed; SmartChain records its own time. Extra response fields are tolerated. A generic success such as `{"message":"ok"}` becomes `REJECTED / INVALID_ACCEPTANCE_RESPONSE`.

Proposed partner rejection shapes (awaiting agreement):

```json
{"accepted":false,"error":{"code":"VALIDATION_ERROR","message":"recipient.address is required","fields":["recipient.address"]}}
```

```json
{"accepted":false,"error":{"code":"DUPLICATE_CONFLICT","message":"The idempotency key was previously used with different content."}}
```

SmartChain currently classifies errors by HTTP status and stores a safe local message: `401/403` → `AUTH_FAILED`; ordinary 4xx except `408/429` → `REJECTED`; timeout, `408`, `429`, and `5xx` → retryable only when idempotency is confirmed.

Transport acknowledgment is merely an HTTP response. Partner acceptance is the validated `ACCEPTED` body. Delivery progress begins only with callbacks.

### Idempotency, retries, and ambiguous outcomes

The partner must enforce uniqueness on `(source_system, delivery_request_id)` and return the original partner ID for an exact retry. It must never create a second delivery job. A reused key with different content should return a stable conflict.

The queue job permits three attempts and uses 60s then 300s job backoff; the service records retry scheduling at 60s, 300s, then 900s. A concurrent worker skips a `SENDING` request updated within two minutes. Exhaustion becomes `RECONCILIATION_REQUIRED`. A timeout is ambiguous: reconcile using the same UUID; do not create a second request. Queue job `DONE` means worker completion, not customer delivery.

## Logistics → SmartChain callback

### Authentication

```text
Content-Type: application/json
X-SmartChain-Partner: <REGISTERED_PARTNER_CODE>
X-SmartChain-Timestamp: <CURRENT_UNIX_SECONDS>
X-SmartChain-Signature: <LOWERCASE_HEX_HMAC_SHA256>
```

Sign the UTF-8 bytes of `<timestamp>.<exact raw request body>` with the partner-specific callback secret. Default allowed authentication clock skew is ±300 seconds. `occurred_at` is event time; the header timestamp is fresh authentication time. Reformatting, reordering, re-escaping, or changing newlines after signing breaks verification.

### Complete examples

```json
{"schema_version":"1.0","event_id":"evt-test-0001","delivery_request_id":"6d891fc0-acde-4b21-9df4-cc4b617f61d9","partner_delivery_request_id":"LSP-TEST-849203","status":"IN_TRANSIT","occurred_at":"2026-10-19T09:15:00+08:00","note":"Synthetic test movement.","proof_reference":null}
```

```json
{"schema_version":"1.0","event_id":"evt-test-0002","delivery_request_id":"6d891fc0-acde-4b21-9df4-cc4b617f61d9","partner_delivery_request_id":"LSP-TEST-849203","status":"DELIVERED","occurred_at":"2026-10-19T13:40:00+08:00","note":"Synthetic test delivery.","proof_reference":"PARTNER-POD-REF-001"}
```

Validation: `schema_version` exactly `1.0`; `event_id` 1–100 chars matching `[A-Za-z0-9._:-]+`; UUID request ID; partner ID 1–100 chars; status only `IN_TRANSIT` or `DELIVERED`; and RFC 3339 `occurred_at` with `Z` or numeric offset, max 40 chars. `note` is nullable/max 1000; `proof_reference` nullable/max 255 and is only a reference. Unknown properties are rejected.

### Windows PowerShell signing and curl

Save the exact minified body as `callback-in-transit.json`, then:

```powershell
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$bodyBytes = [IO.File]::ReadAllBytes((Resolve-Path '.\callback-in-transit.json'))
$prefixBytes = [Text.Encoding]::UTF8.GetBytes("$timestamp.")
$signingBytes = [byte[]]::new($prefixBytes.Length + $bodyBytes.Length)
[Array]::Copy($prefixBytes, 0, $signingBytes, 0, $prefixBytes.Length)
[Array]::Copy($bodyBytes, 0, $signingBytes, $prefixBytes.Length, $bodyBytes.Length)
$secret = $env:SMARTCHAIN_CALLBACK_TEST_SECRET
$hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
$signature = [Convert]::ToHexString($hmac.ComputeHash($signingBytes)).ToLowerInvariant()

curl.exe -X POST "https://tapering-sulfite-knapsack.ngrok-free.dev/api/integrations/logistics/v1/status-events" `
  -H "Content-Type: application/json" `
  -H "Accept: application/json" `
  -H "X-SmartChain-Partner: PARTNER_TEST" `
  -H "X-SmartChain-Timestamp: $timestamp" `
  -H "X-SmartChain-Signature: $signature" `
  --data-binary "@callback-in-transit.json"
```

Do not put real secrets in files, chat, source control, URLs, JSON, or shell history. Callback and bearer secrets are unrelated to ngrok credentials.

### Responses and state rules

```json
{"acknowledged":true,"event_id":"evt-test-0001","result":"APPLIED","smartchain_status":"IN_TRANSIT"}
```

An exact replay for the same partner/event/raw body returns `200 DUPLICATE` without side effects. Reusing the ID with different raw JSON—even equivalent reformatted JSON—returns `409 EVENT_ID_CONFLICT`. IDs are partner-scoped.

The authenticated partner must own the request and its stored partner reference must match. A callback may establish the partner reference before acceptance is persisted. Direct `DELIVERED` is accepted. `IN_TRANSIT` after `DELIVERED` returns `200 IGNORED_OUT_OF_ORDER`. Occurrence times are stored, but monotonicity is based on status rank. Callbacks update delivery/order status, order history, and the event record only; they do not repeat Stock Out or change inventory.

| HTTP | Partner action |
|---|---|
| `200` | Applied, exact duplicate, or ignored out of order; do not retry |
| `401` | Fix credentials, clock, or signed bytes before retrying |
| `403` | Wrong owning partner; escalate/reference-check |
| `404` | Unknown request; correct or escalate |
| `409` | Event conflict, reference mismatch, or invalid state; reconcile first |
| `422` | Correct schema/fields before retrying |
| `429`, `5xx`, timeout | Retry same event identity/content with bounded backoff and a fresh auth timestamp/signature |

## Credentials and runtime configuration

- Logistics supplies the outbound bearer credential and its provisioning/rotation/revocation process.
- SmartChain supplies the registered code and generates the partner-specific callback HMAC secret through a secure channel.
- SmartChain enters both through hidden prompts in `php artisan logistics:configure-partner`; encrypted values are not displayed.
- Optional item mapping is configured only when explicitly agreed.

```dotenv
LOGISTICS_SOURCE_SYSTEM=SMARTCHAIN
LOGISTICS_PUBLIC_BASE_URL=https://tapering-sulfite-knapsack.ngrok-free.dev
LOGISTICS_CALLBACK_CLOCK_SKEW_SECONDS=300
LOGISTICS_CONNECT_TIMEOUT_SECONDS=3
LOGISTICS_REQUEST_TIMEOUT_SECONDS=10
QUEUE_CONNECTION=database
```

Partner URL/path and both secrets are stored per partner, not in these global keys. If the tunnel host changes, update `LOGISTICS_PUBLIC_BASE_URL`, clear/rebuild Laravel configuration as appropriate, and restart/reload the web process and queue workers. New snapshots then use the new callback URL; existing queued snapshots remain immutable and need operator review.

## Team-separated joint test

### SmartChain team

1. Confirm the callback URL reaches this Laravel backend; configure the values above. An online tunnel alone is insufficient proof.
2. Register a disabled test partner, securely enter both credentials, and enable it only after HTTPS/parser/idempotency agreement.
3. Start/reload the backend and a queue worker listening on `logistics`; verify tunnel forwarding separately. Do not assume these are already running.
4. Create a deliberate synthetic order through the real flow: Admin assignment → Plant Manager preparation → complete stock-out → packing → Ready for Shipment → internal forwarding.
5. Record inventory/stock-out counts. Admin previews and sends once; verify one persisted UUID/snapshot.
6. Verify valid partner acceptance and persisted external reference. Worker `DONE` is not Delivered.
7. After callbacks, verify UI/order becomes `IN_TRANSIT`, then `DELIVERED`, with unchanged inventory/stock-out counts.

### Logistics team

1. Provide HTTPS test URL/path/method, bearer lifecycle, validation/error examples, limits/timeouts, and technical contact.
2. Confirm idempotency and that retries return the original partner ID without creating another job.
3. Confirm Product ID and status mapping. Request `partner_item_reference` only if necessary.
4. Receive the synthetic request, create exactly one test job, and return the required acceptance.
5. Send signed `IN_TRANSIT` and `DELIVERED` with distinct stable event IDs.

### Joint negative/edge cases

Test duplicate requests/events, changed-content event conflict, invalid/stale signature, wrong partner, unknown request, reference mismatch, unsupported status, unknown field, outbound timeout/`429`/`5xx`, direct delivery, and late transit. Reconfirm callbacks never change inventory or repeat stock-out.

## Phase-one limits

No partial/multiple deliveries, fleet/driver management, route planning, polling, cancellation, returns, failed-delivery status, or proof upload. One order has one delivery request; `proof_reference` is metadata only.

## Evidence and checks

Evidence: `backend/routes/api.php`, `bootstrap/app.php`, `AppServiceProvider.php`, Admin/callback controllers, callback middleware, logistics builder/submission service/job/models/config/commands/migration, and `backend/tests/Feature/LogisticsIntegrationTest.php`.

The feature tests use queue/HTTP fakes, so even a pass would not prove partner integration. `php artisan route:list` and PHP tests were attempted but could not run because PHP is unavailable on this workstation's `PATH`; routes were source-verified. The supplied public URL was not contacted, and no state-changing request was sent. Reachability and live integration remain unverified.

## Ready-to-copy Taglish coordination message

> Hi Logistics Team — phase one uses one whole-order delivery request. Ang only SmartChain API na tatawagin ninyo ay `POST https://tapering-sulfite-knapsack.ngrok-free.dev/api/integrations/logistics/v1/status-events` for `IN_TRANSIT` and `DELIVERED`, signed with your registered partner code, fresh Unix timestamp, and exact raw JSON bytes. Ise-share namin ang `docs/logistics-partner-handoff.md`, `docs/openapi/logistics-partner-v1.yaml`, partner code, at callback secret via secure channel. Kailangan namin ang inyong HTTPS test receiving URL/path/method, bearer-token provisioning/rotation/revocation, acceptance/error examples, limits/timeouts, technical contact, at written guarantee na the same `(SMARTCHAIN, delivery_request_id)` never creates a second job. SmartChain `products.id` ang `items[].product_id`; walang required SKU/barcode mapping. Next step: agree on contract/credentials, then run one synthetic order end-to-end in an isolated test environment including duplicate, timeout, invalid-signature, wrong-partner, and out-of-order cases. The callback URL is supplied but not yet verified live.
