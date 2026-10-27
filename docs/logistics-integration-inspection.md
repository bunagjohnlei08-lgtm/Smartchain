# SmartChain Logistics Integration Inspection

Inspection date: 2026-10-18 (Asia/Manila)
Scope: repository inspection and integration-readiness assessment only. No application code, migration, live request, deployment, or production data change was performed.

> Implementation update (2026-10-18): the missing SmartChain-side partner registry, request/attempt/event persistence, queued outbound adapter, Admin preview/send actions, HMAC callback, status processing, and UI states have since been implemented. See `docs/logistics-integration-implementation.md`. The findings below remain the pre-implementation evidence baseline; ?Missing? entries describe the state at inspection time, not the current working tree.

## Executive finding

SmartChain implements the internal flow from Admin order creation/assignment through Plant Manager preparation, stock-out, packing, and handoff into the Admin Logistics list. It does **not** currently exchange delivery requests or status events with an external logistics system.

The current ?shipment? is an `orders` row. There is no `shipments` table or delivery/dispatch record. One optional `shipment_packings` row (unique by `order_id`) stores package data. This means the repository currently supports one packing/handoff context per order, not partial shipments or multiple deliveries per order.

The exact eligibility event for Admin Logistics is the Plant Manager action `forwardToLogistics`, which changes an order from `READY_FOR_SHIPMENT` to `FORWARDED_TO_LOGISTICS`. `READY_FOR_SHIPMENT` alone is not visible to Admin Logistics. Only the assigned Plant Manager can perform that action; Admin can view the resulting logistics list but cannot persist partner selection or send a delivery request.

## Verified current flow

1. An Admin creates an order in `AdminOrderController::store`. The order starts as `NEW`, contains one or more finished-product items, and receives an `ORDER_CREATED` history row.
2. An Admin assigns an active Plant Manager in `AdminOrderController::assign`. The order becomes `ASSIGNED` and records `ORDER_ASSIGNED` or `ORDER_REASSIGNED`.
3. Only that assigned Plant Manager can progress the order through `ASSIGNED ? PREPARING ? READY_FOR_STOCK_OUT`.
4. Stock Out validates the manager's warehouse and finished-product inventory. Each release decrements inventory and creates a `stock_out_transactions` row with UUID `reference_no` and UUID `idempotency_key`.
5. When all ordered quantities have been released, Stock Out automatically changes the same order to `FOR_PACKING` and records `STOCK_OUT_COMPLETED`.
6. Plant Manager Shipment changes the order through `FOR_PACKING ? PACKING ? READY_FOR_SHIPMENT`. Packing stores one `shipment_packings` row with a unique `package_id`, box count, estimated weight in kg, flags, notes, packer, and timestamp.
7. The assigned Plant Manager invokes `forwardToLogistics`. SmartChain validates completed packing for the current flow, changes the order to `FORWARDED_TO_LOGISTICS`, records history/audit data, and notifies active Admin users.
8. Admin Logistics performs a read-only query for orders whose status is exactly `FORWARDED_TO_LOGISTICS`.

No verified code changes an order from `FORWARDED_TO_LOGISTICS` to `IN_TRANSIT` or `DELIVERED`. Those values exist in `Order::STATUSES`, reporting code, and some UI mapping, but there is no route/controller/service that accepts a logistics partner update.

## Business concept mapping

| Business concept | Current SmartChain representation | Assessment |
|---|---|---|
| Ready for Shipment | Order status `READY_FOR_SHIPMENT`, set after packing is validated | Implemented |
| Internal handoff to Admin Logistics | Order status `FORWARDED_TO_LOGISTICS`, set by the assigned Plant Manager | Implemented |
| Submission attempt | No record or status | Missing |
| Accepted by Logistics | No record or status | Missing |
| In Transit | Enum/status value exists, but no transition endpoint or partner event processor exists | Partial |
| Delivered | Enum/status value exists, but no transition endpoint or partner event processor exists | Partial |

`FORWARDED_TO_LOGISTICS` must not be interpreted as ?sent to partner? or ?accepted by partner.? It currently means only that the internal Plant Manager handoff was completed.

