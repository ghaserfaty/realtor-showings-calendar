# Multi-tenant Property Showings

A production-oriented Next.js application where independent realtors issue private invitation links and invite prospects to select one or more group property showings from that realtor's Google Calendar.

The private invitation URL is the invitee's bearer credential. There is no public listing page and no email-confirmation or OTP flow. PostgreSQL is the registration source of truth; Google Calendar is the realtor's operational view.

## Architecture

The project uses Node.js 22, strict TypeScript, Next.js App Router, PostgreSQL, Prisma, Zod, Google Calendar, Vitest, Docker, ESLint, and Prettier.

```text
Invitee browser
  └─ private invitation token
      └─ Next.js API
          ├─ resolves Invitation → Realtor tenant
          ├─ decrypts only that realtor's Calendar connection
          ├─ filters and sanitizes that calendar's showings
          └─ stores registrations in PostgreSQL

Realtor API client
  └─ tenant-specific API key
      └─ invitations and Calendar connection for that realtor only

Platform operator
  └─ platform API key
      └─ provisions realtor tenants
```

Important boundaries:

- `app/api` contains HTTP Route Handlers.
- `services` owns domain rules, tenant resolution, and external synchronization.
- `repositories` owns Prisma access patterns.
- `services/calendar` contains the Google and mock providers.
- `components/invite/InviteExperience.tsx` is the only client-side application component.
- Raw Google events, credentials, descriptions, organizer data, and private properties are never serialized to invitees.

## Data model

- `Realtor` is the tenant. It stores tenant identity, a SHA-256 hash of its administrative API key, and its selected Calendar provider.
- `GoogleCalendarConnection` is a one-to-one secret record. Client ID, client secret, refresh token, and calendar ID are independently encrypted with AES-256-GCM and tenant-bound authenticated context.
- `Invitation` belongs to exactly one realtor and stores only the hash of its private URL token.
- `Registration` records one invitation/event selection. `UNIQUE(invitationId, calendarEventId)` makes repeated submissions idempotent.
- `AuditLog` records security and domain actions with HMAC-hashed IP addresses.

There is intentionally no `Showing` table. Google Calendar is authoritative for showing time and availability. Tenant-aware database queries ensure that equal Calendar event IDs in different realtor accounts cannot mix capacity counts or synchronization state.

## Local setup

```bash
cp .env.example .env
# Replace PLATFORM_ADMIN_API_KEY, SESSION_SECRET, and CREDENTIAL_ENCRYPTION_KEY.
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Generate the encryption key with:

```bash
openssl rand -base64 32
```

The development seed creates one mock-calendar realtor, prints that realtor's API key once, and prints valid and expired invitation URLs.

Quality commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run db:reset` destroys and recreates the configured database and is intended only for local development.

## Environment variables

| Variable                          | Required           | Purpose                                                                                  |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | Yes                | PostgreSQL connection URL. Use a pooled URL for serverless runtime traffic.              |
| `APP_URL`                         | Yes                | Canonical HTTPS origin used in invitation links and origin checks.                       |
| `PLATFORM_ADMIN_API_KEY`          | Yes                | Platform-only credential used to provision realtor tenants.                              |
| `SESSION_SECRET`                  | Yes                | HMAC key for audit IP pseudonymization.                                                  |
| `CREDENTIAL_ENCRYPTION_KEY`       | Yes                | Exactly 32 random bytes encoded as Base64. Never expose it to the browser.               |
| `EMAIL_PROVIDER`                  | For email delivery | `console` in development or `webhook` in production. Used only to send invitation links. |
| `EMAIL_WEBHOOK_URL`               | For webhook        | Endpoint accepting `{to, subject, text}` JSON.                                           |
| `EMAIL_WEBHOOK_API_KEY`           | Optional           | Bearer credential sent to the email webhook.                                             |
| `SHOWING_FILTER_MODE`             | No                 | `dedicated_calendar` (default), `extended_property`, or `title_prefix`.                  |
| `SHOWING_OPEN_TITLE_PREFIX`       | No                 | Open showing title prefix. Default `[ABIERTA]`.                                          |
| `SHOWING_CLOSED_TITLE_PREFIX`     | No                 | Closed showing title prefix. Default `[CERRADA]`.                                        |
| `SHOWING_PUBLIC_BLOCK_START`      | No                 | Public-description opening marker.                                                       |
| `SHOWING_PUBLIC_BLOCK_END`        | No                 | Public-description closing marker.                                                       |
| `ALLOW_REGISTRATION_CANCELLATION` | No                 | Allows cancellation before the showing starts.                                           |

