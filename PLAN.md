# 2025 game implementation plan

Status: first draft implemented and validated locally. Initial planning documents were pushed to `origin/main` in commit `46237e3`; working source was pushed in `8ac523e`. The primary agent served as lead with three workers. Public hosting and provider selection remain future work.

## Intended experience

Open the website to a starting menu with Play, Stats, detailed expandable rules, and the playing card display setting. Play begins a timed run with eight cards. Select a card, an operation, then another card; alternatively select both cards first, then the operation. Both operands disappear and one result card appears at a random available position. Win by combining all eight original cards into a single value of exactly 2025, or end the attempt using Give up.

The statistics screen shows wins, best winning time, the average time of the latest 20 successful runs, success rate, give-up count, and time until give up. Confirmed rules and proposed statistics definitions appear below.

## Requirements and decisions

### Confirmed requirements

- A standalone website hosting the game, with a main menu, game screen, and statistics screen.
- Eight distinct playing cards drawn from a deck, with values 1–13.
- Merge exactly two different active cards through either ordered sequence: first operand → operation → second operand, or first operand → second operand → operation. Border colors and labels identify operand order.
- Include five operation buttons: addition, subtraction, multiplication, division, and exponentiation (`^`).
- A win requires all eight original cards to be consumed into one final value of exactly 2025.
- Use exact fractions with integer exponents for the initial version.
- Initial random hands do not need a solvability guarantee. Guaranteed solvable hands are a desired future enhancement.
- Consume both operands and create one result card at a random location on a successful merge.
- Default cards show numbers. Optional playing card mode maps 1 to A, 11 to J, 12 to Q, and 13 to K.
- Include a Give up button and record time elapsed until giving up.
- Track wins, best time, average time of the last 20 wins, success rate, and give-up statistics, with aggregation details proposed below.
- Implement with the primary agent as lead and three workers after updating this plan.
- Use a poker-table visual design with green felt, particles after successful merges, larger display typography and consistent casino-plaque action buttons. Restart and New hand were removed by the latest user instruction; retain Undo and Give up during active play.

### Confirmed rule decisions

The user confirmed these choices after reviewing the initial plan. They replace the earlier provisional defaults.

| Decision | Confirmed choice | Consequence |
| --- | --- | --- |
| Winning condition | Use all eight starting cards, leaving exactly one card equal to 2025 | A successful run uses seven merges; reaching 2025 earlier does not end it |
| Exponentiation in the first version | Include a fifth operation button, `^` | The toolbar offers all five operations from the start |
| Arithmetic domain | Exact fractions with integer exponents | Deterministic equality with 2025; fractional powers are rejected |
| Hand solvability | Random hands without an initial solvability guarantee | A solver or validated hand library is a desired future feature |

No major rule questions remain from the initial planning round. The lead must still choose explicit computation limits for exact arithmetic before implementation. For future guaranteed solvability, add a solver or prevalidated hand pipeline and budget for solution validation and deal diversity; preserve source identities and expression trees now to support that work later.

### Proposed behavior for routine details

These defaults can be adjusted during implementation without changing the core product.

