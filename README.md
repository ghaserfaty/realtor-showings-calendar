# Private Group Property Showings

A production-oriented Next.js application that lets a realtor issue private invitation links and lets each invited prospective buyer or renter select one or more **group** property showings. PostgreSQL is the registration source of truth; Google Calendar is a synchronized operational view.

The application never has a public listing page. Only events explicitly marked as property showings are returned, and the browser receives a small sanitized DTO rather than a raw Google Calendar event.

## Architecture

The project runs on Node.js 22 with strict TypeScript, Next.js App Router, PostgreSQL, Prisma, Zod, Vitest, and the Google Calendar API.

```text
Browser invitation page
  └─ Next.js API routes
      ├─ invitation + session services
      ├─ OTP verification + email provider
      ├─ server-side showing filter
      ├─ idempotent registration service
      ├─ deterministic Calendar sync service
      └─ Prisma repositories → PostgreSQL
                              ↘ Google Calendar or mock provider
```

Important boundaries:

- `app/api` contains thin HTTP handlers only.
- `services` owns domain rules and external synchronization.
- `repositories` owns Prisma-backed access patterns.
- `services/calendar` contains the provider interface plus Google and mock implementations.
- `lib/validation` contains Zod request schemas.
- `lib/security` contains hashing, masking, rate limiting, admin authentication, and headers.
- PostgreSQL determines which invitation registered for which event. Calendar descriptions are never parsed as the database.

## Database model

- `Realtor`: calendar owner reference and internal identity.
- `Invitation`: SHA-256 token hash, recipient defaults, expiration/revocation, optional registration limit, and verification policy.
- `InvitationSession`: hashed opaque browser session with optional verified-email timestamp.
- `VerificationCode`: HMAC-hashed, ten-minute, single-use OTP with request and attempt limits.
- `Registration`: one record per invitation/event pair, contact details, cancellation state, and separate Calendar sync state.
- `AuditLog`: creation, access, verification, registration, cancellation, resend, and revocation activity; IP addresses are HMAC-hashed.

The database enforces `UNIQUE(invitationId, calendarEventId)`. Different invitations may register for the same event. A showing is never made exclusive after one selection.

## Quick start with Docker

Requirements: Docker with Compose.

```bash
cp .env.example .env
# Replace ADMIN_API_KEY, SESSION_SECRET, and OTP_PEPPER in .env.
docker compose up --build -d
docker compose run --rm migrate npm run db:seed
```

Open `http://localhost:3000`. The seed command prints one development-only valid invitation URL and one expired URL. The app defaults to the in-process mock Calendar provider, so Google credentials are not needed locally.

Stop the stack with:

```bash
docker compose down
```

Use `docker compose down -v` only when you intentionally want to delete the local PostgreSQL volume.

## Local development without Docker for the app

Run PostgreSQL (the Compose database is convenient), then:

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Quality commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Environment variables

