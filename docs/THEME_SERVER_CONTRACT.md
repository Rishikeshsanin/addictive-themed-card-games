# DeckVerse — Server-Authoritative Theme Registry Contract (Round 4 / Agent C)

**Status:** Server-only foundation and isolated contract tests. **NOT** wired into `api/game.js`; **NOT** evidence of live multiplayer for non-Pokémon themes. Do not merge/deploy before the coordinated review, 007 migration rehearsal and release gates.

**Pinned base:** `integration/deckverse-v2-theme-preview-20261020`, commit `c3d58abd7fcba152b92df1ffda57fedd4049c74e`.

## Inventory and strict policy

| `theme_id` | Name | Comparisons (first is low-wins; the rest high-wins) |
| --- | --- | --- |
| `pokemon` | Pokémon | rank, height, weight, attack, defense, speed, energy, hp |
| `avengers` | Avengers Saga | rank, strength, combat, defense, speed, intellect, energy, endurance |
| `ben10` | Ben 10 Alien Clash | rank, strength, speed, durability, intellect, technology, versatility, energy |
| `shinchan` | Shin-chan Chaos | rank, mischief, comedy, courage, imagination, friendship, speed, luck |
| `dc` | DC Legends | rank, strength, combat, defense, speed, intellect, energy, endurance |
| `naruto` | Naruto Shinobi Clash | rank, chakra, taijutsu, ninjutsu, genjutsu, speed, strategy, endurance |
| `cricket` | Cricket Legends | rank, batting, bowling, fielding, leadership, clutch, consistency, athleticism |
| `fantasy` | Elemental Realms | rank, might, agility, defense, magic, wisdom, stamina, versatility |

All themes have one **server-approved, immutable** `50/60/80` unique-card manifest for 2/3/4 participants, dealing `25/20/20` cards per seat. The seven Theme Lab packs are read from committed source code `themes/packs/index.js`, **never** downloaded or accepted from request JSON. The 80 selected Pokémon multiplayer IDs are read from the original `src/catalog.js` manifests, preserving their exact order; the full older Pokémon catalog and deployed engines are not changed. Exposes only the supported IDs; no dynamic filename loading or arbitrary theme object lookup.

Bootstrap validation fails closed before a theme can be used: eight unique category keys; rank exactly first and `min`; seven other categories `max`; unique positive integer card IDs, display names, ranks, complete finite nonnegative scores, exact manifest lengths, all manifest IDs found in the registry, no duplication. Unique ranks guarantee deterministic sudden-death tie resolution. The test validator supports synthetic invalid manifests independently of the bundled pack data.

The registry's public methods return deeply immutable metadata/manifest/card values **inside the server**. They are not endpoints. Never serialize a full manifest with active hand ordering, cards-by-ID maps, game state, raw deck or opponent upcoming cards to a browser. Browser output should contain only player count, public category labels, owned top card and last-revealed played cards.

## Proposed server API (implemented in modules, not HTTP-wired)

`src/server/theme-registry.js`
- `ALLOWED_THEME_IDS` and `requireThemeId(themeId,{allowMissing})`: only exact case-sensitive IDs; missing CREATE ID -> `pokemon` for backward compatibility; unsupported IDs rejected. No `__proto__` or constructor tricks.
- `themeIdForRoom(room)`: `room.theme_id ?? 'pokemon'` ONLY for legacy rooms. If nonempty/unsupported DB value, fail closed.
- `requireSameRoomTheme(room,proposed)`: forbid a theme change via JOIN, REMATCH or client reuse. Compare against room-locked persisted DB theme.
- `requireCreateTheme(body)`: accept `themeId` **only** as the theme selector. Reject client-supplied `cards`, `deck`, `decks`, `deckOrder`, `stats`, `categories`, `manifest`, `seed`, `picker`, `chooser`, `scores` and analogous scoring attributes.
- `getServerTheme(themeId)`: immutable metadata and eight comparison directions (not mutable external category values).
- `getServerManifest(themeId,playerCount)`: immutable list of server-approved identities, not a shuffled hand.
- `getServerCard(themeId,id)`: server-side identity and scores, to build authorized owned-card/reveal views only.
- `serverCompare(themeId,leftId,rightId,categoryKey)`: server-side stat resolution, rank min only, all others max.
- `validateThemeDefinition(definition)`: explicitly exercised with corrupt synthetic fixture data.

