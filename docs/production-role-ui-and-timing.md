# Production role screens, processing time and confirmations

Verified on 2026-10-14 in this checkout. This extends the Production Batches table/step refactor and preserves the completed catalog, Supplier Portal and warehouse unit-allocation changes. No commit or push was made.

## Role guide

1. **Admin → Smart Warehousing → BOM / Formulas:** the initial screen lists saved formulas. Create Formula opens a dialog for a finished product without a current formula. Set output quantity, raw materials with their existing KG/PCS/L units, and Minimum Production Time in positive whole minutes (default 30). View Formula is read-only; Edit Formula is prefilled and keeps its finished-product identity. Saving refreshes the table. Existing batches keep their copied formula, material requirements and processing duration.
2. **Plant Manager → Production Batches:** search/filter/page through a table. View opens a read-only batch; Continue Batch opens its permitted next stage. Create Batch is a separate page and offers only valid current BOM products eligible for the assigned active warehouse. Material shortages remain visible after planning; they do not hide a valid formula. No batch is created by opening a page, and creation does not issue stock.
3. **PM → Materials:** review exact requirements and current matching warehouse stock. Export Pick List (PDF) downloads a genuine PDF; Print Pick List opens the same document body for browser printing. Issue Materials requires confirmation and atomically deducts all required stocked raw materials. This existing action already starts production; there is no extra Start Production mutation.
4. **PM → Production Output:** review the saved start, earliest output time and countdown. Submission stays disabled during the minimum processing period. Once elapsed, deliberately enter actual output and assign an eligible QA Supervisor. Above-target output opens a confirmation showing Target, Entered Output and Above Target. Review Quantity preserves the input and returns focus; Confirm and Send to QA sends the current acknowledged values. Neither elapsed time nor opening the confirmation submits automatically.
5. **QA → Production Inspections:** search/filter/page through assigned records. Inspect is available only for assigned pending output. The dialog progresses through Review Batch → Record Inspection → Review & Confirm. Enter whole-unit passed/failed quantities totaling the recorded actual output, plus inspection notes. Above-target actual output requires a separate QA checklist, even if the passed quantity is at or below target. Complete the inspection explicitly. View Result is read-only; existing internal Hold/Rework/Disposal actions remain under View Non-Conformance. There is no persisted draft or fake Continue Inspection state.
6. **PM → QA Inspection / Finished Goods Stock In:** refresh to see the saved inspection. Only its passed quantity can be stocked in, through the separate Stock In Passed Goods action. Existing matching-unit capacity checks still apply. All-failed output has no stock-in action. Failed units remain in internal production non-conformance, outside supplier rejection and Backload.
7. **Admin → Production Oversight:** table first, then a selected read-only dialog with Overview, Materials, Output & QA, Stock In and History. Production lifecycle and QA pass/partial/fail results remain separate; a stocked batch may still have excluded failed units.

List filters and pagination remain in the URL after closing details or returning to the list. PM routes are `/plant-manager/production`, `/plant-manager/production/create`, and `/plant-manager/production/:batchId`; details default to View unless `mode=continue` is explicitly selected. QA and Admin detail dialogs never auto-open the first record.

## Persisted status and action mapping

| Existing persisted status | PM step / permitted action | QA action | Admin action |
|---|---|---|---|
| PLANNED | Batch Details for review; Materials is next. Confirm Issue only when demand is supported and stock is sufficient. Cancel with reason. | No inspection before output is assigned. | Read-only review. |
| IN_PRODUCTION | Production Output. Wait for minimum processing time, then deliberately send output. Cancel requires recorded material disposition. | No inspection before handoff. | Read-only timing/material review. |
| PENDING_QA | QA Inspection, read-only. No stock-in or repeat output. | Assigned supervisor may Inspect through the three steps. | Read-only output/QA review. |
| QA_COMPLETED | Passed > 0: Finished Goods Stock In is next. Passed = 0: QA result/internal failure review, with no stock-in. | View Result; existing unresolved internal disposition actions. | Read-only result and eligible quantities. |
| STOCKED_IN | Finished Goods Stock In recorded; no duplicate action. | View Result and applicable unresolved failure disposition. | Read-only stock-in and failure review. |
| CANCELLED | Read-only details/material disposition/history; no continuation. | No new inspection action. | Read-only cancellation review. |

The five PM steps are presentation of these six existing statuses, not new stored lifecycle states. Opening steps never mutates stock. Output is recorded once. Existing stock-in posts **all** QA-passed goods atomically; there is no new partial-stock posting feature. History is collapsed by default on the PM page.