- Draw uniformly without replacement from 52 unique identities (four suits, thirteen ranks). Suits need not be displayed; duplicate numeric values are valid.
- Interpret an ordered operation as `first op second`. Show the pending expression and clearly distinguish selection and selected operation.
- Allow negative and fractional intermediate values. In exact mode use normalized numerator/denominator values with a positive denominator.
- Reject division by zero, zero to a negative exponent, `0^0`, and noninteger exponents in exact mode. Define explicit magnitude and computation limits before implementing exponentiation so huge powers cannot freeze the page.
- Use readable fraction formatting and expand long values through a detail view or accessible label. The underlying value stays exact. Face labels apply to exact rank values, including a merged result with that value.
- Clicking the first selected card again clears the pending selection. A different card selects the second operand; clicking it again deselects it, and another distinct card replaces it. If an operation is already selected, choosing the second card attempts the merge; if both cards are selected, choosing an operation attempts it. Escape clears pending selection.
- An invalid merge leaves the cards intact and retains the operand pair and operation so another operation or second card can be chosen. Show the reason near the toolbar and announce it accessibly.
- Undo restores the last board and expression state, clearing pending selection. Undo remains part of the same timed run. Disable undo after a recorded win or give-up to keep records consistent.
- Provide a visible Give up button during an active run. Confirm before ending the run; canceling keeps the run active and its timer running. Confirming stops the timer, clears pending selection, records a `given_up` outcome with elapsed time, and opens a summary with New hand / Menu actions. Do not claim the hand was unsolvable or automatically reveal a solution.
- Provide Give up and a way back to the menu. Confirming a menu exit from active play records a give-up, including duration. Do not offer Restart or New hand during play. After a win or give-up, Play again starts a fresh deal with a new run ID and timer. Interruptions such as reload remain abandoned outcomes.
- Start the timer once the initial board is ready for interaction, stop on the winning or confirmed give-up transition, and include time spent in a background tab. Use a monotonic clock; selection and animation do not reset the timer. Do not resume an unfinished run after a reload in the first version.
- Record each terminal outcome once using a unique run ID: `won`, `given_up`, or `abandoned`. Preserve outcome, start/end timestamps, and elapsed duration when known; store started-run count separately. New hand or menu exit from an active run records abandonment, not an explicit give-up. A persisted active-run marker allows a reload to classify an interrupted run as abandoned without inventing a precise duration.
- Label the winning-time average as “Last 20 wins”; when fewer than 20 wins exist, average those available and display the sample count. Only wins contribute to winning-time statistics. Show an empty state before the first win.
- Proposed success rate: `wins / (wins + give-ups + other abandoned runs) × 100%`. Exclude the currently active run; show an empty state when no run has ended. Label the denominator as ended attempts and show outcome counts so the definition is clear. An interrupted run counts after its abandonment has been reconciled.
- Show give-up count, average time until give up across all explicit give-ups, and average time of the last 20 explicit give-ups with sample counts. Run history shows each give-up's elapsed time. Exclude other abandonments from give-up-time aggregates, and show an empty state when there are no give-ups.
- Store stats and display preference in the backend PostgreSQL database, with browser caching and explicit save status. The first version has anonymous sessions and no cross-device login. Offer a deliberate reset-stats action with confirmation.
- Place cards randomly inside the usable board, excluding the toolbar and other cards. Try bounded random candidates, then use a known free slot. Keep all cards visible and reachable; on small screens use shuffled grid slots as a constrained random layout. Reposition on resize without changing values.
- Include a clear win screen with elapsed time and Play again / Menu actions. Do not call a deal unwinnable just because no obvious move remains.

## Proposed architecture

Use a TypeScript React/Vite browser application with responsive CSS, plus a Node/Express backend and PostgreSQL database. The user expanded scope during implementation to include a backend database in preparation for online play. Browser storage is now a cache, not the primary record store.

### Backend and database scope

- Persist anonymous players, settings, runs, terminal outcomes, and active-run markers in relational PostgreSQL tables with versioned migrations, foreign keys, unique run IDs, and validation constraints.
- Identify anonymous players using an opaque, HttpOnly same-site session cookie. Keep database credentials server-side. Accounts and cross-device login are future work; anonymous identity is tied to the browser cookie.
- Expose same-origin API endpoints for profile loading, settings, starting/finishing runs, and stats reset. Use parameterized queries, transactions, request validation, bounded payloads, and consistent errors. Isolate records by player identity.
- Hosted deployment uses PostgreSQL through `DATABASE_URL`. Docker/PostgreSQL is not installed on the current machine; support server-side PGlite (embedded PostgreSQL persisted to disk) for local development and integration checks. Both adapters use the same SQL schema. Production requires `DATABASE_URL`.
- Load records from the API before enabling play. Keep arithmetic responsive in the browser, queue backend writes in order, and visibly report failed saves with retry. Do not claim unsynced records are saved to the server.
- The initial API stores client-submitted personal practice results. Competitive online play later requires server-authoritative deals, move validation, timing, and authentication before enabling rankings.
- Add database/API integration checks for player isolation, duplicate finishes, interruption handling, malformed input, transactional reset, and persistence. Document environment variables, migrations, local startup, and hosted PostgreSQL setup.
- Provider choice remains open. Standard PostgreSQL allows a later choice among providers; Supabase is a candidate if managed authentication becomes a priority. No provider account or paid resource is needed for the local implementation.
- The user explicitly requires no paid database services now. Use the free local backend; do not create paid resources. Revisit available free hosting options when deployment is requested.
- Acquire a browser Web Lock for the entire document before replaying saves or reconciling server active runs. A second tab shows an actionable message and retry; this prevents it from abandoning a still-live attempt. Same-document StrictMode and hot reload share the acquisition.

