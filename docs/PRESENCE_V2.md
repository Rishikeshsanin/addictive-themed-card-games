# DeckVerse V2 — presence, recovery and host ownership (Agent C)

**Status: review-only module, tests and migration proposal. NOT integrated, migrated or deployed.** This PR owns only the presence module, its tests, migration 006 and this document. QA finding DV-03 remains a release/integration gate.

## Verified baseline

- `api/game.js` serves `create/join/get/ready/start/rematch/select/settings/ack/leave`. Ordinary `get` polling **does not** refresh `deckverse.players.last_seen_at`; reusing a lobby seat on `join` does.
- Mutating actions serialize on `deckverse.rooms ... FOR UPDATE`. `get` is an unlocked snapshot and cannot safely commit ownership changes.
- Session tokens are stored as SHA-256 hashes and authenticate an `active=true` row. The stable `seat` is player identity. A nickname+room-code join is **not** authenticated reconnection.
- Server `start`/`settings` and client lobby/battle controls assume seat 0 is host. The coordinator must replace *all* those checks, not just one UI button.
- Explicit `leave` currently forfeits an active 2P game or aborts an active 3/4P game. **Network loss/backgrounding must never call this action.**
- `rooms.expires_at` gates room reads and needs coordinated heartbeat-based refresh before enabling recovery. Exact deployed defaults, live schema and cleanup jobs are **not verified** by this PR. Browser sessionStorage normally preserves the original session across reload within the tab, not after permanent tab closure.

## Server-authoritative state machine

`advanceHeartbeat(player, {serverNow})` is a pure monotonic helper after server authentication; `presenceOf` derives the state from the existing `last_seen_at` (DB clock, never client clock). `evaluateRoomPresence` proposes host election, paused and abandoned flags. These functions **never** mutate database, decks, pot, round, chooser, cards or winner.

| State | Conditions | Result |
| --- | --- | --- |
| `online` | Verified heartbeat under 45 seconds ago | Normal gameplay |
| `grace` | 45 seconds to phase grace boundary, inclusive | Keep seat and cards; freeze battle until all online |
| `disconnected` | Full grace elapsed | Keep seat/cards; *host controls* may transfer, not cards |
| `left` | Explicit server-approved departure (`active=false`) | Existing explicit-exit policy applies, never a timeout forfeit |
| `unknown` | Missing/invalid legacy timestamp | Freeze if playing; forbid automatic eviction/expiration and transfer based on this player |

**Foreground heartbeat every 15 seconds**, plus immediately on reconnect and visibility resume, separate from the ~550 ms GET poll. Background timers are unreliable and cannot be required. Policy thresholds are configurable and validated. Defaults:

| Room state | Host/disconnect grace | Abandoned only when all inactive for |
| --- | ---: | ---: |
| lobby | 2 min | 30 min |
| playing | 5 min | 24 hours |
| finished | 3 min | 30 min |

Room expiry refresh must exceed the playing grace and protect active matches. A separate maximum age/retention policy must be reviewed to prevent indefinitely retained rooms. The timestamp of *every* participant must be known before automatic abandonment.

## Host-loss and fair-play policy

1. **Lobby:** host keeps authority while online/grace. Once disconnected beyond grace or explicitly left, select the next *online* active seat clockwise (2/3/4 players). Otherwise keep current host and wait.
2. **Battle:** identical election but control privileges alone move. Pause round-affecting actions while any required player is not online. Never automatically choose a category, end the match, forfeit cards, advance the pot or replace a seat. Keep the category caller/chooser defined by the actual game engine.
3. **Finished:** allow host transfer to coordinate UI/rematch but never modify the result. A rematch still requires every original player and their consent. Explicit forfeit rematches remain forbidden.
4. If all players are away, pause; choose no offline replacement. Once old host reconnects following a legitimate transfer, it regains only its original seat (new host remains host). If a host remains within grace, no premature election is permitted.
5. Explicit exit is a different intent from closed/hidden browser: successful `leave` records `active=false`, `left_at=statement_timestamp()` and refreshes last activity. Review lobby-host exit behavior so guests can remain under a live successor; preserve current 2P forfeit and 3/4P abort behavior unless product policy is separately approved.

## Required coordinator implementation — shared files NOT edited by Agent C

