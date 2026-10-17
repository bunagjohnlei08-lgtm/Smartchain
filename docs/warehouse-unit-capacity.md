# Warehouse capacity allocations

Implemented 2026-10-14 for the clarified business allocation rule.

One `capacity` value is the warehouse's Total Capacity allocation budget. Administrators explicitly divide that budget among `capacity_kg`, `capacity_pcs`, and `capacity_l`. The three nonnegative whole-number allocations must sum exactly to Total Capacity. For a 10,000 budget, the total allocation is 10,000 across the three units, not 10,000 per unit. No weight/volume/piece conversions are used.

## Resulting behavior

- Admin Manage Locations retains Total Capacity and adds three editable allocation fields. Missing values, negative/fractional values, and incorrect totals prevent saving. Server validation is also enforced, with a database check constraint for allocation integrity.
- Allocated, used, and remaining capacity are shown separately for KG, PCS, and L. Overall text reports the allocation budget, such as `10,000 fully allocated`; stock usage is never combined into a physical capacity total.
- Used capacity retains the existing definition of available plus reserved stock, now grouped by catalog unit. Backload is shown separately and retains its existing workflow meaning. Unit matching consistently normalizes case and surrounding whitespace, including tabs/newlines, without changing saved product units.
- Stock In aggregates all QA-accepted incoming items by their catalog unit before making any stock changes. A shortage in any one unit rejects the entire operation. Existing inventory barcodes and receipt idempotency are preserved.
- Admin inventory additions and increases check their matching allocation. Transfers through inventory warehouse changes check the destination allocation using the full incoming available-plus-reserved quantity. Updates within the same warehouse validate the positive quantity change. Warehouses are locked in a consistent order and validation happens inside the stock transaction.
- Catalog edits cannot relabel existing KG/L or unmeasured stored stock as PCS to bypass allocation accounting. No conversion is implied by editing a unit label.
- Capacity alerts are tracked independently per unit, including deduplication, rearming after stock falls, correct recipient scope, and delivery after transaction commit.
- Warehouse pages, capacity dashboard cards, and Admin/Plant Manager capacity reports use the same allocation snapshot. Exported capacity reports show one row per warehouse/unit. Warehouse counts and total allocation budgets are not multiplied by the number of unit rows.
- Stock In's capacity preview uses the same existing default warehouse selection as the actual Stock In operation, rather than displaying an unrelated assigned warehouse's allocation.

## Existing records and required setup

The migration does not backfill any allocation or change existing Total Capacity values. Existing stock, barcodes, historical transactions, and supplier applications are preserved. Legacy warehouses show **allocation setup required** and their recorded usage per unit. Stock reductions and unrelated metadata edits remain possible; positive stock additions and inbound transfers require an explicitly saved split.

The inspected local warehouse has **Total Capacity = NULL**, rather than an already saved 10,000. That value was preserved. To configure it:

1. Sign in as Admin and open **Manage Locations** (`/admin/manage-locations`).
2. Choose **Edit Location**.
3. Enter **10,000** in Total Capacity.
4. Enter the actual KG, PCS, and L allocations agreed by the business. The example split was not saved automatically.
5. Save when the allocations total exactly 10,000. Each allocation must also cover any existing used quantity in that unit.

Existing inventory in other or missing units is explicitly displayed as lacking a matching allocation. New stock in those units is blocked. The implementation does not infer KG/PCS/L or invent conversion factors for bags, drums, or unspecified legacy units.

## Migration

New additive migration: `backend/database/migrations/2026_10_14_000000_add_unit_capacity_allocations_to_warehouses.php`.

It adds three nullable integer allocation columns, one nullable JSON column for unit alert state, and an integrity constraint. All-null legacy allocations are allowed; a configured split must be complete, nonnegative, and equal Total Capacity.

**Applied successfully to the local application database.** Migration status now contains 77 applied migrations. Other installations require their normal `php artisan migrate` deployment step. No new dependency or environment-secret change is required.

## Verification

