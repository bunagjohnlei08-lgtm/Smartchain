# Consistent authenticated main-content spacing

Verified 2026-10-14 in `Smartchain-New`. The current Admin Product Catalog is the reference. Its page component and classification-column CSS are unchanged. No backend, database, API, supplier workflow, production mutation or public Supplier Portal code was changed.

## Root cause and correction

Several outer module wrappers used `max-w-7xl mx-auto` (1280px), `max-w-[1400px]`, or an additional centered wrapper. At 1920px with the existing 256px sidebar expanded, the shell provides 1664px. Product Catalog filled it with 24px padding, while Inventory, BOM, Production Oversight and Logistics stopped at 1280px, creating a **216px left content gutter** instead of 24px. Shared PageContainer capped Locations at 1400px and used 32px desktop horizontal padding.

Inventory also nested a second main/scroll wrapper and repeated vertical padding around its inner centered container. This affected the breadcrumb/tabs and every Inventory section, including Recent Inventory Movements and Inventory History. Other pages used 32px desktop padding, 24px mobile padding, or switched padding at `md` rather than Product Catalog's `sm` breakpoint.

Added the shared `PAGE_CONTENT_CLASS` in `components/layout/pageLayout.ts`: `module-page w-full min-w-0 p-4 sm:p-6`. It uses the reference's **16px below 640px / 24px from 640px** tokens, fills the actual remaining shell width and allows flex/grid children to shrink. Applicable pages adopt this token without changing their content or business controls. Existing PageContainer now supplies that outer layout directly; it no longer adds a centered width cap, nested main element or additional scroll region. Inventory uses it once around all existing sections.

The browser also identified an existing tablet header mismatch: the fixed header was 64px but main content reserved only 56px. Shared `MAIN_SCROLL_OFFSET_CLASS` reserves the real existing fixed-header height **outside** the scrolling region: 56px below 640px, 64px up to the `xl` desktop breakpoint, and zero extra offset when the desktop header is already in normal flow. Admin, PM and QA shells use this one token. This corrects the tablet overlap while keeping mobile/desktop offsets stable and scrolling content below the fixed header. No sidebar offsets, screenshot coordinates, `w-screen`, global zero-padding rule, new `!important` patch or empty layout spacers were added.

## Route/module audit

“Shared” means the routed page changes through an existing shared component/token, rather than editing its own file. All routes below were smoke-checked at 1440px and 390px. The eight screenshot reference modules were additionally measured at 1920, 1024 and 768px.

