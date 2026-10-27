# Instructions for agents

## Current authorization

Implementation is authorized. The initial planning documents were pushed in commit `46237e3`, followed by the first draft and subsequent UI/configuration changes. Public deployment is now authorized on **Render Free + Neon Free**. Never add payment details, paid resources or upgrades. Optional exponentiation implementation is now explicitly authorized.

Read `PLAN.md` before starting work. Treat its proposed defaults as provisional where decisions remain open. User answers override those defaults; update the plan when answers arrive.

## Current change: optional exponentiation

The user authorized implementing exponentiation as an opt-in Game settings
checkbox, **off by default**. Follow the worker ownership below and the sequence
in `PLAN.md`. This supersedes the earlier five-operation default.

| Agent | Implementation ownership when execution begins |
| --- | --- |
| Lead (`/root`) | `src/types.ts`, `src/config.ts`, `src/App.tsx`, shared normalization contracts, integration, docs, deployment and Git |
| Engine (`/root/engine`) | `src/game/**`, exact-rule enforcement and engine checks |
| UI (`/root/play`) | `src/features/menu/**`, `src/features/play/**`, `src/features/rules/**`, UI/keyboard checks |
| Records/backend (`/root/operations_refresh`) | `server/**`, migration 003, `src/storage/**`, `src/features/stats/**`, persistence and grouping checks |

Reuse these agents for their existing areas. Establish the required boolean
`exponentiationEnabled` and separate new-settings versus legacy-run normalization
before independent implementation. Only the lead edits shared contracts. Treat
missing flags on historical runs/outbox commands as enabled; new settings default
off. Include the flag in immutable run snapshots and statistics identity. Never
relabel old runs by applying the new default retroactively.

Prefer delegation for bounded, independent work. Keep worker output concise,
avoid duplicate file ownership, and collect targeted checks before integrating.

## Current product

Build a browser game with a starting menu, a play screen, and a statistics screen. The standard game uses eight distinct cards and target 2025. Main-menu settings allow 2–52 cards from the standard deck and a positive integer target within the 4096-bit exact-arithmetic bound. Card values are 1–13; repeated ranks are allowed when the physical cards differ.

Support both interaction orders: first card → operation → second card, and first card → second card → operation. Show the first card with a gold border and the second with a blue border; selection order defines subtraction, division, and exponentiation. A/S/D/F select add/subtract/multiply/divide; power and G are available only if Allow exponentiation was enabled before the run. Replace the operands with one result card at a random valid position.

Display numeric values by default. A playing card mode displays exact values 1, 11, 12, and 13 as A, J, Q, and K. All other values retain their numeric representation.

Winning requires consuming every starting card into one exact value equal to the run's configured target. Snapshot configuration at run start; standard and variation statistics must be isolated by card count, canonical target and exponentiation flag. Default to four operations; the opt-in checkbox adds exponentiation. Use exact fractions with integer exponents. Initial hands need not be guaranteed solvable; guaranteed solvable deals are a desired future feature.

Include a Give up button that ends the run and records its elapsed time. Statistics include wins, best winning time, average time of the last 20 wins, success rate, and time until give up. Follow `PLAN.md` for proposed outcome and aggregation definitions; distinguish explicit give-ups from other abandoned runs.

## Team for a future implementation

Use a lead agent and three workers for this implementation. The primary agent acts as the lead, leaving all three worker slots available. Worker file ownership below applies in the shared checkout; do not commit or change shared files without coordinating with the lead.

| Role | Responsibility | Suggested ownership after scaffolding |
| --- | --- | --- |
| Lead | Settle rules, scaffold, define shared contracts, integrate, resolve conflicts, prepare deployment | App shell, shared types, dependency files, global styles, documentation |
| Worker 1: game engine | Deck generation, arithmetic, merge transitions, expression provenance, win detection | `src/game/**` and corresponding engine tests |
| Worker 2: play experience | Cards, ordered selection, operation toolbar, placement, animation, keyboard support | `src/features/play/**` and corresponding interaction tests |
| Worker 3: menus and records | Main menu, statistics screen, settings, persistence, run records | `src/features/menu/**`, `src/features/stats/**`, `src/storage/**` and corresponding tests |
| Optional Worker 4: quality | Cross-feature checks, accessibility, responsive layout, deployment review | Dedicated end-to-end tests and review findings, with fixes coordinated by the lead |

