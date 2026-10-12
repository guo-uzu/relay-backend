# Relay backend

Relay's API provides Better Auth authentication and organization-scoped Google Sheets endpoints. It uses PostgreSQL for application data and Redis for cached sheet headers and BullMQ jobs.

## Requirements

- [Node.js](https://nodejs.org/) 22 or later. The development script runs TypeScript directly with Node's native TypeScript support.
- [pnpm](https://pnpm.io/installation) 11.21 or later. Corepack is a convenient way to install the version requested by this project:

  ```bash
  corepack enable
  corepack prepare pnpm@11.21.0 --activate
  ```

- PostgreSQL 18 (or a compatible PostgreSQL server)
- Redis 6 or later
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Compose is optional, but is the simplest way to run PostgreSQL and Redis locally.
- A Google Cloud service account is required only for the Google Sheets endpoints.

## Install

```bash
git clone <repository-url>
cd relay-backend
pnpm install --frozen-lockfile
```

Use `pnpm install` instead if you intentionally need pnpm to update the lockfile.

## Configure `.env`

Create `.env` in the repository root. It is ignored by Git; never commit this file or the Google credential JSON.

```env
# Authentication
BETTER_AUTH_SECRET=replace-with-a-random-32-byte-secret
BETTER_AUTH_URL=http://localhost:3000

# PostgreSQL: used by the API and Drizzle
POSTGRES_DB=relay
POSTGRES_USER=relay
POSTGRES_PASS=change-this-local-password
DATABASE_URL=postgresql://relay:change-this-local-password@localhost:5432/relay

# Redis: used by BullMQ
REDIS_PASS=change-this-local-redis-password
REDIS_URL=redis://:change-this-local-redis-password@localhost:6379

# Optional: only used by GET /api/v1/google-sheets/:id/get-data
GOOGLE_SPREADSHEET_ID=your-google-spreadsheet-id

# Optional
RUN_WORKER=false
LOG_LEVEL=info
```

Do not leave the sample passwords in any shared or deployed environment. If a PostgreSQL password includes URL-reserved characters such as `@`, `:`, `/`, or `#`, percent-encode it in `DATABASE_URL`.

### Where each value comes from

| Variable | Required | How to obtain or choose it |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Yes | Generate it locally with `openssl rand -base64 32`. Use a stable, private value for each environment so existing sessions remain valid. |
| `BETTER_AUTH_URL` | Yes | The public URL of this API. Use `http://localhost:3000` locally; use the deployed API URL in production. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASS` | When using `docker-compose.yml` | Choose local database name, user, and password. Docker Compose uses these to create PostgreSQL on first start. A hosted provider instead gives you its connection details. |
| `DATABASE_URL` | Yes | PostgreSQL connection URL constructed from the values above, or copied from your managed PostgreSQL provider. It is used by the API and Drizzle. |
| `REDIS_PASS` | When using `docker-compose.yml` | Choose a local Redis password. The Compose service enables Redis authentication with it. A hosted Redis provider supplies this as part of its connection URL. |
| `REDIS_URL` | Yes for BullMQ | Redis connection URL. With the local Compose service, it is `redis://:<REDIS_PASS>@localhost:6379`. |
| `GOOGLE_SPREADSHEET_ID` | Only for the legacy `get-data` endpoint | Copy the ID between `/d/` and `/edit` in the Google Sheets URL. Other sheet endpoints receive the ID in the request body. |
| `RUN_WORKER` | No | Set to `true` to run the BullMQ worker in the API process; leave `false` when only testing the HTTP API. |
| `LOG_LEVEL` | No | A [Pino log level](https://getpino.io/#/docs/api?id=logger-level), such as `debug`, `info`, `warn`, or `error`. Defaults to `info`. |

## Start local services

With the `.env` file in place, start PostgreSQL and Redis:

```bash
docker compose up -d
docker compose ps
```

The services are exposed on `localhost:5432` and `localhost:6379`. To see service logs, run `docker compose logs -f postgres redis`. Use `docker compose down` to stop them; it preserves the named Redis volume. The PostgreSQL data path is configured in `docker-compose.yml`, so do not delete its data volume or directory unless you intend to discard local database data.

You may use external PostgreSQL and Redis services instead. Set `DATABASE_URL` and `REDIS_URL` to their provider-issued URLs and do not start the Compose services.

## Create the database schema

The application needs the Better Auth tables, organization tables, and sheet tables defined in `src/db/schema.ts` and `src/db/app.schema.ts`.

For a **new, empty local database**, generate and apply a Drizzle baseline migration:

```bash
pnpm db:generate
pnpm db:migrate
```

This creates a `drizzle/` migration directory locally from the current schema and applies it using `DATABASE_URL`. Do not also apply the legacy SQL files below to that same fresh database, because the generated baseline contains the current auth schema.

The `better-auth_migrations/` directory is retained for databases that were originally created with Better Auth's CLI. If you are upgrading one of those databases, apply its files in chronological order after taking a backup:

```bash
psql "$DATABASE_URL" -f better-auth_migrations/2026-09-17T19-15-36.148Z.sql
psql "$DATABASE_URL" -f better-auth_migrations/2026-09-23T23-10-02.056Z.sql
psql "$DATABASE_URL" -f better-auth_migrations/2026-09-25T20-14-15.000Z.sql
```

Those legacy files do not create the application-specific sheet tables. Generate a reviewed Drizzle migration for `src/db/app.schema.ts` before enabling Google Sheets endpoints on an existing database. Do not run `pnpm db:generate` blindly against a database that already has Better Auth tables: first establish the migration baseline with the maintainer responsible for that database.

## Configure Google Sheets access

Skip this section if you only need authentication or organization endpoints.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Enable the Google Sheets API and Google Drive API for that project.
3. Create a service account and create a JSON key from **IAM & Admin → Service Accounts**.
4. Save the downloaded key as `relay-test-credentials.json` in the project root. This exact filename is currently required by `src/lib/sheets.ts` and is ignored by Git.
5. Open the JSON file, copy its `client_email`, and share every target spreadsheet with that email. Give it at least Viewer access; use Editor only if future write operations require it.

The server requests the `spreadsheets` and read-only Drive scopes. Drive access is used to check a spreadsheet's modification time for the Redis cache.

## Run the API

```bash
pnpm dev
```

This starts `node --env-file=.env --watch src/server.ts` on <http://localhost:3000> and reloads when source files change. Set `RUN_WORKER=true` before starting it if this local process should also consume scheduled sheet-polling jobs.

To type-check without generating JavaScript:

```bash
pnpm exec tsc
```

### Verify authentication

Better Auth is mounted at `/api/v1/auth/{*any}`. For example, after the API and database are running:

```bash
curl -X POST http://localhost:3000/api/v1/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Alex","email":"alex@example.com","password":"supersecret123"}'
```

Refer to the [Better Auth documentation](https://www.better-auth.com/docs) for its route and request format details.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the API with `.env` and watch mode. |
| `pnpm db:generate` | Generate Drizzle migration files from the current schema. |
| `pnpm db:migrate` | Apply generated Drizzle migrations using `DATABASE_URL`. |
| `pnpm exec tsc` | Type-check the project without emitting files. |

## Current Redis note

`REDIS_URL` is correctly used by BullMQ. The Redis cache client in `src/lib/redis.ts`, however, currently calls `createClient()` without reading `REDIS_URL`. Because the included Compose configuration requires `REDIS_PASS`, Google Sheets cache operations will not authenticate to that Redis container until that client is configured with the same URL/password. Authentication routes can still be developed independently; this limitation affects the Google Sheets cache and related functionality.
