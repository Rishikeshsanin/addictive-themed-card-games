# DeckVerse V2 — database-integrated mobile QA and release gate

**Lane:** Agent E / `agent/e-db-integration-qa` → `integration/deckverse-v2-api-wiring` (draft, review-only)  
**Evidence classification:** disposable PostgreSQL + Chromium emulation; stubbed LiveKit SDK; physical devices pending.

## Isolation / prohibited actions

The workflow runs only on `pull_request`/manual CI with an ephemeral **PostgreSQL 16** service in `deckverse_ci` on loopback, with fictional login roles and test accounts. Both setup and runtime reject absent `DB_INTEGRATION_LOCAL_ONLY=YES`, non-loopback database hosts or non-`/deckverse_ci` database names. The repository V1 base tables are not present as a migration: setup explicitly provisions a **minimal synthetic legacy schema** in this disposable database, then applies reviewed-in-branch migrations 004/005/006 using a local `hub.assert_app_scope` stub that rejects any scope except DeckVerse. **This does not test live Project Hub registration, original production schema equivalence, grants/RLS, backup/rollback, or migration permission readiness.**

The in-process HTTP server imports the *real* `api/game.js` and `api/livekit-token.js` modules from the checked-out candidate. Restricted `deckverse_app` handles requests, while the fixture's disposable admin role performs timestamp manipulation and seeded terminal states. TLS is enabled with an ephemeral localhost self-signed certificate because the production handler requires SSL. Only `127.0.0.1` is contacted; there are **no Supabase writes, external LiveKit requests, real API keys, Vercel deploys, merges or unrelated project changes**.

Never point these scripts at an actual database. Screenshots must never expose session tokens, API credentials or connection strings; they contain synthetic DeckVerse game UI only. Uploaded test artifacts expire after seven days.

## How to run

GitHub Actions: `.github/workflows/db-integration-mobile-check.yml` — service database, localhost SSL, test bootstrap, existing LiveKit lifecycle unit suite, integrated Chromium lane, evidence upload. The runner has `npm ci`, Node 22 and Google Chrome.

For local reproduction, provision **your own disposable local PostgreSQL 16** named `deckverse_ci`, with SSL enabled for the game handler; set **only fictional, local, CI-specific** `DB_INTEGRATION_ADMIN_URL`, `DECKVERSE_DATABASE_URL`, `DB_INTEGRATION_LOCAL_ONLY=YES` and `CHROME_PATH`. Then:

```sh
node tests/db-integration-mobile-setup.mjs
node --test tests/livekit-mobile-lifecycle.mjs
node tests/db-integration-mobile-e2e.mjs
```

The bootstrap intentionally fails if roles/tables already exist; start with a fresh disposable database for every run. Do not add production credentials.

## Cross-feature acceptance checklist

