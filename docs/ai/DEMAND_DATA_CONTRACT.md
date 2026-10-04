# SmartChain Demand Data Contract

Status: **BLOCKED FOR MODEL TRAINING**  
Profiled source: local PostgreSQL database `smartchain_db` on 2026-10-01  
Scope: demand extraction rules only; this document does not authorize training or prediction.

## Target and source

- **Target:** customer-requested product quantity.
- **Fact table and field:** `order_items.quantity` (`numeric(12,3)`).
- **Order relationship:** `order_items.order_id -> orders.id`.
- **Forecast entity:** `order_items.product_id -> products.id`.
- **Time field:** `orders.order_date`; aggregate using the configured application timezone before deriving calendar dates/weeks.
- **Canonical grain before aggregation:** one retained `order_items.id` joined to its parent order and product.
- **Primary demand signal:** requested quantity, not `inventories.available_stock` and not `stock_out_transactions.quantity`.

`stock_out_transactions.quantity` is a fulfillment signal. In the profiled data,
requested quantity totals 17,746 while recorded fulfillment totals 16,238; seven
lines have no fulfillment, two are partially fulfilled, and nine are exactly
fulfilled. Requested demand therefore preserves demand that inventory could not
yet fulfill.

## Status and cancellation rule

The statuses defined by `App\Models\Order::STATUSES` are:

`NEW`, `ASSIGNED`, `PREPARING`, `READY_FOR_STOCK_OUT`,
`STOCK_OUT_IN_PROGRESS`, `STOCK_OUT_COMPLETED`, `FOR_PACKING`, `PACKING`,
`READY_FOR_SHIPMENT`, `FORWARDED_TO_LOGISTICS`, `IN_TRANSIT`, `DELIVERED`, and
`CANCELLED`.

- Include all listed statuses except `CANCELLED` because the order records a customer request from creation onward.
- Exclude an order when its current `orders.status` is `CANCELLED`, regardless of earlier history.
- Cancellation is permitted by the current Admin workflow only from `NEW` or `ASSIGNED`.
- Cancellation updates the parent status and does not delete its `order_items`; extraction must therefore apply the parent-order status filter.
- There were no cancelled orders in the profiled database, so counts verify the query path but not a live cancelled-row example.
- `order_items` has no independent status field.

## Product linkage rule

Include a row only when `order_items.product_id` is non-null and resolves to an
existing `products.id`. Use `product_id` as the entity key; `product_name` is a
historical display snapshot, not an identity key. Do not merge products by name.

The profiled data has zero null or orphan product links and no duplicate
case-normalized product names. However, the schema deliberately permits
`product_id` to become null when a product is deleted. Linkage must be rechecked
on every training snapshot. There is no SKU column in `products`; inventory
barcodes are unique and inventory-specific, so neither SKU nor barcode replaces
`product_id` as the forecast key.

`products` has no active/inactive status and no soft-delete/archive column in the
inspected schema. Historical demand for a deleted product loses its foreign-key
link through `nullOnDelete` and is excluded until governed archival semantics
exist.

## Unit rule

Training requires one documented canonical unit for each product and a reliable
conversion from every transaction unit to that unit. Until then:

- Require a nonblank `products.unit`.
- Require a nonblank `order_items.unit` that matches the product's canonical unit after trimming and case normalization, or apply a pre-approved conversion table.
- Never infer conversion factors from labels, prices, quantities, or inventory.
- Do not combine different units for one product.

This rule currently **blocks training**: all 69 products have a null unit, all 18
valid item units mismatch that missing product unit, and four products use more
than one item unit. Item units include `pcs`, `kg`, and numeric-looking values
such as `20`, `100`, `1000`, `4000`, and `7000`. No package/carton conversion
table exists in the inspected schema.

## Quantity quality rules

- **Null:** invalid; reject from training and report. The schema is non-null and the profile found zero.
- **Zero:** invalid as an order-line demand observation; reject and report. The profile found zero.
- **Negative:** invalid; reject and report. The profile found zero.
- **Positive decimal:** structurally valid, subject to product, unit, provenance, duplicate, and outlier rules. Do not coerce to integer because the schema permits three decimal places.

