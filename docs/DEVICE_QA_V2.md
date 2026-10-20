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
