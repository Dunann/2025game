# 2025 — The Numbers Table

A browser arithmetic game on a green felt table. Draw eight distinct cards from a standard deck, then combine them into exactly **2025** using addition, subtraction, multiplication, division, and exponentiation.

Expand **Game settings** on the starting screen to choose **2–52 cards** and a **positive integer target**. Apply saves the preference; Standard 2025 restores eight cards and target 2025. Configuration is fixed for each attempt, and winning always requires using every starting card. Targets remain exact strings rather than JavaScript floating-point numbers, up to the existing 4096-bit arithmetic limit.

## Run locally

Use Node.js 22.19+ (Node 24 recommended) and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. This command starts the website and backend together. The API listens on port 3001; Vite proxies browser API requests to it. Both services stop when you stop the command.

Local development requires **no paid service, provider account, Docker, or system PostgreSQL installation**. The backend runs PGlite, an embedded PostgreSQL engine, and persists its database in `.data/postgres/`. That directory, environment secrets, dependencies, and generated build files are ignored by Git. Keep the database directory to preserve local records across server restarts.

Optional configuration is documented in [.env.example](.env.example). Copy it to `.env` only when changing the defaults. If you change the API port, update the proxy target in `vite.config.ts` too.

## Play

1. Choose **Take a seat** from the main menu.
2. Select a card, choose an operation, then select a different card—or select both cards first, then the operation. Gold marks the first operand and blue the second. Selection order determines subtraction, division, and exponentiation.
3. The two operands become a new result card at a random free table position, accompanied by a short particle burst.
4. Use all eight original cards to leave one card equal to 2025. There are seven successful merges in a winning hand.

All cards display just their value. The main menu's **Playing card mode** changes 1, 11, 12, and 13 to A, J, Q, and K, including merged results with those exact values.

- **Undo:** restore the previous board; the timer keeps running.
- **Give up:** confirm to stop the timer and save a give-up result with its duration.
- **Play again:** deal the next hand after a win or give-up. Leaving active play through the menu also asks you to confirm giving up.
- **A / S / D / F / G:** choose add / subtract / multiply / divide / power after selecting the first card or both operands. Keys are displayed under the buttons.
- **Escape:** clear the selected card and operation.

Negative and fractional results are allowed. Fractions are exact, backed by BigInt. Powers require an integer exponent between −1024 and 1024, and numerator/denominator size is limited to 4096 bits to keep calculations responsive. Division by zero, zero to a negative power, and `0^0` are rejected without consuming cards. Inspect a selected card to see its full value and expression. The starting screen includes expandable Rules & how to play.

Hands are random and **not guaranteed solvable**. A validated hand generator or solver is planned for a later version. Merge particles respect reduced-motion preferences, and every game control is keyboard accessible.

## Records and persistence

The server stores anonymous players, session-token hashes, settings, and runs in relational tables. An HttpOnly cookie identifies your player; keep the cookie to return to your records. Accounts and cross-device login are not included yet.

The statistics screen includes:

Standard 2025 and Variations are separate sections. Every variation is grouped by its exact card count and target; times, success rates, and history are never mixed across different games. Legacy records belong to standard 2025. Reset all statistics clears every group while keeping preferences.

- Wins, best winning time, and average of the latest 20 wins, with the available sample count.
- Success rate: wins divided by all ended attempts (wins + explicit give-ups + other abandonments). Active attempts are excluded.
- Give-up count, average time until giving up, and average of the latest 20 give-ups.
- Recent attempt history. Giving up or confirming a menu exit records a give-up; interrupted runs are reconciled on the next load as abandoned with an unknown duration. Older records can also contain abandonments from the earlier Restart/New hand controls.

The timer includes time in background tabs. Browser storage caches records; an ordered save queue retries failed API writes without recording an outcome twice. Save status is visible. Keep the tab open until records are saved; unsent writes survive a reload of the same tab when session storage is available, but are not guaranteed to survive closing the tab. Stats reset requires confirmation and keeps the display preference.

One browser tab at a time owns the anonymous player session, preventing a second tab from abandoning a live attempt. Close the other game tab and retry if the session is already open.

## Commands and validation

```sh
npm test
npm run build
```

The build checks client and server TypeScript and produces the website in `dist/`. Tests cover exact arithmetic, complete winning hands, deck identity, storage validation, statistics windows, API requests, ordered retry behavior, and real database/HTTP integration with PGlite.

Separate development commands are `npm run dev:web` and `npm run dev:api`. Frontend changes reload automatically; restart after backend changes. Stop `npm run dev` with Ctrl+C and wait for shutdown to finish: the runner closes the API database before stopping the frontend. Avoid forced process termination while the database is open. `npm run preview` serves the built frontend through Vite; it still needs the API running separately. `npm start` runs the backend without watch mode.

## Future online deployment

The database provider remains undecided and no paid resources have been created. For hosted deployment, supply a PostgreSQL `DATABASE_URL`, set `NODE_ENV=production`, build the frontend, and run `npm start`. The production server serves both the API and `dist/`; use HTTPS and configure the listener and trusted proxy for your host. Production fails fast without a PostgreSQL connection instead of using the development database.

Versioned SQL migrations run transactionally at backend startup. The local and hosted database adapters use the same schema and parameterized queries. Hosted PostgreSQL has not been exercised against a real provider yet. See [server/README.md](server/README.md) for environment variables and API details.

Migration 002 adds configuration to settings and runs while preserving existing records with standard-game defaults. Run-start and finish retries must match the same configuration.

Personal practice results are client-reported. Before adding competitive leaderboards or multiplayer, add authenticated accounts and server-authoritative move, outcome, and timing validation.

## Project coordination

[PLAN.md](PLAN.md) records rules, design direction, milestones, and acceptance criteria. [AGENTS.md](AGENTS.md) assigns the lead and three workers to separate files. The lead owns integration and shared interfaces; workers own the engine/backend, play UI, and menus/records respectively.