| Page / route | Starting outer wrapper / actual issue | Result |
|---|---|---|
| `/admin/dashboard` | Full width, min-w-0, p-4 sm:p-6 | Already consistent; page unchanged. Shared tablet header correction applies. |
| `/admin/product-catalog` | Full-width block, p-4 sm:p-6 | Reference retained; page and table CSS unchanged. |
| `/admin/inventory` | Centered 1280px inner wrapper; nested main/scrolling and duplicated vertical padding | Single full-width PageContainer around breadcrumb, tabs, filters, cards, table, recent movements and history. |
| `/admin/inventory-audit-approvals` | px-4 / md:px-6 / lg:px-8; missing consistent outer vertical padding | Shared page token. |
| `/admin/manage-locations` | Shared PageContainer capped at 1400px with lg:px-8 | Shared PageContainer fixed. Page source unchanged. |
| `/admin/boms` | Production pageClass capped at 1280px and centered | Shared production pageClass fixed. Formula form/dialog unchanged. |
| `/admin/production` | Same centered production pageClass | Shared production pageClass fixed; oversight remains read-only. |
| `/admin/procurement` | p-6 at every width | Shared reference padding, including 16px on phones. |
| `/admin/barcode-center` | max-w-7xl mx-auto, p-4 md:p-6 | Width cap removed; reference breakpoint/padding adopted. |
| `/admin/purchase-orders` | Full width but md:p-6 instead of sm:p-6 | Shared reference padding; page content unchanged. |
| `/admin/rejected-items` | Larger xl:px-8/pt-8 and separate outer padding values | Shared reference padding; internal sections preserved. |
| `/admin/suppliers` | Centered max-w-7xl tab strip and Suppliers body; p-6 below sm | Full-width tab strip and shared body spacing. Sticky tabs retained. |
| `/admin/suppliers?tab=applications` | Centered max-w-7xl body | Shared page token; invitation/application steps untouched. |
| `/admin/suppliers?tab=performance` | Centered max-w-7xl body | Shared page token; metrics/disclosures untouched. |
| `/admin/logistics` | max-w-7xl mx-auto, p-4 md:p-6 | Shared full-width spacing; logistics/document tracking sections retained. |
| `/admin/ai-demand-forecasting` | Shared PageContainer's centered 1400px limit | Shared PageContainer fixed. Forecast page source unchanged. |
| `/admin/reports` | lg:p-8 outer spacing | Shared reference padding; report tables/drawers unchanged. |
| `/admin/users` | px-6 py-8 at every width | Shared reference padding; user and audit-log sections retained. |
| `/admin/order-management` | lg:p-8 outer spacing | Shared reference padding; order actions retained. |
| `/admin/notifications` | Shared NotificationCenter lg:p-8 | Shared reference padding. |
| `/admin/profile` | Shared ProfilePage centered max-w-6xl and lg:p-8 | Full-width outer page; readable max-w-6xl retained on the inner form grid, left aligned. |
| `/plant-manager/dashboard` | lg:p-8 outer spacing | Shared reference padding. |
| `/plant-manager/procurement` | Centered 1400px wrapper, lg:p-8 and repeated bottom padding | Shared full-width outer spacing. |
| `/plant-manager/warehouse` | p-4 md:p-6 around another centered max-w-7xl wrapper | Shared padding; inner width cap/centering removed. |
| `/plant-manager/production` | Centered production pageClass | Shared production token; table/list behavior retained. |
| `/plant-manager/production/create` | Same outer pageClass | Full-width outer page; deliberately limited inner planning form retained. |
| `/plant-manager/production/:batchId` | Same outer pageClass | Shared layout; timer, steps, confirmation dialogs and mutations untouched. Verified with batch 1 fixture. |
| `/plant-manager/inventory` | max-w-7xl mx-auto, md padding breakpoint | Shared full-width outer spacing. |
| `/plant-manager/stock-in` | lg:p-8 | Shared reference padding; stock-in controls unchanged. |
| `/plant-manager/stock-out` | lg:p-8 | Shared reference padding; barcode release/scanner behavior unchanged. |
| `/plant-manager/shipment` | max-w-7xl mx-auto, md padding breakpoint | Shared full-width outer spacing; existing conditional-hook lint issue remains. |
| `/plant-manager/receiving` | max-w-7xl mx-auto | Shared full-width outer spacing; receiving form/dialogs unchanged. |
| `/plant-manager/reports` | max-w-7xl mx-auto, md padding breakpoint | Shared full-width outer spacing. |
| `/plant-manager/forecast` | max-w-7xl mx-auto, md padding breakpoint | Shared full-width outer spacing; existing forecast content unchanged. |
| `/plant-manager/suppliers` | max-w-7xl mx-auto | Shared full-width outer spacing. |
| `/plant-manager/order-management` | lg:p-8 | Shared reference padding. |
| `/plant-manager/notifications` | Shared NotificationCenter | Shared reference padding. |
| `/plant-manager/profile` | Shared ProfilePage | Full-width outer page; inner readable form limit retained. |
| `/qa/dashboard` | max-w-7xl mx-auto, md padding breakpoint | Shared full-width outer spacing. |
| `/qa/inspection` | max-w-7xl mx-auto, md padding breakpoint | Shared full-width outer spacing; manual inspection controls unchanged. |
| `/qa/production` | Centered production pageClass | Shared production token; inspection steps/checklist unchanged. |
| `/qa/rejected-items` | max-w-7xl mx-auto, md padding breakpoint | Shared full-width outer spacing. |
| `/qa/history` | max-w-7xl mx-auto, md padding breakpoint | Shared full-width outer spacing; history content retained. |
| `/qa/inventory-audit` | Centered 1400px wrapper | Shared full-width outer spacing. |
| `/qa/reports` | max-w-7xl mx-auto, md padding breakpoint | Shared full-width outer spacing. |
| `/qa/notifications` | Shared NotificationCenter | Shared reference padding. |
| `/qa/profile` | Shared ProfilePage | Full-width outer page; inner readable form limit retained. |