| Area | Responsibility |
| --- | --- |
| `src/game/` | Deck generation, exact values, operation validation, expression trees, merge transitions, win detection |
| `src/features/play/` | Board layout, selectable cards, toolbar, timer presentation, undo, Give up, and run completion |
| `src/features/menu/` | Starting menu and display settings |
| `src/features/stats/` | Aggregated statistics, history presentation, empty state, reset flow |
| `src/storage/` | Browser cache, API client, settings and run record transitions |
| `server/` | HTTP API, anonymous sessions, PostgreSQL adapters, migrations, database validation |
| App shell / shared types | Navigation, run lifecycle, dependency wiring, common styling |

The lead defines shared contracts before workers begin: `CardId`, `SourceCard`, `GameValue`, `Expression`, `ActiveCard`, `Operation`, `GameState`, `MergeResult`, `RunOutcome`, `RunRecord`, and `Settings`. `RunOutcome` distinguishes wins, explicit give-ups, and other abandonments; `RunRecord` carries duration and timestamps. Keep layout coordinates outside arithmetic state. Inject randomness and the clock where needed to make behavior reproducible in checks.

The engine should expose pure operations for creating a hand, validating/applying a merge, and checking a win. The run lifecycle owns timing and persistence; the UI dispatches intent and renders state. Expressions preserve operand order and source identities. All terminal records use a unique run ID so repeated renders or competing finish actions cannot record the same attempt twice.

## Visual design and motion

### Starting-screen and control refresh

The user requested a more playful poker-style font, larger starting-screen typography, removal of the “Eight cards. Five operations. One number to make.” tagline, a larger and more playful Take a seat button, and larger in-game operations. Vertical scrolling is welcome; do not shrink the menu just to fit one viewport.

1. Lead: record this plan, obtain a locally served open-license display font, and own integration/documentation/commits.
2. Menu worker: own `src/features/menu/**`; use Rye for the title and primary action, enlarge the menu's text and spacing, remove the tagline, and style the Play action as a warm gold casino plaque with decorative suits and clear focus/hover states.
3. Controls worker: own `src/features/play/play.css`; enlarge operation symbols and buttons, retain all five in a fluid row, and preserve usable touch targets without horizontal overflow at 320px.
4. Lead: inspect the combined changes and production build, adjust only observed issues, then commit and push the completed refresh. No new behavior or tests are required for this visual update.

Keep the green felt and ivory/gold palette, native button semantics, reduced-motion support, and readable text. Bundle the font and its license so playing does not require a third-party font request.

### Keyboard operations and detailed rules (added during refresh)

- Controls worker additionally owns `src/features/play/**` for keyboard behavior. After choosing the first card, A selects addition, S subtraction, D multiplication, F division, and G exponentiation. Mouse/touch buttons remain available. Show a small, persistent shortcut label under every button and expose `aria-keyshortcuts`/accessible descriptions.
- Ignore repeated keydowns, modified key combinations, editable fields, finished runs, and any open dialog/inert play screen. Operation keys do nothing until a first card is selected; choosing another operation replaces the pending choice. Escape clears selection only during unobstructed play.
- Menu worker adds an expandable Rules & how to play section directly on the starting screen, with clear descriptions of all-eight-card winning, ordered operands, exact fractions and integer powers, keyboard shortcuts, Undo/Restart/New hand/Give up, timing/statistics, and random hands without guaranteed solutions.
- Restyle Your statistics as an attractive secondary casino plaque with a distinct win-count badge. Preserve a clear hierarchy below the larger Take a seat action.
- Lead checks keyboard selection and dialog guards, rules disclosure, button sizing and viewport fit, then commits/pushes the integrated update. Add targeted shortcut checks for the new behavior; a broad repeat of unchanged database tests is unnecessary.

