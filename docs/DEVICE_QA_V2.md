# DeckVerse V2 — physical device & multi-player release gate

**Status:** test plan, not proof of passed physical-device testing. All tests must be recorded against the exact candidate commit and deployment URL. The current production V1.2 is unaffected by this branch.

## Phone-to-phone LiveKit testing (requires two real phones)
Prefer one iPhone Safari and one Android Chrome, different networks for at least one run. Do not show API keys, passwords or participant session tokens in screen recordings.

1. Start a Remote Room, join with a code from two devices, ready both, start the battle. On both tap **Join Voice** and allow microphone. Verify both hear each other without echo or duplicate audio; use headphones for reliable echo measurement.
2. Enable cameras one at a time, verify each screen shows its *own* local thumbnail and the *other* player's live video. Turn one camera off; audio and gameplay must continue.
3. Mute/unmute from either phone; check that the **other** person no longer hears / hears the microphone. Test iOS Safari's first interaction autoplay behavior.
4. Deny mic permission, then camera permission separately. Gameplay must remain playable; re-allowing permission through device settings should give a usable recovery route.
5. Place a normal phone call, switch apps, lock/unlock screen, rotate device, and return to DeckVerse. Observe whether microphone, camera, and WebRTC session require the user to rejoin.
6. On one phone toggle Wi-Fi off/on, change Wi-Fi ↔ mobile data, airplane mode for a short interval, and return. The battle room/session should be preserved when connectivity returns; media should reconnect or show a usable Join Voice action without leaking camera/microphone state.
7. Have one participant deliberately press **Leave Call** without exiting the match; then rejoin. Only their media connection should change.
8. Run two complete matches and a consensual rematch. Verify cards, categories and LiveKit media are independent of room reset.
9. Check battery, overheating, audio clarity, frame rate, video overlay, screen reader controls and accessible touch targets over at least 15 minutes.
10. Repeat with two Android phones if available; test on slower 4G and a throttled connection.

Suggested evidence table: test ID, devices/OS/browser/network, candidate commit/URL, result (PASS/FAIL/BLOCKED), observed delay in seconds, screenshots/screen recording (redacted), reproduction steps, severity, and retest status.

## Automated coverage versus not yet verified
- Node unit tests: 2-player rules, rematch decision, 3/4-player turn engine and conservation.
- Local browser: responsive practice and offline → online → refresh room restoration (mocked game API).
- Production CI against existing V1.2: two browser online card fights + real LiveKit connections using **synthetic** camera/microphone input.
- NOT verified: actual human audio/video quality, Safari/iOS permissions, mobile call interruptions, network handoff stability, 3/4-player deployment, and multiway card-balance fairness.

## Experimental 3–4 player rules (subject to acceptance testing)
- 3 people: **60 cards, 20 each**. 4 people: **80 cards, 20 each**.
- Each round, every remaining player with at least one card reveals their top card to compete in the host's chosen category. Rank: lower is better. All other stats: higher is better.
- The best individual stat wins every drawn card and the shared jackpot; takes category power.
- If the highest/best value is shared, **every player's drawn card enters the jackpot**, not just the tied best cards.
- The original chooser retains control after the first consecutive tie; the next active seat receives control after the second. Continue alternating after subsequent ties, skipping players whose decks are empty.
- Players with zero cards cannot select or draw; the remaining participants continue.
- If a tie exhausts every player's deck, the unique game Rank among that round's drawn cards resolves the whole jackpot. If only one player still has cards while a jackpot remains, that player receives the pot and wins (no deadlock).
- The winner is the participant holding all cards; active seats never gain hidden cards except via a legitimate win.
- Server must authorize each action and keep upcoming cards private from opponents.
- No production 3/4 room feature is enabled until the isolated DB changes and multi-party UX are verified. Deck manifests and the engine are not a deployed multiplayer feature.

## Same-room rematch expectations
- At natural match end, both original participants remain in the room. Either player can request a rematch.
- Only when **both** consent does the server shuffle the fixed 50-card deck again, deal 25 each and randomly select the first chooser. No opponent deck order is reused.
- Pressing rematch twice is idempotent. A game ended by a player leaving requires a new room.
- Reveal settings persist between rematches. The current match's reveal timer and acknowledgements are cleared.
- Do not expose a rematch UI when the lobby has lost a participant.

## Required before merging
- Green draft-PR CI against this branch, focused rematch tests and reproducible, server-authoritative simulations.
- Two real browser sessions using branch preview must play a match to completion and rematch; don't test branch-only API behavior against existing production code.
- Database migration and security advisor review before any 3/4 room API rollout. Never touch other Project Hub applications.
- Codex QA branch findings should be reconciled without overwriting its independent work.