Actual shells are `components/layout/AdminLayout`, `layouts/PlantManagerLayout`, and `layouts/QALayout`. Unused legacy alternative layouts/pages were excluded. This application has an expanded desktop sidebar and a hidden/mobile-drawer state below `xl`; it does **not** currently provide a separate compact desktop sidebar-collapse mode. Both actual states and all three mobile drawers were checked. Sidebar appearance, menus, active routes and permission checks were not edited.

## Verification

At 1920px, all five measured Admin reference/affected modules (Catalog, Inventory, Locations, BOM and Logistics) now use the same 1664px shell width with a 24px content gutter. Inventory's recent movements and history cards separately match its full outer content width at 1920px and 390px.

| Check | Result / local evidence |
|---|---|
| Current before capture | 48 screenshots and computed layouts across eight actual role screens at 1920/1440/1024/768/390 light, plus 1440 dark. `.codex/spacing-browser/before-result.json` |
| Final spacing/navigation verification | Passed **47 unique route/tab views**, **149 measured layouts**, 48 matching after screenshots. Root width/padding, actual main scrollWidth, page overflow, fixed-header spacing, and drawer open/close invariance checked. `.codex/spacing-browser/result.json` |
| Inventory recent movements/history | Passed four separate section alignment/width checks and screenshots at 1920/390. `.codex/spacing-browser/sections-result.json` |
| Classification/actions regression | Passed both Admin columns, filters, no-results, long names, alignment, selection, sorting, pagination, grid and actions. `.codex/spacing-classification-regression.log` |
| PM production regression | Passed list/create/detail, persisted stages, read-only views, material confirmation, validation recovery, lost response, passed-only stock-in, capacity rejection, duplicate actions and cancellation. `.codex/spacing-pm-production-regression.log` |
| QA/Admin/processing regression | Passed role tables/dialogs, independent QA excess checks/reset, mixed/all-failed results, unsaved edits, formula create/edit/view, oversight, monotonic countdown, pick-list actions and PM excess review. `.codex/spacing-role-production-regression.log` |
| TypeScript/build | Passed. Build retains the existing large-chunk warning. `.codex/spacing-typescript.log`, `.codex/spacing-build.log` |
| Scoped lint | 37 files clean. Across all 40 source files, the existing Shipment conditional useEffect error and three existing warnings remain; no new findings. `.codex/spacing-clean-lint.log`, `.codex/spacing-scoped-lint.log` |
| Lint baseline | Reconstructed the three flagged starting files; their SHA-256 hashes exactly match the start snapshot. Oxlint reproduced the same hook error at the old line 295, Receiving dependency warning, and two unused catch-parameter warnings. `.codex/spacing-baseline-lint.log` |
| Scope/diff | Reviewed shared and per-page wrapper edits with the repository's Open Code Review guidance. Existing backend, Product Catalog reference, classification CSS, Supplier Portal and unrelated source hashes preserved. `git diff --check` passes. `.codex/spacing-start-hashes.json`, `.codex/spacing-changed-files.json` |

Browser runs use real frontend routes with fully intercepted API fixtures. They do not write operational records or send messages. No redundant unit tests or unrelated backend suites were added/run for this spacing change. Existing narrow dialogs, reading panels, searches and the inner Profile form retain their limits; wide tables remain inside their own horizontal scrollers. No content or useful tabs/breadcrumbs were removed.

## Before/after screenshots

The three named screenshot files in the attachment were unavailable in the supplied attachment directory. These captures show the actual previous checkout and the implemented checkout at the **same viewport and sidebar state**, with isolated fixture data.

| View | Before | After |
|---|---|---|
| Product Catalog reference, 1920px | [Before](../.codex/spacing-browser/before-catalog-light-1920.png) | [After](../.codex/spacing-browser/after-catalog-light-1920.png) |
| Admin Inventory, 1920px | [Before](../.codex/spacing-browser/before-inventory-light-1920.png) | [After](../.codex/spacing-browser/after-inventory-light-1920.png) |
| Locations, 1920px | [Before](../.codex/spacing-browser/before-locations-light-1920.png) | [After](../.codex/spacing-browser/after-locations-light-1920.png) |
| BOM/Formulas, 1920px | [Before](../.codex/spacing-browser/before-bom-light-1920.png) | [After](../.codex/spacing-browser/after-bom-light-1920.png) |
| Oversight, 1920px | [Before](../.codex/spacing-browser/before-oversight-light-1920.png) | [After](../.codex/spacing-browser/after-oversight-light-1920.png) |
| Logistics, 1440px dark | [Before](../.codex/spacing-browser/before-logistics-dark-1440.png) | [After](../.codex/spacing-browser/after-logistics-dark-1440.png) |
| PM Inventory, 390px | [Before](../.codex/spacing-browser/before-pm-inventory-light-390.png) | [After](../.codex/spacing-browser/after-pm-inventory-light-390.png) |
| QA Inspection, 390px | [Before](../.codex/spacing-browser/before-qa-inspection-light-390.png) | [After](../.codex/spacing-browser/after-qa-inspection-light-390.png) |