## Processing-time rules and migration

`2026_10_14_030000_add_production_processing_time_snapshots.php` adds:

- `boms.minimum_processing_minutes`: positive whole minutes, default 30.
- Nullable batch snapshot `minimum_processing_minutes`, `production_started_at` and `output_available_at`.
- Database positive-range checks; no original quantity, status, requirement or history rewrite.

The migration is **applied to the local application database**. Migration count changed from 79 to 80; there are no pending migrations. On another checkout/database, run the normal `php artisan migrate` after activating its tools and confirming its connection. Do not run migrate:fresh on operational data.

New batches copy their BOM duration. The first successful full material issue saves the start and deadline in its existing transaction. Failed issue, batch creation and export never start the clock. Repeat issue does not reset it. Later formula edits do not shorten or reset the snapshot. The UI anchors to the server's remaining interval and advances with `performance.now()`; device date changes do not authorize output. Every final request rechecks server time, role, warehouse, state and one-time output rules.

Older batches retain NULL snapshot fields. For active legacy batches, timing uses recorded `issued_at`, then the material-issuance event, then material-issue row timestamps, with the documented default 30 minutes. If no reliable start exists, the explicit legacy compatibility path remains available only when the persisted material requirements are fully issued and the batch is in production. PM sees the missing-start explanation; no timestamp or new wait was fabricated. Completed QA/stocked history is not retroactively re-locked. Cancellation still requires material disposition for legacy recorded issued quantities even when issued_at is missing.

Before/after hashes of **26 existing business tables** match when excluding only the newly added timing columns. Existing BOMs receive the specified default configuration; both existing batches retain NULL start/deadline snapshot fields. Existing allocations, inventory, supplier applications, purchasing, receiving, QA, production materials and history were preserved. No operational demonstration data or messages were created.

## Excess confirmation and QA wording

PM confirmation is conditional on `actual_quantity > target_quantity`. The server rejects missing, false or mismatched acknowledgments. Existing event/audit metadata stores target, actual, excess, the authenticated confirmer and server time. The target and material demand stay unchanged; excess is not capped to target or automatically stocked.

QA independently compares recorded **actual** output with the immutable target, then binds the confirmation to target, actual, passed, failed and current inspection notes. Changing inspection quantities or notes clears the UI checks. Missing/stale server context is rejected. The checklist begins unchecked:

- “I verified the actual produced quantity and its unit.”
- “The quantity marked as passed was inspected against the approved criteria for this product.”
- “The units marked as passed meet the applicable quality requirements.”
- “Failed or non-conforming units are identified and excluded from the passed quantity.”

No product-specific acceptance specifications were found in the existing production schema/UI, so these are the requested generic confirmations; they do not invent a quality standard. Passed-unit checks apply only when passed > 0. Failed exclusion applies only when failed > 0. An all-failed result requires quantity verification and failure exclusion, with passed-unit acceptance stored as `not_applicable`. It remains truthful and enters the existing internal hold path. Counts, applicable checks, notes context, authenticated inspector and server time persist in existing production event/audit metadata. History exposes recorded confirmation details read-only. QA does not increase inventory.

## Pick list and material readiness

GET `/production/batches/:id/pick-list?format=pdf` uses the already-installed Dompdf package. `format=html` supplies the same escaped Blade document for Print Pick List. Only the authorized warehouse's PM can export it. No dependency, scanner, new sending action or stock mutation was added.

The A4 document includes Archon Nell Incorporated, batch/product, target/unit, warehouse, creation/generated timestamps, recorded preparer, raw-material names and available inventory barcodes, required/issued/remaining-to-pick quantities, blank actual-picked/acknowledgment lines, notes and PDF page numbers. Browser print has CSS page counters where supported. It repeats table headings across pages and labels a planned document versus an issued reprint; legacy recorded issue quantities also produce an issued reprint. Unknown storage/bin locations are “Not recorded.” It invents no prices, signatures or staff. Browser popup permission may be needed for Print Pick List; PDF download is separate.

Per-material remaining demand is `max(required - issued, 0)`; shortage is `max(remaining - current matching available, 0)`. Required 2 / issued 2 / available 1 displays **Fulfilled**, remaining 0 and shortage 0. Current availability is labeled as current stock, not a historical snapshot. Unsupported fractional whole-stock demand remains explicitly blocked without rounding or unit conversion. KG, PCS and L remain independent stock units and allocation limits.