## Traceability matrix

| Capability | Status | Repository evidence | Finding |
|---|---|---|---|
| Admin creates customer order | Implemented | `backend/app/Http/Controllers/Api/AdminOrderController.php` ? `store`; `backend/routes/api.php` ? `POST /api/admin/orders` | Validates destination, dates, finished-product item, quantity, unit, and price; writes order/items/history atomically. |
| Upstream reference retention | Partial | `backend/database/migrations/2026_08_18_000000_create_orders_table.php` ? `reference_no`; `AdminOrderController::store` | Optional string, indexed but not unique; source system is not stored. |
| Admin assigns Plant Manager | Implemented | `AdminOrderController::assign`; `backend/app/Policies/OrderPolicy.php` | Admin-only through policy; active Plant Manager required; only `NEW`/`ASSIGNED` orders allowed. |
| Assigned-manager ownership | Implemented | `PlantManagerOrderController::assignedOrders`; `StockOutController::ordersFor`; `PlantManagerShipmentController::shipmentOrders` | Queries constrain work to `assigned_to = authenticated manager`. |
| Preparation transitions | Implemented | `PlantManagerOrderController::startPreparing`, `readyForStockOut` | Enforces ordered transitions and inventory readiness. |
| Stock-out | Implemented | `StockOutController::release`; `StockOutTransaction`; migration `2026_08_18_000003...` | Decrements inventory once per idempotency key; automatically moves fully released order to `FOR_PACKING`. |
| Packing | Implemented | `PlantManagerShipmentController::startPacking`, `markReadyForShipment`; `ShipmentPacking`; migration `2026_09_28_000001...` | One packing row per order; package ID unique; boxes and estimated kg required for the current flow. |
| Ready-for-shipment eligibility | Implemented | `PlantManagerShipmentController::markReadyForShipment`, `completedPacking` | Requires packing/checklist and barcode-verified stock-out for new-flow orders. |
| Internal forward to logistics | Implemented | `PlantManagerShipmentController::forwardToLogistics` | Changes only local order/history/audit state and notifies Admins. It does not call an external API. |
| Admin Logistics list | Implemented | `AdminLogisticsController::index`; `GET /api/admin/logistics/shipments` | Read-only Admin-authorized list, restricted to `FORWARDED_TO_LOGISTICS`. |
| Admin partner selection | Missing | `frontend/src/page/admin/logistics.tsx` ? `logisticsOptions`, `handleAssignSubmit`; `AdminLogisticsController::shipmentData` | UI choices are hard-coded; submit only shows a toast. Backend always returns `assigned_logistics: null`. |
| Admin approve/dispatch/send | Missing | `frontend/src/page/admin/logistics.tsx` ? `handleApprove`, `handleAssignSubmit` | Both handlers are explicitly mock-only and make no API request. |
| Partner registry/routing | Missing | `backend/config/services.php`; `backend/.env.example`; migrations/models | No logistics partner configuration, model, base URL, credential reference, or routing key. |
| Outbound HTTP client | Missing | Repository search; only unrelated `AIForecastController` uses Laravel `Http::` | No delivery-request service/client, timeout, response parsing, or partner request test. |
| Submission audit/correlation | Missing | Orders, histories, audit logs, shipment packing schemas | No stable delivery-request ID, partner request ID, attempt/result, safe error, or acceptance timestamp. |
| Retry/background send | Partial infrastructure | `backend/config/queue.php`; `0001_01_01_000002_create_jobs_table.php`; `.env.example` queue names | Laravel database queue is configured, but no logistics job/retry policy exists. |
| Inbound webhook/callback | Missing | `backend/routes/api.php`; middleware/controllers search | No public partner callback route, partner authentication, signature validation, replay protection, or event handler. |
| Polling | Missing | Controllers/jobs/commands search | No logistics polling implementation. Do not add polling unless the partner cannot provide callbacks. |
| In Transit / Delivered persistence | Partial | `Order::STATUSES`; dashboard/reports/frontend mappings | Values can be represented on `orders.status`, but no legitimate transition path from a partner exists. Admin Logistics currently filters them out. |
| Status audit history | Partial | `order_status_histories`; `AuditLogger` usage | Internal transitions are recorded. External event ID, partner, event time, raw partner status, and deduplication are absent. |
| Notifications | Partial | `WorkflowNotificationSender` in `forwardToLogistics` | Admin notification exists only for the internal handoff. No notification for partner acceptance/transit/delivery. |
| API documentation | Partial | `docs/API_ENDPOINTS.md` ? Stock-Out, Shipments & Logistics | Documents internal endpoints only; no external-partner contract/specification exists. |
| Relevant automated tests | Implemented for internal flow | `StockOutManagementTest`; `PlantManagerOrderManagementTest`; `AdminOrderManagementTest` | Tests cover ordered packing/handoff, single notification, queue ownership, and no duplicate stock-out. They do not cover external submission/callbacks. |
| Partial/multiple shipments | Missing | `shipment_packings.order_id` is unique; shipment identity is `orders.order_no` | One order maps to one packing context. No shipment lines, split quantity, or multiple dispatch record exists. |