**Server:**
- Add a distinct authenticated `heartbeat` action to `api/game.js` with existing code/token validation, body limits and Agent B's per-instance-safe throttling. Never trust client timestamps, seat identifiers, status strings or host claims.
- On heartbeat or another authenticated mutation: start a transaction, lock room *first*, validate player token/hash and `active=true`, and issue an update equivalent to `UPDATE deckverse.players SET last_seen_at=GREATEST(COALESCE(last_seen_at,statement_timestamp()),statement_timestamp()) WHERE room_id=... AND seat=... AND active=true`. Initialize fresh lobby-join timestamps and reset `left_at=NULL` only for legitimately new lobby seats. No `get`-poll heartbeat writes every ~550ms.
- Load **all** occupied seats including `active=false`, read authoritative server time, call `evaluateRoomPresence`. Under the **same room lock**, set `deckverse.rooms.host_seat` only when changed and increment `presence_version` only on persistent transitions, not each heartbeat. Expose non-secret `room.hostSeat`, `room.presenceVersion`, `room.paused` and `players[].presence` in snapshots; do not expose token hashes/credentials. Use consistent room-first lock order in join, leave, sweeping and all mutations.
- Change `start/settings` to authorize `me.index === room.host_seat` *inside the transaction* and reject while host isn't online. Guard `select` with paused state and an explicit reconnect-friendly 409; remain faithful to engine `chooser`. Ensure ready/rematch/ack preserve existing game rule and freeze semantics.
- Refresh `rooms.expires_at` for healthy authenticated sessions with a reviewed minimum active TTL. Do not expire at the original default while an active participant is still inside recovery grace.
- An unlocked read-only `get` can **display** derived presence but must not persist a transfer. For a serverless idle room, only an approved DeckVerse-only scheduled worker can commit an owner transfer/expiration without incoming requests.
- Never replace an active player based on nickname or permit a disconnected seat to join again with a new token in a playing match. `leave` must keep transaction ordering, record `left_at` and avoid silently destroying guest sessions when lobby host exits.

**Client:**
- Replace every `me.index===0` host shortcut in lobby and battle; use `room.hostSeat` from server, but keep `game.chooser` independent.
- Foreground heartbeat cadence 15s; send an immediate heartbeat **before** first refreshed presence snapshot after visibility/network reconnect. Do not call leave on visibilitychange, pagehide, media-call failure or transient disconnect.
- Render online/grace/disconnected/unknown/left labels, reconnecting banner, host transferred notice and `room.paused` disabled turn controls, retaining visible cards/reveal history.
- Keep original session token on reconnect and never create a second occupied seat. Existing sessionStorage is a same-tab recovery mechanism only; full tab closure/reinstallation needs a separately reviewed secure token-persistence design.
- LiveKit audio/video failure is **not** evidence the card player disappeared.

**Atomic ordering:** BEGIN → SELECT room FOR UPDATE → authenticate member → refresh trusted heartbeat → SELECT entire roster → evaluate policy → commit host/version if necessary → authorize requested action/pause guard → COMMIT → return sanitized snapshot.

## Concurrency / cleanup analysis

- **Two simultaneous reconnects or tab retries:** both refer to the same authenticated player row/seat; PostgreSQL room-row locking serializes effects. DB `GREATEST` prevents heartbeat regression. `active=false` cannot be revived by a stale heartbeat. Shared tab tokens are not independently fenced; per-tab token rotation needs a separate threat/UX review.
- **Timeout vs heartbeat race:** if heartbeat takes the room lock first, no transfer; if timeout/election takes it first, later reconnection restores only the existing seat and does not confiscate host authority. Do not use a stale unlocked `get` to transfer ownership.
- **Many lost connections:** preserve battle and owner metadata; choose only online successors. If none exist, pause.
- **Idle cleanup:** only an explicitly authorized DeckVerse-scoped worker may inspect rooms using `FOR UPDATE SKIP LOCKED` and fresh, complete roster timestamps, then set `deckverse.rooms.expires_at` to now for rooms proven abandoned. This proposal does **not** delete room history, introduce jobs or alter live rows. Plan archival/privacy deletion separately.
- **Rollout:** first diagnostic read-only presence; then schema, heartbeat endpoint, expiry refresh, client UI and locked transfer; only then cleanup. Never apply cleanup to existing stale `last_seen_at` rows before client upgrade and migration verification.

## Verification / outstanding gates

15 deterministic Node tests exercise suspect/grace boundaries, same-session recovery, monotonic/repeated heartbeats, explicit leave, 2/3/4-player clockwise host election, former-host recovery, multiple disconnects, legacy timestamps, abandonment and simulated serialized update ordering. **They are pure unit tests, NOT a live PostgreSQL race test, deployed browser test or physical iOS/Android background/network proof.**

Connected Supabase Project Hub verification was attempted read-only: `SELECT hub.read_me_first();` returned PostgreSQL `42883: function hub.read_me_first() does not exist`. This conflicts with checked-in safety rules. No other database query, migration, data write, deployment or cross-project change was attempted. **Coordinator must resolve this environment/Hub prerequisite before migration approval.** Original role grants/RLS and live schema must be independently checked before running SQL. CI, server integration, lease races, real mobile recovery and IP/licensing release gates remain open. DV-03 is not fully fixed by the standalone Agent C PR.
