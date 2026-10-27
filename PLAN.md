# 2025 game implementation plan

Status: planning only. No application has been implemented. The repository initially contained only Git metadata.

## Intended experience

Open the website to a starting menu with Play, Stats, and access to the playing card display setting. Play begins a timed run with eight cards. Select a card, choose one of five operations at the bottom of the screen, then select a second card. Both operands disappear and one result card appears at a random available position. Win by combining all eight original cards into a single value of exactly 2025, or end the attempt using Give up.

The statistics screen shows wins, best winning time, the average time of the latest 20 successful runs, success rate, give-up count, and time until give up. Confirmed rules and proposed statistics definitions appear below.

## Requirements and decisions

### Confirmed requirements

- A standalone website hosting the game, with a main menu, game screen, and statistics screen.
- Eight distinct playing cards drawn from a deck, with values 1–13.
- Merge exactly two different active cards through ordered clicks: first operand, operation, second operand.
- Include five operation buttons: addition, subtraction, multiplication, division, and exponentiation (`^`).
- A win requires all eight original cards to be consumed into one final value of exactly 2025.
- Use exact fractions with integer exponents for the initial version.
- Initial random hands do not need a solvability guarantee. Guaranteed solvable hands are a desired future enhancement.
- Consume both operands and create one result card at a random location on a successful merge.
- Default cards show numbers. Optional playing card mode maps 1 to A, 11 to J, 12 to Q, and 13 to K.
- Include a Give up button and record time elapsed until giving up.
- Track wins, best time, average time of the last 20 wins, success rate, and give-up statistics, with aggregation details proposed below.
- Prepare for implementation by a lead and 2–4 workers, and stop after planning in this session.

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
- Clicking the selected card again clears selection. Before choosing an operation, another card changes the first operand. After choosing an operation, another card attempts the merge. Escape clears the pending selection, and another operation button changes the pending operation.
- An invalid merge leaves the cards intact and retains the first card and operation so another second card can be chosen. Show the reason near the toolbar and announce it accessibly.
- Undo restores the last board and expression state, clearing pending selection. Undo remains part of the same timed run. Disable undo after a recorded win or give-up to keep records consistent.
- Provide a visible Give up button during an active run. Confirm before ending the run; canceling keeps the run active and its timer running. Confirming stops the timer, clears pending selection, records a `given_up` outcome with elapsed time, and opens a summary with New hand / Menu actions. Do not claim the hand was unsolvable or automatically reveal a solution.
- Provide New hand and a way back to the menu. Restarting or leaving an unfinished run abandons that run. Confirm abandoning a run after play has started; browser unload confirmation is optional and should not be required for correctness.
- Start the timer once the initial board is ready for interaction, stop on the winning or confirmed give-up transition, and include time spent in a background tab. Use a monotonic clock; selection and animation do not reset the timer. Do not resume an unfinished run after a reload in the first version.
- Record each terminal outcome once using a unique run ID: `won`, `given_up`, or `abandoned`. Preserve outcome, start/end timestamps, and elapsed duration when known; store started-run count separately. New hand or menu exit from an active run records abandonment, not an explicit give-up. A persisted active-run marker allows a reload to classify an interrupted run as abandoned without inventing a precise duration.
- Label the winning-time average as “Last 20 wins”; when fewer than 20 wins exist, average those available and display the sample count. Only wins contribute to winning-time statistics. Show an empty state before the first win.
- Proposed success rate: `wins / (wins + give-ups + other abandoned runs) × 100%`. Exclude the currently active run; show an empty state when no run has ended. Label the denominator as ended attempts and show outcome counts so the definition is clear. An interrupted run counts after its abandonment has been reconciled.
- Show give-up count, average time until give up across all explicit give-ups, and average time of the last 20 explicit give-ups with sample counts. Run history shows each give-up's elapsed time. Exclude other abandonments from give-up-time aggregates, and show an empty state when there are no give-ups.
- Store stats and the display preference locally in the browser. The first version has no login or cross-device synchronization. Offer a deliberate reset-stats action with confirmation.
- Place cards randomly inside the usable board, excluding the toolbar and other cards. Try bounded random candidates, then use a known free slot. Keep all cards visible and reachable; on small screens use shuffled grid slots as a constrained random layout. Reposition on resize without changing values.
- Include a clear win screen with elapsed time and Play again / Menu actions. Do not call a deal unwinnable just because no obvious move remains.

## Proposed architecture

Use a small TypeScript browser application, provisionally React with Vite, with CSS for responsive layout. Confirm the current tooling versions when implementation begins. A static build and browser storage cover the initial scope; a backend is unnecessary for the proposed features.

| Area | Responsibility |
| --- | --- |
| `src/game/` | Deck generation, exact values, operation validation, expression trees, merge transitions, win detection |
| `src/features/play/` | Board layout, selectable cards, toolbar, timer presentation, undo, Give up, and run completion |
| `src/features/menu/` | Starting menu and display settings |
| `src/features/stats/` | Aggregated statistics, history presentation, empty state, reset flow |
| `src/storage/` | Versioned settings and run records, validation and migration |
| App shell / shared types | Navigation, run lifecycle, dependency wiring, common styling |

