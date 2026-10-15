# Login OTP delivery investigation and fix

Application verification completed October 14, 2026; delivery evidence and final review updated October 15, 2026. Applies to Admin, Plant Manager, and QA Supervisor. No migration, dependency installation, provider replacement, or queue-worker change is required. **Live OTP delivery remains blocked on unexplained delivery latency and unconfirmed timely Gmail receipt/verification.**

## Confirmed failure boundary

All three roles use the same `AuthController` and `LoginChallenges` flow. Laravel 13/PHP 8.5 sends `LoginOtpMail` synchronously through the custom Brevo HTTPS transport. The `Queueable` trait does not make this mailable queued; it does not implement `ShouldQueue`. There were zero pending/failed database jobs. Login uses Sanctum bearer tokens, issued only after OTP verification.

The active local configuration was uncached `MAIL_MAILER=brevo`. The existing API key authenticated successfully, SMTP relay was enabled, the configured sender was active, and credits remained. No credential changes or cache/session flushes were needed. This investigation does not establish the configuration of a separately deployed instance.

Two explicitly authorized controlled emails were sent to the designated inbox using temporary records inside a rolled-back transaction in the isolated test database. The shared initial-send and resend services submitted both messages successfully. The HTTP login endpoints were independently exercised by automated tests; the live smoke check exercised the shared delivery services, not a real user's login session.

Brevo recorded `requests` for the initial message at 22:24:59 and the resend at 22:26:01 on October 14, Asia/Singapore. The October 14 final check showed only those request events. The user checked the designated inbox including Spam at that time and reported **neither arrived**.

A read-only recheck on **October 15 at 09:07:39 +08:00** now shows a later `delivered` event for each message. Both event requests and message metadata requests returned HTTP 200. Each event response contained exactly `requests` and `delivered`, below the 100-event limit, with no reason present. No deferral, block, rejection, bounce, or other explanatory event was returned. The account API returned HTTP 200, relay enabled, and 265 remaining send-limit credits; the configured sender was listed active. These observations apply to the configured local account, not a separately deployed environment.

The observed request-to-delivered intervals were approximately **46 minutes 19 seconds** and **45 minutes 55 seconds**. Both delivery timestamps fall well after the five-minute code lifetime. This establishes delayed provider-reported delivery, not the reason for that delay. On October 15, the user subsequently confirmed **both emails arrived late**. This independently confirms eventual Gmail receipt; exact mailbox arrival times and Inbox versus Spam placement were not supplied. The provider timestamps must not be represented as user-confirmed arrival times. Timely delivery and a usable live login remain unverified. An account restriction, Gmail rejection, provider outage, and delayed event reporting remain unproven explanations; Brevo must identify the actual cause.

### Correlation evidence

Both messages target the same authorized controlled recipient, **`j***@gmail.com`**. Provider IDs below are correlation identifiers, not login challenge IDs or codes.

| Message | Brevo message ID | Request event, Asia/Singapore (+08:00) | Delivered event, Asia/Singapore (+08:00) | Observed interval |
|---|---|---|---|---|
| Initial | `<202610141424.88118542612@smtp-relay.mailin.fr>` | 2026-10-14 22:24:59.146 | 2026-10-14 23:11:18.000 | 46m 18.854s |
| Resend | `<202610141426.31364464426@smtp-relay.mailin.fr>` | 2026-10-14 22:26:01.011 | 2026-10-14 23:11:56.000 | 45m 54.989s |

The corresponding UTC request times are 14:24:59.146Z and 14:26:01.011Z; delivered times are 15:11:18.000Z and 15:11:56.000Z, all on October 14. The metadata endpoint reports the same request instants with a +02:00 offset (16:24:59.146 and 16:26:01.011); these are timezone representations, not additional sends.

Sanitized raw recheck output is saved locally in `.codex/otp-provider-continuation.log`; the earlier request-only snapshot is retained in `.codex/otp-provider-final.log`. The original IDs remain in `.codex/otp-live-message-ids.json`. No new messages were sent during the continuation, and no message-content endpoint was fetched.

Delivery evidence:

| Stage | Result |
|---|---|
| Challenge generated, hash stored | Verified with isolated records |
| Laravel email job queued | Not used; OTP is synchronous |
| Transport/provider submission accepted | Verified for initial send and resend |
| Provider delivery event | Now verified for both, approximately 46 minutes after request |
| Gmail receipt | User subsequently confirmed both arrived late; exact arrival times and folder unspecified |
| Timely live code verification | Unverified for every role; delivery events were after expiry, and isolated records had been rolled back |

## Application defects corrected