The inspected application exposes order creation and status transitions but no
order-item update endpoint. The profile found zero item rows whose `updated_at`
differs from `created_at`. Future edit support must preserve an auditable history
or define which version is authoritative before edited demand is used.

## Duplicate rule

`order_items.id` is the event identity. Multiple rows for the same product in one
order are legitimate unless business evidence proves an accidental duplicate.
Aggregate distinct retained item IDs; do not use `DISTINCT` across business
columns and do not delete repeated rows.

Flag for review when rows in the same order have identical `product_id`,
`product_name`, `quantity`, normalized `unit`, and `unit_price`. Exclude a flagged
row only after an audit establishes which primary key is erroneous. The current
profile found zero same-product multi-line groups and zero exact duplicate groups.

## Outlier rule

- **KEEP:** positive, linked, unit-valid demand with no evidence of entry error, including legitimate large orders.
- **REVIEW:** unit anomalies; a line contributing at least 50% of its product's lifetime quantity; or a value that business constraints identify as unusual. Review is not automatic exclusion.
- **INVALID:** null, zero, negative, an impossible unit/conversion, or a value confirmed as erroneous by source-record evidence.

Current quantities range from 2 to 7,000 (median 100; 95th percentile about
4,450). Nine of ten demanded products have one line contributing at least 50% of
their recorded quantity and seven are at least 90%. This primarily reflects very
sparse history, so no high positive value is automatically removed.

## Test, demo, and provenance rule

Every order must be classified before training:

- **REAL/OPERATIONAL:** confirmed by an approved source-system/provenance marker.
- **DEMO:** explicitly marked demo or created by an approved demo seeder/process.
- **TEST:** explicitly marked test or carrying the `EXAMPLE_ORDER_SEEDED` history action.
- **UNKNOWN:** no reliable marker; exclude from training until classified.

The local profile found no `TEST`/`DEMO` reference marker and no
`EXAMPLE_ORDER_SEEDED` action. Five order numbers overlap the optional example
seeder, but their dates/actions do not prove that the seeder created them. All 18
orders are therefore **UNKNOWN**. Do not call them real client records.

## Returns and replacements

No customer return, refund, or outbound replacement table/field was found in the
order schema or routes. Supplier rejection replacements belong to inbound
receiving/procurement and are not customer demand. Do not subtract or add these
inbound records.

If customer returns or replacement orders are introduced, training remains
blocked until they have explicit linkage: returns must not silently rewrite the
original request, and replacement lines that merely re-fulfill the same request
must be excluded from new demand. No such adjustment is made from nonexistent
fields.

## Aggregation and horizon decision

The intended aggregation is product/calendar week (Monday start), filling every
product/week between the snapshot boundaries with zero. This is the preferred
V1 shape, not an approval to train.

The current snapshot covers only 2026-09-07 through 2026-09-28: 22 days, four
calendar weeks, and one calendar month. Only 10 of 69 products have demand; none
has four active demand weeks. Daily, weekly, and monthly forecasting are all
currently **not viable**. A next-four-weeks horizon is deferred until materially
more classified, unit-consistent history exists and backtesting can support that
horizon.

## Provisional intermittency classification

Classification is evaluated only when a product has at least 13 complete weekly
periods and at least four non-zero weeks:

- **REGULAR:** zero-demand weeks below 25%.
- **INTERMITTENT:** zero-demand weeks from 25% through 75%.
- **VERY SPARSE:** zero-demand weeks above 75%.
- **INSUFFICIENT HISTORY:** fewer than 13 complete weeks or fewer than four non-zero weeks.

Under these thresholds all 69 current products are `INSUFFICIENT HISTORY`.
Observed zero-week percentages range from 25% to 100%, with a median of 100%, but
the four-week window is too short to assign a stable demand-pattern class.
