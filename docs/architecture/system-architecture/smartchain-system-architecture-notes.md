# SmartChain System Architecture Notes

Inspected: 5 September 2026. Project: Integrated Smart Warehousing and Supply Chain Management System with AI-Based Demand Forecasting and Shipment Reports for E-Commerce.

This describes the local working tree at base revision `bc3581c583481fc148b7c314692fe23acc3b164d`, including existing uncommitted frontend changes. Verification is static source inspection, not a running-system acceptance test. Application files were not modified.

## 1. Overview

SmartChain has a React/TypeScript browser application, a Laravel REST API containing the business modules, and PostgreSQL persistence. A separate Python FastAPI service scaffold exists. Its forecasting pipeline is not connected. The architecture groups modules within one Laravel application; the domain boxes are not separate deployed services.

Read the diagram from users through the frontend and API to business modules and data. Authentication/RBAC applies across protected API operations. The disconnected FastAPI box intentionally indicates that no application communication path was found. Flow cards explain the business relationships without turning the component map into a process chart.

## 2. User and RBAC Layer

The main roles are Admin, Plant Manager and QA Supervisor. The supported business sequence is Admin creates an account, assigns its role, and the user logs in to the corresponding panel. Actual access is determined by server policies, permissions and explicit role checks; frontend routing provides the panel restriction.

`AuthController::login` checks credentials and account status, applies login rate limits, and issues a Sanctum personal access token. The Axios request interceptors attach the session-stored token as a Bearer token. Protected API routes use `auth:sanctum`; bootstrap also enables stateful API middleware. Role and permission records are linked through `permission_role`. User, inventory, order and replenishment policies coexist with controller-level role checks. This is not an external identity provider or a separate RBAC service. User policy permissions can also permit some Plant Manager user-management actions; the diagram's Admin creation flow is not a claim that every user action is exclusively Admin-only.

Evidence: [authentication controller](../../../backend/app/Http/Controllers/Api/AuthController.php), [API routes](../../../backend/routes/api.php), [bootstrap](../../../backend/bootstrap/app.php), [User model](../../../backend/app/Models/User.php), [Role model](../../../backend/app/Models/Role.php), [User policy](../../../backend/app/Policies/UserPolicy.php), [policy directory](../../../backend/app/Policies), [permission seed](../../../backend/database/seeders/PermissionSeeder.php).

## 3. Frontend Layer

React and TypeScript use Vite and React Router. The active router mounts Admin, Plant Manager and QA Supervisor panels behind `ProtectedRoute` role restrictions. Shared Axios clients target `http://localhost:8000` and `/api`, use JSON, enable credential/XSRF handling and attach Bearer tokens. The address is development configuration, not evidence of a production deployment. Procurement, receiving, QA, inventory, orders, stock movement, shipment and report screens call Laravel endpoints. Forecast pages currently contain sample datasets.

Evidence: [package manifest](../../../frontend/package.json), [active router](../../../frontend/src/routes/index.tsx), [route protection](../../../frontend/src/components/ProtectedRoute.tsx), [shared API clients](../../../frontend/src/lib/api.ts), [Admin procurement](../../../frontend/src/page/admin/Procurement.tsx), [QA inspection](../../../frontend/src/page/QA/QualityInspection.tsx).

## 4. Laravel/API Layer

Laravel controllers validate requests, enforce authorization, use Eloquent models and perform database transactions for key record and stock changes. The shared API connects the presentation layer with procurement, receiving/QA/inventory and fulfillment/reporting domains. There is no verified forecast endpoint or outgoing FastAPI client in the application code. No additional cloud, queue, carrier or supplier integration is asserted; framework default configuration alone does not establish a business integration.

Evidence: [Composer manifest](../../../backend/composer.json), [API routes](../../../backend/routes/api.php), [controllers](../../../backend/app/Http/Controllers/Api).

## 5. Core Business Modules

**Procurement.** Plant Managers create and submit replenishment requests. Admin approves or declines pending requests. PO creation can reference an approved request and changes that request to `for_purchase_order`; the reference is optional, so the requested core path is supported but not mandatory for every PO. Suppliers are maintained as records, and PO creation validates an active supplier name. The send action records `Sent to Supplier` and `sent_at`; it does not send email or call a supplier API. Receiving is linked to a purchase order and checks remaining delivered quantities. Supplier identity on the PO is stored as a name, not a supplier foreign key.