Production configuration rejects placeholder platform, HMAC, and encryption secrets. Changing `CREDENTIAL_ENCRYPTION_KEY` without first re-encrypting stored connections makes existing Google credentials unreadable; back up and rotate it with an explicit key-rotation procedure.

## Provisioning a realtor tenant

Tenant creation is a platform operation. The returned realtor API key is shown only once; the database stores only its SHA-256 hash.

```bash
curl -X POST http://localhost:3000/api/platform/realtors \
  -H 'content-type: application/json' \
  -H 'x-platform-admin-api-key: your-platform-key' \
  -d '{
    "email":"realtor@example.com",
    "displayName":"Example Realty",
    "calendarProvider":"GOOGLE"
  }'
```

Store the returned `apiKey` in the realtor application's secret store. Every realtor administration request uses:

```text
x-realtor-api-key: rlt_...
```

The platform key cannot be used as a realtor key and a realtor key cannot access another tenant's records.

## Connecting a realtor's Google Calendar

Open the visual setup page:

```text
http://localhost:3000/admin/connect-calendar
```

Before starting:

1. Enable Google Calendar API in the realtor's Google Cloud project.
2. Create an OAuth client of type **Web application**.
3. Add the exact callback shown by the setup page to **Authorized redirect URIs**. Locally it is:

```text
http://localhost:3000/api/admin/google-oauth/callback
```

4. Enter the realtor API key, OAuth Client ID, OAuth Client Secret, and dedicated Calendar ID.
5. Continue to Google, choose the account, and grant Calendar event access.

The backend creates a random ten-minute, single-use OAuth `state`, stores only its hash, and temporarily encrypts the setup credentials. Google returns an authorization code to the backend callback; the backend validates and consumes `state`, exchanges the code for offline tokens, verifies access to the configured calendar, encrypts the refresh token, and redirects to a clean success/error URL without OAuth query parameters.

The plaintext refresh token is never returned to the browser. The pending encrypted OAuth record is deleted when the callback is consumed.

The direct authenticated endpoint remains available for automation or recovery:

```bash
curl -X PUT http://localhost:3000/api/admin/calendar-connection \
  -H 'content-type: application/json' \
  -H 'x-realtor-api-key: rlt_...' \
  -d '{
    "provider":"GOOGLE",
    "clientId":"...",
    "clientSecret":"...",
    "refreshToken":"...",
    "calendarId":"..."
  }'
```

For that direct endpoint, plaintext values exist only during the request and are encrypted before database persistence. API responses and logs never return them. `GET /api/admin/calendar-connection` returns only provider/configuration status.

For local mock events, set the tenant connection to:

```json
{ "provider": "MOCK" }
```

## Creating invitations

All admin endpoints are scoped to the realtor authenticated by `x-realtor-api-key`. Clients cannot supply an arbitrary `realtorId`.

```bash
curl -X POST http://localhost:3000/api/admin/invitations \
  -H 'content-type: application/json' \
  -H 'x-realtor-api-key: rlt_...' \
  -d '{
    "invitedEmail":"client@example.com",
    "invitedName":"Jane Client",
    "expiresAt":"2026-08-01T23:59:59Z",
    "sendEmail":false
  }'
```