`src/server/theme-match.js`
- `startServerThemeMatch({themeId,playerCount})`: choose server-approved manifest, unbiased secure `secureIndex` shuffle and secure opening chooser, create correct 2/3/4 seat hands. The optional test-only `picker`/`chooser` injection **must never map client JSON fields into these arguments**.
- `takeServerThemeTurn(savedState,authenticatedSeat,categoryKey,{roomThemeId})`: first validate the persisted theme/manifest/card conservation; select only a category key from the stored server registry; no client score/order, no turn from wrong seat.
- `validateServerThemeMatch(state,storedThemeId)`: reject cross-theme saved-state mismatch, missing/duplicate/foreign cards, impossible lengths and format mismatch.
- `themeViewFor(state,authenticatedSeat,{roomThemeId})`: hide all unrevealed opponents' cards and deck order. Last revealed cards remain public; only authenticated player's current top card contains full current stats.
- For `pokemon` the module delegates **exactly** to the existing V2 `newGame/startMultiGame/takeTurn/multiTurn/viewFor/multiViewFor` paths; the serialized game-state shape is unchanged, preserving existing historical 2P rooms.
- For the seven expansions it mirrors the relevant 2P and 3/4P V2 state machine: same chooser, strict expected-chooser action, lower-rank comparison, 2P two-consecutive-tie caller switch, pooled tie jackpot, top-card winner ordering, multi-way tie rotation, elimination and decisive rank sudden death. `status`, `last`, player deck/pot conservation, and safe views are validated per turn.

## Exact next-stage coordinator API wiring plan

The coordinator should do these in order, **in a separate shared-file PR** (Agent C does not edit `api/game.js`, `src/app.js` or migrations):

1. **Migration 007 owner (Agent A):** On *disposable PostgreSQL* rehearse `deckverse.rooms.theme_id TEXT NOT NULL DEFAULT 'pokemon'` with CHECK restricting exactly `pokemon,avengers,ben10,shinchan,dc,naruto,cricket,fantasy`. Existing 2P rooms must remain `pokemon` with unchanged IDs, cards, host/expiry and session hashes. Do not run against the real Project Hub without separate explicit approval; protect immutability at DB and locked API layer, including rematches. No cross-app tables.
2. **CREATE transaction:** Extract just `themeId=requireCreateTheme(body)` (leave omitted theme as `pokemon`); insert `theme_id` alongside room fields under existing rate limits and room transaction. Do not pass body-supplied deck/chooser/stats to the match initializer. Return `themeId` as explicit room metadata.
3. **JOIN/READY/HEARTBEAT:** Load the locked persisted room and `themeIdForRoom(room)`. Reject attempts to change `themeId` with `requireSameRoomTheme`. Never infer a room theme from a nickname, URL or current UI selection. Preserve existing token-hash seat authorization, 15s heartbeat and room-first locks.
4. **START:** Inside the already locked `deckverse.rooms FOR UPDATE` transaction, with current-host/ready/roster enforcement, call `startServerThemeMatch({themeId:themeIdForRoom(room),playerCount})` **without injection**. Save the entire authoritative state **only in** `deckverse.rooms.state`, with appropriate theme marker and match number. Keep legacy Pokémon state serialization unchanged.
5. **SELECT:** Verify authenticated chooser, `expectedRound`, reveal lock and current presence/paused state in the same transaction; reject arbitrary `categoryKey` using the room's theme category registry. Call `takeServerThemeTurn(state,me.index,requestedKey,{roomThemeId:themeIdForRoom(room)})`. Persist its returned state, reveal deadline and no client-provided scores.
6. **SNAPSHOT:** In existing consistent MVCC statement, derive `themeId` from persisted room and use `themeViewFor(state,authenticatedSeat,{roomThemeId})` for current/last visible cards. Publish only `room.themeId`, `theme.categories` and sanitized view; never the manifest, full state, cardById map, session token hashes, or the other players' top cards. Legacy state has no `themeId` and remains Pokémon.
7. **REMATCH:** Check match-number freshness, unanimous approval, original roster and existing host transfer rules. Persist the *same* `theme_id`; call `startServerThemeMatch({themeId:themeIdForRoom(room),playerCount})` under the lock; reset turn/reveal metadata exactly as current V2 implementation. Reject client theme mutation and mismatched persisted theme.
8. **CI gates:** Test real HTTP and disposable PostgreSQL across all 8 × 2/3/4, reconnection and lost host, ties/sudden death, 50/60/80 card conservation, concurrent rounds/rematches, observer redaction and 2P legacy regression. Verify 007 idempotence and rollback, then request separate migration approval and physical iOS/Android QA before deployment.

## Known limitations and intellectual property

The Theme Lab ratings are partly generated, subjective prototypes; they are **not** established sports statistics, canonical franchise combat measurements, or fully balanced/peer-reviewed scores. Naruto, Ben 10, DC, Avengers, Shin-chan and many names/likenesses remain third-party or publicity-rights restricted; commercial/public licensing is **not** granted. Separate fairness analysis and rights review are required. These modules do **not** establish actual joined online rooms, PostgreSQL 007 enforcement, synchronized reveal UI for expansion stats, WebSocket/live sessions or end-to-end multiplayer. This foundation alone is not production-ready.

## Test evidence

`node --test tests/theme-server-contract.test.js` exercises 8-theme registry policy, 24 authoritative manifests, 2/3/4 match contracts, legacy Pokémon parity, tie/jackpot and privacy regression, and malformed-input rejection. The existing `npm test` includes all `*.test.js` including this suite when CI runs. Record the verified run URL and outcomes before claiming pass; do not invent tests, screenshots or deployments. No real database access is needed or performed by this branch.