| Variable                                | Required    | Purpose                                                                                    |
| --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                          | Yes         | PostgreSQL connection URL.                                                                 |
| `APP_URL`                               | Yes         | Canonical origin used to create invitation links and validate mutation origins.            |
| `ADMIN_API_KEY`                         | Yes         | Internal API bearer passed as `x-admin-api-key`; use a long random value.                  |
| `SESSION_SECRET`                        | Yes         | HMAC secret for security metadata; at least 32 random characters.                          |
| `OTP_PEPPER`                            | Yes         | Independent secret used to HMAC verification codes.                                        |
| `REALTOR_EMAIL`                         | Yes         | Email for the realtor record created with the first invitation if the database is empty.   |
| `REALTOR_DISPLAY_NAME`                  | Yes         | Display name for that initial realtor record.                                              |
| `REQUIRE_INVITATION_EMAIL_VERIFICATION` | No          | Default verification policy for new invitations. Default `false`.                          |
| `SESSION_COOKIE_SECURE`                 | No          | Force secure cookies outside production; use `true` behind HTTPS.                          |
| `EMAIL_PROVIDER`                        | Yes for OTP | `console` in development or `webhook` in production. Console is rejected in production.    |
| `EMAIL_WEBHOOK_URL`                     | For webhook | HTTPS endpoint accepting `{to, subject, text}` JSON.                                       |
| `EMAIL_WEBHOOK_API_KEY`                 | No          | Sent as a bearer credential to the email webhook.                                          |
| `CALENDAR_PROVIDER`                     | No          | `mock` or `google`. Default `mock`.                                                        |
| `GOOGLE_CLIENT_ID`                      | For Google  | OAuth client ID.                                                                           |
| `GOOGLE_CLIENT_SECRET`                  | For Google  | OAuth client secret.                                                                       |
| `GOOGLE_REFRESH_TOKEN`                  | For Google  | Realtor-authorized offline refresh token.                                                  |
| `GOOGLE_CALENDAR_ID`                    | Yes         | Exact calendar queried and updated. A dedicated showing calendar is recommended.           |
| `SHOWING_FILTER_MODE`                   | No          | `dedicated_calendar` (recommended/default), `extended_property`, or legacy `title_prefix`. |
| `SHOWING_OPEN_TITLE_PREFIX`             | No          | Editable title prefix that opens registration. Default `[ABIERTA]`.                        |
| `SHOWING_CLOSED_TITLE_PREFIX`           | No          | Human-facing convention for closed events. Default `[CERRADA]`.                            |
| `SHOWING_PUBLIC_BLOCK_START`            | No          | First line of the whitelisted public description block.                                    |
| `SHOWING_PUBLIC_BLOCK_END`              | No          | Last line of the whitelisted public description block.                                     |
| `SHOWING_EVENT_TYPE`                    | Legacy      | Event type used only in `extended_property` mode.                                          |
| `SHOWING_TITLE_PREFIX`                  | Legacy      | Prefix used only in `title_prefix` mode.                                                   |
| `ALLOW_REGISTRATION_CANCELLATION`       | No          | Allow the invitee to cancel before the showing starts.                                     |
| `EXPOSE_GOOGLE_MEET_LINKS`              | No          | Reserved, off by default. Meet links are not currently exposed.                            |
| `ADD_REGISTRANTS_AS_ATTENDEES`          | No          | Reserved, off by default. Registrants are not Calendar attendees.                          |

Production startup intentionally fails if placeholder secrets or the development realtor address remain configured. The console email adapter refuses to deliver in production, so OTP-enabled deployments must configure the webhook adapter.

## Google Cloud and Calendar setup

1. Create or select a Google Cloud project.
2. Enable **Google Calendar API**.
3. Configure the OAuth consent screen. Add the realtor account as a test user while the app is in testing status.
4. Create an OAuth 2.0 client (Web application for a hosted callback flow, or Desktop app for a one-time local token helper).
5. Request the narrow scope `https://www.googleapis.com/auth/calendar.events` and offline access.
6. Complete consent as the realtor, exchange the authorization code, and store the returned refresh token in `GOOGLE_REFRESH_TOKEN`.
7. Set `GOOGLE_CALENDAR_ID` to the dedicated showings calendar ID or the exact owner calendar. Never send credentials to the browser.

For a one-time refresh token, Google OAuth 2.0 Playground can be used: open its settings, enable “Use your own OAuth credentials,” enter the client values, authorize the Calendar events scope with access type offline/prompt consent, exchange the code, and copy the refresh token. Follow your organization’s secret-management policy; do not put the token in Git.

If local development reports `No access, refresh token, API key or refresh handler callback is set`, `CALENDAR_PROVIDER=google` is active but `GOOGLE_REFRESH_TOKEN` is empty. Add a refresh token and restart `npm run dev`, or temporarily use `CALENDAR_PROVIDER=mock` to exercise the invitation flow without connecting Google Calendar.

Refresh tokens can be revoked by the account owner or invalidated by OAuth configuration changes. API errors are recorded per registration as `ERROR`; they do not roll back the database registration or create a duplicate on retry. An internal retry endpoint is provided at `POST /api/admin/calendar-sync/retry`.

## Managing showings from the normal Google Calendar interface

Create a separate Google Calendar used **only** for property showings and put its ID in `GOOGLE_CALENDAR_ID`. The application never queries the realtor's personal calendar. With the recommended `SHOWING_FILTER_MODE=dedicated_calendar`, no custom or extended properties are required.

Create and edit events with the regular Calendar fields:

- **Title:** `[ABIERTA] Palermo – 2 ambientes`
- **Location:** `Güemes 4120, Palermo`
- **Date and time:** the normal start and end fields
- **Description:** an optional, deliberately small public block followed by any internal notes

```text
PUBLIC_SHOWING
Listing: https://example.com/listings/palermo-101
Notes: Meet in the lobby five minutes early.
Capacity: 20
END_PUBLIC_SHOWING

Seller phone and internal access instructions can go here.
This text is never returned to the invitee.
```