---

## Agent E LiveKit mobile hardening addendum — 2026-10-20

**Scope:** `src/livekit-call.js`, `tests/livekit-mobile-lifecycle.mjs` and this document only. No production deployment, DB/SDK credentials or shared token route changed. Existing public LiveKit Cloud synthetic two-Chrome smoke was completed *before* Agent E; do not present it as a new regression run on this branch.

### Findings and changes

| Risk observed in baseline | Hardened behavior | Verification boundary |
| --- | --- | --- |
| Subscription and room-sync could attach the same remote track multiple times | Remote track→element map deduplicates attachments and detaches by track | Mock LiveKit SDK regression PASS; recheck live conference |
| Calling disconnect during a pending fetch/connect could leave an orphaned connection | Abort token fetch, invalidate each join epoch, track pending Room, disconnect and release it | Mock lifecycle tests PASS; hardware backgrounding pending |
| Track and event listener cleanup was incomplete | Explicit local track stop + preview/remote element detach + bound SDK handler removal | Mock lifecycle assertions PASS; browser media-indicator check pending |
| Mic/camera controls had stale static accessibility names | Labels, state and disabled controls synchronize with SDK participant flags | Mock regression PASS |
| Reconnecting status lacked clear terminal-failure recovery | Reconnecting / Reconnected / Disconnected messages; Join Voice after final disconnect | Simulated SDK events PASS; genuine network switching pending |
| Joining after permission/SDK/token failures was opaque | Distinct permission-denied, missing-device, 429, 401/403, SDK/network messages; audio-only fallback | Mock permission and failure paths partial; token response branch needs full integration QA |
| Remote video view discarded existing peers in 3/4 rooms | Preserve one element per remote video track, remove individual elements on unsubscribe | Mock multi-track PASS; visual 3/4 layout integration pending |
| Call dock overlapped category controls on narrow mobile | Default minimized at widths <=700px; place dock near top/safe-area with height cap; manually expandable | DOM viewport simulation PASS; physical viewport/landscape QA pending |
| Mobile audio could silently be blocked | Keep user-initiated ENABLE AUDIO and reflect `room.canPlayAudio` state | Mock audio-unlock PASS; iOS Safari audible playback pending |
| Foreground/reload might silently resume capture | No automatic page-load rejoin or page-visible capture; pagehide disconnect/stop | Mock visibility and stop assertions PASS; iOS page lifecycle pending |

**Explicit consent:** pressing **Join Voice** is the player action that starts microphone capture, if permission is allowed; the camera stays off until **Turn camera on** is pressed. On reload no microphone/camera starts until another **Join Voice** click. Camera switching is best effort; unsupported platforms remain on their existing camera.

### Executed versus pending

- **PASS — Node + mocked LiveKit SDK**: `node --test tests/livekit-mobile-lifecycle.mjs` — 6/6 on Node 22.16.0, covering lazy connect, mic toggles/labels, deduplicated tracks, multiple cameras, audio unlock, camera switching, permission problems, reconnected/failed disconnect UI, stop/detach/listener cleanup, abort of an in-flight token fetch and safe 403 authorization error handling. Test uses simulated DOM and simulated participant/events; no real packets are exchanged.
- **PASS — JS syntax**: `node --check src/livekit-call.js` (local).
- **Previously verified on production baseline, not rerun against this change**: two independent desktop Chrome sessions with synthetic microphone/camera published and received LiveKit Cloud media (`tests/livekit-browser.mjs`). This is neither physical-mobile evidence nor Agent E branch verification.
- **NOT RUN on this branch**: real LiveKit Cloud two-way audio/video, the new `node tests/livekit-mobile-browser.mjs` Playwright harness (browser navigation was blocked in the local runner; this harness uses synthetic media and a mocked SDK, not a real LiveKit Cloud call), browser emulation with actual WebRTC, expired real token, real 4G↔Wi-Fi handoff, Safari/iOS or Android device capture, real multi-device camera switching, screen recordings, or long call soak. Do not label these PASS.

### Exact physical-device matrix (record results; all currently PENDING)

Use **iPhone Safari** (current stable iOS, non-private tab) + **Android Chrome** (current stable Android), *two independent humans and devices*, HTTPS branch-preview URL and authorized remote-game room. Record model, OS, browser version, network carrier, candidate SHA, latency/time, battery/thermal impact, PASS/FAIL/BLOCKED, redacted evidence and issue link. Repeat core calls with Android↔Android when possible.