- A failed resend previously revoked the challenge and made the screen terminal. It now leaves an open, rate-limited retry path, invalidates the previous code, and never enables the unsent replacement. Initial send failure still returns a safe 503 and leaves no usable challenge.
- Rotation and synchronous resend submission now hold the challenge row lock. Conditional updates match the current code hash, open state, and expiry. A stale send cannot enable a newer generation or revive a revoked/consumed challenge.
- Log/array transports and composite transports containing them are refused for login OTP outside the test environment. A cancelled mail submission cannot masquerade as a successful send. Automated mail fakes remain supported.
- Diagnostics retain transport type, exception class, HTTP status, and known provider error categories. Raw exception details, provider text that might echo message content, and challenge IDs are excluded from the changed diagnostics.
- Responses expose submission state, the stored account's masked email, server time, actual expiry, and remaining cooldown. The screen says submitted to the email service, rather than claiming Gmail receipt. It shows sending/failure/retry states, stops repeated clicks, resets expiry after a successful resend, and does not display a usable-code countdown following a failed send.
- Pending verification remains component-only. Refresh discards it and returns to sign-in; it does not reset a saved challenge's countdown. No code, password, challenge ID, or authentication token is persisted before verification.

Six-digit randomness, hash storage, five-minute expiry, single use, wrong-code attempt limits, resend limits, request throttles, active-account checks, account binding, and role redirects are retained. Failed resends retain the established per-challenge request limit and explicit cooldown; repeated failures can exhaust that limit and require signing in again.

## Changed files

1. `backend/app/Http/Controllers/Api/AuthController.php` — resend locking, retryable failure state, accurate response metadata, safe verification diagnostics.
2. `backend/app/Support/LoginChallenges.php` — delivery guard, conditional activation, safe diagnostics and failed-send behavior.
3. `backend/app/Support/BrevoTransactionalMail.php` — redact arbitrary provider/connection error text; no change to sender, recipients, content, endpoint, TLS or timeout settings.
4. `backend/tests/Feature/LoginOtpTest.php` — retry, all roles, matching account, stale completion, and non-delivery transport checks.
5. `backend/tests/Feature/LoginOtpDeliveryTest.php` — new tests through the actual Laravel/Brevo mail pipeline with HTTP fakes and no external messages.
6. `frontend/src/page/LoginPage.tsx` — sending feedback and server submission/masked-recipient state.
7. `frontend/src/components/auth/OtpVerificationForm.tsx` — failure recovery, sending feedback, expiry and cooldown behavior.
8. `docs/login-otp-delivery.md` — this report.

Prior uncommitted catalog, inventory, capacity, production, layout and Supplier Portal work was preserved. Starting-file hashes show only the six intended existing source/test files changed during this task, plus the new delivery test and report. No real application user or email address was altered. No staging, commit, push, reset or clean was performed.

The October 15 continuation preserved all existing application/frontend/test edits and unrelated work. It updated only this report and three ignored local diagnostic scripts: `otp-provider-recheck.php` now records check time, provider IDs, masked recipients, explicit truncation warnings and reason-presence flags while suppressing raw reasons and exception text; `otp-diagnostics.php` masks the sender; `otp-live-smoke.php` requires an explicit `--send-controlled-test` flag before bootstrapping or sending. The live-send guard was checked without the flag; it did not send email. These scripts and evidence under `.codex` are ignored local artifacts, so the durable support facts are also included in this report.

## Verification

- Baseline: 52 auth/mail tests passed, 426 assertions.
- Final focused and related regression set: **116 tests passed, 1,188 assertions**, including OTP, rate limits, auth hardening, Brevo, password reset, invitations and Supplier Portal. Only the isolated PostgreSQL test database on port 55432 was used. The test server was stopped afterwards.
- Initial submission and resend through rendered Laravel mail/Brevo HTTP pipeline tested for all three roles; provider rejection/authentication/rate-limit/server failure and missing credentials tested without live sends.
- Verification, no access before OTP, invalid/expired/reused/wrong-account codes, cooldown, resend limits, failed attempts retained through resend, suspended accounts, stale send completion, and retryable failure covered.
- PHP syntax checks, frontend TypeScript, scoped oxlint and production build passed. The existing large-bundle build warning remains.
- Browser checks passed for masked destination, initial failure, submitting state, repeated-click prevention, retryable resend failure, successful resend, invalid/expired code, refresh and all three redirects. Eight screenshots are in `.codex/otp-browser`; these use isolated mocked API responses and do not prove Gmail delivery.
- Repository Open Code Review checklist applied to authentication, locking, failures, sensitive data, API/frontend mapping and regression scope. No external OCR service was required.

### October 15 final review

The repository-local [Open Code Review checklist](../.claude/skills/open-code-review/SKILL.md) was reapplied to the relevant diffs and current execution path. The external `ocr` CLI was not available. Review confirmed password-first challenge issuance, account binding, hash-only storage, conditional generation activation, resend/verify row locking, expiry, single use, attempt/resend limits, endpoint throttles, active-account checks, token issuance only after verification, role redirects, and honest submission/failure UI states. No additional application defect explaining the live delay was established, and no application change was made in this continuation.

