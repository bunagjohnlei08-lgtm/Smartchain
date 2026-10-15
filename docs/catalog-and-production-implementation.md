# SmartChain catalog and independent production implementation

Verified on 2026-10-14 in the existing `Smartchain-New` checkout. This report describes changes relative to the start of this task, preserving the earlier Supplier Portal and warehouse-allocation work.

## Business decisions implemented

- One Product Catalog and one existing Inventory. `item_classification` is `RAW_MATERIAL` or `FINISHED_PRODUCT`. Existing products default to Finished Product; Admin explicitly identifies actual raw materials.
- Both classifications require the existing active supplier and warehouse setup when created. Both retain the same supplier replenishment, approval, PO, receiving, manual incoming QA, and Stock In process. Finished products with a BOM remain supplier-procurable.
- There is no `supply_method`, production replenishment status, mandatory replenishment link, or automatic batch creation. Production never completes a supplier replenishment request.
- Required Stock Unit is independent of classification. KG, PCS, and L choices come from the selected warehouse's saved **positive allocations**, even when their remaining quantity is zero. The existing Total Capacity is divided among units; no conversions or fabricated allocations.
- Internal production is a deliberate Plant Manager action using stocked raw materials. Output enters the same inventory only after assigned QA inspection and a separate passed-only Stock In action.

## Inspection and source limitations

Read root `AGENTS.md`, the repository's Open Code Review and UI/UX Pro Max skills, `.codex/hybrid-architecture-preflight.md`, and `docs/warehouse-unit-capacity.md`. Used the two local skills as backend review and UI guidance. The memory registry search returned no relevant project entries. No unrelated plugins or agents were used.

Inspected starting status, full tracked diff, schemas, migration status, routes, roles, forms, inventory calculations, procurement and fulfillment, tests, toolchain, and relevant original requirements. Starting changes were saved in `.codex/catalog-production-start.diff` and `.codex/catalog-production-start-files.json`.

The available original master attachment still ends at section **70, MIGRATIONS, `(14 KB left)`**. Searching attachments and repository documentation did not find a complete original. Requirements after that truncation are **Unverified**, not assumed implemented. The latest explicit request and available sections govern this change.

Installed stack verified: PHP 8.5.11, Laravel 13.18.1, Node 24.21.0, Composer 2.10.3, PostgreSQL 18. Existing dependencies were sufficient; no package or secret changes were needed.

## Before/after audit

Status names: Implemented, Partial, Missing, Blocked, Unverified, Superseded by latest clarification. “Before” refers to this task's inspected checkout, including prior uncommitted changes.

