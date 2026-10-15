# Supplier invitation-to-portal flow

## Confirmed failure and scope

The local application sends supplier invitations synchronously through Laravel's `SupplierApplicationPortalMail`, the registered `brevo` mail transport, and the Brevo HTTPS endpoint `POST /v3/smtp/email`. `Queueable` is present on the Mailable, but these callers use `Mail::send`; there is no queued invitation job in this flow.

A live resend to the designated test recipient was accepted with HTTP 201. Brevo's personalized-email API recorded `sent`, `delivered`, and `open` events. Its stored HTML confirmed that the original button destination was rewritten to a host under `sendibt3.com` with a `/tr/cl/` path. The recipient reported that this fresh button still timed out; a request to the same redirect from this PC also failed. The copyable destination in the stored email retained the full original URL and a token matching the application's access record. The recipient confirmed that copying that address into the browser opened their own portal, including History and Meeting.

This isolates the reported timeout to the provider redirect/network path before the portal. It does not establish whether the underlying cause is Brevo availability, DNS, routing, filtering, or another network restriction. The screenshots named in the request were not included in the attachment directory; live sender-side and recipient checks supplied the evidence above. No complete access token or tracking URL is included in this report.

There was also an application bug: reopening a previously consumed invitation attempted another exchange and cleared the valid supplier session. A browser reproduction using the original frontend confirmed that behavior. Direct `window.history.replaceState` also left React Router's fragment state out of sync. The page now uses router navigation, remembers only a SHA-256 fingerprint of the invitation, and resumes the matching unexpired session. A different invitation must establish its own session. The server still validates every portal data request; revoked or expired sessions hide the application and clear cached access. Async responses from an abandoned invitation cannot replace the current application's data.

## Files changed

| File | Purpose |
| --- | --- |
| `frontend/src/page/SupplierPortalPage.tsx` | Resume only the matching live session, remove the fragment through React Router, reset stale application/meeting selection state, and ignore abandoned loading responses. |
| `backend/resources/views/mail/supplier-application-portal.blade.php` | Include the original full portal URL as copyable text below the button, allowing recipients to bypass a failed tracking redirect. |
| `backend/tests/Feature/SupplierPortalTest.php` | Cover invitation rendering, guest access, real history, private-note protection, ownership, schedule persistence, confirmation links, and tampering. |
| `backend/tests/Feature/BrevoTransactionalMailTest.php` | Verify the original destination and fragment reach the actual API integration unchanged in HTML and plain text. |
| `docs/supplier-portal-invitation-flow.md` | Investigation, operational configuration, verification, and limitations. |

## Access and business rules

1. The existing admin meeting-options action validates and stores at least three future options on different dates. This moves initial review to `QUALIFIED_FOR_MEETING`, records supplier-visible events, and sends the invitation.
2. The URL is `${FRONTEND_URL}/supplier-portal#token=...`. The fragment keeps the raw invitation token out of ordinary frontend HTTP access logs. The React route is public and is outside the administrator route guard; the two existing supplier-application portal aliases remain available.
3. The page exchanges a fresh token at `POST /api/supplier-portal/access`. The database stores only its hash. Expiration, revocation, row locking, and the one-use `link_consumed_at` check remain unchanged. Suppliers need no administrator login, supplier account setup, or Sanctum token.
4. The temporary session is stored in the tab's session storage. Requests use `X-Supplier-Portal-Session`. Middleware resolves the application from that server-validated session, rather than a caller-supplied application ID. History, current status, offerings, and meeting information use existing stored records; internal decision notes and meeting evaluation notes remain excluded.
5. Selection remains an explicit POST. The existing transaction checks application stage, slot ownership, availability, and booking conflicts. It persists `MEETING_SCHEDULED`, the reserved slot, cancellation of other options, and the `MEETING_SELECTED` history event. Opening or refreshing a link does not approve an application or reserve a meeting. Final accreditation remains a separate existing admin process.
6. Meeting confirmation sends a fresh invitation while preserving the established session. Refresh and reopening in the same tab/session show the saved meeting. A previously consumed or replaced link in another tab/browser remains invalid; use the latest confirmation email to establish fresh access there.