### Additional refresh requirements

- Scale card text to fit its actual width and character count so 2025 is fully visible even at 320px. Keep a selected-card inspector for very long values. Remove the redundant native hover tooltip that showed source values twice (for example 11 and expression 11).
- Apply the same raised, double-inset casino-plaque shape to all action controls; distinguish gold primary actions, champagne statistics, forest secondary/operation controls, and a warmer Give up shade.
- Remove decorative copy such as Make every card count, 2025 club, the menu tagline, and the promotional footer. Retain the target, timer, card count, rules, and keyboard guidance.
- Remove Restart and New hand. Keep Undo; Give up is the only deliberate way to end an active run. Menu exit confirms a give-up; Play again appears after completion.
- Controls worker adds the alternative card → card → operation flow with gold first-card and blue second-card borders, matching accessible order labels, and keyboard support. Invalid operations retain both selections; selecting another second card replaces it. Add focused transition tests covering both orders, operand order, deselection, replacement, and recovery.
- The user explicitly prefers a minimal game interface. Remove visible First/Second legends and flow explanations from play; keep operand order in accessible labels. Put detailed guidance behind an in-game ? disclosure and the starting-screen rules section. This preference is also recorded in `AGENTS.md`.

### Refresh validation and preview limit

- The production build passed after the visual, keyboard, and two-order selection changes. Focused keyboard/selection checks passed **30/30**.
- Browser component checks confirmed local Rye typography, expandable rules, all five shortcuts, keyboard/dialog guards, both merge orders, correct gold/blue borders, and no card hover tooltip. At 320px the complete 2025 fit its card, menu buttons did not overflow, and operation controls remained at least 47px wide/68px tall.
- Detailed rules and the in-game ? panel share one rules component. No visible workflow explanation or First/Second legend remains during normal play.
- The pre-existing local PGlite directory failed to reopen during preview startup. It was preserved without deletion, reset, or repair. Browser checks used temporary component fixtures that do not access player records; full app/database checks are therefore not claimed for this refresh. Database recovery is a separate issue.

- Build an atmospheric poker-table setting: deep forest green felt, subtle CSS texture, a soft central pool of light, dark surrounding rail, and fine warm gold rules. Use CSS for the felt and decoration rather than downloading unnecessary imagery.
- Use large, readable ivory number cards with rounded corners and restrained shadows. Selected cards get a gold border and visible focus treatment. Numeric value stays the only visible card content; playing card mode changes the rank label rather than adding suit illustrations.
- Give the main menu a clear typographic hierarchy: small club-style wordmark, prominent 2025 title, short rules, a primary Play action, and secondary Stats access. Carry the same materials and colors through stats, dialogs, and summaries.
- Keep the timer, target, and cards remaining visible above the board. Place the five operation buttons in a bottom toolbar with the pending expression nearby. Keep Undo, Restart, New hand, and Give up distinct and readable on narrow screens.
- After each successful merge, emit a short burst of small ivory/gold particles around the new card and animate its arrival. Invalid operations do not emit particles. Use a bounded number of particles, remove them after animation, and prevent them from blocking pointer or keyboard input.
- Under `prefers-reduced-motion`, replace travel/burst animations with an immediate or subtle opacity change. Decorative layers are hidden from assistive technology. Maintain contrast and touch targets; the table theme must not impair play.
- At mobile sizes, shrink the rail and use randomized grid slots with enough board space for all cards. Long exact fractions remain readable through truncation plus a full-value accessible/detail view.

## Milestones and agent assignments

### 0. Finalize implementation details — lead

