# Free Render + Neon deployment

Use one Render Free web service and one Neon Free PostgreSQL project. No paid
resources, payment details, custom domain purchases, or upgrades are authorized.
Stop if a provider requires payment information.

## How it works

The browser loads React from Render and calls `/api` on the same HTTPS address.
Render runs Express, which connects to Neon using a private `DATABASE_URL`.
Records live in Neon, independent of Render's temporary disk. Never commit the
URL, expose it through a `VITE_*` variable, or print it in chat/logs.

## 1. Create the database

Sign in to Neon, confirm **Free**, and create a project for this game. Select a
region near the Render service (the Blueprint uses Ohio). Use the default
database and role; no additional products or paid compute are needed.

Through Connect, obtain the **direct** PostgreSQL connection URL. Keep TLS
enabled and use `sslmode=verify-full` for explicit certificate/hostname
verification. A direct endpoint supports the existing small connection pool and
startup migrations. Store the URL only in the provider's secret settings.

The empty database is expected. The first backend startup applies
`server/migrations/001_initial.sql` and `002_game_config.sql` in a transaction.
These create players, anonymous sessions, settings, runs, and migration version
records. Subsequent startups skip applied migrations. Local statistics are not
automatically uploaded.

## 2. Deploy the application

Sign in to Render, select its free workspace option, and authorize access to
`Dunann/2025game`. Create a Blueprint using `render.yaml`. Inspect its resource
list: it must contain only **one Free web service**. Supply the Neon URL as the
secret `DATABASE_URL` when prompted. Do not create a Render database or disk.

Manual web-service creation uses equivalent settings:

| Setting | Value |
| --- | --- |
| Branch / runtime / plan | `main` / Node / **Free** |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| `NODE_VERSION` | `24.13.0` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `TRUST_PROXY` | `1` |
| `DATABASE_URL` | Secret direct Neon URL with TLS |

Let Render supply `PORT`. Keep the default TCP health check. Polling
`/api/health` regularly would query Neon and prevent autosuspend, consuming free
compute. Use that endpoint manually for diagnostics, without keep-awake pings.
Render provides HTTPS and the public `onrender.com` address.

Production rejects a missing `DATABASE_URL`, preventing accidental use of local
PGlite on Render's temporary disk. Keep SQL migration files and runtime `tsx`
available. `npm ci --include=dev` includes the TypeScript/Vite build tools.

## 3. Verify

1. Confirm a successful deploy and no credentials in logs.
2. Open the public HTTPS URL. `/api/health` should return
   `{"ok":true,"database":"postgres"}`.
3. Change settings, start a run, give up, and check saved statistics.
4. Reload and redeploy/restart Render; records must remain available.
5. Check that another browser profile gets separate records.
6. Verify the cookie is HttpOnly, Secure, and SameSite=Lax.
7. Confirm both dashboards still show free plans and no payment method.

## Deployment verified October 27, 2026

- Public game: **https://game-2025.onrender.com/**
- Render service: `game-2025`, Free, service ID `srv-dbggq06i0phs73cb8k10`.
- Render Blueprint: `exs-dbggph29lscs73f4g4m0`; application commit `3140df8`.
- Neon project: `2025-game`, Free, ID `red-unit-07942147`, AWS Ohio.
- Database/branch: `game2025` / `production` (`br-quiet-lab-b59ktmsr`).
- Compute is 0.25 CU; the Free plan enforces five-minute autosuspend. Render
  uses the default TCP check, so health polling does not wake PostgreSQL.
- Backend startup completed migrations and reported `postgres`. Live API checks
  passed for database health, settings, start/give-up, duplicate-finish safety,
  separate players and cross-origin rejection. Cookie attributes were checked
  as Secure, HttpOnly and SameSite=Lax.
- Redeployment `dep-dbgh6bgm7kps73dd7afg` became live; the same isolated test
  player's configuration, preference and run survived the application restart.
- Browser verification opened the public main menu and confirmed saved status.
- No payment details, paid plan, disk, Render database or custom domain were added.

Only identifiers and URLs above are public configuration; the database password
exists in Render's private environment settings. Initial setup attempts failed
while transferring the URL; the endpoint and refreshed credential were corrected
and verified before the successful deployment. Local statistics remain local.

## Limits and maintenance

Render Free sleeps when idle, so the first visit can be slow. Neon Free has
finite compute, storage, and transfer allowances. Limits can pause service;
free hosting does not guarantee uninterrupted availability. Do not upgrade or
add a payment method without the owner's approval. Start with the free subdomain.

Per-IP API/session limits reduce automated database growth. They apply to one
running process and reset on restart, rather than providing distributed abuse
protection. Practice results are
client-reported and are unsuitable for competitive rankings. Anonymous identity
depends on a browser cookie; clearing it loses access to those records. Accounts
remain future work. Keep dependencies updated and arrange periodic private
PostgreSQL exports before treating saved records as valuable. Never commit them.

## Official references

- [Render Blueprint configuration](https://render.com/docs/blueprint-spec)
- [Render Free limits](https://render.com/docs/free)
- [Neon with Render](https://neon.com/docs/guides/render)
- [Neon plans](https://neon.com/docs/introduction/plans)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