The response returns the plain invitation token and URL once. Other tenant-scoped endpoints:

- `GET /api/admin/invitations/:id`
- `POST /api/admin/invitations/:id/revoke`
- `POST /api/admin/invitations/:id/resend`
- `POST /api/admin/calendar-sync/retry`

## Managing showings in Google Calendar

Use a dedicated calendar for each realtor. In the default `dedicated_calendar` mode, create events with normal Calendar UI fields:

- **Title:** `[ABIERTA] Palermo – 2 ambientes`
- **Location:** `Güemes 4120, Palermo`
- **Date/time:** a future start and end time; all-day events are excluded
- **Description:** optional public block plus any private notes

```text
PUBLIC_SHOWING
Listing: https://example.com/listings/palermo-101
Notes: Meet in the lobby five minutes early.
Capacity: 20
END_PUBLIC_SHOWING

Internal realtor notes stay outside this block.
```

Google Calendar rich-text HTML and plain-text descriptions are both supported. Only `Listing`, `Notes`, and `Capacity` inside the markers are parsed. `Listing` must be HTTPS. Omit `Capacity` for unlimited group registration.

Change `[ABIERTA]` to `[CERRADA]` to close registration. Cancelled, past, all-day, unprefixed, closed, and full events are excluded server-side.

## Calendar changes while an invitee is deciding

The page refreshes every 60 seconds and on browser focus. Submission always re-fetches the selected event from that invitation's realtor calendar and verifies its status, time, title prefix, public details, and capacity. A SHA-256 selection version detects changes and returns `409 SHOWING_CHANGED` instead of accepting stale state.

After registration, the application writes a managed attendee block into the Google event while preserving realtor-authored text. PostgreSQL remains authoritative if Calendar synchronization fails, and failed synchronization is tenant-scoped for retry.

## Security model

- The invitation URL is a bearer credential. Anyone who obtains it can use it until expiration, revocation, or its configured selection limit.
- Invitation and realtor API keys are stored only as hashes.
- Google credentials use authenticated encryption with a random nonce and tenant/field-specific additional authenticated data.
- Realtor endpoints derive tenant identity from the API key; request bodies cannot choose another tenant.
- Calendar lookup, capacity counts, managed descriptions, failed-sync retries, and admin invitation reads are scoped by `realtorId`.
- Mutation routes enforce origin checks, Zod validation, size limits, rate limits, and generic error responses.
- Production infrastructure should redact `/invite/*` and `/api/invitations/*` paths from access logs.

The current realtor authentication surface is an API key, suitable for an internal API/MVP. A full SaaS should add interactive identity, MFA, RBAC, API-key rotation, and account recovery.

## Deploying to Vercel

The application deploys as a standard Next.js project without `vercel.json` or a custom build command.

1. Import the Git repository into Vercel.
2. Provision managed PostgreSQL with connection pooling; local Docker cannot be used by Vercel Functions.
3. Add the production environment variables above.
4. Run `npm run db:migrate` from a trusted release environment before serving traffic. Use a direct database URL for migrations when the provider supplies separate direct and pooled URLs.
5. Provision tenants through the platform endpoint and configure each tenant's Calendar connection.
6. Configure the email webhook only if the app must send invitation links.

For production, register this exact redirect URI in every realtor-provided OAuth Web client:

```text
https://your-production-domain.example/api/admin/google-oauth/callback
```

The included IP limiter is process-local and not globally consistent across multiple serverless instances. Use Redis or a gateway-level rate limiter for production abuse protection. Calendar retry is request-driven; a durable queue is recommended for stronger delivery guarantees.

## Tests

Vitest covers invitation token validation, invitation expiration/revocation/limits, encrypted tenant credential isolation, OAuth authorization parameters, Google credential validation, showing filtering and sanitization, rich-text Calendar descriptions, stale-selection detection, group registration idempotency, cancellation ownership, Calendar sync failures, and deterministic managed-description replacement.