Only the exact `Listing`, `Notes`, and `Capacity` lines between the two markers are parsed. Everything outside the block remains private. `Listing` must be HTTPS, and `Capacity` is optional; omit it for an unlimited group showing.

Descriptions created with Google Calendar's rich-text editor are supported; the parser accepts both the HTML returned by the Calendar API and plain-text descriptions.

To close registration, change the title prefix from `[ABIERTA]` to `[CERRADA]`. Deleting or cancelling the event, removing the open prefix, or allowing its start time to pass also removes it from availability. The dedicated calendar is the main security boundary; the open prefix is a second explicit allow-list.

The older `extended_property` mode remains available for API-managed calendars, but it is no longer the default.

## Calendar changes while an invitee is deciding

The invitation page refreshes its showing list every 60 seconds and whenever the browser window regains focus. Any selected item whose public details changed is automatically unselected so the invitee must review it again.

The browser refresh is only a convenience; the server is authoritative. On submission, it fetches every selected event again from the exact configured calendar immediately before the database transaction and verifies that it:

- still exists and is not cancelled;
- still starts in the future;
- still begins with `[ABIERTA]`;
- has not reached its optional capacity; and
- has the same title, address, start/end time, time zone, public notes, listing URL, and configured capacity that the invitee selected.

The public fields are represented by an opaque SHA-256 selection version. If the event was moved or edited, registration returns HTTP `409 SHOWING_CHANGED`, the page reloads the current Calendar data, clears the stale selection, and asks the invitee to choose again. If it was closed, deleted, cancelled, started, or filled, registration returns the corresponding unavailable/full conflict instead. No stale browser state is trusted.

Google Calendar and PostgreSQL cannot participate in one distributed transaction, so an event could theoretically change in the very small interval after the final Calendar validation and during the database write. Calendar synchronization is tracked separately; failures remain visible as `ERROR` without duplicating the registration and can be retried or reviewed by the realtor.

## Invitation-link security model

Creation uses 32 cryptographically random bytes. The URL contains only an opaque token; the database stores only its SHA-256 hash. The plain token is returned once by the create endpoint. A resend rotates the token, invalidates existing invitation sessions, sends the replacement link, and returns the new token once.

**Without email verification, the private URL is a bearer credential: anyone who obtains it may use it until it expires, reaches its configured limit, or is revoked.** Enable email OTP verification when it is important to ensure that only the intended recipient can use an invitation.

When verification is enabled:

1. The page exposes only a masked invited address.
2. A six-digit code is delivered only to the stored address.
3. The HMAC-hashed code expires after ten minutes, is single-use, allows five attempts, and has database plus IP request limits.
4. Success issues an opaque, hashed server session in an `HttpOnly`, `SameSite=Strict`, secure-in-production cookie.
5. The invited email becomes visible and read-only only after verification.

The application does not log invitation tokens. In production, configure reverse proxies, observability, and analytics to redact `/invite/*` and `/api/invitations/*` path segments as URLs may otherwise be captured outside the application.

## Admin API

All internal endpoints require `x-admin-api-key`. In production, place them behind a private network or identity-aware proxy; the API key is an MVP control, not a substitute for a managed identity provider and role-based authorization.

Create an invitation (the token and URL appear only in this response):

```bash
curl -X POST http://localhost:3000/api/admin/invitations \
  -H 'content-type: application/json' \
  -H 'x-admin-api-key: your-admin-key' \
  -d '{
    "invitedEmail":"client@example.com",
    "invitedName":"Jane Client",
    "expiresAt":"2026-08-01T23:59:59Z",
    "verificationRequired":true,
    "sendEmail":true
  }'
```

Other endpoints:

- `GET /api/admin/invitations/:id` — recipient metadata and selected showings; never returns the token hash.
- `POST /api/admin/invitations/:id/revoke` — revoke and delete active invitation sessions.
- `POST /api/admin/invitations/:id/resend` — rotate and resend the bearer token.
- `POST /api/admin/calendar-sync/retry` — retry up to 100 events with failed synchronization.

Public invitation endpoints follow the routes in the original brief under `/api/invitations/:token`.

## Managed Calendar description block

After each registration or cancellation, active database registrations for that event are sorted by registration time and ID and rendered between:

```text
<!-- SHOWING_REGISTRATIONS_START -->
<!-- SHOWING_REGISTRATIONS_END -->
```

The service retrieves the current event, replaces only that managed block, preserves realtor-authored text outside it, and updates the private `registrationCount`. Repeating synchronization produces the same block rather than appending duplicate text. Clients are deliberately not added as Google Calendar attendees, which avoids invitation emails and attendee disclosure.

