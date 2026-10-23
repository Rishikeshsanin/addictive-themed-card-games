# Contributing to DeckVerse

**Old-school rivalry. New-school magic.** DeckVerse is an existing, playable card-battle project, not a greenfield starter. Small, verified contributions that protect the shipped experience are welcome.

> [!IMPORTANT]
> **Know the two game paths:** Pokémon Classic has solo practice and existing online **1v1** rooms. The other **12** theme packs are local player-versus-bots experiences (2, 3 or 4 seats); they do **not** have deployed online multiplayer. Pack comparison scores are editorial gameplay ratings, not official franchise or sports statistics.

## Get oriented

Start with the [architecture map](docs/ARCHITECTURE.md), [local development guide](docs/LOCAL_DEVELOPMENT.md), and [repository operating rules](AGENTS.md). Database or deployment proposals must also read [Project Hub boundaries](SUPABASE_HUB_RULES.md) and the [deployment runbook](docs/DEPLOYMENT.md). Observe the current `main` branch, not unmerged V2 drafts, when describing public functionality.

## First contribution

1. Open or select a focused issue. Reproduce the behavior on the latest `main`; note theme, **solo/online** mode, desktop/mobile viewport and expected versus actual result. **Never attach room codes, tokens, private URLs or credentials.**
2. Create a short-lived branch from the latest `main`, e.g. `fix/accessibility-card-label` or `docs/dev-onboarding`; do not develop directly on `main`.
3. Make only the change your issue authorizes. Keep existing Pokémon multiplayer, hidden decks, roster ordering, session privacy, 50/60/80-card conservation, and rank's **lower-wins** rule intact.
4. Run the relevant commands from [Local development](docs/LOCAL_DEVELOPMENT.md). For JavaScript/rules changes, run `npm test`. For browser changes, serve locally and run `npm run test:ui`; for pack changes, also run `node --test tests/theme-packs.test.js` and the Theme Lab browser smoke when Chrome is available. Record exactly what ran and what could not run.
5. Open a **draft pull request** linking the issue. Include before/after behavior, screenshots **only when authentic and rights-safe**, executed tests and results, risks, rollback plan, and exact source/target SHAs. Request review; do not merge your own change without the project owner's sign-off.

## Coding and review standards

- Keep the existing plain **HTML/CSS and browser-native ES modules**. The project uses Node tooling; it is *not* a React/Next.js app.
- Keep each theme's **eight comparisons** consistent: rank selects the smallest value, all other axes select the largest. Deal 50 cards for two seats, 60 for three, 80 for four.
- Do not let clients submit authoritative card values, shuffled deck orders, opponents' hidden cards or privileged database actions.
- Favor accessible labels, semantic controls, keyboard usability and readable contrast; test the 320px and 390px breakpoints.
- Keep API/database code, deployments, migrations and secrets out of incidental UI/documentation PRs. **Any** DeckVerse database change requires a separate scoped migration and explicit owner approval; never test against the real shared Hub.
- Add/maintain automated regression checks and avoid unverified claims such as “lag-free” or “fully tested on devices”.

## Artwork, media and privacy

Fan themes reference third-party properties. **The repository does not establish a redistribution or commercial license for character art, names, posters, athlete likenesses or logos.** Prefer original abstract graphics, or content for which you can document ownership/permission. Never import artwork just because a remote URL renders in the browser. Clearly distinguish an *original illustration* from a *real application screenshot*. Scrub room codes, player names, session tokens, URLs with parameters and personal information. The separate visual-media workstream will provide a media provenance guide; do not link to or imply it is merged until the coordinator integrates its PR.

## Pull request hygiene

Use the repository PR template when available, explain any feature-flag/deployment dependency, and keep unrelated files out of the diff. Unmerged V2 database and eight-theme online experiments are **not** production claims. Protect historical work: never force-push, delete branches, close existing PRs or alter GitHub settings as part of a routine contribution.

Questions and proposed enhancements belong in an issue first. Thanks for helping the nostalgia feel modern without breaking the game.