| Available original sections / latest requirement | Before | After | Schema / code evidence | UI entry and role | Verification |
|---|---|---|---|---|---|
| 0–3: existing app inspection and protected workflows | Implemented | Implemented | Starting diff/hash snapshots; existing controller and route inspection | Existing Admin, PM, QA modules | Live baseline; 202 focused regressions; seven Supplier Portal file hashes unchanged |
| 4, 6–9, 53, 57, 61: classification and catalog | Missing | Implemented | Product constants/defaults, classification migration, ProductController validation/filter/detail; CatalogProductRules | Admin → Product Catalog → Add/Edit/details/filter | Defaults, both classes, every KG/PCS/L choice, persistence, supplier and zero-stock setup tests |
| 5, conflicting parts of 8/9/11/19/27/50/52/53: Purchased/Manufactured method and supplier exemption | Missing | Superseded by latest clarification | No supply-method column or branch added; supplier validation retained for both | Same catalog forms and supplier mapping | Schema/status assertions; finished-with-BOM supplier flow test |
| 10 and latest warehouse-based unit selection | Partial: fixed PCS creation | Implemented | Saved warehouse allocations, supported-unit metadata, CatalogProductRules, immutable used/history guards | Admin catalog and Supplier Offerings → Create New Product | Full allocation allows zero setup; unsupported/unconfigured unit rejection; compatible unit edits and all assigned warehouses |
| Latest Total Capacity business decision | Implemented by prior task | Implemented, preserved | Existing WarehouseCapacity and nullable allocation migration; stock additions/transfers use matching-unit quotas | Admin → Manage Locations; PM Warehouse / Stock In | WarehouseUnitAllocationTest; no conversion or mixed physical capacity introduced |
| Latest safe deletion | Partial: blanket inventory dependency rejection | Implemented | ProductController transaction; setup provenance and persistent stock-history flag; history/FK checks | Admin catalog Delete | Setup cleanup, real history/BOM/reservation rejection, role guards, concurrent PO insert versus deletion |
| 11: Supplier Application → Catalog Mapping | Partial: fixed unit, no classification | Implemented | AdminCatalogMappingController, active supplier locks, ProductCatalogSetup | Admin catalog → Supplier Offerings → Create New Product | SupplierCatalogMappingTest plus classified catalog tests; no applicant flow redesign |
| 12/13/22/41/51: one inventory with classification views | Partial: one inventory existed | Implemented | Existing inventories; InventoryController classification DTO/filter; no parallel stock table | Admin and PM Inventory → All/Raw Materials/Finished Products | API filters, existing inventory regressions, selected unit shown beside row quantities |
| 14/42/43/55/62: finished-only orders and existing barcodes | Partial: catalog eligibility unrestricted | Implemented | AdminOrderController selection/create, PM readiness, StockOut barcode release guard | Admin Order Management; PM existing Order Management / Stock Out / Shipment | Finished production output → real order API → preparation → original barcode release; scanner and shipment regressions |
| 15/18/20/21/49/63: shared supplier lifecycle, thresholds and manual actions | Implemented | Implemented, preserved | Existing ReplenishmentLifecycle/fulfillment stages, procurement, Receiving, QA and StockIn controllers | Existing PM Procurement/Receiving, Admin Procurement/PO, QA Inspection, PM Stock In | Isolated raw L and finished KG with BOM both traverse the SAME complete API workflow; 202 focused regressions |
| 16/17, conflicting 19/31/47/48/56/64: production routing/completion of replenishment | Missing | Superseded by latest clarification | Production tables have no required replenishment link; no new replenishment statuses; no historic reconciliation | Separate PM Production Batches | No production batch created by supplier flow; no PO/request created or completed by production |
| 23–28/31/32: BOM, batches and exact requirements | Missing | Implemented | boms, bom_materials, production_batches/materials; BomController, ProductionWorkflow::scaledDemand | Admin SWS → BOM / Formulas; PM → Production Batches | Raw-only BOM, role/output/warehouse guards, immutable batch snapshot after BOM edits, shortages and exact fractions |
| 24/33/34/65/69: explicit issuance without scanning | Missing | Implemented | production_material_issues unique material reference; warehouse/batch/inventory row locks; whole-unit atomic decrement | PM batch → Issue Materials to Production | All-or-nothing shortage test, retry test, two simultaneous workers deduct once, no scanner or automatic replenishment |
| 35: cancellation/material disposition | Missing | Implemented | ProductionWorkflow::cancel, preserved issue records and disposition/event history | PM planned/in-production batch → Cancel Batch | Explicit unused-material confirmation, matching-unit return capacity, repeated cancellation, disposal without fabricated stock |
| 36/37: actual output and assigned manual production QA | Missing | Implemented | Batch output/QA fields, exact passed+failed DB constraint, role and assignment authorization | PM → Send Output to QA; assigned QA → Production Inspections | No output stock before QA; wrong role/assignee and incorrect totals rejected; browser invalid-total button guard |
| 38/39: internal failure separated from supplier rejection and Backload | Missing | Implemented | production_non_conformances, HOLD/REWORK/DISPOSAL disposition and events | QA Production Inspections → batch → Internal Production Non-Conformance | Failed output leaves sellable inventory, Backload and supplier rejection tables unchanged; disposition tests |
| 40/41: passed-only finished Stock In | Missing | Implemented | ProductionWorkflow::stockIn, existing Inventory/Barcode, WarehouseCapacity matching unit | PM production batch → Stock In QA-passed Finished Goods | QA gate, passed-only count, quota failure/retry, stable barcode, simultaneous workers increment once |
| 29/30/67/68: navigation, design and RBAC | Missing | Implemented | Existing route layouts and actual sidebars; backend action guards; no seventh Admin core module | Admin SWS BOM/Oversight; PM Production Batches; QA Production Inspections | Actual role routes with browser fixtures; 42 light/dark 375/768/1440 screenshots; backend role/warehouse/QA-assignment tests |
| 44/45: notifications and audit history | Partial: existing infrastructure only | Implemented | AuditLogger, production_batch_events, WorkflowNotificationSender after commit, role notification destinations | Existing Notifications; batch Production History | Notification recipient/warehouse tests; audit assertions; browser action history |
| 46: reports through existing architecture | Partial: no production/classification sources | Implemented | Existing ReportRegistry classified stock/production history; PM ReportsController scoped production source | Admin Reports → Inventory/Warehouse; PM Reports → Production Batch History | Classified rows, units, Admin access and other-warehouse PM exclusion tests; existing report regressions |
| 52/54/70 available text: additive schema and historic safety | Missing | Implemented | Two additive migrations; nullable PO identity/unit/classification snapshots for NEW POs; setup provenance | Existing app; no operational demonstration data inserted locally | Migration compatibility test; local before/after hashes of 19 existing business tables match; both local migrations applied |
| 58/66: baseline and protected-module testing | Unverified for this checkout | Implemented verification | Isolated PostgreSQL tests, frontend checks, hash snapshots | Existing modules preserved | Current baseline 662/664; final 688/690 with the same two unrelated failures; focused 202/202 |
| 59 phase 1: discovery/capacity decision | Implemented | Implemented | Current schema and clarified capacity rule | Existing Manage Locations | No unresolved mixed-unit business question |
| 59 phase 2: classification/inventory/order eligibility | Missing | Implemented | Catalog migration, classification UI/API and order guards | Catalog / Inventory / Orders | Catalog and order tests; browser catalog flow |
| 59 phase 3: replenishment routing | Missing | Superseded by latest clarification | Preserve supplier routing for both classes | Existing Procurement | Complete classified supplier-flow test |
| 59 phase 4: BOM/production/material issue | Missing | Implemented | Production schema/controllers/service | Admin BOM, PM Production Batches | Atomic issuance, exact demand, snapshot and concurrency tests |
| 59 phase 5: production QA/finished Stock In | Missing | Implemented | Assigned QA, internal failure, idempotent Stock In | QA Production Inspections; PM production Stock In | Manual QA, rejection separation, quota and concurrent stock-in tests |
| 59 phase 6: notifications/audit/reports/regression | Missing | Implemented | Existing infrastructure extended | Existing Notifications/Reports and batch history | 202 focused tests, full suite, TypeScript/build, scoped lint, browser |
| 60: fractional whole-inventory limits | Previously unresolved | Blocked only for affected batch demands | Exact fixed-point arithmetic reports the reduced fraction; issue rejects fractional or >2,147,483,647 demand | PM material requirements show reason and remedy | `0.25 × 3 = 3/4` blocks; target 4 requires 1 and works; excessive precision is rejected |
| Unavailable section 70 remainder and later original requirements | Unverified | Unverified | Original full copy unavailable | Not inferred | Continue based on explicit latest scope; no hidden requirement completion claim |

