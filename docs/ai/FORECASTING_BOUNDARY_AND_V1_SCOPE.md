# Forecasting Boundary and V1 Scope

## Responsibility boundary

The forecasting service is decision support. Its only planned business output is
expected customer-requested quantity by product and future period, plus metadata
needed to interpret that estimate.

Example shape (illustrative only, not generated data): product identifier,
week-start date, expected quantity, generated timestamp, model version, and data
sufficiency/quality metadata. Historical observations and forecast values may be
displayed together, but must remain distinguishable.

The forecasting service must not:

- stock inventory in or out;
- create or approve replenishment/procurement requests;
- create or send purchase orders;
- modify inventory, orders, suppliers, or receiving records; or
- bypass SmartChain authorization or RBAC workflows.

Any future replenishment recommendation is separate Laravel business logic:

`forecast demand + safety stock - usable available inventory - confirmed incoming inventory`

That calculation is not a forecasting-model feature. Any resulting procurement
action must remain explicit and pass through the existing authorized SmartChain
workflow. The existing frontend forecast pages contain mock reorder/PO controls;
they are prototypes and are not evidence of an approved forecast-to-procurement
integration.

## V1 scope gate

The planned V1 remains conceptually:

- **Input:** classified, valid historical customer-requested quantities.
- **Entity:** `products.id`.
- **Aggregation:** weekly, including zero-demand weeks.
- **Horizon:** next four weeks.
- **Output:** forecasted quantity per product/week; historical and forecast chart; forecast values; trend; generation timestamp; model version; and data-sufficiency/model-quality metadata.

Not included: automatic purchase orders, procurement approval, inventory
mutation, supplier recommendation, shipment prediction, warehouse optimization,
chatbot/LLM functionality, or automatic reorder execution.

This scope is **NOT VIABLE on the 2026-10-01 local snapshot**. It is a gated
target for reevaluation, not permission to implement or train. The current four
weeks of unknown-provenance and unit-inconsistent data cannot support a
meaningful four-week product forecast or honest model-quality measurement.
