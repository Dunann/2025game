# Database and API

Run the TypeScript server with `npx tsx server/index.ts`. It listens on `127.0.0.1:3001` by default. The frontend development server should proxy `/api` to this address while preserving the incoming host, or explicitly list the frontend origin in `ALLOWED_ORIGINS`.

Environment variables:

| Name | Behavior |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; required when `NODE_ENV=production` |
| `PGLITE_DATA_DIR` | Persistent embedded PostgreSQL directory for development; defaults to `./.data/postgres` |
| `HOST`, `PORT` | Listener address and port; defaults to `127.0.0.1`, `3001` |
| `NODE_ENV` | Production enables Secure cookies, serves `dist/`, and requires external PostgreSQL |
| `ALLOWED_ORIGINS` | Optional comma-separated exact website origins for writes, for example `http://localhost:5173,http://127.0.0.1:5173`; the request's own origin is always permitted |
| `TRUST_PROXY` | Set to `1` only behind one trusted reverse proxy; lets Express use its forwarded protocol for origin checks |

Deploy with HTTPS, a persistent PostgreSQL instance, a production frontend build in `dist/`, and the source/migration files needed by the TypeScript server. Set `HOST=0.0.0.0` where required by the hosting platform. Configure PostgreSQL TLS through the provider's connection string. SQL migration files are versioned under `server/migrations`; startup applies outstanding versions inside a transaction with a PostgreSQL advisory lock. Development PGlite executes the same SQL and serializes complete transactions on its single connection.

`createDatabase({ connectionString?, dataDir? })` creates and migrates an adapter with `kind`, `query`, `transaction`, and `close`. For tests use `dataDir: 'memory://'`. `createApp(database, options?)` creates an Express app without opening a listener.

The API uses anonymous, year-long HttpOnly SameSite=Lax cookies. Only SHA-256 token hashes enter the sessions table. Cookie loss creates a new player; account recovery and cross-device login are outside this version. Settings and every run are scoped to the resolved player, never to a player ID supplied in a request.

All `/api` responses disable caching. Mutation requests require an allowed `Origin`; POST and PUT additionally require `application/json`. JSON bodies are bounded to 16 KiB. Unknown API routes return JSON 404 responses rather than the frontend. The API records validated client-reported outcomes and durations; it does not verify a solution or provide competitive anti-cheat guarantees.

Run `npm test -- server/app.test.ts` for HTTP integration tests against real embedded PostgreSQL, including persistent disk reopening. Run `npx tsc -p server/tsconfig.json` for the server type check. External PostgreSQL uses the same migration and queries, but requires a configured database to exercise independently.