REWORK records a held internal rework plan. It does not fabricate inventory, automatically reprocess failed output, or claim physical completion. QA can document disposal; additional production is a separate deliberate batch with its own stock/material/QA controls. No global quantity columns were converted to decimals.

## Deletion root cause and protections

The previous ProductController rejected a product whenever an Inventory row existed. Catalog creation deliberately creates an empty row, so ordinary unused setup could never be removed.

Deletion now locks mapped offerings, assigned warehouses, product identity, and inventory rows; verifies dependencies; removes only proven empty setup and its supplier pivot/current offering mapping; retains audit/application history; and deletes the unused product. Unproven legacy zero rows remain blocked with a specific explanation. A legacy setup audit with unchanged timestamps and no adjustment/history can establish disposable setup. Zero quantity alone never establishes that.

New setup has `catalog_setup_at`. InventoryObserver permanently records `has_stock_history` when quantities exist now or existed before an update, including stock rising and returning to zero within one timestamp interval. Clients cannot clear that flag through the inventory API. Actual orders/POs/receiving/replenishment/stock movements/inventory audits/BOM/production dependencies protect even zero-stock records. The Inventory deletion API also permits only proven unused setup, closing the route that could erase a used row before catalog deletion. Manual adjustment audit references survive previously removed inventory rows through their original product/warehouse setup audit. Legacy name-only PO/customer-order references are included, with known names retained through catalog rename audits.

