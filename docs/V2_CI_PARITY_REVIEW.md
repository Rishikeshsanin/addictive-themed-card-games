# DeckVerse Round 4 — V2 CI Parity Review

**Agent:** B — test-only integration verification. **Status: seven/ seven workflow lanes passed on the initial parity PR code head `b0910f7db7e1b998027c9aa506975a8a7150710f`; still DRAFT / NOT production-approved.**  
**Exact parent:** `integration/deckverse-v2-theme-preview-20261020` at `c3d58abd7fcba152b92df1ffda57fedd4049c74e` (PR #31 head).  
**Test-only branch:** `agent/b-v2-ci-parity`. No runtime, API, rosters, LiveKit, migrations, production settings or real Supabase objects changed.

## Provenance: PR #29 vs PR #30 vs PR #31

| Candidate | Branch / head | Verified CI on **its own head** | Key distinction |
| --- | --- | --- | --- |
| [#29](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/29) | `integration/deckverse-v2-final-review` / `7c6ca7e3b613aa32fd700ef67b4c7b9b762aee25` | 6 successful workflow runs: core, presence, multiplayer PostgreSQL, rate-limit PostgreSQL, integrated PostgreSQL + mobile, PostgreSQL **17.6** schema parity | Most complete test coverage; **no seven-pack solo theme preview** |
| [#30](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/30) | `integration/deckverse-v2-final-rc-20261020` / `2b6f22352f9fd9d693cdf0d583df24f518f538da` | 3 successful runs: core, presence, multiplayer PostgreSQL | Staged A–E security/migration/presence/mobile fixes; left existing rate-limit/mobile workflow **branch filters** on older integration branch, and did not include PG17 workflow/fixture |
| [#31](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/31) | `integration/deckverse-v2-theme-preview-20261020` / `c3d58abd7fcba152b92df1ffda57fedd4049c74e` | 2 successful runs: core and theme packs | Child of #30; preserves V2 code and adds seven **experimental solo-only** themes, not theme-enabled authoritative multiplayer |

The discrepancy was a **coverage gap, not a known backend code regression**. Direct Git tree blob checks found the exact same SHA across **all three candidates** for:
- `api/game.js`: `6085dc132ad4d8877cd85375d3149ba942f7f0df`
- `src/server/rate-limit.js`: `c036732e4373399e0d4eb85ac7e73c294a0411b4`
- `src/presence.js`: `db678e3673f202380c9755ea291b9c7f40b0131f`
- Migrations 004, 005, 006: `b63803bbfcc2cf0f03990cd0722a9e1b4a92159e`, `dca8e8ca704980cf4586ba186b5e607d0d552f03`, `f7298022d709ef6f553a059ae6dd67c4d34daede`
- Core rate-limit PostgreSQL test, presence and multiplayer fixtures/tests also have matching blobs.

**LiveKit dock evidence:** The entire #29/#30 stylesheet (36,193 UTF-8 characters, blob `bd69a9fa89c1b761d945b966979786161764e2ef`) is a **byte-for-byte prefix** of #31's stylesheet (37,002 chars, blob `9e5add60611b0ce54f622976b113ff40c30908cc`). The 809-character suffix consists only of explicitly labeled theme-preview link CSS. The previously audited 768px expanded-dock overlay fix is preserved; original `tests/final-mobile-livekit.test.js` remains unchanged.

**Theme preservation:** #31's `themes/packs/**`, `tests/theme-packs.test.js`, `index.html`, `styles.css`, theme CI and rosters were not replaced, removed or rewritten. Themes remain isolated **solo preview** code, not unapproved online room mechanics. IP/character data still require separate rights review before public/commercial distribution.

## Parity changes in this PR (QA-only)

1. Recover `.github/workflows/db-postgres17-parity.yml` from verified #29. Target the **actual #31 branch** as well as its original release-hardening target. Reuse `tests/fixtures/pg17-v1-deckverse.sql` with the exact verified #29 blob SHA `7b3eb4276e28bc324608e4bc7beafdffa05543bb`. GitHub Actions PostgreSQL image pinned to `postgres:17.6` checks the actual version, migration 004/005/006 **twice**, historical row digest, 2P/3P capacity and RLS, then restores the pre-migration synthetic backup into a new disposable DB.
2. Restore #29's verified `.github/workflows/db-rate-limit-check.yml` rate-limit concurrency job. Add the #31 PR target to the branch filter; its isolated PostgreSQL 16 test performs **200 simultaneous quota attempts**, eight pools, SQL-based authentication/room-code and LiveKit *synthetic* quota cases, 429 and expiry/index/cleanup coverage.
3. Restore #29's verified `.github/workflows/db-integration-mobile-check.yml` (PostgreSQL 16 TLS + actual HTTP + synthetic browser/mobile + fake LiveKit lifecycle); add the #31 branch to its PR target filter.
4. Preserve existing #31 `.github/workflows/db-multiplayer-check.yml`, `.github/workflows/db-presence-check.yml` and `.github/workflows/theme-packs.yml` tests intact, adding a path trigger for **this review document** to ensure that the complete suite runs on this QA-only PR.
5. Add the same doc trigger to the three recovered/extended workflows. The core `.github/workflows/ci.yml` has an unfiltered `pull_request` trigger and requires no change.

No test was silenced or skipped to achieve parity. The source files and application configuration were not modified. Existing PR #29 runs are **historical** evidence and are not claimed as passes on this combined theme-preview head.

## Seven-job fresh CI gate

| Required GitHub Actions workflow | What it proves | Current PR result |
| --- | --- | --- |
| DeckVerse CI | 106/106 Node unit tests, classic/multiplayer simulations, Chrome/client, synthetic media regressions | **[PASS #39479143143](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39479143143)** |
| DeckVerse PostgreSQL 17.6 schema parity | `server_version_num=170006`, V1 fingerprint, twice-replayed 004/005/006, RLS, 2P/3P capacity, restore into new DB | **[PASS #39479143420](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39479143420)** |
| DeckVerse disposable PostgreSQL rate-limit QA | 200 concurrent SQL calls from eight pools, 31 admitted / 169 denied, 11/11 tests, 361 same-IP polls admitted, expiry/index/cleanup | **[PASS #39479143265](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39479143265)** |
| DeckVerse isolated DB + mobile integration QA | 2/3/4 player rooms, live DB/local HTTP, expanded dock controls unblocked, synthetic media, offline/resume, HTTP 429 | **[PASS #39479143336](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39479143336)** |
| Disposable DB presence validation | 20/20 tests, SQL presence/host/reconnect invariants | **[PASS #39479143586](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39479143586)** |
| DeckVerse disposable PostgreSQL multiplayer QA | Full two/three/four-player HTTP+SQL matches, browser secrecy, concurrency and 2 match epochs per size | **[PASS #39479143725](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39479143725)** |
| DeckVerse Theme Packs QA | 7/7 unit tests and Chrome at 320, 390, 768 and 1366px for seven solo packs | **[PASS #39479143148](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39479143148)** |

Success requires these runs to finish **on the parity branch head or its pull-request merge commit** with no unexpected skips; GitHub action success alone is not proof of production Vercel, real LiveKit cloud, physical phones or Hub configuration.


### Actual fresh-run findings

- **PG17 release rehearsal:** 004, 005 and 006 each applied **twice** to disposable PostgreSQL 17.6, preserved a synthetic legacy V1 fingerprint, rejected an illegal seat-2 join in a two-seat room, accepted a valid third seat in a three-player room, and restored the pre-migration backup to an independent new database. The expected SQL error for the rejected seat is a **passing negative test**, not a CI failure.
- **Durable limiter:** 200 attempts, 8 pools/24 maximum connections, 31 admitted, 169 rejected and one persisted counter capped at 31; burst p95 161.93ms including pool contention. Four friends behind one IP completed 361 polls with 0 denials (SQL limiter p95 0.96ms). RLS/permissions, 429 and Retry-After, malformed/forged IP protections, bounded 700-row cleanup and 12K-row expiry-index selection all passed.
- **Integrated PostgreSQL + mobile:** synthetic browsers at 320/390/768/1366 widths exercised 2/3/4-player room flows and reconnect. Expanded LiveKit panel at 390px produced zero blocked controls; calling uses **fake** media/SDK credentials, not production LiveKit. API create quota returned 429 with Retry-After in a synthetic browser test.
- **Multiplayer:** real local HTTP against disposable PostgreSQL ran completed games and rematches for 2/3/4 players, concurrency and host recovery. The final HTTP test reported 954 API calls and six complete matches, with no failed tests. Core CI included 106 passing unit tests; presence 20, themes 7.
- **No unexpected failures** were observed in the seven required workflows. No test step or existing CI assertion was disabled. Runner timing values are neither production throughput claims nor physical-phone evidence.

**Evidence snapshot note:** Those seven GitHub Actions links test the source and QA changes at commit `b0910f7db7e1b998027c9aa506975a8a7150710f`. This annotation-only document update does not change the tested workflows or runtime. Its own subsequent PR head must also show green checks before coordinator consolidation.
## Safety / release recommendation

1. **Preferred consolidated development baseline:** PR #31's branch **plus this QA-only parity PR**, conditional on seven actual green workflows and confirmation that it still contains all original theme and runtime blob IDs. Prefer this over #29 alone because #29 lacks the preview themes; prefer over #30/#31 alone because they lack the verified full CI matrix.
2. **NO production deployment or Hub migration authorization.** Read `AGENTS.md`, `SUPABASE_HUB_RULES.md` and `docs/DB_FINAL_RELEASE.md`. SQL and synthetic roles in GitHub ephemeral containers must not be run on connected Supabase. Real Postgres roles/grants/backup restoration, single-app Hub resource registration, deployment proxy trust, 429/503 behavior and LiveKit devices remain staged release gates requiring explicit approval.
3. Ensure original Pokémon multiplayer remains backward compatible; the seven themed packs are **not** backend multiplayer. Agent E's expanded dock and UI hit-testing continue under the existing core/mobile checks.
4. A successful CI matrix is a **review gate only**, not a signoff to merge the upstream draft integration PRs or change the production Project Hub.
