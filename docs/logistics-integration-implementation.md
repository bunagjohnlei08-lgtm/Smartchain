# Logistics Integration Implementation and Setup

Implementation date: 2026-10-18. This report distinguishes local implementation from public/live verification.

## Completion status

| Milestone | Status |
|---|---|
| SmartChain application implementation | Implemented; backend runtime verification pending on this host |
| Local database migration | Not applied; PHP executable and verified PostgreSQL tooling were unavailable |
| Local automated backend verification | Blocked by unavailable PHP executable |
| Frontend verification | See validation results in the task handoff |
| Public callback verification | Not verified; no current ngrok URL was supplied |
| Live exchange with partner | Not verified; partner endpoint/credentials/contract acceptance are unavailable |

## Implemented architecture

- `logistics_partners`: trusted HTTPS destination, enablement, encrypted outbound bearer token, encrypted callback HMAC secret, and confirmed-idempotency flag.
- `logistics_item_mappings`: optional SmartChain Product ID-to-partner reference overrides for a partner contract that explicitly requires its own identifier. Ordinary v1 requests use `products.id`; no SKU setup is required and no barcode/name is substituted.
- `delivery_requests`: one row per order (database unique), stable UUID, immutable payload snapshot, selected partner, state, external reference, retry and safe error fields.
- `delivery_submission_attempts`: numbered attempts, correlation IDs, sanitized result/status/error, and timestamps.
- `delivery_status_events`: partner/event uniqueness, exact payload hash, business time, processing result, and duplicate/conflict evidence.
- `SubmitDeliveryRequest` queue job and `DeliverySubmissionService`: HTTP outside database transactions, bearer authentication, stable `Idempotency-Key`, finite timeouts, three total attempts, and backoff of 60 then 300 seconds.
- Authenticated callback middleware and controller: HMAC verification before body processing, ±300-second default replay window, strict known-property validation, partner ownership, event deduplication/conflict detection, and monotonic `IN_TRANSIT → DELIVERED` handling.
- Admin UI: enabled partner list, configuration indicator, payload preview, persisted send, disabled pending actions, integration states, partner reference, attempts, and safe errors.

Phase one intentionally permits one delivery request per order and does not implement partial shipments, multiple deliveries, fleet, drivers, routes, cancellation, return, failed-delivery, or proof upload.

## Local configuration

Add deployment secrets without committing them:

```dotenv
LOGISTICS_SOURCE_SYSTEM=SMARTCHAIN
LOGISTICS_PUBLIC_BASE_URL=https://<CURRENT-NGROK-HOST>
LOGISTICS_CALLBACK_CLOCK_SKEW_SECONDS=300
LOGISTICS_CONNECT_TIMEOUT_SECONDS=3
LOGISTICS_REQUEST_TIMEOUT_SECONDS=10
```

`LOGISTICS_PUBLIC_BASE_URL` is dedicated to integration callbacks and does not replace `APP_URL` or `FRONTEND_URL`.

## Safe setup commands

Backend runs on port 8000:

```powershell
cd "C:\Users\Johnlei\Desktop\Smartchain\backend"
php artisan serve --host=127.0.0.1 --port=8000
```

Queue worker (restart after code/config deployment):

```powershell
php artisan queue:work --queue=logistics,default --tries=3 --timeout=20
php artisan queue:restart
```

Tunnel the backend, not PostgreSQL:

```powershell
ngrok http 8000
```

When the ngrok hostname changes, update `LOGISTICS_PUBLIC_BASE_URL`, clear/reload Laravel configuration, restart the queue worker, and tell the partner the new full callback URL.

After independently verifying that `.env` targets the intended local development PostgreSQL database and retaining a recoverable backup:

```powershell
php artisan migrate --pretend
php artisan migrate
php artisan migrate:status
```

Never run `migrate:fresh` or `db:wipe` for this setup.

Provision a partner through hidden secret prompts:

```powershell
php artisan logistics:configure-partner PARTNER_TEST "External Logistics Group" --base-url="https://<PARTNER-TEST-HOST>" --request-path="/api/v1/delivery-requests" --enable --supports-idempotency
# Optional only when this partner explicitly requires its own reference:
php artisan logistics:map-item PARTNER_TEST 123 "PARTNER-REFERENCE-001"
```

The partner issues SmartChain's outbound bearer token. SmartChain generates and securely provides that partner's callback HMAC secret. Do not reuse an ngrok authtoken, Admin password, database credential, or another partner's secret.

New previews and requests identify each item with the string form of the existing SmartChain `products.id` in `items[].product_id`, plus `product_name`, released `quantity`, and stored `unit`. Existing persisted snapshots remain immutable. An unsent legacy snapshot containing only the retired mandatory-SKU shape is moved to `RECONCILIATION_REQUIRED` and is not transmitted automatically; an operator must review its replacement rather than mutate/retry the old idempotency identity.

## Actual routes

- Authenticated Admin: `GET /api/admin/logistics/partners`
- Authenticated Admin: `POST /api/admin/logistics/shipments/{order}/preview`
- Authenticated Admin: `POST /api/admin/logistics/shipments/{order}/send`
- Partner callback: `POST /api/integrations/logistics/v1/status-events`

The OpenAPI contract is in `docs/openapi/logistics-partner-v1.yaml`. The shareable partner document is `docs/logistics-partner-handoff.md`.