New PO rows retain product ID and unit/classification snapshots; old PO rows are not backfilled or rewritten. Product locks plus restrictive foreign keys protect new concurrent dependencies. The isolated contention check observed a PO insert waiting for the product lock, then failing with a foreign-key violation after valid unused-setup deletion. No orphaned dependency was created. Successful UI deletion refreshes catalog counts, selections, and supplier-offering candidates; PM candidates are recomputed from existing inventory on their next fetch.

## Migrations and local data preservation

New additive migrations:

1. `backend/database/migrations/2026_10_14_010000_add_catalog_classification_and_setup_provenance.php`
   - Classification with safe Finished Product default and enum check.
   - Missing legacy catalog units default to PCS; explicit units and historic quantities/barcodes remain.
   - Nullable setup timestamp and stock-history flag.
   - Nullable product identity and unit/classification snapshots on PO items; historic PO rows remain untouched.
2. `backend/database/migrations/2026_10_14_020000_create_internal_production_tables.php`
   - BOM/formula, batch/material snapshots, immutable issuance, internal non-conformance, events, restrictive references and quantity checks.

**Both are applied to the local application database.** It now has 79 applied migrations, no pending migration. The earlier `2026_10_14_000000_add_unit_capacity_allocations_to_warehouses.php` was already applied and was not changed by this task.

Before applying these two migrations, hashed 19 existing business tables, including six products/inventory rows, supplier and application/offering data, PO/Receiving/QA and replenishment records. The original-column hashes match after migration. The warehouse's already saved Total 10,000 and allocations KG 4,000 / PCS 3,000 / L 3,000 also match. This implementation did not set that allocation split. Existing warehouses with null allocations elsewhere remain unconfigured until Admin explicitly saves their allocation.

Evidence: `.codex/catalog-local-before.json`, `.codex/catalog-local-after.json`, `.codex/catalog-migration-before.log`, `.codex/catalog-migration-applied.log`, `.codex/catalog-migration-after.log`.

Other installations require the usual `php artisan migrate` deployment step. No reset, fresh migration, rollback or seed was run against the application database. Tests and concurrency demonstrations used only `smartchain_test_db` at port 55432. No real supplier/customer messages were sent.

## Verification

- Live baseline: **664 tests, 662 passed, 5,511 assertions**, one failure and one error. `.codex/catalog-production-baseline.log`.
- Final full suite: **690 tests, 688 passed, 5,886 assertions**, the same two baseline issues. `.codex/catalog-production-full.log`.
- Final focused regression: **202 passed, 2,248 assertions**. Catalog/mapping, exact units/capacity, legacy deletion/migration, shared supplier lifecycle, internal production, orders/Receiving/Stock Out/shipment, Supplier Portal/Brevo and report checks. `.codex/catalog-production-regression.log`.
- New catalog/production/supply tests alone: **26 passed, 363 assertions**. `.codex/catalog-production-new-tests.log`.
- Separate concurrent-worker check: observed actual PostgreSQL lock contention; two material-issue workers deduct once, two finished-stock-in workers increment once, and a concurrent PO dependency cannot survive unused product deletion. `.codex/catalog-production-concurrency.log` and `.codex/check-production-concurrency.php`.
- Isolated demonstrations: raw material L and finished product KG with BOM each use original supplier approval/PO/receiving/QA/Stock In; separate raw KG production → material issuance → actual output → manual QA with failure held internally → passed PCS output Stock In → customer order/preparation/original barcode release.
- `npm run build` passes TypeScript and Vite. Existing large bundle warning remains. `.codex/catalog-production-build.log`.
- Scoped lint has no errors; one existing Receiving Management missing-effect-dependency warning remains in a touched file. No new lint warning was introduced. Global lint remains blocked by the existing conditional `useEffect` at `frontend/src/page/plant-manager/Shipment.tsx:295`, with four existing warnings. `.codex/catalog-production-lint.log`, `.codex/catalog-production-global-lint.log`.
- PHP syntax checks passed for changed/new application, route and migration files. Production routes register successfully. Final diff whitespace check passed.
- Browser: actual protected-role routes/layouts with all backend traffic intercepted; catalog compatible/incompatible/missing warehouse unit setup and setup deletion; Admin BOM creation; PM planned batch/issuance/output; assigned QA invalid/valid totals and internal HOLD; PM passed Stock In and both Inventory classification filters/unit displays. 42 screenshots at 375/768/1440 in light/dark mode; no page overflow or runtime/interception errors. `.codex/check-catalog-production.mjs`, `.codex/catalog-production-browser/result.json`.
- Visual inspection covered the mobile Add Product form and desktop dark production QA view. Form labels, role navigation, unit quantities, validation and existing responsive layout remain usable.
- Seven Supplier Portal implementation/test/doc files match start-of-task SHA-256 snapshots. Existing map/location code and the prior capacity implementation remain intact. No stage, commit or push.