Evidence: [Plant Manager procurement](../../../backend/app/Http/Controllers/Api/PlantManagerProcurementController.php), [Admin procurement](../../../backend/app/Http/Controllers/Api/AdminProcurementController.php), [purchase orders](../../../backend/app/Http/Controllers/Api/PurchaseOrderController.php), [suppliers](../../../backend/app/Http/Controllers/Api/SupplierController.php), [receiving](../../../backend/app/Http/Controllers/Api/ReceivingController.php).

**Receiving, QA and inventory.** Receiving creates item records awaiting QA. QA Supervisor write access records accepted and rejected quantities and finalizes inspections. Passed quantities become eligible for stock-in only after inspection completion. Stock-in posts accepted quantities into product/warehouse inventory and records stock-in tracking. The controller selects `WH-MAIN`, with a first-warehouse fallback. The secondary partial/rejected path is implemented: accepted portions of partial inspections can stock in, and rejected quantities are exposed in QA records/reports. Rejection reporting is not evidence of an automated supplier-return integration.

Evidence: [QA inspection](../../../backend/app/Http/Controllers/Api/QaInspectionController.php), [stock in](../../../backend/app/Http/Controllers/Api/StockInController.php), [rejected items](../../../backend/app/Http/Controllers/Api/QaRejectedItemsController.php), [inventory](../../../backend/app/Models/Inventory.php), [warehouse consolidation migration](../../../backend/database/migrations/2026_08_29_020000_configure_single_main_warehouse.php).

**Orders, shipment and reports.** Admin creates and assigns orders. The assigned Plant Manager prepares them and proceeds to stock-out. Inventory checks use product and warehouse records. Barcode-based stock-out validates available quantities, decrements inventory and writes stock-out transactions. When all quantities are released, the order becomes `READY_FOR_SHIPMENT`; forwarding changes it to `FORWARDED_TO_LOGISTICS`. Admin Logistics reads these forwarded orders. A shipment is represented by the existing order, its items and status histories; there is no separate shipment table. Report endpoints query these records, including shipment statuses, and generate reports. `IN_TRANSIT` and `DELIVERED` appear in status definitions and reporting, but no API write transition to them was found. Admin's generic status endpoint only permits early cancellation. Therefore end-to-end delivery completion remains unfinished.

Evidence: [Admin orders](../../../backend/app/Http/Controllers/Api/AdminOrderController.php), [Plant Manager orders](../../../backend/app/Http/Controllers/Api/PlantManagerOrderController.php), [stock out](../../../backend/app/Http/Controllers/Api/StockOutController.php), [shipment forwarding](../../../backend/app/Http/Controllers/Api/PlantManagerShipmentController.php), [read-only Admin Logistics](../../../backend/app/Http/Controllers/Api/AdminLogisticsController.php), [Order model](../../../backend/app/Models/Order.php), [reports](../../../backend/app/Http/Controllers/Api/ReportsController.php).

## 6. AI Forecasting Layer

Classification: **PARTIALLY IMPLEMENTED / INTEGRATION IN PROGRESS**. The diagram uses the requested label **Implemented Service / Integration In Progress**, qualified as a scaffold only. FastAPI implements service information at `/` and health at `/health`. There is no forecast endpoint, trained model, inference code, model artifact, historical-data loader or implemented link to Laravel/frontend. Dependency listings for pandas, NumPy and scikit-learn do not establish a working ML model.

Admin forecasting uses `mockForecastProducts`, history, insights and chart arrays. Plant Manager forecasting also uses local arrays. Laravel dashboards expose placeholder calculations from movement/stock-out data; these are not FastAPI ML predictions. The replenishment options' `forecastedDemand` is calculated from inventory values. No forecast-result persistence or automatic forecast-to-request creation was verified. Historical orders and stock-out records are possible future inputs; their presence does not prove an extraction pipeline.

