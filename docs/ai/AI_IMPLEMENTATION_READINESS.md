# SmartChain AI Implementation Readiness

Assessment date: 2026-10-01  
Profiled environment: local Laravel configuration, PostgreSQL `smartchain_db`  
Final gate: **NO-GO**

No model was trained and no prediction or production endpoint was created.

## Verified live profile

- 18 total and 18 non-cancelled candidate orders; 0 cancelled and 0 currently training-eligible after provenance/unit gates.
- 18 total and 18 non-cancelled candidate order-item rows; requested quantity total 17,746.
- Demand dates: 2026-09-07 through 2026-09-28 (22 days, four calendar weeks, one calendar month).
- 69 products: 10 with demand and 59 with none.
- Line observations/product: 59 with 0, 9 with 1-3, 1 with 4-7, and 0 in every larger bucket.
- Active demand weeks/product: 59 with 0, 10 with 1-3, and 0 with 4 or more.
- Weekly zero-demand rate across products: 25%-100%, median 100%; 59 products are 100% zero over the snapshot.
- Four products have more than one transaction unit; all 69 products have null canonical units.
- All orders have unknown operational/test/demo provenance.

## Readiness checklist

| Requirement | Status | Evidence |
|---|---|---|
| Demand source validated | PASS | `order_items.quantity`, joined through `order_id`; `orders.order_date`; requested rather than fulfilled quantity. |
| Historical database profiled | PASS | Read-only PostgreSQL transaction; 18 orders/items across 22 days. |
| Product linkage validated | PARTIAL | Current rows: 0 null/orphan links and 0 duplicate product-name groups; schema permits null-on-delete and has no SKU. |
| Units validated | BLOCKED | 69/69 product units null; 18/18 item/product mismatches; 4 products have multiple item units; no conversion table. |
| Cancellation rule finalized | PASS | Current `CANCELLED` parent status is excluded; workflow retains item rows. No live cancelled example exists. |
| Test/demo data rule finalized | BLOCKED | Rule is documented, but all 18 local orders are `UNKNOWN` and therefore excluded from training. |
| Duplicate rule finalized | PASS | Item primary key retained; exact duplicates require audit, never blind deletion; current duplicate groups: 0. |
| Outlier rule finalized | PASS | KEEP/REVIEW/INVALID evidence rules documented; no automatic statistical deletion. |
| Zero-demand periods analyzed | PASS | Complete weekly grid profiled; zero-week median is 100%. |
| Intermittent-demand products identified | PARTIAL | All 69 are `INSUFFICIENT HISTORY`; only four weeks are available. |
| Forecast granularity validated | BLOCKED | Daily, weekly, and monthly series are too short/sparse for forecasting. |
| Forecast horizon validated | BLOCKED | A four-week horizon cannot be validated from four historical calendar weeks. |
| Python version locked | PASS | `forecasting-service/.python-version`: Python 3.14.6. |
| Python dependencies reproducible | PASS | Exact pins in `forecasting-service/requirements.txt`; malformed sklearn suffix corrected to installed compatible release 1.9.0. |
| `pip check` passes | PASS | Existing isolated `forecasting-service/venv` reports no broken requirements. |
| FastAPI environment imports successfully | PASS | FastAPI, pandas, NumPy, sklearn, SciPy, joblib, and Uvicorn imported successfully. |
| Forecast/replenishment responsibilities separated | PASS | `FORECASTING_BOUNDARY_AND_V1_SCOPE.md` forbids business mutations and preserves RBAC workflow. |
| V1 scope formally documented | PASS | Weekly/product/four-week target is documented as deferred and currently not viable. |

## P0 blockers before implementation

1. Classify an approved historical source as operational and reliably exclude test/demo/unknown records.
2. Populate canonical product units and approve explicit conversions for every alternate transaction unit; do not infer them.
3. Accumulate/import a materially longer valid history, then rerun the read-only profile. At minimum, the documented intermittency classification requires 13 complete weeks and four active weeks per eligible product; model selection/horizon still requires time-aware backtesting.
4. Reassess weekly granularity and the four-week horizon from the expanded snapshot.

The service scaffold and Python environment are ready for health-check
development, but the demand dataset is not ready for model implementation.