Paths are proposals until the lead creates the application. With two workers, combine the play and menu work into one UI assignment and let the lead own integration checks.

### Coordination rules

1. The lead records resolved rules, shared types, file ownership, and acceptance criteria before dispatching dependent tasks.
2. Scaffold and establish contracts first; then run independent worker tasks in parallel. Workers may use agreed fixtures until dependencies are integrated.
3. Only the lead changes package manifests, lockfiles, shared contracts, routing, or global styles unless explicitly delegated. Assign each shared file to one active editor.
4. Each assignment includes its inputs, owned files, dependencies, expected output, and validation criteria. Do not expand scope without coordinating with the lead.
5. Workers report completed changes, checks performed, assumptions, and unresolved issues. Request contract changes before editing another worker's files.
6. Preserve others' edits. Do not reset the repository, overwrite unrelated work, or use destructive cleanup to resolve conflicts.
7. The lead integrates early at each milestone, resolves cross-feature issues, and keeps `PLAN.md` current. Review work before calling a milestone complete.
8. Do not send messages to outside people or publish the site unless authorized by the user. A request for a game with a website permits building the website; public deployment details still need to be established.

## Implementation principles once authorized

- Keep arithmetic and game transitions independent of UI rendering. Prefer explicit state transitions to UI side effects.
- Give every source and result card a stable unique identifier. Track original card identities and expression ancestry so every merge consumes disjoint inputs exactly once.
- Centralize arithmetic validity, result formatting, and win detection. Never infer numeric values from displayed face labels.
- Validate a merge before consuming cards. Rejected operations preserve the board and provide a clear explanation.
- Keep game state authoritative; animations reflect committed transitions and cannot trigger a second merge.
- Use the green felt table, ivory cards, warm gold accents, and merge-particle direction in `PLAN.md`. Honor reduced motion and keep decorative particles noninteractive.
- The latest user instruction removes Restart and New hand. Give up is the only deliberate way to end an active attempt; confirming a menu exit records a give-up too. Undo remains available; after a win/give-up offer Play again for the next deal. Interrupted runs still count as abandoned.
- All action buttons use the same casino-plaque treatment with different color shades. Cards scale their visible number to fit, including the complete 2025 target, and have no native hover tooltip; full expressions remain available in the selected-card inspector.
- Separate game values from screen coordinates. Reflow cards when the viewport changes without altering the hand or expression.
- Use semantic buttons, visible focus, accessible names, adequate touch targets, keyboard operation, and reduced motion support.
- Persist validated records and settings in the backend PostgreSQL database; browser storage is a cache. Record each terminal run outcome once, distinguishing wins, give-ups, and other abandonments. Handle unavailable browser cache and report backend save failures with retry.
- The user added backend/database scope during implementation. The lead may reassign an available worker to `server/**` and another to the API client while preserving exclusive file ownership. Server-side PGlite is allowed for local development; production uses PostgreSQL via `DATABASE_URL`.
- No paid resources or provider subscriptions are authorized. Keep local development free. Commit and push meaningful working checkpoints; push the completed first draft, as requested by the user.
- Avoid adding accounts, leaderboards, a solver, or monetization unless the agreed scope requires them.
- Keep secrets out of client code. Document build commands and any hosting configuration.
- Keep the game interface concise. Do not add slogans, visible operand-order labels, workflow diagrams, or repeated instructions to ordinary play. Put detailed explanations behind the starting-screen rules disclosure or the in-game ? button. Retain accessible labels and essential feedback; small keyboard hints are explicitly requested.

## Validation and handoff

Implementation and its targeted validation are authorized. Use the acceptance checks in `PLAN.md`; report actual results and any browser verification limits.

For an implementation handoff, report what changed, how it was checked, remaining issues, and how to run it. Distinguish a locally working site from a publicly deployed site. Never claim a hand is solvable without a validated solution or a complete solver result.
