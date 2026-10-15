# Process updates contribution

Prepared October 15, 2026. Base: `organize-frontend-backend`; contribution branch: `feature/process-updates`.

## Behavior

This contribution includes all existing application edits requested by the owner: catalog classification and safe unused-setup deletion, warehouse capacity allocations by KG/PCS/L, independent internal production with BOM snapshots and server-enforced processing time, assigned manual QA and separate passed-only stock-in, supplier portal session recovery and invitation fallback, OTP submission/retry handling, classification displays, and shared page spacing.

The existing supplier replenishment/approval/PO/receiving/incoming-QA/stock-in flow remains the procurement path for both product classes. Production does not complete supplier requests. Whole-unit inventory and existing barcodes remain authoritative; fractional material demand blocks issuance rather than rounding. Internal HOLD/REWORK/DISPOSAL is separate from supplier Backload.

## Validation during contribution preparation

- 176 focused process tests passed, 2,120 assertions, on isolated PostgreSQL `smartchain_test_db` at port 55432.
- Full backend suite: 714 tests, 712 passed, 6,313 assertions. Two exceptions match existing baseline logs: `AuditLogTest::test_user_update_role_change_and_status_changes_are_audited` uses a password fixture without a required symbol; `InventoryQualityAuditTest::test_admin_can_change_configured_months` uses unsupported PostgreSQL JSON equality.
- Frontend TypeScript/Vite production build passed; large-chunk warning remains.
- Global frontend lint fails at `plant-manager/Shipment.tsx:296` because a hook is conditional; four existing warnings remain. The Shipment diff only changes page spacing/imports.
- PHP syntax passed for all 66 staged PHP files. Composer production platform requirements passed.
- Eleven production routes were listed successfully; all four new migrations are recorded as applied in the local application database. No application migration was executed during contribution preparation.
- Applied the repository-local Open Code Review checklist and focused staged-diff review, including authorization, transactions, snapshots, stock/QA arithmetic, provider submission semantics and shared layout changes. External OCR CLI is unavailable.
- Staged whitespace check and credential/path scan passed. No dependency manifest or lockfile changes were required. No secrets, databases, private uploads, or generated Python caches are included.
- No browser flow or live email was rerun for this contribution. Earlier fixture browser evidence is described in the implementation reports; it is not a new production verification.

## Developer setup

1. Install locked dependencies normally: `composer install` in `backend`, `npm ci` in `frontend`. Use the project's PHP 8.5/PostgreSQL stack and supported Node version. Dompdf is already in the committed Composer dependencies.
2. Back up the deployment database using the normal private operational process, then run `php artisan migrate --force` in `backend`. This applies the four `2026_10_14_000000` through `2026_10_14_030000` migrations. Do not import a local database dump.
3. Admin must explicitly configure warehouse Total Capacity and KG/PCS/L allocations that sum to that total and cover current usage. No legacy split is invented. Positive inbound stock requires this configuration.
4. Confirm actual raw-material classifications; legacy products default to Finished Product, missing units to PCS. Configure real formulas and minimum processing times (default 30 minutes), warehouse assignments, eligible QA users and approved QA criteria through the application. Operational records/configuration are not transferred by Git.
5. Configure deployment-specific `APP_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, and frontend `VITE_API_URL` privately using the existing environment examples. Example placeholders only: `APP_URL=https://api.example.com`, `FRONTEND_URL=https://app.example.com`, `CORS_ALLOWED_ORIGINS=https://app.example.com`, `VITE_API_URL=https://api.example.com`. The API URL excludes `/api`; rebuild the frontend after changes. Serve SPA routes such as `/supplier-portal` through the frontend entry point.
6. Configure a working live mail transport and its credentials privately; refresh Laravel configuration cache as appropriate. OTP and current supplier invitations send synchronously; this change adds no queue-worker requirement. Do not regenerate an existing application key.

## Remaining deployment verification

Timely live OTP delivery remains unresolved: the existing report records eventual receipt after approximately 46 minutes, beyond the five-minute OTP lifetime. The Brevo account owner must investigate and verify a fresh login before expiry. Supplier invitation tracking redirects also require account/network verification; the template provides a direct copy/paste fallback. No provider setting or support message was changed/sent during this contribution.

Use a draft PR until the lint/test exceptions are assessed and required live validation is completed. Existing detailed implementation reports contain historical local counts and links into ignored `.codex` artifacts; those artifacts are local evidence and are not part of the Git contribution.

Local environment files, real database records, provider credentials, private attachments, dependencies/build output, ignored `.codex` verification artifacts, and two modified tracked `.claude` Python cache files remain only on the original device.