Unrelated full-suite failures remain: `AuditLogTest::test_user_update_role_change_and_status_changes_are_audited` uses a password without a required symbol; `InventoryQualityAuditTest::test_admin_can_change_configured_months` compares PostgreSQL JSON using unsupported equality. Their implementation/test files were not changed to conceal these failures.

## Role guide

### Admin

1. Manage Locations → Edit Location: save an intentional Total Capacity and KG/PCS/L allocation whose sum matches it. Units with positive allocation appear in catalog forms; no automatic split is applied.
2. Product Catalog → Add Product: choose Classification, an active Assigned Supplier, Warehouse, and supported Stock Unit. Save creates only zero-stock setup. Supplier Offerings → Create New Product offers the same classification/unit choices.
3. Edit/detail: inspect classification and unit; unused setup can change unit only when every assigned warehouse supports it. Used/history-dependent units explain why they are locked. Delete removes proven unused setup; dependency errors identify the reason.
4. Smart Warehousing System (SWS) → BOM / Formulas, or finished-product detail → Manage BOM: choose finished product, formula output quantity, raw ingredients and exact requirements; save. Changing a BOM affects future batches; existing snapshots remain.
5. SWS → Production Oversight: view all batches, requirements, QA, internal dispositions and history. Admin cannot issue materials or perform QA through this oversight view.
6. Reports: use Raw Material Stock, Finished Product Stock and Warehouse → Production Batch History. Both classes remain available in normal Procurement and Purchase Order Management.

### Plant Manager

1. Supply either classification through existing Procurement: choose low-stock candidate, enter requested quantity, forward to Admin. Continue Receiving, QA assignment and original Stock In after supplier delivery.
2. Warehouse navigation → Production Batches: choose a finished product assigned to your warehouse with configured BOM and enter target quantity. Create Planned Batch; no stock changes yet.
3. Open batch and review exact requirements, available quantities and shortages. For a fractional demand, choose a compatible target or ask Admin to revise the formula intentionally. Stock shortages require separate replenishment or existing approved stock actions.
4. Issue Materials to Production: deduct all required whole stock units atomically once, with no barcode scan.
5. Record Actual Output and choose an eligible active QA Supervisor → Send Output to QA. Output stays outside sellable inventory.
6. After QA, Stock In QA-passed Finished Goods. Matching-unit remaining allocation must fit. Repeat requests cannot increment stock twice.
7. Cancellation: planned batches cancel with a reason. Issued batches also require explicit confirmed return of **all physically unused** materials, with capacity checking, or documented consumed/disposed material disposition. Recorded output must finish QA/internal disposition instead of cancellation.
8. Sell eligible finished inventory through existing Order Management, barcode Stock Out, packing, shipment and logistics. Reports → Production Batch History is scoped to your assigned warehouse.

### QA Supervisor

1. Continue existing supplier Quality Inspection and Rejected Items unchanged.
2. Production Inspections → assigned batch: manually inspect actual produced quantity, enter passed and failed quantities plus notes. Their sum must match output exactly; no scan is required.
3. Failed output creates Internal Production Non-Conformance with HOLD. Record a held rework plan or documented disposal as appropriate. It does not enter Supplier Rejected Items or Backload and does not become sellable.
4. Passed output becomes eligible for the Plant Manager's separate finished-goods Stock In. Only the assigned QA can complete that batch's inspection or failure disposition.

## Remaining setup / limitations