Implementation is authorized. Use the confirmed rules above, finalize numeric limits and statistics labels, and keep acceptance criteria aligned. Guaranteed solvability remains future scope. Exact arithmetic uses BigInt fractions, at most 4096 bits per numerator/denominator, and integer exponents with absolute value at most 1024; reject oversized work before allocating huge values.

Deliverable: agreed rules and a concrete implementation scope.

### 1. Foundation and contracts — lead

Create the project, app shell, responsive layout primitives, shared interfaces, and initial commands/documentation. Define storage schema and merge error semantics with the workers. Establish file ownership using `AGENTS.md`. Prepare representative fixture states so UI work can proceed alongside engine work.

Deliverable: a running shell and stable interfaces that allow parallel work.

### 2. Parallel feature work — three workers

**Worker 1: engine.** Implement unique deck draws, arithmetic normalization and validation, safe exponentiation, expression ancestry, immutable merges, undo state support, and win detection. Supply deterministic examples and targeted engine checks.

**Worker 2: play screen.** Implement card rendering, the ordered selection state machine, all five operation buttons, bounded random placement, responsive reflow, merge particles and animation, keyboard controls, timer display, invalid-operation feedback, Restart/New hand/Give up controls, and terminal presentation. Own play-specific CSS; use shared design tokens. The lead owns confirmation dialogs and lifecycle transitions. Use fixtures until the engine is connected.

**Worker 3: menus and stats.** Implement main menu navigation, playing card setting, validated local storage, once-per-run outcome recording, interrupted-run reconciliation, success rate, winning-time and give-up-time calculations, history/empty states, and reset confirmation. Coordinate run lifecycle events with the lead.

**Lead during parallel work.** Integrate engine and UI incrementally, own navigation and run lifecycle, protect shared contracts, and resolve cross-feature issues. Avoid waiting for every worker to finish before integration.

Deliverable: complete local play-to-win-to-stats and play-to-give-up-to-stats flows.

### 3. Integration and validation — lead, optionally a fourth worker

Run the checks below and resolve defects. Review arithmetic, timer, persistence, and animation interactions together. Review touch input, keyboard focus, reduced motion, card overlap, and long values at desktop and mobile sizes. Confirm UI labels accurately describe the rules and statistics.

Deliverable: a playable website meeting the acceptance criteria, with results and known limitations documented.

### 4. Website delivery — lead

Document local setup and production build, prepare static hosting configuration for the selected host, and check production asset paths. Establish hosting account, domain, and public deployment authorization before publishing. A local build can be delivered while those choices remain open.

Deliverable: source, run instructions, build output workflow, and a public URL if deployment is authorized and configured.

## Acceptance and validation plan

These are the targeted implementation checks for the authorized build.

- A deal has eight distinct source identities, all with values in 1–13; repeated ranks are accepted.
- Each successful merge removes two active cards and adds one new card with a unique ID. Selecting the same card twice cannot merge it with itself.
- Verify ordered subtraction, division, and powers, exact fractional results, negative values, rejected zero divisions, and all agreed exponent limits.
- Confirm source ancestry is preserved without duplication, undo restores the previous board, and rejected merges leave values and card count unchanged.
- Only a single final value of exactly 2025 using all eight source cards wins. A card worth 2025 alongside other cards does not win; a final non-target value does not win.
- Exercise a deterministic winning fixture through seven merges. The hand A♠, 2♠, 3♠, 4♠, 5♠, 6♠, 10♠, K♠ has the solution `((13 − 10) × ((6 + 4) + 5)) ^ ((3 + 1) − 2) = 45² = 2025`. Every source card is used exactly once.
- Verify the exact click order, selection changes, cancellation, toolbar behavior, rapid repeated input, invalid-operation recovery, and absence of duplicate merge commits during animations.
- Check new card bounds and overlap prevention, narrow screens, resizing, long fractions, keyboard operation, screen reader announcements, and reduced motion.
- Verify successful merges produce one bounded particle burst, invalid operations produce none, decorative layers never intercept input, and particles are cleaned up. Reduced motion suppresses burst travel.
- Verify Restart restores the original hand, clears undo/selection, starts a fresh attempt, and records the prior active attempt once as abandoned. Canceling Restart preserves the board and timer. New hand is a separate action; restarting a completed run does not change its outcome.
- Verify timer start/stop, background time, undo continuity, abandonment, and once-only outcome recording.
- Verify Give up cancellation preserves play, confirmation stops timing and records one give-up, repeated clicks do not duplicate it, and undo/merge controls cannot alter a finished run. Exercise competing win/give-up events so one attempt has exactly one terminal outcome.
- Verify success rate for no ended runs, wins only, give-ups only, and mixed wins/give-ups/abandonments. Active runs do not affect it; reload reconciliation does not duplicate an outcome.
- Verify per-run give-up durations and all-time/last-20 give-up averages with 0, 1, 19, 20, and 21 give-ups. Wins and other abandonments do not enter these averages.
- Verify best time and rolling averages with 0, 1, 19, 20, and 21 wins. Ensure abandoned runs do not enter successful-time averages.
- Verify settings survive reload and storage errors or malformed records do not block play. Check record schema migration and reset behavior.
- Run the production build and browser smoke checks of menu → play → win → stats → replay and menu → play → give up → stats. Record which checks passed and any unresolved issues.