| Check | Result |
| --- | --- |
| Focused allocation and workflow regressions | **170 passed, 1,552 assertions** on the final code |
| Final additional edge checks before the normalization review | **31 passed, 190 assertions**; the final 170-test run also includes these cases |
| Full PHPUnit regression run | **664 tests: 662 passed, 1 failure, 1 error; 5,507 assertions** |
| Known full-suite exceptions | Existing AuditLogTest password fixture fails symbol policy; existing InventoryQualityAuditTest uses unsupported PostgreSQL JSON equality |
| PHP syntax checks | Passed for changed PHP files and migration; final changed guards/helper rechecked |
| Scoped frontend lint | Passed for all eight changed/new frontend source files |
| TypeScript and production build | Passed; existing large-bundle warning remains |
| Real component browser check | Passed for blank legacy fields, incorrect totals, negative allocations, a valid split, and server validation error feedback |
| Responsive/theme checks | Passed at 390, 768, and 1440 px in light and dark themes, with no horizontal overflow or browser exceptions |
| Local migration record preservation | SHA-256 comparison confirmed existing columns/rows in nine protected tables unchanged |
| Prior work preservation | All seven existing Supplier Portal modified/untracked files unchanged by SHA-256 comparison |
| Final diff check | `git diff --check` passed |

The test database was isolated PostgreSQL on port 55432, `smartchain_test_db`. It was stopped after verification. Browser writes used intercepted fixture responses; no real allocation split or stock change was made through the browser checks. Local check logs, JUnit results, data hashes, and screenshots are under ignored `.codex/capacity-*` artifacts.

The OpenCodeReview checklist was applied to validation, role restrictions, warehouse scoping, atomic stock changes, lock order, unit normalization, migration compatibility, and regression preservation. UI/UX Pro Max was used for labels, inline validation, responsive layouts, and accessible light/dark presentation. No commit or push was performed. The Supplier Portal redesign and unrelated workflows were preserved.

## Files changed for this task

Backend implementation:

- `backend/app/Support/WarehouseCapacity.php`
- `backend/app/Models/Warehouse.php`
- `backend/app/Http/Controllers/Api/AdminWarehouseLocationController.php`
- `backend/app/Http/Controllers/Api/InventoryController.php`
- `backend/app/Http/Controllers/Api/StockInController.php`
- `backend/app/Http/Controllers/Api/ProductController.php`
- `backend/app/Http/Controllers/Api/DashboardController.php`
- `backend/app/Http/Controllers/Api/AdminReportController.php`
- `backend/app/Http/Controllers/Api/ReportsController.php`
- `backend/app/Reports/ReportRegistry.php`
- `backend/routes/api.php`
- `backend/database/migrations/2026_10_14_000000_add_unit_capacity_allocations_to_warehouses.php` (new)

Frontend:

- `frontend/src/lib/warehouseCapacity.ts` (new)
- `frontend/src/components/warehouse/CapacitySummary.tsx` (new)
- `frontend/src/page/admin/warehouse/ManageLocations.tsx`
- `frontend/src/page/plant-manager/Warehouse.tsx`
- `frontend/src/page/plant-manager/StockIn.tsx`
- `frontend/src/page/admin/AdminDashboard.tsx`
- `frontend/src/page/admin/Reports.tsx`
- `frontend/src/page/plant-manager/Reports.tsx`

Tests:

- `backend/tests/Feature/WarehouseUnitAllocationTest.php` (new)
- `backend/tests/Feature/WarehouseCapacityWarningTest.php`
- `backend/tests/Feature/StockInTest.php`
- `backend/tests/Feature/QaInspectionTest.php`
- `backend/tests/Feature/PlantManagerWarehouseTest.php`
- `backend/tests/Feature/AdminDashboardWarehouseUtilizationTest.php`
- `backend/tests/Feature/AdminReportsDashboardTest.php`
- `backend/tests/Feature/AdminReportsModuleTest.php`
- `backend/tests/Feature/PlantManagerReportsTest.php`
- `backend/tests/Feature/PublicCompanyLocationTest.php`

Documentation: `docs/warehouse-unit-capacity.md` (this file).

No implementation blocker remains for this capacity change. Warehouse configuration is an explicit operational setup step. The two unrelated baseline test exceptions remain unresolved.