Inventory section examples: [Recent Movements at 1920px](../.codex/spacing-browser/after-inventory-movements-light-1920.png), [History at 1920px](../.codex/spacing-browser/after-inventory-history-light-1920.png), [Recent Movements at 390px](../.codex/spacing-browser/after-inventory-movements-light-390.png), [History at 390px](../.codex/spacing-browser/after-inventory-history-light-390.png).

## Files modified for this task

40 frontend source files: one new shared token file and 39 existing files. This report is also new. Earlier unrelated dirty/untracked files remain preserved.

Shared components/layouts:

- `frontend/src/components/layout/pageLayout.ts` (new)
- `frontend/src/components/layout/PageContainer.tsx`
- `frontend/src/components/layout/AdminLayout.tsx`
- `frontend/src/layouts/PlantManagerLayout.tsx`
- `frontend/src/layouts/QALayout.tsx`
- `frontend/src/components/NotificationCenter.tsx`
- `frontend/src/components/ProfilePage.tsx`
- `frontend/src/page/production/ProductionUi.tsx`

Admin page-wrapper adoption:

- `frontend/src/page/admin/Inventory.tsx`
- `frontend/src/page/admin/InventoryAuditApprovals.tsx`
- `frontend/src/page/admin/BarcodeCenter.tsx`
- `frontend/src/page/admin/PurchaseOrders.tsx`
- `frontend/src/page/admin/Procurement.tsx`
- `frontend/src/page/admin/RejectedItems.tsx`
- `frontend/src/page/admin/Reports.tsx`
- `frontend/src/page/admin/orderManagement.tsx`
- `frontend/src/page/admin/userManagement.tsx`
- `frontend/src/page/admin/logistics.tsx`
- `frontend/src/page/admin/SupplierManagement.tsx`
- `frontend/src/page/admin/Suppliers.tsx`
- `frontend/src/page/admin/SupplierApplicationsTab.tsx`
- `frontend/src/page/admin/SupplierPerformanceTab.tsx`

Plant Manager page-wrapper adoption:

- `frontend/src/page/plant-manager/Dashboard.tsx`
- `frontend/src/page/plant-manager/Inventory.tsx`
- `frontend/src/page/plant-manager/Procurement.tsx`
- `frontend/src/page/plant-manager/Warehouse.tsx`
- `frontend/src/page/plant-manager/StockIn.tsx`
- `frontend/src/page/plant-manager/StockOut.tsx`
- `frontend/src/page/plant-manager/Shipment.tsx`
- `frontend/src/page/plant-manager/Receiving Management.tsx`
- `frontend/src/page/plant-manager/Reports.tsx`
- `frontend/src/page/plant-manager/Forecast.tsx`
- `frontend/src/page/plant-manager/Suppliers.tsx`
- `frontend/src/page/plant-manager/OrderManagement.tsx`

QA page-wrapper adoption:

- `frontend/src/page/QA/Dashboard.tsx`
- `frontend/src/page/QA/QualityInspection.tsx`
- `frontend/src/page/QA/RejectedItems.tsx`
- `frontend/src/page/QA/InspectionHistory.tsx`
- `frontend/src/page/QA/InventoryQualityAudit.tsx`
- `frontend/src/page/QA/QualityReports.tsx`

## Remaining exceptions

The existing Shipment conditional-hook lint error and three baseline warnings remain outside this layout task. The Inventory module's embedded Manage Locations tab is still its original “Coming Soon” placeholder; the real standalone Locations route is corrected through PageContainer. Profile retains an intentional inner form-width limit. These are documented exceptions, not remaining inconsistent outer wrappers.

No migration, API change, new sidebar-collapse feature, dependency change, memory update, staging, commit or push was performed. Local verification scripts/logs/screenshots remain ignored `.codex` artifacts.