## Environment and deployment

For development on this PC, the existing values are correct:

```dotenv
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
MAIL_MAILER=brevo
```

The frontend has `VITE_API_URL=http://localhost:8000`; its API client adds `/api`. Both development servers must stay running. A localhost invitation only works from a computer hosting those servers.

For external suppliers, configure the deployment's `FRONTEND_URL` to the real, reachable **HTTPS frontend origin**; set `APP_URL` to the public backend URL and `CORS_ALLOWED_ORIGINS` to the frontend origin. Set the frontend's `VITE_API_URL` to the HTTPS backend origin without `/api` and rebuild the frontend, because Vite embeds it at build time. The frontend host must serve its SPA entry point for `/supplier-portal` and the existing alias paths. No deployment environment was changed during this investigation.

After changing backend environment values, clear or rebuild Laravel's configuration cache as appropriate for that deployment. If long-running queue workers are used elsewhere, restart them to reload configuration; the current supplier invitation does not require a queue worker. Do not regenerate the application key or change credentials to apply this fix.

## Brevo tracking

The [transactional send API](https://developers.brevo.com/reference/send-transac-email) does not document a per-message click-redirect disable option in the request fields inspected. No undocumented tracking header was added. Brevo's [anonymous tracking setting](https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails) still collects aggregate opens and clicks; it is not a verified way to bypass link rewriting. The newer [per-recipient consent documentation](https://developers.brevo.com/changelog/2026/7/21) describes anonymized opens and a required account feature; it does not establish a redirect-bypass guarantee, so it was not used as a tracking-disable switch.

For the button itself to work on the affected network, the account/network operator must restore reachability of the rewritten redirect or have Brevo confirm and apply a supported account setting that preserves the original URL. Contact Brevo support with the message identifier from the account's Transactional Email logs and the failed tracking hostname; keep the secure URL private. The application change provides a copy-and-paste fallback while this is investigated. Provider-dashboard settings were not changed, and no successful tracking-button click is claimed.

Previously delivered tracking links cannot be rewritten by changing this template. Fresh invitations include the fallback, and resending rotates the previous invitation token. Existing matching sessions remain usable until session expiry/revocation. Older tabs established before this frontend change have no invitation fingerprint; they can still refresh their token-free portal URL while their session is valid, or use a new invitation.

## Validation

- Focused isolated PostgreSQL checks: `SupplierPortalTest`, `SupplierMeetingSchedulingTest`, `SupplierApplicationWorkflowTest`, and `BrevoTransactionalMailTest`: **65 tests passed, 625 assertions**. Mail/HTTP fakes prevent automated tests from sending emails or using the application database.
- Real backend tests verify guest access, supplier isolation, invalid/expired/revoked/tampered links, public history, final approval separation, persistent selections, and fresh confirmation links. A replay without its matching established session remains rejected.
- Automated Chromium checks exercised the actual React page with intercepted API fixtures: fresh guest access, StrictMode single exchange, History/Meeting display, selection and refresh, reopening, switching invitations, rejected cached sessions, invalid/expired links, replay rejection in a clean browser, and a fresh confirmation link. The original frontend reproduction failed on reopening as expected; the changed frontend passed these checks. Browser fixture checks supplement the real backend persistence tests.
- The changed portal component passes the repository's linter. The full frontend lint still fails on the pre-existing conditional hook in `plant-manager/Shipment.tsx:295`, with four existing warnings. Those unrelated files were not changed.
- TypeScript checking and the Vite production build pass; the existing bundle-size warning remains.
- Live email: a single authorized resend used the designated recipient's existing qualified application and real meeting options. The application status and selected-slot count were preserved. The invitation remained unconsumed until the recipient opened it. The recipient verified delivery, the tracking timeout, and successful direct portal access/history/meeting display. Live schedule selection was not performed by the agent.

The OpenCodeReview checklist confirmed that authentication boundaries, supplier ownership, approval stages, stored history, and existing slot transactions were preserved. No dependencies, migrations, shared API clients, administrator authentication, or unrelated modules were changed. Full end-to-end success through the tracked button remains dependent on resolving the external redirect failure.