| ID | Verification | Evidence expected | Gate |
|---|---|---|---|
| INT-01 | 2P/3P/4P private room creation and browser-based joins | real local PostgreSQL rows + independently isolated Chromium browser contexts | must pass |
| INT-02 | All participants ready, only host starts, correct 50/60/80 card totals | API snapshot, browser battle render and SQL seat count | must pass |
| INT-03 | Future opponent cards concealed | 3/4-player DOM: one visible top card per browser | must pass |
| INT-04 | Brief offline→online and page reload | same room ID, same seats, identical card counts/round/top-card ID | must pass |
| INT-05 | Stale host 7 minutes, authenticated guest heartbeat, host transfer | host seat 0→1, pause + player disconnected status, match mutation 409, no lost cards | must pass |
| INT-06 | Recovered player heartbeat | pause removed, new host retains authority, no card mutation | must pass |
| INT-07 | 2P/3P/4P unanimous rematch | test-only SQL fixture seeds finished state; actual API/browser votes restart once, same room and fresh count | must pass |
| INT-08 | Stale rematch number | 409 rejection, unchanged room identity | must pass |
| INT-09 | Browser-originated create-rate burst | 429 + `Retry-After`, safe message, durable DB counters | must pass |
| INT-10 | LiveKit outsider rejection vs authorized participant | 403 for forged session, locally signed room-limited JWT with fake CI keys | must pass |
| INT-11 | Calling capture begins only by user action | fake LiveKit SDK + actual browser-generated synthetic media; mic on, camera off initially | must pass |
| INT-12 | Mute/unmute, enable audio, camera on/off, leave releases tracks | synthetic Chromium media + stubbed SDK (not packet-level LiveKit) | must pass |
| INT-13 | 320×568, 390×844, 768×1024, 1366×768 | viewport overflow, card visibility, unobstructed playable controls, screenshot artifacts | must pass |
| INT-14 | Timing and repeatability | action timings from same CI runner, p50/p95/max and counts in `results.json` | report |
| INT-15 | Denied mic/camera and missing camera | existing `livekit-mobile-lifecycle.mjs` mocked SDK regression | must pass |
| INT-16 | Production-bound client/server physical call compatibility | real LiveKit Cloud on isolated preview plus actual iPhone/Android | **pending** |
| INT-17 | Natural full-match ending, true four-player concurrency and migration compatibility | independent Agent G/H/I database suites + migration-safety Agent F | **pending** |
| INT-18 | Service behavior under high latency/packet loss/Wi-Fi cellular handoff | real device or controlled real-network test, with recorded delays | **pending** |

**Terminology:** "real API + disposable PostgreSQL" does not mean deployed V2. "Synthetic browser verified" does not imply physical iPhone or Android. Calling fixture uses a stubbed client; it does not establish peer-to-peer audio, prove autoplay semantics on Safari, or test actual LiveKit ICE/DTLS reconnection.

## Executed GitHub Actions evidence (2026-10-20)

**Latest fully evaluated integration code run:** [39453605939](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39453605939) — **FAIL, correctly blocked on responsive horizontal scrolling**. The independent DeckVerse CI on the earlier compatible commit passed; it does not override this new gate.

- **20 scenario groups passed** under disposable PostgreSQL + Chromium, including real API-backed 2/3/4 creation/join/start, player counts and card privacy; all three room reconnect/refresh/card-preservation checks; 3P stale-host transfer with correct pause and recovery; all three browser-driven rematches (test-only finished-state fixture); forged vs legitimate LiveKit token access using fictional signing credentials; synthetic mic/camera/audio-unlock/mute/leave; durable create throttling 429/Retry-After; unobstructed expanded call dock at 390px.
- **6/6 existing LiveKit lifecycle/mock permission tests passed** in the same workflow.
- **Three viewport groups failed**: 3P at 768px; 4P at 768px and 1366px. Each had **240px actual horizontal scroll** (`window.scrollX=240` after a direct scroll), not just a large DOM scrollWidth. The overwide element is decorative `.ambient-a` (right edge 1008px at 768px; 1606px at 1366px). **Gameplay card/button bounds remained inside viewport** in these tested layouts, so this is horizontal page scrolling rather than proven card obstruction. Fix belongs to the **coordinator/Agent D**, not Agent E; consider clipping the decorative layer at a correctly bounded ancestor and verify `scrollX=0` without hiding interactive content.
- Chromium emulation screenshots + timing JSON: [run artifact deckverse-disposable-mobile-qa](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39453605939/artifacts/12278883918). Files `overflow-3p-768.png`, `overflow-4p-768.png`, `overflow-4p-1366.png` and cross-device captures are simulated browser screenshots only.
- **Measured local-CI performance (not real-device or network latency):**

| Action | Samples | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| Browser room creation | 3 | 67.3 ms | 91.5 ms | 91.5 ms |
| Browser room joining | 6 | 134.5 ms | 281.2 ms | 281.2 ms |
| API get | 15 | 8.2 ms | 63.2 ms | 63.2 ms |
| API rematch | 3 | 9.2 ms | 9.5 ms | 9.5 ms |
| API heartbeat | 2 | 8.5 ms | 8.8 ms | 8.8 ms |
| API select (paused rejection) | 1 | 7.0 ms | 7.0 ms | 7.0 ms |

