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
          └─ redirects to /realtor/dashboard
              ├─ choose a writable Calendar
              ├─ create private lead links
              ├─ copy a ready-to-send invitation message
              ├─ preview the showings leads can see
              └─ review or revoke invitations

Platform operator opens /admin
  └─ enters PLATFORM_ADMIN_API_KEY
      ├─ receives an 8-hour signed HttpOnly admin session
      ├─ selects a realtor tenant
      └─ can permanently delete an invitation and its registrations

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
- `RateLimitBucket` stores shared, expiring request counters using HMAC-hashed
  keys, so all Vercel instances enforce the same limits without storing raw IPs.

There is intentionally no `Showing` table. Google Calendar is authoritative for
showing time, availability, and capacity. Registration transactions use
temporary PostgreSQL advisory locks per invitation and Calendar event to prevent
concurrent overbooking; the locks are not rows and are released at commit or
rollback.

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

| Variable                          | Required | Purpose                                                              |
| --------------------------------- | -------- | -------------------------------------------------------------------- |
| `DATABASE_URL`                    | Yes      | PostgreSQL URL. Use a pooled runtime URL in serverless environments. |
| `APP_URL`                         | Yes      | Canonical origin used for redirects, invitations, and origin checks. |
| `GOOGLE_OAUTH_CLIENT_ID`          | Yes      | Platform-owned Google OAuth Web client ID.                           |
| `GOOGLE_OAUTH_CLIENT_SECRET`      | Yes      | Platform-owned OAuth secret; backend only.                           |
| `CREDENTIAL_ENCRYPTION_KEY`       | Yes      | Exactly 32 random bytes encoded as Base64.                           |
| `SESSION_SECRET`                  | Yes      | HMAC key for audit pseudonymization.                                 |
| `PLATFORM_ADMIN_API_KEY`          | Yes      | Protects platform APIs and signs temporary admin sessions.           |
| `SHOWING_FILTER_MODE`             | No       | `dedicated_calendar` by default.                                     |
| `SHOWING_OPEN_TITLE_PREFIX`       | No       | Default `[ABIERTA]`.                                                 |
| `SHOWING_CLOSED_TITLE_PREFIX`     | No       | Default `[CERRADA]`.                                                 |
| `ALLOW_REGISTRATION_CANCELLATION` | No       | Allows cancellation before the event starts.                         |

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

The realtor creates invitations visually at `/realtor/dashboard`. The plain invitation URL
is shown once because the database stores only its hash. The result includes
buttons to copy either the URL or this complete message with the real URL
inserted:

```text
Hi there! You can check the available showings times for the week on the following link: <link>
```

The authenticated API remains available:

```bash
curl -X POST http://localhost:3000/api/admin/invitations \
  -H 'content-type: application/json' \
  -H 'x-realtor-api-key: rlt_...' \
  -d '{
    "invitedEmail":"client@example.com",
    "invitedName":"Jane Client",
    "expiresAt":"2026-08-15T23:59:59Z"
  }'
```

`invitedEmail`, `invitedName`, and `invitedPhone` are optional. The application
only generates the private link; it does not send invitation emails. A lead can
also register without providing an email address.

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

The realtor can also open or close these events from
`/realtor/dashboard`. The action updates the real Google Calendar event title,
switching between `[ABIERTA]` and `[CERRADA]`, and uses the event ETag to reject
a stale update if the event changed concurrently in Google Calendar. Closed
showings remain in the dashboard so they can be reopened, but are excluded from
lead invitation pages.

## Calendar changes while a lead is deciding

The lead page refreshes every 60 seconds and on browser focus. Submission always
re-fetches the selected event from that realtor's Calendar and verifies status,
time, title, public details, and capacity. A selection version detects changes
and returns `409 SHOWING_CHANGED` instead of accepting stale state.

PostgreSQL remains authoritative if Calendar synchronization fails. Failed
synchronization is tenant-scoped for retry.

## Admin portal

Open `/admin` and enter `PLATFORM_ADMIN_API_KEY`. The key is exchanged for a
signed, `HttpOnly`, `SameSite=Strict` cookie that expires after eight hours; it
is not stored in browser JavaScript or in the database.

The portal lists every realtor tenant, Calendar connection status, active
sessions, invitation count, and registration count. Select a tenant and load
its invitations to permanently delete one. Permanent deletion is intentionally
different from realtor revocation: it transactionally deletes that
invitation's registrations and invitation, records an audit entry, and then
removes the deleted registrations from affected Google Calendar event blocks.
It cannot be undone, so normal realtor operations should continue to use
**Revoke**.

## Follow Up Boss integration planning

Possible multi-tenant CRM integrations, recommended sequencing, security
boundaries, and endpoint mappings are documented in
[`docs/FOLLOW_UP_BOSS_INTEGRATIONS.md`](docs/FOLLOW_UP_BOSS_INTEGRATIONS.md).

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

### Initial deployment

1. Import the Git repository into Vercel.
2. Provision Neon Postgres from Vercel Storage and connect it to the Production
   environment.
3. Use the Neon **pooled** connection string for the Vercel `DATABASE_URL`.
4. Add the remaining production environment variables in Vercel:

```text
APP_URL
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
CREDENTIAL_ENCRYPTION_KEY
SESSION_SECRET
PLATFORM_ADMIN_API_KEY
```

`APP_URL` must be the stable production origin without a trailing slash, for
example `https://realtor-showings.example.com`. Do not import the local `.env`
wholesale: its `DATABASE_URL` and `APP_URL` point to local services.