The intended sequence Historical Data → FastAPI → ML Model → Forecast → Replenishment Decision is **PLANNED** beyond the existing service scaffold. No network arrow is drawn because neither its caller nor its request/response contract is implemented.

Evidence: [complete FastAPI app](../../../forecasting-service/app/main.py), [dependencies](../../../forecasting-service/requirements.txt), [Admin forecast page](../../../frontend/src/page/admin/AIDemandForecast.tsx), [Plant Manager forecast page](../../../frontend/src/page/plant-manager/Forecast.tsx), [Admin dashboard](../../../backend/app/Http/Controllers/Api/DashboardController.php), [Plant Manager dashboard](../../../backend/app/Http/Controllers/Api/PlantManagerDashboardController.php), [procurement options](../../../backend/app/Http/Controllers/Api/PlantManagerProcurementController.php).

## 7. PostgreSQL Data Layer

Both the local database driver setting and committed `.env.example` specify `pgsql`; Laravel provides the PostgreSQL connection. This verifies configured technology, not live connectivity or applied migration state. The diagram uses four logical groups:

- Access: users, roles, permissions and organizational/warehouse references.
- Procurement: replenishment requests, purchase orders/items and supplier records.
- Warehouse: products, inventories, receivings/items, QA inspections/items and receiving timelines.
- Fulfillment: orders/items, stock-out transactions and order status histories.

Migrations link receiving to purchase orders, PO references to replenishment requests, inventories to products/warehouses, QA to receiving/items and stock-out transactions to orders/items/inventory. These groups share one application database. A detailed ERD is intentionally separate.

Evidence: [example database driver](../../../backend/.env.example), [database configuration](../../../backend/config/database.php), [migrations](../../../backend/database/migrations), [models](../../../backend/app/Models).

## 8. Core Data/Process Flow

1. **Procurement:** Request → Approval → Purchase Order → Supplier → Receiving. Supplier dispatch is represented as a business step/status, not an electronic integration.
2. **Receiving:** Delivery → Receiving → QA Inspection → Passed → Stock In → Inventory. The successful path is implemented; partial acceptance/rejection is secondary.
3. **Order fulfillment:** Order → Inventory Check → Stock Out → Shipment → Completed. Implementation reaches logistics forwarding; Completed is the intended future delivery outcome, not an available API transition or literal current order status.
4. **AI forecasting:** Historical Data → FastAPI → ML Model → Forecast → Replenishment Decision. This is the target flow; only the FastAPI scaffold and forecast UI placeholders exist.

The frontend initiates REST operations, Laravel performs validation and business rules, and PostgreSQL persists the results. Domain-to-database arrows represent shared Eloquent/SQL access, not isolated databases. The unlabeled users-to-frontend and security-to-API relationships are already expressed by their endpoint names; they introduce no separate protocol or service.

## 9. Implemented vs Planned Notes

- **IMPLEMENTED in source:** role panels, Sanctum login/protected routes, role/permission models and authorization checks, manual replenishment/approval/PO/supplier records, PO-linked receiving, QA outcomes, accepted stock-in, inventory, order preparation, stock-out, shipment forwarding, and database-backed report queries.
- **PARTIALLY IMPLEMENTED / INTEGRATION IN PROGRESS:** AI subsystem (service scaffold plus sample/placeholder forecast displays); fulfillment beyond logistics forwarding.
- **PLANNED / not implemented in inspected source:** historical-data extraction to FastAPI, ML inference and forecast processing, forecast-result integration into replenishment decisions, and delivered/completed write transitions.

These classifications were established before authoring. No model algorithm, external e-commerce connector, carrier API, supplier messaging service or production deployment topology was inferred. Existing local frontend edits were preserved. The repository review checklist was applied to documentation claims about statuses, authorization, relationships and scope; no application test suite was run because this task changed only documentation.

## Artifact and validation

Open [the interactive architecture](smartchain-system-architecture.html). The editable [Archify specification](smartchain-system-architecture.json) is stored with its [deterministic delivery receipt](smartchain-system-architecture-delivery.json). Archify showcase validation passed all nine checks with zero composition errors and warnings. Browser evidence and perceptual review are recorded separately in the validation notes/sidecars.