The lead defines shared contracts before workers begin: `CardId`, `SourceCard`, `GameValue`, `Expression`, `ActiveCard`, `Operation`, `GameState`, `MergeResult`, `RunOutcome`, `RunRecord`, and `Settings`. `RunOutcome` distinguishes wins, explicit give-ups, and other abandonments; `RunRecord` carries duration and timestamps. Keep layout coordinates outside arithmetic state. Inject randomness and the clock where needed to make behavior reproducible in checks.

The engine should expose pure operations for creating a hand, validating/applying a merge, and checking a win. The run lifecycle owns timing and persistence; the UI dispatches intent and renders state. Expressions preserve operand order and source identities. All terminal records use a unique run ID so repeated renders or competing finish actions cannot record the same attempt twice.

## Milestones and agent assignments

### 0. Finalize implementation details and await authorization — lead

Use the confirmed rules above, finalize numeric limits and statistics labels, and keep acceptance criteria aligned. Guaranteed solvability remains future scope. Wait for the user's next instruction to begin implementation; this planning session ends before scaffolding.

Deliverable: agreed rules and a concrete implementation scope.

### 1. Foundation and contracts — lead

Create the project, app shell, responsive layout primitives, shared interfaces, and initial commands/documentation. Define storage schema and merge error semantics with the workers. Establish file ownership using `AGENTS.md`. Prepare representative fixture states so UI work can proceed alongside engine work.

Deliverable: a running shell and stable interfaces that allow parallel work.

### 2. Parallel feature work — three workers

**Worker 1: engine.** Implement unique deck draws, arithmetic normalization and validation, safe exponentiation, expression ancestry, immutable merges, undo state support, and win detection. Supply deterministic examples and targeted engine checks.

**Worker 2: play screen.** Implement card rendering, the ordered selection state machine, all five operation buttons, bounded random placement, responsive reflow, merge animation, keyboard controls, timer display, invalid-operation feedback, Give up confirmation and summary, and win presentation. Use fixtures until the engine is connected.

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

These are future implementation checks, not work to perform during this planning session.

- A deal has eight distinct source identities, all with values in 1–13; repeated ranks are accepted.
- Each successful merge removes two active cards and adds one new card with a unique ID. Selecting the same card twice cannot merge it with itself.
- Verify ordered subtraction, division, and powers, exact fractional results, negative values, rejected zero divisions, and all agreed exponent limits.
- Confirm source ancestry is preserved without duplication, undo restores the previous board, and rejected merges leave values and card count unchanged.
- Only a single final value of exactly 2025 using all eight source cards wins. A card worth 2025 alongside other cards does not win; a final non-target value does not win.
- Exercise a deterministic winning fixture through seven merges. The hand A♠, 2♠, 3♠, 4♠, 5♠, 6♠, 10♠, K♠ has the solution `((13 − 10) × ((6 + 4) + 5)) ^ ((3 + 1) − 2) = 45² = 2025`. Every source card is used exactly once.
- Verify the exact click order, selection changes, cancellation, toolbar behavior, rapid repeated input, invalid-operation recovery, and absence of duplicate merge commits during animations.
- Check new card bounds and overlap prevention, narrow screens, resizing, long fractions, keyboard operation, screen reader announcements, and reduced motion.
- Verify timer start/stop, background time, undo continuity, abandonment, and once-only outcome recording.
- Verify Give up cancellation preserves play, confirmation stops timing and records one give-up, repeated clicks do not duplicate it, and undo/merge controls cannot alter a finished run. Exercise competing win/give-up events so one attempt has exactly one terminal outcome.
- Verify success rate for no ended runs, wins only, give-ups only, and mixed wins/give-ups/abandonments. Active runs do not affect it; reload reconciliation does not duplicate an outcome.
- Verify per-run give-up durations and all-time/last-20 give-up averages with 0, 1, 19, 20, and 21 give-ups. Wins and other abandonments do not enter these averages.
- Verify best time and rolling averages with 0, 1, 19, 20, and 21 wins. Ensure abandoned runs do not enter successful-time averages.
- Verify settings survive reload and storage errors or malformed records do not block play. Check record schema migration and reset behavior.
- Run the production build and browser smoke checks of menu → play → win → stats → replay and menu → play → give up → stats. Record which checks passed and any unresolved issues.

## Deferred scope

Online accounts, cloud saves, leaderboards, multiplayer, daily challenges, hints, replay sharing, and additional operation sets are outside the proposed initial scope.

Guaranteed solvable deals are a desired future milestone. Evaluate a solver versus a curated or generated library of validated hands, validate each solution using the same exact arithmetic engine, and consider computation cost and hand diversity. Initial random deals must not be described as guaranteed solvable.

## Planning handoff

`AGENTS.md` defines execution boundaries and team coordination. This document defines product behavior, open decisions, implementation sequence, and acceptance criteria. Stop after these documents are ready; wait for the next implementation instruction.