Secrets should be marked Sensitive in Vercel. Sensitive values cannot be
downloaded again in plain text, so retain their source values in an approved
secret manager. Never paste database URLs, OAuth secrets, or encryption keys
into issues, chats, screenshots, or logs. Rotate a credential immediately if it
is exposed.

5. In the platform Google OAuth Web client, retain the local callback and add
   the exact production settings:

```text
Authorized JavaScript origin:
https://realtor-showings.example.com

Authorized redirect URI:
https://realtor-showings.example.com/api/auth/google/callback
```

The scheme, host, path, casing, and trailing slash must match exactly. If the
OAuth consent screen is in Testing mode, add each allowed account as a test
user.

6. Apply the production migrations using the runbook below.
7. Redeploy after adding or changing Vercel environment variables.
8. Submit the Google OAuth app for verification before public production use.

Vercel environment changes require a new deployment. A database migration or a
change saved only in Google Cloud does not require a Vercel redeploy.

### Production database connections

Use different Neon connection modes for different workloads:

- **Pooled URL:** Vercel `DATABASE_URL` used by the running serverless app. Its
  hostname normally contains `-pooler`.
- **Direct URL:** Prisma migrations, destructive maintenance, and pgAdmin. Get
  it from Neon **Connect** with **Pooled connection** disabled.

Keep a temporary, ignored `.env.production.local` for trusted local operations:

```env
DATABASE_URL=postgresql://role:password@direct-host.neon.tech/neondb?sslmode=require&channel_binding=require
```

The repository ignores `.env*.local`. Do not commit this file. If the Vercel
variables are Sensitive, obtain a fresh direct connection string from Neon
instead of attempting to download it from Vercel.

Before every production database command, clear any exported local override and
print only the target hostname and database:

```bash
unset DATABASE_URL

node --env-file=.env.production.local -e '
const url = new URL(process.env.DATABASE_URL);
console.log({ host: url.hostname, database: url.pathname.slice(1) });
if (url.hostname === "localhost" || url.hostname.includes("-pooler")) {
  console.error("Expected a direct production Neon connection");
  process.exit(1);
}
'
```

The hostname must be the direct production Neon endpoint, never `localhost`.

### Applying production migrations

Do not run plain `npm run db:migrate` for production from a local checkout: the
Prisma config loads `.env`, which normally points to local PostgreSQL. Inject the
production file into the Prisma process explicitly:

```bash
node --env-file=.env.production.local \
  ./node_modules/prisma/build/index.js \
  migrate deploy
```

The output must identify the Neon host before applying migrations. The current
history starts with the single `20260803010000_baseline` migration, which
represents the complete schema as of August 3, 2026. A new database creates the
`_prisma_migrations` table and records that baseline. Future schema changes must
be added as new migrations; `migrate deploy` preserves existing application
data.

After a successful migration, remove the temporary secrets file when it is no
longer needed:

```bash
rm .env.production.local
```

### Resetting the production database

> **Danger:** a production reset permanently removes every realtor, session,
> encrypted Google connection, invitation, registration, and audit record.
> Realtors must sign in and authorize Google again. Never use this as a normal
> deployment or migration step.

Before a reset, create a restorable Neon branch or backup and verify the direct
production target using the check above. With Prisma 6, reset without inserting
development seed data using:

```bash
node --env-file=.env.production.local \
  ./node_modules/prisma/build/index.js \
  migrate reset --force --skip-seed
```

This drops the schema and reapplies the baseline plus any later migrations. It
does not require a Vercel redeploy. The `npm run db:reset` script remains for
local development only.

### Connecting pgAdmin to Neon

Prefer a separate least-privileged database role for routine production
inspection. Register a pgAdmin server using the direct Neon connection:

```text
Name: Neon Production
Host: direct Neon hostname without -pooler
Port: 5432
Maintenance database: neondb
Username: Neon role name
Password: Neon role password
SSL mode: require
Channel binding: require (when available)
```

Avoid saving an owner password unless the workstation credential store is
approved. Use Prisma rather than pgAdmin to apply migration files so migration
history remains consistent.

### Rotating database credentials

If a Neon URL is exposed:

1. Reset the affected role password in Neon immediately.
2. Generate a new pooled URL for Vercel and a direct URL for trusted operations.
3. Update or resync the Vercel `DATABASE_URL` through the Neon integration.
4. Redeploy so new serverless instances receive the rotated credential.
5. Delete temporary local production environment files.

Do not rotate `CREDENTIAL_ENCRYPTION_KEY` as a normal secret rotation. Existing
Google refresh tokens and Calendar IDs cannot be decrypted with a new key; that
key requires a dedicated re-encryption procedure.

### Production authentication troubleshooting

The health endpoint verifies database connectivity:

```bash
curl https://realtor-showings.example.com/api/health
```

Google sign-in starts with an expected `307` redirect. Inspect its `Location`
header:

```bash
curl -I https://realtor-showings.example.com/api/auth/google/start
```

- A redirect to `https://accounts.google.com/...` means OAuth startup worked.
- A redirect to `/?auth=unavailable` means startup failed before reaching
  Google. Inspect Vercel Function logs.
- `GoogleOAuthAttempt does not exist` means production migrations were not
  applied to the database used by the deployment.
- `redirect_uri_mismatch` means `APP_URL` and the exact Google authorized
  redirect URI differ.

Official references:

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Neon connection strings](https://neon.com/docs/connect/query-with-psql-editor)
- [Prisma production migrations](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)
- [Prisma migrate reset](https://docs.prisma.io/docs/cli/migrate/reset)
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [pgAdmin server connection dialog](https://www.pgadmin.org/docs/pgadmin4/latest/server_dialog.html)

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
for local development. Follow the explicit production runbook above for any
production database maintenance.
