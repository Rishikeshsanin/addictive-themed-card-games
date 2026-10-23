## What changed

<!-- Concise user impact. Link the issue (#123) and explain the current shipped behavior. -->
Closes / relates to: #

**Mode affected:** <!-- Pokémon online 1v1 / Pokémon practice / local 12-pack solo bots / docs only -->

## Scope and source

- [ ] Change is restricted to the linked issue's authorized paths; no unrelated gameplay or infrastructure changes
- [ ] Exact **base** ref/SHA: `...`
- [ ] Exact **head** ref/SHA: `...`
- [ ] Existing deployed functionality is described accurately (no claim of 13-theme online multiplayer)

## Actual verification

| Executed command or workflow | Result | Evidence link / limitation |
| --- | --- | --- |
| `npm test` (if applicable) | Pass / fail / not run | |
| Local UI / pack browser smoke (if applicable) | Pass / fail / not run | |
| Other scoped checks | Pass / fail / not run | |

<!-- Do not claim physical devices, production authorization, or browser execution from source review alone. -->

## Evidence and accessibility

- [ ] Any included screenshots are from genuine UI states, or clearly labeled **original illustrations**
- [ ] No room codes, player tokens, personal details, private links or secrets exposed
- [ ] Any media has source/rights notes; no new unlicensed character or athlete likeness images
- [ ] Relevant keyboard, contrast, 320/390px overflow and text legibility considered
- Screenshots / provenance (or `N/A`):

## Risk, release and rollback

**What could regress?** <!-- storage, API secrets, auth/hidden cards, performance, mobile, player state -->

**Rollback plan:** <!-- revert this PR or scoped release commit; NEVER unilaterally roll back shared Hub data -->

- [ ] No unapproved changes to Supabase, Vercel, LiveKit, shared Project Hub, or other applications
- [ ] If schema/DB/auth/API modifications exist, separate DeckVerse-only migration, owner approval, backup/restore and scope/RLS review are documented; otherwise **N/A**
- [ ] No credentials or private production data were added or used
- [ ] Draft PR opened for review; no auto-merge or branch deletion

## Reviewer focus

<!-- List 1–3 things to verify, any conflicts with existing draft PRs, and what is intentionally not included. -->
