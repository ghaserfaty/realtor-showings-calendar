# Showing Workspace

A multi-tenant Next.js application where realtors sign in with Google, connect
their Calendar, and generate private invitation links for leads to choose one or
more group property showings.

PostgreSQL is the registration source of truth. Google Calendar is each
realtor's operational view.

## Product flow

```text
Realtor opens the public site
  └─ Continue with Google
      ├─ Google verifies identity
      ├─ Realtor grants Calendar event access
      └─ backend creates or resolves the Realtor tenant
          ├─ encrypts the Google refresh token
          ├─ creates an HttpOnly application session
          └─ redirects to /admin
              ├─ choose a writable Calendar
              ├─ create private lead links
              └─ review or revoke invitations

Lead opens /invite/:token
  └─ sees only sanitized upcoming showings
      └─ selects showing times
          ├─ registration is stored in PostgreSQL
          └─ managed fields are synchronized to Google Calendar
```

The OAuth Client ID and Client Secret belong to the platform. Realtors never
create a Google Cloud project and never submit OAuth client credentials to the
application.

## Architecture

The project uses Node.js 22, strict TypeScript, Next.js App Router, PostgreSQL,
Prisma, Zod, Google Calendar, Vitest, Docker, ESLint, and Prettier.

- `app/api/auth` owns Google sign-in, callback, and logout.
- `app/api/admin` contains session-authenticated realtor operations.
- `services` owns domain rules, OAuth, tenant resolution, and synchronization.
- `repositories` owns Prisma access patterns.
- `services/calendar` contains Google and mock Calendar providers.
- `components/admin` contains the realtor dashboard.
- `components/invite` contains the lead registration experience.

Raw Google events, refresh tokens, private descriptions, organizer data, and
private extended properties are never serialized to leads.

## Data model

- `Realtor` is the tenant and is linked to Google's stable OpenID `sub`.
- `RealtorSession` stores only a hash of the random browser session token.
- `GoogleOAuthAttempt` stores a ten-minute, single-use state plus encrypted PKCE
  material while authorization is in progress.
- `GoogleCalendarConnection` stores an encrypted refresh token and selected
  Calendar ID. The platform Client ID and Secret stay in environment variables.
- `Invitation` belongs to one realtor and stores only the hash of its private
  URL token.
- `Registration` records one invitation/event selection.
- `AuditLog` records security and domain actions with HMAC-pseudonymized IPs.

There is intentionally no `Showing` table. Google Calendar is authoritative for
showing time and availability.

## Local setup

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

Generate application secrets with:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

The first command can be used for `PLATFORM_ADMIN_API_KEY` and
`SESSION_SECRET`. The Base64 value is used for
`CREDENTIAL_ENCRYPTION_KEY`.

## Google Cloud setup

1. Create or select the Google Cloud project owned by the platform.
2. Enable Google Calendar API.
3. Configure the OAuth consent screen.
4. Create one OAuth client of type **Web application**.
5. Add this local authorized redirect URI:

```text
http://localhost:3000/api/auth/google/callback
```

