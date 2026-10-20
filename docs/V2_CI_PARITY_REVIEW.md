# DeckVerse Round 4 — V2 CI Parity Review

**Agent:** B — test-only integration verification. **Status: review-only / pending fresh CI at the initial document commit.**  
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
| DeckVerse CI | Unit rules, 2K seeded games, 3/4 simulations, Chrome/client, synthetic media regression | **Pending** |
| DeckVerse PostgreSQL 17.6 schema parity | Historical V1 preservation, 004/005/006 rerun, app scope/RLS, pre-migration restore | **Pending** |
| DeckVerse disposable PostgreSQL rate-limit QA | Real SQL 200-way concurrency, spoofed identities, throttling, sharing, cleanup | **Pending** |
| DeckVerse isolated DB + mobile integration QA | Real HTTP/DB and synthetic Chrome mobile/audio permissions | **Pending** |
| Disposable DB presence validation | Schema, heartbeat/host transfer, recovery, RLS | **Pending** |
| DeckVerse disposable PostgreSQL multiplayer QA | 2P/3P/4P full HTTP+SQL and mobile browsers | **Pending** |
| DeckVerse Theme Packs QA | Seven experimental solo theme inventories/engine/desktop+mobile browser | **Pending** |

Success requires these runs to finish **on the parity branch head or its pull-request merge commit** with no unexpected skips; GitHub action success alone is not proof of production Vercel, real LiveKit cloud, physical phones or Hub configuration.

## Safety / release recommendation

1. **Preferred consolidated development baseline:** PR #31's branch **plus this QA-only parity PR**, conditional on seven actual green workflows and confirmation that it still contains all original theme and runtime blob IDs. Prefer this over #29 alone because #29 lacks the preview themes; prefer over #30/#31 alone because they lack the verified full CI matrix.
2. **NO production deployment or Hub migration authorization.** Read `AGENTS.md`, `SUPABASE_HUB_RULES.md` and `docs/DB_FINAL_RELEASE.md`. SQL and synthetic roles in GitHub ephemeral containers must not be run on connected Supabase. Real Postgres roles/grants/backup restoration, single-app Hub resource registration, deployment proxy trust, 429/503 behavior and LiveKit devices remain staged release gates requiring explicit approval.
3. Ensure original Pokémon multiplayer remains backward compatible; the seven themed packs are **not** backend multiplayer. Agent E's expanded dock and UI hit-testing continue under the existing core/mobile checks.
4. A successful CI matrix is a **review gate only**, not a signoff to merge the upstream draft integration PRs or change the production Project Hub.