Small sample sizes and a loopback CI service prohibit generalizing these figures to real Vercel/Supabase/mobile performance. A subsequent documentation-only commit may produce a new CI run; evaluate that separately.

## CI reproducibility and performance

- `artifacts/db-integration-mobile/results.json`: scenario results, action type, sample counts, min/p50/p95/max timings in **milliseconds**. Report only numbers emitted by completed runs; never invent a production latency.
- Screenshot names: `started-2p-390.png`, `started-3p-320.png`, `started-4p-390.png`, `presence-paused-3p.png`, `remote-call-expanded-390.png` (plus other generated screenshots). These are **Chromium emulation**, not screenshots of actual phones.
- Dataset: four or fewer separate fake participants per session; local fast network, ephemeral database; synthetic timestamps and finish fixture. Repeat CI runs under same conditions before comparing latencies. No hard production SLA can be inferred.
- Dedicated agents G, H and I own deeper real-SQL multiplayer, rate-limit concurrency and presence tests. This suite checks only cross-feature smoke, preventing false duplication of their work.

## Physical verification matrix (not executed, all PENDING)

Record for each case: device model, OS/browser build, date, candidate commit, HTTPS preview, network, test partner, PASS/FAIL/BLOCKED, steps, actual timings, redacted screenshots/video, issue, retest outcome.

| ID | Devices | Test | Expected behavior |
|---|---|---|---|
| PHY-01 | iPhone Safari ↔ Android Chrome | Join 2P/3P/4P remote room and finish a match | Every player sees own card, accurate reveal, no freezes |
| PHY-02 | 320px small phone, 390px phone, tablet | Expand camera window, press all categories, exit/rematch | No obscured controls, no horizontal scrolling |
| PHY-03 | iPhone Safari + Android Chrome | First Join Voice tap, allow mic, deny camera | Audio-only fallback and explicit camera opt-in |
| PHY-04 | iPhone Safari | Browser autoplay/silent switch, Enable Audio | Real remote speech audible after gesture, no duplicate voices |
| PHY-05 | Android Chrome | Audio focus, Bluetooth/headphone change, lock/unlock | Capture stays user-controlled, recovery available |
| PHY-06 | Both | Deny and later re-enable microphone/camera permissions | Actionable feedback; private media releases after leave |
| PHY-07 | Front/back camera phones | Switch front↔rear, camera on/off 10 times | Correct device and track stop, no accidental background capture |
| PHY-08 | Both, different carriers | Switch Wi-Fi↔cellular, airplane mode, short and long outages | Status and host-transfer policy reflect reality, no duplicate rooms/cards |
| PHY-09 | Both | Receive call, background browser, reopen/reload | Session continuity or safe rejoin; no automatic media activation |
| PHY-10 | 2/3/4 physical phones | Host disappears beyond policy grace | Visible pause, authoritative host transfer, no premature forfeit |
| PHY-11 | Both | Mute/unmute cross-device with speaker/headphones | Human-audible result correct, no echo/multiplied audio |
| PHY-12 | Both | 15-minute camera-on call plus rematch | Battery/thermal/frame-rate/quality measured, no ongoing mic indicator after leave |
| PHY-13 | Both | Poor 4G + high latency, intermittent reconnect | No game-state corruption, bounded error recovery; log observed delay |
| PHY-14 | Screen-reader/touch accessibility | VoiceOver/TalkBack, 44px targets, orientation/zoom | Operable without card-control obstruction |

## Release recommendation / coordinator handoff

**NO-GO** for production migration or unrestricted public V2 release based only on this suite.

Coordinator should review any CI failures and perform fixes only on shared-owned files; rerun this integration lane together with Agents F/G/H/I; review original production schema vs local synthetic schema; audit authorization, constrained DB grants and RLS in a safe stage; then request separate user approval before any live `deckverse` migration. LiveKit Cloud preview and real devices, payment/IP rights and production rollback plans remain independent release gates. Do not auto-merge this draft PR.
