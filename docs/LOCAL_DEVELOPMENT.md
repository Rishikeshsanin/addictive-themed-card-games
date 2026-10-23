# Local development

> Verified against **`main` `73e933e76d333904bb71793018e8ae8d94a2c69a`** (2026-10-23). The public app has **Pokémon practice/online 1v1** and **12 local bot-playable themes**. The instructions below use only local code and do not connect to the live Supabase Hub.

## Prerequisites

- **Node.js 20 or newer** (see [package.json](../package.json)); npm.
- A modern browser with Web Crypto (`crypto.getRandomValues`) support.
- To run Playwright smoke tests: installed **Chrome/Chromium** and `CHROME_PATH` pointing to that executable. The project uses `playwright-core`, which does **not** install a browser automatically.
- Optional: Python 3, for the same local static server used in CI.

## Run the app

```bash
git clone https://github.com/Rishikeshsanin/addictive-themed-card-games.git
cd addictive-themed-card-games
npm install
npm run dev
```

Open **http://localhost:4173/** for the homepage, and **http://localhost:4173/themes/packs/** for the Theme Lab. The theme URL can be preselected with, for example, `/themes/packs/?theme=fantasy`.

`npm run dev` executes `npx serve . -p 4173`; the first use of `npx` may require installing the `serve` CLI. If you don't want that, use the CI-equivalent static server instead:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

**A local static server provides the fully playable browser-only experience:** Pokémon practice and the twelve expansion packs' 2/3/4-seat bot matches. It **does not** emulate Vercel's `/api/game` or `/api/livekit-token` functions. Online create/join, calling and authenticated remote room snapshots require a separately configured serverless deployment or an intentionally isolated development backend; do not point local experiments at production.

## Tests and diagnostics

Run these from the repository root (use a **second terminal** for browser checks; the server must stay running):

| Command | Verified script in the repository | Requires |
| --- | --- | --- |
| `npm test` | `node --test tests/*.test.js` | Node.js |
| `npm run balance` | `node scripts/balance.js` | Node.js |
| `npm run simulate` | `node scripts/simulate.js 2000` | Node.js; heuristic simulation, not real-user prediction |
| `npm run test:ui` | `node tests/ui-smoke.mjs` | Local server on `127.0.0.1:4173` + Chrome |
| `node --test tests/theme-packs.test.js` | Twelve-pack roster/rules validation (also included in `npm test`) | Node.js |
| `node themes/packs/qa/browser-smoke.mjs` | Theme Lab 320/390/768/1366px, roster and local battle smoke | Local server + Chrome |

Examples for setting Chrome's location (replace the sample path with the **actual** executable path on your computer):

```bash
# Linux/macOS
CHROME_PATH=/usr/bin/chromium npm run test:ui
# Windows PowerShell (example; change path to installed Chrome)
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:ui
```

Use `node --check src/app.js` (or another target JS file) for a quick syntax check. Screenshots written by existing browser QA scripts to `/tmp/` are testing artifacts, **not automatically licensed public marketing media**. Tests that import production-connected `tests/live-*.mjs` can create temporary real rooms; **do not execute them manually** as part of normal local onboarding.

## Environment variables and safe server setup

The [example file](../.env.example) lists only these **names**: `DECKVERSE_DATABASE_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

For browser-only work **none is needed**. Never copy production values, use a shared Project Hub admin or `service_role` connection, or expose an API secret in frontend JavaScript, test output or a screenshot. Use an isolated, explicitly authorized test database only when a specific backend task needs it. Environment variables are read by Vercel serverless handlers, not loaded automatically by `npm run dev`.

See [deployment notes](DEPLOYMENT.md), [Hub rules](../SUPABASE_HUB_RULES.md), [project operating rules](../AGENTS.md), and the [system diagram](ARCHITECTURE.md) before any backend-related contribution.

## Quick troubleshooting

- **Theme Lab assets 404:** serve the **repository root** and keep the `/themes/packs/` trailing slash; do not open `index.html` directly as a `file://` page.
- **Online room button unavailable locally:** expected on a static server; choose Pokémon practice or a solo theme instead of inserting production credentials.
- **Playwright cannot find Chrome:** install Chrome/Chromium and set `CHROME_PATH` as shown; `playwright-core` does not download a browser.
- **Port 4173 in use:** stop the existing server; the checked-in UI tests expect precisely `127.0.0.1:4173`.
- **Wrong feature comparison:** only the original Pokémon mode uses deployed private online 1v1. Expansion packs are offline local bot matches; draft V2 multiplayer PRs are not part of the current release.

To contribute a fix, follow [CONTRIBUTING.md](../CONTRIBUTING.md) and open a draft PR.