## Deployment

1. Provision PostgreSQL with encrypted connections, backups, and restricted network access.
2. Build the Docker image from `Dockerfile` and run it behind an HTTPS reverse proxy.
3. Store all secrets in the platform’s secret manager, not an image or checked-in `.env`.
4. Run `npx prisma migrate deploy` as a release step before routing traffic.
5. Use at least one persistent email webhook and set `CALENDAR_PROVIDER=google` with OAuth secrets.
6. Restrict admin routes, redact invitation paths in infrastructure logs, and monitor the health route at `/api/health`.
7. Schedule authenticated calls to `/api/admin/calendar-sync/retry` or replace it with a durable queue worker.

The image uses Next.js standalone output and runs as an unprivileged user.

## Deploying to Vercel

The application can be deployed to Vercel as a standard Next.js project. No `vercel.json` or custom build command is required. The `postinstall` script generates Prisma Client and Vercel can use the existing `npm run build` command.

Before the first production deployment:

1. Import this Git repository into Vercel.
2. Provision a managed PostgreSQL database. Use a pooled connection string for `DATABASE_URL`; `localhost` and the included Docker Compose database are only for local development.
3. Add the variables from `.env.example` in Vercel Project Settings. At minimum, replace `APP_URL`, `ADMIN_API_KEY`, `SESSION_SECRET`, `OTP_PEPPER`, `REALTOR_EMAIL`, the database URL, and the Google OAuth values. Set `APP_URL` to the canonical HTTPS production domain and `CALENDAR_PROVIDER=google`.
4. Run `npm run db:migrate` once from a trusted release environment with the production database URL before serving traffic. When the database vendor supplies separate pooled and direct URLs, use the direct URL for migrations and the pooled URL for Vercel Functions.
5. Configure `EMAIL_PROVIDER=webhook` plus its URL and credential if invitations or OTP codes must be delivered. The console provider intentionally refuses production delivery.

Vercel-specific operational considerations:

- API Route Handlers run as Node.js functions and make outbound calls to PostgreSQL, Google Calendar, and the configured email webhook.
- The current IP rate limiter is process-local. It is useful as defense in depth but is not globally consistent across multiple Vercel instances; use Redis or a gateway-level limiter for production abuse protection.
- Calendar synchronization retries are request-driven. Schedule the authenticated retry endpoint or replace it with a durable queue for stronger delivery guarantees.
- Apply database migrations as a separate release step rather than from every serverless function or every preview build.

## Security considerations

- Raw Google events, attendees, organizer data, Meet links, descriptions, and private extended properties are never serialized to invitees.
- Event IDs are treated as untrusted and fetched from the configured calendar again on every registration/cancellation.
- Mutation routes enforce same-origin requests, strict cookies, Zod validation, body-size limits, rate limits, and generic errors.
- User text is length-limited and rendered by React; line breaks and managed-block markers are stripped before Calendar synchronization.
- Logging recursively redacts token/secret/code/cookie/authorization fields.
- Capacity is optional and off unless an event declares a positive integer. Group registrations are never exclusive.
- Security headers deny framing and restrict scripts, connections, forms, and browser capabilities.

## Tests

Vitest covers valid/invalid/expired/revoked hashed invitation lookup, OTP expiration/attempt/reuse rules, exclusion of unrelated/past/cancelled/disabled Calendar events, valid showing sanitization, multiple invitees on one group event, same-invitation retries, cancellation ownership, Calendar sync failure persistence, preservation of realtor descriptions, and deterministic block replacement. Google Calendar is mocked in automated tests.

## Known limitations and future improvements

- The included IP limiter is process-local in addition to persistent OTP request limits. Multi-instance deployments should use Redis or an API-gateway limiter.
- Calendar synchronization is request-driven with an admin retry endpoint. A durable queue with exponential backoff and dead-letter monitoring is recommended.
- Optional Calendar capacity is checked immediately before the write but is not a cross-region distributed lock. High-contention capacity-limited events should use a database-backed event inventory and serializable allocation.
- Admin authentication is an API key. Replace it with an identity provider, MFA, RBAC, and per-realtor authorization.
- The webhook email adapter is intentionally provider-neutral. Add a signed provider-specific adapter with delivery/bounce telemetry.
- Add token-at-rest encryption only if product requirements later require recovering an existing token; the current hash-only model intentionally makes that impossible and rotates on resend.