## Deferred scope

Online accounts, cross-device login, leaderboards, multiplayer, daily challenges, hints, replay sharing, and additional operation sets are outside the proposed initial scope. Backend database persistence is now included.

Guaranteed solvable deals are a desired future milestone. Evaluate a solver versus a curated or generated library of validated hands, validate each solution using the same exact arithmetic engine, and consider computation cost and hand diversity. Initial random deals must not be described as guaranteed solvable.

## Planning handoff

`AGENTS.md` defines execution boundaries and team coordination. This document defines confirmed product behavior, design direction, implementation sequence, and acceptance criteria. Implementation is authorized; keep this plan updated with integration results and known limitations.

## First-draft implementation results

- Implemented React/TypeScript frontend, exact-fraction game engine, full ordered card interaction, poker-table styling, merge particles, undo, same-hand Restart, New hand, Give up, main menu, display preference, and statistics.
- Implemented Express API with anonymous HttpOnly sessions, normalized PostgreSQL tables, transactional migrations, disk-persisted local PGlite, and an external PostgreSQL adapter for future hosting. No paid resources were created.
- Added API-backed profile loading, ordered write queue with retry and per-tab reload recovery, visible save status, interrupted-attempt reconciliation, and a Web Lock to prevent conflicting tabs.
- Final production build passed, including client and server TypeScript checks. All **70 tests across 7 files** passed, covering arithmetic, storage, statistics, API client, save queue, tab lock, and real HTTP/database integration.
- Browser checks passed: a full eight-card/seven-merge win, exact fractional division, rejected division by zero with unchanged board and retained selection, one 12-particle burst after a valid merge and none after rejection, undo, cancel/confirm Restart restoring the same hand, cancel/confirm Give up, correct mixed-outcome success rate and give-up duration, record/preference reload persistence, and second-tab protection.
- At a 320px viewport, the page had no horizontal overflow; all card bounds remained visible without overlap and all five operation buttons exceeded 44px width. Reduced motion behavior was reviewed in CSS; screen-reader behavior was inspected through accessibility state, not a full manual assistive-technology audit.
- Fixed a fresh-checkout database startup bug by creating missing parent directories, with a disk-persistence regression test.
- Confirmed the single `npm run dev` command starts both services and that records/preferences survive a full backend restart. Browser reload of an active attempt records one abandonment with unknown duration.

### Remaining scope and limits

- No hosted database/provider instance or public deployment has been created or tested. External PostgreSQL uses the tested SQL schema but still needs a real-provider check when selected.
- Accounts, cross-device login, competitive score validation, multiplayer, and guaranteed solvable hands remain future work.
- Personal records use an anonymous browser cookie. Only one app tab can own a session. Unsent API operations survive a same-tab reload when session storage is available; closing the tab can lose unsent operations. Save status makes this visible.
- Local development and all completed work require no paid database service. See `README.md` for startup and `server/README.md` for database configuration.
