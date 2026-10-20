# DeckVerse V2 — Final Mobile & LiveKit QA

**Candidate:** `integration/deckverse-v2-release-hardening`  
**Agent E branch:** `agent/e-final-mobile-livekit`  
**Release state:** Draft / review-only until coordinator evaluates integrated CI, database checks and device evidence.

## Evidence boundaries and safety

This branch edits **only** `tests/final-mobile-livekit.test.js` and `docs/FINAL_DEVICE_QA.md`. The browser test is registered through existing `npm test` (`node --test tests/*.test.js`) without editing shared workflows. It uses real headless Chromium rendering, a localhost static server, Playwright-intercepted **synthetic room API responses**, the checked-in pure 2/3/4-player engines, and fake WebRTC capture devices. For calling it replaces the LiveKit SDK module with a **stub**, and issues fictional token responses. An explicit catch-all network route denies unmocked external requests.

**No physical iPhone/Android, LiveKit Cloud, actual WebRTC peer connection, production database, real user session or external environment is exercised by these new tests.** The existing separate PostgreSQL and API-integrated CI suites are the evidence for database behavior. No live Project Hub modifications, migrations, API/client changes or deployments are authorized.

## Final automatic scenarios

| Area | Simulated validation in `final-mobile-livekit.test.js` | Important boundary |
|---|---|---|
| 320/390/768/1366 viewport | Landing, setup, lobby, active battle, rematch; actual `window.scrollX`, clipped interactive bounds, overlay-versus-enabled category buttons | Chromium viewport emulation, not real Safari or Android |
| Two/three/four participants | Independent browser contexts, room creation and joining, individual sessions, ready/start, future-card concealment, one pure-engine category round and synchronized shared reveal | API routing mocked, engine logic real, no PostgreSQL |
| Lobby and host controls | Complete roster; host-only start and host settings state | Host transfer injected as synthetic fixture |
| Interrupted network | Chromium context offline/online, status notice and preserved cards; refresh preserving session | No genuine 4G/Wi-Fi radio handoff |
| Pause and transfer | Simulated disconnect/grace state, new host and paused category lockout | Backend policy covered by independent DB suites |
| Consent/rematch | Finished game fixture, unanimous rematch UI, fresh 50/60/80-card round | Terminal state seeded, not a natural full match |
| Mic/camera | User tap required, simulated permission errors then retry, fake browser devices publish, camera off by default | Not human audio/video |
| Audio and subscriptions | Explicit Enable Audio, duplicate mocked remote track ignored, synthetic audio/video elements removed | Not LiveKit ICE/DTLS or audible playback |
| Reconnect and visibility | SDK reconnect/reconnected events, visibilitychange/background notices | Does not replicate iOS tab suspension |
| Track/handler lifecycle | Repeated connect/camera/leave cycles; local tracks ended, no attached media, no leaked SDK listeners | Detects observable mock lifecycle leaks; not a heap profiler |

### How CI invokes it

`npm test` picks up `tests/final-mobile-livekit.test.js` on GitHub's existing CI runner. Runner needs Node 22, `npm ci`, `playwright-core` and system Chrome (`CHROME_PATH=/usr/bin/google-chrome`). Screenshots saved as `/tmp/deckverse-final-*.png` are automatically collected by the existing `deckverse-browser-screenshots` workflow artifact step, **when the run reaches the screenshot statements**. Synthetic browser test logs print `FINAL_MOBILE_QA_METRICS` (viewport data), not production latency. No actual physical-media figures are fabricated.

### Specific regression from Agent E's prior findings

The previous V2 candidate could horizontally scroll **240px** at 768px/1366px due to `.ambient-a`. The new QA asserts `window.scrollX <= 2` and no clipped gameplay controls after scrolling to the far right, for landing, lobby, game and rematch. **The coordinator's claimed fix must be independently verified by actual CI on this branch.**

## Physical handset checklist — not executed, all PENDING

For each case, record **iOS/Android model, OS, browser version, network, PR commit, room IDs redacted, date, observer, reproducible steps, actual PASS/FAIL, latency, screenshots without private session codes**, and retest result.

| ID | Physical device and test | Pass criteria |
|---|---|---|
| PHY-01 | iPhone Safari 320/390px portrait and landscape; Android Chrome equivalent | No 240px horizontal scrolling; whole card visible, stats touch targets reachable |
| PHY-02 | iPhone ↔ Android 2-player remote room | Both can join, see only own hidden deck, play full match and rematch without stale cards |
| PHY-03 | Three Android/iOS phones 3P; four phones 4P | Correct roster/seats, 60/80-card totals, no hidden-card disclosure |
| PHY-04 | Lobby host leaves/backgrounds; another player stays | Host change only after approved grace; paused UI and resume correct |
| PHY-05 | Interrupt Wi-Fi for 10s/60s and swap to cellular | Show offline/reconnect, preserve exact cards, no duplicate room or seat |
| PHY-06 | iPhone Safari mic allowed, camera denied | Audio-only calling; permission error accurate; cards still usable |
| PHY-07 | Android Chrome mic denied, camera allowed | Listen-only fallback then mic explicitly recoverable after permission change |
| PHY-08 | iPhone Safari silent mode, Bluetooth/headphones, first Enable Audio tap | Real remote speech heard once; no double playback or stale audio control |
| PHY-09 | Both phones enable camera and switch front/back | Remote video correct; no surprise capture; switch failure clearly surfaced |
| PHY-10 | Background Safari, screen lock, notification/cellular call | Media stopped/suspended responsibly; manual recovery, no unexpected auto-capture |
| PHY-11 | Leave/rejoin voice 10 times, video on/off repeatedly | OS camera/mic indicators turn off after leave; no heating/track leaks |
| PHY-12 | iPhone ↔ Android during 15+ minute video session and rematch | Measure actual audio intelligibility, jitter, delay, echo, thermal/battery, freezes |
| PHY-13 | 2/3/4 remote call window minimized/expanded on 320/390/tablet | Camera overlay never masks game controls; controls reachable and accessible |
| PHY-14 | VoiceOver/TalkBack, accessibility zoom, orientation changes | Controls have proper accessible names, focus/zoom preserves gameplay |
| PHY-15 | Permission permanently denied, absent camera, expired room/token and CDN down | Graceful error and retry; game continues safely; no credentials shown |

## Gate criteria and coordinator recommendation

A *conditional software QA pass* requires: latest candidate CI green including this test; no browser errors or layout failure; independent disposable PostgreSQL concurrency/presence/room suites green; coordinator sign-off on all API and security issues. Physical media and device QA must be recorded before describing real iPhone Safari, Android Chrome, Wi-Fi/cellular and actual LiveKit reliability as **verified**.

**Until then: NO-GO for unconditional production release.** Keep this PR draft and unmerged. The original gameplay/IP licensing requirements also remain separate public-launch gates.

## Execution log

Populated only from real GitHub workflow results; do not infer success from previous branch's passing runs. The PR description will link exact latest run and evidence.
