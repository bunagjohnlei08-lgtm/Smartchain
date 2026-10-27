# Phase 6 Supplier Procurement Verification

Run only with `APP_ENV=testing`, PostgreSQL, and `DB_DATABASE=smartchain_test_db`. Keep `PROCUREMENT_AWARD_TO_PO_ENABLED=false` until every activation-gate item passes. Never use the development database.

## Automated sequence

1. Run `scripts/verify-phase4.ps1 -IncludeConcurrency` and require all Phase 4 hardening and genuine two-process concurrency tests to pass.
2. Run `php artisan test --env=testing --filter Phase5IntegrationTest`.
3. Run the complete Laravel suite and frontend lint/build.
4. With a disposable test configuration only, enable `PROCUREMENT_AWARD_TO_PO_ENABLED=true`, clear configuration cache, and verify full, partial, split, multi-line, multi-supplier, retry, and concurrent conversion cases.
5. Return the gate to false after verification. Production activation requires an authorized change record.

## End-to-end checklist

- Supplier application, document verification, accreditation, invitation, activation, login, suspension, and expiry.
- RFQ drafting, approval, public projection, multi-product bids, immutable revisions, price decrement rules, qualification, and full/partial/split awards.
- Concurrent bids, concurrent awards, and suspension-versus-award serialization using the existing Phase 4 worker harness.
- Award-to-PO validation, supplier-specific grouping, immutable price/quantity sourcing, allocation uniqueness, idempotent retries, rollback integrity, and no premature release.
- Existing Direct Purchase creation, approval, PDF, send/release, receiving, discrepancy, QA, stock-in, and closure behavior.
- Supplier-only PO list/detail authorization, cross-supplier 404 behavior, acknowledgment actions, idempotency, Procurement notification, and immutable commercial terms.
- Delivery visibility reconciled against DTRS where applicable and authoritative Warehouse/QA received, accepted, rejected, and remaining quantities.
- Confirm supplier actions cannot receive goods, inspect goods, modify inventory, resolve discrepancies, or alter approved prices/quantities.
- Supplier performance minimum history, configured weights, inactive-policy behavior, versioned snapshots, tier changes, corrections, and override audit reasons.
- Notification database persistence under mail-provider failure, recipient privacy, deduplication, and accurate provider wording.
- Browser workflows at mobile/tablet/desktop widths with keyboard focus, loading, empty, validation, and confirmation states.

## Activation evidence required

- Passing PostgreSQL concurrency logs with distinct backend PIDs and no deadlocks or unresolved lock timeouts.
- Passing Phase 4, Phase 5, receiving, QA, inventory, performance, notification, authorization, and browser tests.
- Migration review and backup/rollback plan.
- Approved performance policy version and thresholds, if recognition is activated.
- Named owner approval for setting `PROCUREMENT_AWARD_TO_PO_ENABLED=true`.