6. Add these values to `.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

7. Restart `npm run dev` and open:

```text
http://localhost:3000
```

The flow requests OpenID identity (`openid`, `email`, `profile`), read/write
event access (`calendar.events`), and read-only Calendar list access
(`calendar.calendarlist.readonly`). The latter is used only to let the realtor
choose a writable Calendar in the dashboard.

Google OAuth uses `state`, OpenID `nonce`, PKCE S256, an exact callback URI, and
offline access. The callback verifies the ID token and consumes the OAuth
attempt before creating the application session.

The migration to platform-owned OAuth intentionally removes legacy Calendar
connections created with realtor-owned OAuth clients. Refresh tokens are bound
to their issuing client, so each realtor must authorize once through the new
Google sign-in flow.

## Environment variables

| Variable                          | Required           | Purpose                                                              |
| --------------------------------- | ------------------ | -------------------------------------------------------------------- |
| `DATABASE_URL`                    | Yes                | PostgreSQL URL. Use a pooled runtime URL in serverless environments. |
| `APP_URL`                         | Yes                | Canonical origin used for redirects, invitations, and origin checks. |
| `GOOGLE_OAUTH_CLIENT_ID`          | Yes                | Platform-owned Google OAuth Web client ID.                           |
| `GOOGLE_OAUTH_CLIENT_SECRET`      | Yes                | Platform-owned OAuth secret; backend only.                           |
| `CREDENTIAL_ENCRYPTION_KEY`       | Yes                | Exactly 32 random bytes encoded as Base64.                           |
| `SESSION_SECRET`                  | Yes                | HMAC key for audit pseudonymization.                                 |
| `PLATFORM_ADMIN_API_KEY`          | Optional for UI    | Protects platform provisioning APIs.                                 |
| `EMAIL_PROVIDER`                  | For email delivery | `console` in development or `webhook` in production.                 |
| `EMAIL_WEBHOOK_URL`               | For webhook        | Accepts `{to, subject, text}` JSON.                                  |
| `EMAIL_WEBHOOK_API_KEY`           | Optional           | Bearer credential for the email webhook.                             |
| `SHOWING_FILTER_MODE`             | No                 | `dedicated_calendar` by default.                                     |
| `SHOWING_OPEN_TITLE_PREFIX`       | No                 | Default `[ABIERTA]`.                                                 |
| `SHOWING_CLOSED_TITLE_PREFIX`     | No                 | Default `[CERRADA]`.                                                 |
| `ALLOW_REGISTRATION_CANCELLATION` | No                 | Allows cancellation before the event starts.                         |

Changing `CREDENTIAL_ENCRYPTION_KEY` makes previously encrypted Google
connections unreadable. Rotate it only through an explicit re-encryption
procedure.

## Realtor sessions and API authentication

Normal browser usage is authenticated by a random `HttpOnly`, `SameSite=Lax`
cookie. Only a SHA-256 hash is stored in PostgreSQL. Sessions expire after 30
days and logout deletes the database session.

Tenant API keys remain available for trusted automations. They are not part of
the normal dashboard flow. The platform provisioning endpoint can create one:

```bash
curl -X POST http://localhost:3000/api/platform/realtors \
  -H 'content-type: application/json' \
  -H 'x-platform-admin-api-key: your-platform-key' \
  -d '{
    "email":"realtor@example.com",
    "displayName":"Example Realty",
    "calendarProvider":"MOCK"
  }'
```

## Creating invitations

The realtor creates invitations visually at `/admin`. The plain invitation URL
is shown once because the database stores only its hash.

The authenticated API remains available:

```bash
curl -X POST http://localhost:3000/api/admin/invitations \
  -H 'content-type: application/json' \
  -H 'x-realtor-api-key: rlt_...' \
  -d '{
    "invitedEmail":"client@example.com",
    "invitedName":"Jane Client",
    "expiresAt":"2026-08-15T23:59:59Z",
    "sendEmail":false
  }'
```

## Managing showings in Google Calendar

Use a dedicated Calendar for each realtor. Select it in the dashboard and
create events using normal Google Calendar fields:

- **Title:** `[ABIERTA] Palermo – 2 ambientes`
- **Location:** `Güemes 4120, Palermo`
- **Date/time:** a future start and end; all-day events are excluded
- **Description:** optional public block plus private notes

```text
PUBLIC_SHOWING
Listing: https://example.com/listings/palermo-101
Notes: Meet in the lobby five minutes early.
Capacity: 20
END_PUBLIC_SHOWING

Internal realtor notes stay outside this block.
```

Only `Listing`, `Notes`, and `Capacity` inside the markers are exposed. Change
`[ABIERTA]` to `[CERRADA]` to close registration.

## Calendar changes while a lead is deciding

The lead page refreshes every 60 seconds and on browser focus. Submission always
re-fetches the selected event from that realtor's Calendar and verifies status,
time, title, public details, and capacity. A selection version detects changes
and returns `409 SHOWING_CHANGED` instead of accepting stale state.

PostgreSQL remains authoritative if Calendar synchronization fails. Failed
synchronization is tenant-scoped for retry.

## Security boundaries

- OAuth identity is matched by Google's stable `sub`, not by display name.
- OAuth attempts are single-use and expire after ten minutes.
- Refresh tokens and Calendar IDs use AES-256-GCM with tenant-bound context.
- Realtor APIs derive tenant identity from a session or hashed API key.
- Mutation routes enforce origin checks and SameSite session cookies.
- Invitation URLs are bearer credentials and are stored only as hashes.
- Calendar lookups, counts, retries, and admin reads are scoped by `realtorId`.
- Admin, auth, invite, and invitation API responses are private and not cached.

## Deploying to Vercel

1. Import the Git repository.
2. Provision managed PostgreSQL with connection pooling.
3. Add all production environment variables.
4. Register the production callback:

```text
https://your-domain.example/api/auth/google/callback
```

5. Run `npm run db:migrate` from a trusted release environment.
6. Submit the Google OAuth app for verification before public production use.

The built-in rate limiter is process-local. Replace it with Redis or a gateway
limiter when running multiple serverless instances. Use a durable queue for
stronger Calendar retry guarantees.

## Quality commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run db:reset` destroys and recreates the configured database and is only
for local development.