| ID | Device pair / scenario | Procedure | Pass criterion |
| --- | --- | --- | --- |
| LK-01 | iPhone ↔ Android, both Wi-Fi | Explicitly Join Voice on both; accept mic access | Remote voice audible both directions, single audio stream, no camera before click |
| LK-02 | Same, audio-only | Never enable cameras; complete several card rounds | No video capture indicator; voice and gameplay continue |
| LK-03 | Same, camera on/off | Enable both cameras one at a time then turn off | Local preview + remote feeds correct; stopped camera no longer captures |
| LK-04 | Same, mute/unmute | Alternate both speakers' mute states | Peer hears silence from muted sender and sound when unmuted; labels correct |
| LK-05 | iPhone Safari autoplay | Join muted-device/silent-mode case; tap ENABLE AUDIO if shown | Remote sound starts only via allowed gesture; button reflects actual playback |
| LK-06 | Android Chrome autoplay | Repeat LK-05 with screen-off / unlock | No duplicate remote audio and clear blocked-audio recovery |
| LK-07 | iPhone deny microphone | Block mic on first join, allow camera later | Clear listen-only state, cards remain playable, no secret/error leak |
| LK-08 | Android deny camera | Allow mic, refuse camera request | Calling continues audio-only; device settings re-allow permits explicit retry |
| LK-09 | Device without camera / busy camera | Use camera-disabled emulator/device or competing camera app | Message is actionable; voice unaffected and no infinite spinner |
| LK-10 | Front/back camera | Press Switch Camera several times on capable phones | Actual facing changes without double capture, unsupported switch is harmless |
| LK-11 | Browser background and phone lock | Background for 5s then 60s, lock/unlock, return | Status truthful; no surprise capture restart; media resumes or offers manual rejoin |
| LK-12 | Phone interruption | Incoming cellular call/notification during LiveKit session | Interruption handled; audio focus and microphone state reconcilable after return |
| LK-13 | Wi-Fi interruption | Disable/re-enable Wi-Fi for ~10s then ~60s | Reconnecting notice, recover or usable Join Voice; cards unaffected |
| LK-14 | Wi-Fi ↔ cellular | Move one handset to mobile data during call | Recover or manual rejoin; no duplicate publisher or media track leak |
| LK-15 | Refresh or tab close | Refresh and reopen room; press Join Voice again | No automatic capture before click; original tracks stopped |
| LK-16 | Leave/rejoin repeatedly | 10 cycles with video and audio enabled then Leave Call | Device indicators stop after each leave, no multiplied audio or DOM elements |
| LK-17 | 320/375/390/430px + landscape | Minimize/expand call while selecting cards and confirming rounds | Video dock never masks primary interaction; accessible 44px touch controls |
| LK-18 | 3- and 4-player preview | With isolated multiplayer backend enabled, everyone joins calls/cameras | All active participants audible; video feeds visible; gameplay independent |
| LK-19 | Realistic network and soak | Headphones vs speaker, slow 4G, 15-minute call, rematch | Note echo, latency, reconnect duration, battery and overheating without inventing metrics |
| LK-20 | Token/session errors | Revoke game membership / rate-limit or let session expire in safe test room | No credential disclosure; understandable recovery, game not modified |

### Coordinator integration requests (no unauthorized edits)

1. **Shared CI owner:** add `node --test tests/livekit-mobile-lifecycle.mjs` and `node tests/livekit-mobile-browser.mjs` to the shared CI workflow (Chrome with `CHROME_PATH` available) or package test script after reviewing the tests. It is intentionally a `.mjs` file, so existing `npm test` (`tests/*.test.js`) will **not** execute it.
2. **Shared HTML/CSS owner (Agent D/coordinator):** verify expanded remote-video grid/individual feeds visually on a 3–4-player mobile viewport and adjust call-dock responsive CSS, overlay stacking and at-least-44px controls without hiding cards. Agent E did not edit shared CSS/HTML.
3. **Shared token endpoint owner (Agent B/coordinator):** implement durable rate limits and expiry/revocation messaging only in authorized server work. No LiveKit secret or token endpoints were modified by Agent E.
4. **Integration gate:** run `tests/livekit-browser.mjs` (two real LiveKit connections with fake devices) **against a safely provisioned candidate deployment**, not production V1.2; then run LK-01–20 with actual devices. A token/permission emulator cannot prove network-media correctness.
5. Keep PR draft/unmerged and defer public launch claims pending device evidence and existing P1 security/presence/IP findings.