## Verification and review

| Check | Result / evidence |
|---|---|
| Current pre-change backend baseline | 688/690 passed, 5,886 assertions. One password-policy fixture failure and one PostgreSQL JSON equality assertion error reproduced before backend edits. `.codex/role-production-baseline.log` |
| Full backend run | 704/706 passed, 6,177 assertions; the same two unrelated baseline failures, no production failure. `.codex/role-production-full.log` |
| Production and protected-flow regression selection | 67/67 passed, 874 assertions, including the additive migration compatibility test, internal production, shared classified supplier flow, allocation, Supplier Portal and Brevo regressions. `.codex/role-production-focused-final.log` |
| Latest timing/confirmation/PDF checks | 17/17 passed, 308 assertions after the final legacy reprint/print-footer change. `.codex/production-rules-final.log` |
| TypeScript and build | Passed. Existing large-chunk warning remains. `.codex/role-production-build.log` |
| Scoped Oxlint | Clean for new production files, FormulaTablePage, QA layout, routes and PM sidebar. `.codex/role-production-scoped-lint.log` |
| Global Oxlint | Existing conditional useEffect error in Shipment.tsx:295 and four existing warnings outside this change. `.codex/role-production-global-lint.log` |
| PM browser verification | Passed table/create/detail navigation, list state across API pages, read-only View, persisted stages, shortage/fraction guards, confirmations, validation input retention, lost response recovery, passed-only stock-in, capacity rejection, duplicate clicks, terminal states and cancellation disposition. 42 screenshots. `.codex/production-ui-browser/result.json` |
| All-role browser verification | Passed QA three-step inspection, mixed/all-failed handling, context reset and retry, disposition, unsaved-edit protection, formula create/edit/view refresh and duration default, read-only oversight, monotonic clock/device-date resistance, no automatic output, PM excess review and GET-only print/export actions. 54 screenshots. `.codex/production-ui-browser/role-result.json` |
| Local migration and records | 26 original-table hashes match, 80 applied migrations, zero fabricated legacy start/deadline snapshots. `.codex/production-local-preservation.json` |
| Protected source | Supplier Portal, its mail template, allocation support and relevant tests match starting hashes. All other pre-existing dirty files outside the ten intentional backend/routes/sidebar/fixture changes remain unchanged. `.codex/production-protected-source-check.json` and `.codex/production-current-changed-files.json` |
| PHP/routes | Syntax checks passed for changed PHP classes/migration/tests; all 11 production routes remain authenticated and role/warehouse scoped. |

The browser runs use the real frontend/routes with intercepted, isolated API fixtures. Genuine PDF content, multiple pages, unit preservation and read-only behavior are verified by server tests. No browser verification submits operational transactions or sends messages. The isolated PostgreSQL test cluster uses port 55432 and a separate database; the local app database uses port 5432.

Applied the repository's UI/UX Pro Max and Open Code Review guidance. Reviewed request whitelists, actor provenance, transactions, duplicate handling, shared files, output/QA arithmetic, timer authority, legacy behavior, escaped documents, role boundaries and persistence. The review found and resolved legacy cancellation/reprint handling and context-bound QA checks. Existing per-record production presentation queries remain part of the original API architecture; this change does not introduce a server search or broad reporting refactor.

## Before/after screenshot links

The five screenshot filenames mentioned in the attachment were not present in the available attachments. These before images capture the actual previous checkout with isolated fixture data; after images capture the implemented role routes. Additional 375/768/1440 light/dark screenshots are in `.codex/production-ui-browser/`.

| Screen | Before desktop / mobile | After desktop / mobile |
|---|---|---|
| PM initial batches | [Desktop](../.codex/production-ui-browser/before-desktop.png) / [Mobile](../.codex/production-ui-browser/before-mobile.png) | [Desktop](../.codex/production-ui-browser/after-list-light-1440.png) / [Mobile](../.codex/production-ui-browser/after-list-light-375.png) |
| QA initial screen | [Desktop](../.codex/production-ui-browser/before-qa-desktop.png) / [Mobile](../.codex/production-ui-browser/before-qa-mobile.png) | [Desktop](../.codex/production-ui-browser/after-qa-list-light-1440.png) / [Mobile](../.codex/production-ui-browser/after-qa-list-light-375.png) |
| Admin BOM initial screen | [Desktop](../.codex/production-ui-browser/before-admin-bom-desktop.png) / [Mobile](../.codex/production-ui-browser/before-admin-bom-mobile.png) | [Desktop](../.codex/production-ui-browser/after-admin-bom-list-light-1440.png) / [Mobile](../.codex/production-ui-browser/after-admin-bom-list-light-375.png) |
| Admin oversight initial screen | [Desktop](../.codex/production-ui-browser/before-admin-oversight-desktop.png) / [Mobile](../.codex/production-ui-browser/before-admin-oversight-mobile.png) | [Desktop](../.codex/production-ui-browser/after-admin-oversight-list-light-1440.png) / [Mobile](../.codex/production-ui-browser/after-admin-oversight-list-light-375.png) |

