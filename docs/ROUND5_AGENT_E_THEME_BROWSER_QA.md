# DeckVerse — Round 5 Agent E real-browser / isolated SQL acceptance

**Branch:** `agent/e-round5-theme-browser-qa`  
**Base (exact):** `integration/deckverse-theme-online-api-20261021` @ `bdb6aa078cc117f30ed3696812e3a391ff1f3d01`  
**Scope:** Only new `tests/round5-theme-browser*.{js,mjs}` and this document. No production changes.

## Evidence classes, not interchangeable

| Lane | What actually runs | What it does **NOT** prove |
|---|---|---|
| A — 8-theme real API browser | Independent Chrome contexts -> unmodified `api/game.js` -> PostgreSQL 16 in **ephemeral local Docker** with 004/005/006/**007**; role `deckverse_app` and authenticated server state | Not Agent C's real themed frontend UI; not a real internet or production deployment |
| B — base-site geometry | Real Chromium loads the checked-in homepage at 320/390/768/1366; actual horizontal scroll/cropped card-control bounds recorded; baseline screenshots | Current base is **Pokémon-centric**. Frontend eight-theme selection, themed cards, dynamic stat buttons and theme-aware joined-room UI are **PENDING AGENT C**; no automatic green on these items |
| C — synthetic voice | Fake Chromium camera/microphone tracks with explicit cleanup; existing six-case `livekit-mobile-lifecycle.mjs` mock-SDK suite | Not actual LiveKit Cloud, real permission prompts or peer-to-peer media |
| D — physical devices | **NOT EXECUTED**: Safari iPhone and Android Chrome must be tested later | Chromium viewport sizes are not device proof |

### Standalone execution

`npm test` discovers `tests/round5-theme-browser.test.js`. Outside CI it skips unless `ROUND5_QA_RUN=YES`. In CI it starts its *own* named `postgres:16` Docker container bound to **127.0.0.1:5432 only**, creates a one-day self-signed local TLS cert, invokes the existing guarded 004-006 fixture, applies 007 to that fictional DB, and runs `round5-theme-browser-e2e.mjs`. Finally, it removes the Docker container and throwaway certificates. It does not read or connect to live Supabase credentials. Never reuse or substitute a remote database URL. Requires Linux runner with Docker, OpenSSL, Chrome, Node 22 and `npm ci`.

The test runner must not be used against a developer's active port 5432. In CI it owns the isolated container and no shared database. A nonloopback inherited database URL causes an immediate **fail closed**. CI-only role credentials are hard-coded fictional and disposable.

### Required 24 actual API/DB browser scenarios

For each of **Pokémon, Avengers, Ben 10, Shin-chan, DC, Naruto, Cricket, Elemental Realms** × **2/3/4 seats**:

1. Create remote room with a server allowlisted immutable theme; invalid `__proto__` rejected; new room retains its theme ID.
2. 1/2/3 independent Chromium guest browsers join with their own session tokens; mismatching theme joins rejected; duplicate ready is idempotent.
3. Exactly 50/60/80 cards dealt as 25/20/20 to each seat; a second start is rejected.
4. Each authenticated snapshot contains only the viewer's upcoming card, no opponent top card IDs, no player deck order, no unhashed session token, no DB `state` object or `token_hash`.
5. A nonchooser cannot select; chooser completes a server-authoritative turn with correct theme categories and card conservation; stale duplicate select rejected.
6. Browser offline/online transition plus persisted seat/deck snapshots; for the 3P Pokémon representative, force an 8-minute stale host in **fictional CI timestamps** and confirm host transfer, pause enforcement, unchanged card decks, and returning host.
7. Seed terminal state **in CI only**, solicit the 2/3/4 original players' unanimous rematch votes, verify duplicate votes cannot restart early, new `matchNumber=2`, fresh hand totals, same theme ID, stale rematch rejected.
8. Capture JS `pageerror` exceptions; measure baseline viewport scroll/crop and separate **unmerged Agent C** contract gaps. Do not count static QA probes as themed UI passes.

**No natural match completion** is exercised by the rematch shortcut; a full end-to-end match remains independently testable through existing gameplay suites. The deliberate rate-limit-counter reset is restricted to disposable SQL **between unrelated 24-room cases**; the per-IP abuse limiter is tested separately, not evaded in production.

### Agent C frontend contract — strictly pending in this base

Agent C is responsible for wiring actual eight-theme setup and game components. Once Agent C's commit has been incorporated into a combined integration branch, rerun this E suite with front-end assertions updated to that verified DOM (do not guess selectors):

- Theme selector creates a room with canonical `themeId` and displays the immutable chosen theme for **all** joined participants; no client deck or score overrides.
- 2/3/4-player lobbies render correct seat/ready/host controls; wrong-theme join displays safe error; no hidden future card revealed before selecting.
- The eight stat action buttons use the **selected theme's** eight labels and server categories (not Pokémon labels).
- Live result/reveal, pot/jackpot, paused host-transfer and unanimous rematch all retain theme branding, card data and responsive positioning.
- At 320px, 390px, 768px and 1366px check real `window.scrollX`, clipped/masked controls, `elementFromPoint` call-dock obstruction, enabled actions, 44px touch targets, keyboard focus, reduced motion and console/page errors.
- Join Voice is opt-in; mocked SDK only. Expand/minimize dock across 4 viewports without intercepting selectable stats, then verify track cleanup, permission denial/recovery, reconnect events and no duplicate tracks.
- Require screenshots of these **actual integrated UI screens**, not evidence from the pre-C Pokémon frontend.

**Do NOT mark integrated themed frontend as PASS before combined commit / executed tests.** Agent E's branch is intentionally a pre-integration contract and can merge into a *throwaway QA branch* for verification without touching production.

## Output and reproducibility

The script prints `ROUND5_PASS API browser matrix` 24 times, plus `ROUND5_FINAL_API_MATRIX_PASS` if and only if all actual local SQL/HTTP cases pass. It produces four clearly identified `/tmp/deckverse-round5-baseline-{320,390,768,1366}.png` screenshots (the existing main CI collects `/tmp/deckverse-*.png`) and a local `/tmp/deckverse-round5-report.json`. Screenshots are **baseline pre-Agent-C UI**, not themed integration proof. Link actual Actions runs/artifacts in the draft PR only when available.

### Risks and limitations

- The CI database is a fictional legacy schema with 004–007 applied; it is not a production schema replica, and does not prove real Supabase Hub RLS/grant equivalence.
- The local server uses authentic repository `api/game.js`, but browser calls are direct `fetch` probes, **not** verified Agent C UI clicks.
- Permission and call checks use synthetic devices and stub SDK only; no real mic, iOS, Android, WebRTC, LiveKit Cloud or bandwidth evidence.
- Temporary root-site external resources are blocked by browser routing. This may produce blocked-resource console noise; uncaught JS exceptions are reported separately.
- Theme intellectual-property rights, fairness, performance on physical devices and commercial publication are separate launch gates.
- **Release posture: DRAFT / NO-GO for a public eight-theme online multiplayer claim until Agent C's combined UI passes, independently audited DB/security checks remain green and physical device tests exist.**

## Executed CI evidence

To be populated only after runs finish on this branch. A standard `DeckVerse CI` success alone is not proof that the 24-case integrated runner actually ran: inspect the `ROUND5_...` log records and screenshots before claiming the matrix passed.