The prior 116-test/1,188-assertion regression log, focused log, production build/TypeScript log, and browser result manifest with eight screenshots were inspected. Those passing checks were not rerun because their application inputs were unchanged. The changed diagnostic PHP scripts passed syntax checks; the read-only provider recheck completed against the existing IDs; the live-send script refused execution without its flag. Scoped diff whitespace checks passed. Diagnostic/report review found no literal API key, credential, active code, or message body to disclose; fixed codes in automated fixtures are isolated fake values. Fresh file hashes are used to verify preservation of unrelated work.

Representative screenshots: [submitted verification screen](../.codex/otp-browser/submitted-mobile.png), [failed resend with retry](../.codex/otp-browser/resend-failure-retry.png), [expired code](../.codex/otp-browser/expired-code.png).

## Remaining owner/provider action

**Status: blocked for timely live OTP delivery; eventual Gmail receipt confirmed by the user; support handoff prepared, not sent.** The Brevo account owner owns the provider investigation; Brevo owns the internal queue/SMTP trace and cause of delay. The Gmail inbox owner can supply exact arrival times, folder placement and message-header evidence. A developer and the controlled inbox owner can verify a fresh real login after the cause is identified and corrected. Automated role coverage and mocked redirects do not establish live Admin, Plant Manager, or QA success.

### Brevo support handoff (ready to copy)

Subject: SmartChain transactional login OTPs show ~46-minute delivery delay with no explanatory events

Two controlled login verification messages were accepted through Brevo's HTTPS transactional API on October 14, 2026. The configured account's relay is enabled, sender active, and credits available as of October 15, 09:07:39 Asia/Singapore (+08:00). Both message event queries and metadata queries returned HTTP 200. Recipient is masked here as `j***@gmail.com`; the authenticated account owner can supply the exact sender/recipient privately in the ticket.

- Initial ID: `<202610141424.88118542612@smtp-relay.mailin.fr>`. `requests`: `2026-10-14T22:24:59.146+08:00`; `delivered`: `2026-10-14T23:11:18.000+08:00`. Interval 46m 18.854s.
- Resend ID: `<202610141426.31364464426@smtp-relay.mailin.fr>`. `requests`: `2026-10-14T22:26:01.011+08:00`; `delivered`: `2026-10-14T23:11:56.000+08:00`. Interval 45m 54.989s.
- `GET /v3/smtp/statistics/events?messageId=...` returned only `requests` and `delivered` for each ID, with no reason. There were no returned deferred/blocked/rejected/bounce/error events. Earlier checks at approximately 22:34 +08:00 returned requests only. `GET /v3/smtp/emails?messageId=...` found one metadata record per ID. Separately, the user confirmed both emails eventually arrived late in Gmail. Exact arrival times and folder placement were not supplied; the timestamps above remain provider event times.
- Impact: login codes expire after five minutes; both delivered timestamps are far too late for the intended flow. The original test records were rolled back; do not replay or resend these old codes.

Questions for Brevo:

1. For each ID, what are the actual enqueue, dequeue, first SMTP attempt, retry and remote acceptance times? Do the `delivered` timestamps represent actual remote SMTP acceptance or delayed event ingestion/reporting?
2. Where did the ~46-minute interval occur, and why was no explanatory event/reason exposed? Please supply the queue/SMTP trace and any remote response codes, with private message content omitted.
3. Was there a specific account/sender/domain restriction, internal queue hold, sending-IP issue, or remote deferral for these messages? Confirm any cause from the trace rather than inferring it from the delay.
4. What exact account or sender/domain action, if any, is required to restore delivery comfortably within the five-minute lifetime, and how should we confirm it before another controlled test?

The account owner should submit this from the authenticated Brevo account and add the account identifier/contact email plus exact configured sender and controlled recipient privately if requested. Attach the sanitized recheck output or paste the evidence above. Both emails have now been found by the inbox owner; exact arrival times, folder placement and relevant `Received` headers can be supplied privately to Brevo to distinguish transport delay from reporting delay. Never attach an environment file, API key, password, email body, or verification code. No support contact was made automatically.

After an evidence-backed correction, use only the already authorized controlled recipient for a bounded fresh test and record API submission, provider event time, inbox arrival and successful verification before expiry as separate outcomes. Do not claim role-specific live success until that role's real flow is observed. Do not rotate working credentials, flush challenges, remove OTP, increase the five-minute policy, add a worker/migration, or repeatedly resend to hide the delay.

Official references checked October 15: [transactional event API and message-ID filter](https://developers.brevo.com/reference/get-email-event-report), [transactional message metadata](https://developers.brevo.com/reference/get-transac-emails-list), [transactional event definitions](https://help.brevo.com/hc/en-us/articles/208858829-Review-your-transactional-email-reports), [transactional log investigation](https://help.brevo.com/hc/en-us/articles/360021533839-Manage-your-transactional-logs-and-email-previews), [possible provider queue explanations](https://help.brevo.com/hc/en-us/articles/360021917460-Why-are-emails-added-to-a-queue). These references explain the tools and event types; they do not diagnose this account's delay.