- Admin must explicitly classify actual raw materials and configure BOMs; existing products are not inferred from names or categories. PM users need the correct warehouse and an eligible active QA assignee.
- Unconfigured warehouses need explicit saved allocations. A full positive allocation still supports catalog setup but blocks incoming quantities until matching-unit space is available.
- Inventory continues storing whole quantities. Exact fractional ingredient demands and demands beyond its existing integer column limit block only the affected issuance; quantities are never rounded or converted.
- Physical production, inspection and material-return/disposal truth require the responsible roles' explicit records. REWORK is a plan/disposition record, not an automatic physical reprocessing engine.
- Original master text after the supplied truncation is unavailable. The two unrelated baseline test issues, existing global lint error and bundle warning remain documented above.

## Exact project files changed in this task

The manifest below compares current hashes against `.codex/catalog-production-start-files.json` and includes new source/test/report files. Prior unchanged Supplier Portal/capacity files appearing in the overall dirty worktree are intentionally excluded. Temporary verification scripts/logs/screenshots are ignored under `.codex`; no operational fixtures were added to production seeders.

```text
backend/app/Http/Controllers/Api/AdminCatalogMappingController.php
backend/app/Http/Controllers/Api/AdminOrderController.php
backend/app/Http/Controllers/Api/AdminProcurementController.php
backend/app/Http/Controllers/Api/BomController.php
backend/app/Http/Controllers/Api/InventoryController.php
backend/app/Http/Controllers/Api/PlantManagerOrderController.php
backend/app/Http/Controllers/Api/PlantManagerProcurementController.php
backend/app/Http/Controllers/Api/ProductController.php
backend/app/Http/Controllers/Api/ProductionController.php
backend/app/Http/Controllers/Api/PurchaseOrderController.php
backend/app/Http/Controllers/Api/ReceivingController.php
backend/app/Http/Controllers/Api/ReportsController.php
backend/app/Http/Controllers/Api/StockInController.php
backend/app/Http/Controllers/Api/StockOutController.php
backend/app/Models/Bom.php
backend/app/Models/BomMaterial.php
backend/app/Models/Inventory.php
backend/app/Models/Product.php
backend/app/Models/ProductionBatch.php
backend/app/Models/ProductionBatchMaterial.php
backend/app/Models/PurchaseOrderItem.php
backend/app/Observers/InventoryObserver.php
backend/app/Reports/ReportRegistry.php
backend/app/Support/CatalogProductRules.php
backend/app/Support/ProductCatalogSetup.php
backend/app/Support/ProductionWorkflow.php
backend/database/migrations/2026_10_14_010000_add_catalog_classification_and_setup_provenance.php
backend/database/migrations/2026_10_14_020000_create_internal_production_tables.php
backend/routes/api.php
backend/tests/Feature/AdminOrderManagementTest.php
backend/tests/Feature/CatalogClassificationAndDeletionTest.php
backend/tests/Feature/InternalProductionTest.php
backend/tests/Feature/ProductCatalogTest.php
backend/tests/Feature/ReceivingPurchaseOrderTest.php
backend/tests/Feature/SharedClassifiedSupplyTest.php
backend/tests/Feature/SupplierCatalogMappingTest.php
backend/tests/Feature/WarehouseUnitAllocationTest.php
backend/tests/Support/ProductionFixture.php
docs/catalog-and-production-implementation.md
frontend/src/components/catalog/ProductFields.tsx
frontend/src/components/layout/AdminSidebar.tsx
frontend/src/components/layout/PlantManagerSidebar.tsx
frontend/src/components/layout/QASidebar.tsx
frontend/src/lib/catalog.ts
frontend/src/lib/notificationDestination.ts
frontend/src/page/admin/Boms.tsx
frontend/src/page/admin/CatalogMappingPanel.tsx
frontend/src/page/admin/Inventory.tsx
frontend/src/page/admin/Procurement.tsx
frontend/src/page/admin/ProductCatalog.tsx
frontend/src/page/admin/PurchaseOrders.tsx
frontend/src/page/plant-manager/Inventory.tsx
frontend/src/page/plant-manager/Procurement.tsx
frontend/src/page/plant-manager/Receiving Management.tsx
frontend/src/page/plant-manager/Reports.tsx
frontend/src/page/production/ProductionWorkspace.tsx
frontend/src/routes/index.tsx
frontend/src/types/index.ts
```