## Verified data and schema constraints

- `orders.order_no` is unique and is currently exposed as both `order_no` and `shipment_no` in Admin Logistics.
- `orders.reference_no` is optional and indexed, not unique; it may hold an upstream reference but is not sufficient as a delivery idempotency key.
- `order_items.quantity` is decimal `(12,3)` and `unit` is a string up to 50 characters.
- Current product catalog policy supports `PCS`, `SACK`, and `DRUM` as package units (`Product::PACKAGE_UNITS`). The exchange must send the stored item unit verbatim and must not infer conversions or physical contents.
- `stock_out_transactions.quantity` is an unsigned integer even though order quantity is decimal. The active stock-out API accepts integer releases. This mismatch should be resolved or constrained before partners are promised fractional shipped quantities.
- `shipment_packings` is one-to-one with an order. It can provide `package_id`, `number_of_boxes`, `estimated_weight_kg`, fragility, and packing notes.
- Warehouse `name`, `code`, and nullable `address` exist. No verified warehouse pickup-contact field exists. A Plant Manager user is associated with a warehouse, but the inspected user schema/model does not establish a logistics-safe phone/contact field.
- Customer delivery name, address, and optional contact exist on the order.
- Product IDs are local numeric keys and the business does not maintain SKU codes. The implemented v1 request therefore sends the string form of `products.id` under source system `SMARTCHAIN`; a separate partner reference remains optional and requires explicit partner agreement.

## Authorization and security posture

Internal routes are under `auth:sanctum`, `active`, and `idle`. Admin order/logistics access uses `OrderPolicy`, whose Admin `before` rule grants access. Plant Manager endpoints enforce role and assignment in controller queries.

These browser/session controls are not suitable partner authentication. There is no machine credential or partner-scoped callback authorization today. No API key, access token, password, or `.env` value was read into this report.

## Existing versus needed identity

Current local identifiers:

- `orders.id`: local database primary key; do not expose it as the partner contract identity.
- `orders.order_no`: unique SmartChain business order reference and current displayed shipment number.
- `orders.reference_no`: optional upstream order reference; not unique.
- `shipment_packings.package_id`: unique package identifier when the new packing flow was used.
- Stock-out UUIDs: identify inventory release operations, not a logistics delivery request.

Minimum future identity:

- Generate and persist an opaque, stable `delivery_request_id` (UUID) for the logical dispatch to one selected partner.
- Use that same value as the outbound idempotency key across retries, including retry after an ambiguous timeout.
- Persist the partner's returned `partner_delivery_request_id`.
- Correlate callbacks using the SmartChain `delivery_request_id`, the partner ID resolved from authenticated credentials, and optionally the partner's request ID.

Using `order_no` alone would block future multiple shipments and could create duplicate jobs after retries. Even though multiple shipments are not supported today, the proposed request identity should be separate from the order.

## Minimum future changes, prioritized

### P0 ? required for any real exchange