Detail examples: [PM processing countdown](../.codex/production-ui-browser/after-processing-wait-dark-1440.png), [PM excess confirmation](../.codex/production-ui-browser/after-pm-excess-light-375.png), [QA final confirmation](../.codex/production-ui-browser/after-qa-confirm-light-375.png), [Admin formula edit](../.codex/production-ui-browser/after-admin-bom-edit-light-1440.png), [Admin result review](../.codex/production-ui-browser/after-admin-oversight-detail-light-375.png).

## Changed files for this combined production UI task

Relative to `.codex/production-ui-start-files.json` and the starting tracked diff; earlier catalog/capacity/portal work already in the dirty worktree is excluded.

Updated existing production/backend files:

- `backend/app/Http/Controllers/Api/BomController.php`
- `backend/app/Http/Controllers/Api/ProductionController.php`
- `backend/app/Models/Bom.php`
- `backend/app/Models/ProductionBatch.php`
- `backend/app/Support/ProductionWorkflow.php`
- `backend/routes/api.php` (additive authenticated pick-list GET)
- `backend/tests/Feature/InternalProductionTest.php` (controlled clock for existing legitimate output actions)
- `backend/tests/Support/ProductionFixture.php` (controlled clock and conditional confirmations)

New backend files:

- `backend/app/Support/ProductionRules.php`
- `backend/app/Support/ProductionPickList.php`
- `backend/database/migrations/2026_10_14_030000_add_production_processing_time_snapshots.php`
- `backend/resources/views/pdf/production-pick-list.blade.php`
- `backend/tests/Feature/ProductionTimingAndConfirmationTest.php`

Updated frontend integration:

- `frontend/src/routes/index.tsx`
- `frontend/src/components/layout/PlantManagerSidebar.tsx` (active state on production subroutes)
- `frontend/src/layouts/QALayout.tsx` (authorized production warehouse context; remove the hardcoded Plant 02 label)

New frontend files:

- `frontend/src/page/admin/FormulaTablePage.tsx`
- `frontend/src/page/production/PlantManagerProductionList.tsx`
- `frontend/src/page/production/PlantManagerProductionCreate.tsx`
- `frontend/src/page/production/PlantManagerProductionDetail.tsx`
- `frontend/src/page/production/ProductionRolePage.tsx`
- `frontend/src/page/production/ProductionBatchDialog.tsx`
- `frontend/src/page/production/ProductionDialog.tsx`
- `frontend/src/page/production/ProductionReadPanels.tsx`
- `frontend/src/page/production/ProductionUi.tsx`
- `frontend/src/page/production/productionApi.ts`
- `frontend/src/page/production/productionPresentation.ts`
- `frontend/src/page/production/useProductionCountdown.ts`

This report is new. Verification scripts/logs/screenshots are local ignored `.codex` artifacts. The old unrouted `ProductionWorkspace.tsx` and `admin/Boms.tsx` were preserved, along with the earlier uncommitted work; current routes import the new pages. No dependency manifest, secret, warehouse allocation or Supplier Portal source was changed by this task.

## Remaining limitations / setup

The two backend baseline failures and unrelated global lint error remain outside this task. Product-specific QA standards must be supplied by the actual approved process; no criteria were invented. Fractional raw demand still follows the existing whole-stock precision restriction, and stock-in still posts the passed quantity in one transaction. The existing one-current-formula policy and unresolved non-conformance behavior remain.

Admin should set real minimum processing times for each formula. Existing warehouse allocations still require explicit business configuration wherever previously unconfigured; no example split was applied. No new setup blocker was found for this production change. Local frontend (`http://localhost:5173`) and backend (`http://localhost:8000`) are available for review; authenticate with your existing role accounts. Verification did not use those accounts for operational writes.
