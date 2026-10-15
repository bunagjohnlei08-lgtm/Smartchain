# Process updates contribution

Prepared October 15, 2026. Base: `organize-frontend-backend`; contribution branch: `feature/process-updates`.

## Behavior

This contribution includes all existing application edits requested by the owner: catalog classification and safe unused-setup deletion, warehouse capacity allocations by KG/PCS/L, independent internal production with BOM snapshots and server-enforced processing time, assigned manual QA and separate passed-only stock-in, supplier portal session recovery and invitation fallback, OTP submission/retry handling, classification displays, and shared page spacing.

The existing supplier replenishment/approval/PO/receiving/incoming-QA/stock-in flow remains the procurement path for both product classes. Production does not complete supplier requests. Whole-unit inventory and existing barcodes remain authoritative; fractional material demand blocks issuance rather than rounding. Internal HOLD/REWORK/DISPOSAL is separate from supplier Backload.

## Validation during contribution preparation and PR readiness review

- The readiness review recovered the dedicated PostgreSQL `smartchain_test_db` on local port 5432 and verified `current_database()` before every destructive test migration. The development database remained `smartchain_db` and was not migrated or reset.
- A broader focused run of all 22 changed feature-test files passed: 272 tests, 3,054 assertions, at revision `f0b0462a99e0c8d0ed7e60819012a6d0d07bd2e5`.
- Equivalent full-suite comparison used PHP 8.5.9, direct PHPUnit, a 512 MB test-process memory limit, and forced array mail/cache plus the same PostgreSQL test database. Base `993905329186fb5477a8d6b272bf3fc198d95401`: 645 tests, 643 passed, 5,320 assertions. Contribution `f0b0462a99e0c8d0ed7e60819012a6d0d07bd2e5`: 714 tests, 712 passed, 6,313 assertions.
- Both revisions have exactly the same two exceptions: `AuditLogTest::test_user_update_role_change_and_status_changes_are_audited` uses a password fixture without a required symbol; `InventoryQualityAuditTest::test_admin_can_change_configured_months` asks PostgreSQL to compare a `json` column with an uncast value. The contribution does not introduce or alter either test file.
- Frontend TypeScript/Vite production build passed; large-chunk warning remains.
- Global frontend lint now passes after separate commit `f0b0462` moved the existing Shipment modal null return below its guarded effect, preserving behavior while keeping hook order stable. Four existing warnings remain.
- PHP syntax passed for all 66 staged PHP files. Composer production platform requirements passed.
- Eleven production routes were listed successfully; all four new migrations are recorded as applied in the local application database. No application migration was executed during contribution preparation.
- Applied the repository-local Open Code Review checklist and focused staged-diff review, including authorization, transactions, snapshots, stock/QA arithmetic, provider submission semantics and shared layout changes. External OCR CLI is unavailable.
- Staged whitespace check and credential/path scan passed. No dependency manifest or lockfile changes were required. No secrets, databases, private uploads, or generated Python caches are included.
- No controllable browser was connected during the readiness review, so browser UI smoke remains unresolved. Local HTTP smoke against the merge candidate used only `smartchain_test_db` and a localhost SMTP catcher: a fresh OTP was submitted locally in 1.443 seconds and successfully verified in 2.140 seconds, within the unchanged five-minute expiry. This proves the local application submission/verification path only; it is not live-provider delivery evidence.

## Developer setup

1. Install locked dependencies normally: `composer install` in `backend`, `npm ci` in `frontend`. Use the project's PHP 8.5/PostgreSQL stack and supported Node version. Dompdf is already in the committed Composer dependencies.
2. Back up the deployment database using the normal private operational process, then run `php artisan migrate --force` in `backend`. This applies the four `2026_10_14_000000` through `2026_10_14_030000` migrations. Do not import a local database dump.
3. Admin must explicitly configure warehouse Total Capacity and KG/PCS/L allocations that sum to that total and cover current usage. No legacy split is invented. Positive inbound stock requires this configuration.
4. Confirm actual raw-material classifications; legacy products default to Finished Product, missing units to PCS. Configure real formulas and minimum processing times (default 30 minutes), warehouse assignments, eligible QA users and approved QA criteria through the application. Operational records/configuration are not transferred by Git.
5. Configure deployment-specific `APP_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, and frontend `VITE_API_URL` privately using the existing environment examples. Example placeholders only: `APP_URL=https://api.example.com`, `FRONTEND_URL=https://app.example.com`, `CORS_ALLOWED_ORIGINS=https://app.example.com`, `VITE_API_URL=https://api.example.com`. The API URL excludes `/api`; rebuild the frontend after changes. Serve SPA routes such as `/supplier-portal` through the frontend entry point.
6. Configure a working live mail transport and its credentials privately; refresh Laravel configuration cache as appropriate. OTP and current supplier invitations send synchronously; this change adds no queue-worker requirement. Do not regenerate an existing application key.

## Remaining deployment verification

Timely live OTP delivery remains unresolved: the existing report records eventual receipt after approximately 46 minutes, beyond the five-minute OTP lifetime. The Brevo account owner must use an explicitly approved test inbox, compare application submission, provider acceptance/delivery events and mailbox arrival timestamps, and verify a fresh login before expiry. Supplier invitation tracking redirects also require account/network verification against the configured deployment URLs; the template provides a direct copy/paste fallback. No external provider setting or support message was changed/sent during this contribution or readiness review.

Keep the PR draft until browser smoke, timely live-provider OTP delivery, and supplier tracking redirects are verified. The two backend exceptions are confirmed baseline issues, and the Shipment lint blocker is resolved. Existing detailed implementation reports contain historical local counts and links into ignored `.codex` artifacts; those artifacts are local evidence and are not part of the Git contribution.

Local environment files, real database records, provider credentials, private attachments, dependencies/build output, ignored `.codex` verification artifacts, and two modified tracked `.claude` Python cache files remain only on the original device.