1. Add a configured partner registry with a stable partner key, display name, active flag, base URL, credential secret reference, and callback-auth secret/key reference. Never expose secrets to the browser.
2. Add a delivery-request record tied to the order/packing and selected partner. Persist stable request UUID, partner request ID, submission state, accepted timestamp, last safe error, and status.
3. Add a submission-attempt record or equivalent durable attempt log with correlation ID, attempt number, timestamps, HTTP result category, and redacted error. Do not log credentials or full customer payloads.
4. Add an Admin-only backend action to select a partner and submit/queue the delivery request. The UI must call this action rather than displaying a mock success toast.
5. Add a bounded outbound client: explicit connect/request timeouts, same idempotency key on retry, retry only network/timeout/5xx/429 failures, and no automatic retry for 4xx validation/authentication failures.
6. Add one partner callback endpoint with machine authentication, timestamp/signature replay protection, partner scoping, event-ID deduplication, reference matching, validation, and monotonic status transitions.
7. Make Admin Logistics include submitted/accepted/in-transit/delivered records without confusing internal handoff with partner acceptance.

### P1 ? operationally necessary before production

1. Add safe operational/audit views for attempt state and callback events.
2. Add notifications for rejected submission, acceptance, In Transit, and Delivered according to business preference.
3. Add mocked integration tests for ambiguous timeout, duplicate submission/event, wrong partner, and out-of-order callbacks.
4. Provision a queue worker only if sending is asynchronous. Queue infrastructure exists, but production worker availability must be verified. A synchronous first version is possible if timeouts are short and the UI accurately reports pending/failure; a queue is preferable for bounded retry and ambiguous network failures.

### P2 ? only if business confirms the need

- Split/partial shipments or multiple deliveries per order.
- Cancellations, returns, failed-delivery statuses, proof-of-delivery upload, driver details, vehicle details, coordinates, or polling.

## Safe status-processing rules

- Partner callbacks must never invoke Stock Out or create stock-out transactions.
- Stock-out completion is inventory release, not pickup.
- A submission timeout must remain pending/unknown until a retry with the same request ID or a partner lookup confirms acceptance.
- HTTP 2xx from the submission endpoint means only ?request recorded? when the response contains the agreed acceptance fields; it never means Delivered.
- Duplicate callback `event_id` values must return a successful duplicate acknowledgment without replaying history, notifications, or other side effects.
- Once Delivered, a later In Transit event must be acknowledged as ignored/out-of-order and must not regress the order.
- A callback authenticated for partner A must not update a request assigned to partner B.
- Unknown request IDs and unsupported statuses must produce a stable 4xx response and no state change.

## Validation performed and limits

- Inspected relevant routes, controllers, policies, models, migrations, frontend handlers, API documentation, configuration names, and feature tests.
- Repository searches found no logistics HTTP client, callback/webhook handler, polling job, partner registry, or delivery-request persistence.
- Existing feature tests were reviewed but not run. The repository's test configuration points to PostgreSQL rather than an evidently disposable per-run database, so running stateful tests was not necessary or sufficiently justified for a documentation-only inspection.
- No live partner endpoint or production system was contacted. No end-to-end exchange has been verified.

## Open questions and practical impact

1. **Will the partner accept callbacks as the primary status mechanism?** If no, polling design and a partner lookup endpoint become necessary.
2. **Does one SmartChain order always produce one delivery?** If no, a real shipment aggregate and shipment-line quantities are required before defining idempotency and status at order level.
3. **Can the partner accept SmartChain `product_id` in the `SMARTCHAIN` namespace?** If it requires its own item reference, it must explicitly provide that mapping; this is not a global SmartChain prerequisite.
4. **What pickup contact is authorized for sharing?** Warehouse address exists, but no verified logistics contact field exists.
5. **Are decimal order quantities valid operationally?** Order schema allows three decimals while Stock Out releases integers; the contract must reflect the actual fulfillable quantity rule.
6. **Does Delivered update only logistics visibility or also trigger upstream customer-order synchronization?** No upstream status-sync implementation was found in this scope; it must be treated as a separate integration decision.
