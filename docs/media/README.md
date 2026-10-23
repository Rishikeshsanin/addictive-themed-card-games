# DeckVerse media gallery — originals and capture provenance

**Gallery update:** 2026-10-23. **Source reviewed:** `main` at `73e933e76d333904bb71793018e8ae8d94a2c69a`. **Palette:** deep black / midnight indigo, electric lime and neon violet. This PR contains **two original SVG illustrations plus four genuine CI browser screenshots**. The SVGs are not screenshots.

The product itself currently has **Pokémon Classic online 1v1 + practice**, **12 expansion packs with local 2/3/4-seat bot battles**, and a PWA. The eight stat categories are theme-specific, with **Rank lower-wins** and other comparisons **higher-wins**. No claim of 13-theme online multiplayer is made.

## Media in this PR

| Preview | File / dimensions | Provenance | Accessible alt-text proposal |
| --- | --- | --- | --- |
| ![Original neon DeckVerse collectible card artwork; not a game screenshot](deckverse-editorial-hero.svg) | [`deckverse-editorial-hero.svg`](deckverse-editorial-hero.svg), **1440 × 810** vector | Newly authored geometric card silhouettes, original lettering and brand treatment. No copied characters or third-party logos. **Editorial illustration only.** | “Original DeckVerse neon brand illustration with abstract collectible cards and the words Old-school rivalry, New-school magic.” |
| ![Original three-step comparison-rules diagram; not a game screenshot](deckverse-how-it-works-original.svg) | [`deckverse-how-it-works-original.svg`](deckverse-how-it-works-original.svg), **1440 × 720** vector | Newly authored cards and arrows explaining deck choice, rank/other stat comparison, and winnings. **Instructional illustration only.** | “Original three-step DeckVerse rules infographic: pick a deck, call one of eight stats, and claim cards; Pokémon online 1v1, expansions local bot matches.” |

Both graphics have `title` and `desc` elements for accessibility, intrinsic dimensions, live text, no embedded images and no external network dependencies. They are SVG deliberately: as original author-controlled scalable designs, they avoid bloating Git history with raster assets and remain crisp at 320px / 390px / desktop **when embedded responsively**. Do not confuse graphic responsiveness with verified live app screenshots.

### Rights and attribution

- These specific **abstract geometric illustrations were created for the DeckVerse repository** and do not include external logos, Pokémon sprites, comic/anime characters, athlete faces or stock images.
- This statement applies to **these two SVGs**, not to the app's existing third-party franchise posters, source images, character names or trademarks. The owner must separately review content rights for wider publication and commercial use.
- The text on illustrative cards is conceptual, not a screenshot or a claim that those exact cards/scores exist in the application. No character power/athletic statistics appear.
- Do not edit out the **“NOT A GAMEPLAY SCREENSHOT”** footer when sharing outside the repository.

## Verified authentic browser screenshots — GitHub Actions

**Real captures have now been recovered and inspected.** These are **not mockups**. Existing CI used Chromium against the repository's local static server, producing authentic DeckVerse UI screenshots. They were collected from GitHub Action ZIP artifacts, not from live private player rooms.

| Capture | Original filename | Actual viewport / image pixels | Provenance |
| --- | --- | --- | --- |
| Twelve-theme desktop selector and collection | `deckverse-theme-lab-1366.png` | **1366 × 7829** full-page image, 1366px viewport | [Theme Packs CI run 39833945097](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39833945097), merged Wave 2 source SHA `a2a920ac43d4d73dd16dbd37124dd7239a4cc35d` |
| Theme Lab responsive layout | `deckverse-theme-lab-390.png` | **390 × 15836** full-page image | Same Theme Packs CI run; Chrome browser smoke |
| Small-screen responsive layout | `deckverse-theme-lab-320.png` | **320 × 16343** full-page image | Same Theme Packs CI run; Chrome browser smoke |
| Pokémon Classic solo battle | `deckverse-battle-mobile.png` | **390 × 988** image | [DeckVerse CI run 39937836608](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39937836608), current `main` source `73e933e76d333904bb71793018e8ae8d94a2c69a` |

**Get the actual files:** open [Theme Packs CI 39833945097](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39833945097) → **Artifacts** → `theme-packs-chrome-preview`. For the real classic battle and homepage capture, open [DeckVerse CI 39937836608](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39937836608) → **Artifacts** → `deckverse-browser-screenshots`. GitHub may require you to sign in, and CI artifacts have a retention limit.

## Real gameplay screenshots — optimized WebP gallery

These **four images are now committed** under [`docs/media/screenshots/`](screenshots/), and come from **actual Chromium browser tests**, not generated artwork or reconstructed interface designs. They are cropped/optimized from retained CI screenshots, **not** captured from private live rooms.

| Screenshot | Authentic UI preview | Image details |
| --- | --- | --- |
| **Theme Lab — desktop** | ![Genuine DeckVerse Theme Lab desktop layout at 1366px, captured by automated browser QA](screenshots/theme-lab-desktop-1366.webp) | [Open image](screenshots/theme-lab-desktop-1366.webp) · **1366 × 1570** · **115,872 bytes** · [Theme CI #39833945097](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39833945097) |
| **Theme Lab — 390px mobile** | ![Genuine DeckVerse Theme Lab 390px mobile layout, captured by automated Chromium](screenshots/theme-lab-mobile-390.webp) | [Open image](screenshots/theme-lab-mobile-390.webp) · **390 × 1770** · **59,478 bytes** · [Theme CI #39833945097](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39833945097) |
| **Theme Lab — 320px mobile** | ![Genuine DeckVerse Theme Lab narrow 320px screen layout from Chromium browser tests](screenshots/theme-lab-mobile-320.webp) | [Open image](screenshots/theme-lab-mobile-320.webp) · **320 × 1420** · **40,188 bytes** · [Theme CI #39833945097](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39833945097) |
| **Classic Pokémon practice** | ![Real DeckVerse Pokémon Classic mobile practice round with one character-image area deliberately redacted](screenshots/classic-practice-mobile-redacted.webp) | [Open image](screenshots/classic-practice-mobile-redacted.webp) · **390 × 988** · **27,050 bytes** · [Classic CI #39937836608](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39937836608) · **third-party artwork area redacted** |

**Exact capture provenance:** Theme Lab from source `a2a920ac43d4d73dd16dbd37124dd7239a4cc35d` on 2026-10-22, [workflow #39833945097](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39833945097), originals `deckverse-theme-lab-1366.png` (1366×7829), `deckverse-theme-lab-390.png` (390×15836), `deckverse-theme-lab-320.png` (320×16343). Crops emphasize the real page's legible content rather than unrelated vertical whitespace. Classic practice from current `main` baseline `73e933e76d333904bb71793018e8ae8d94a2c69a`, October 23, [workflow #39937836608](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39937836608), original `deckverse-battle-mobile.png` (390×988). Optimized to WebP using original screenshot pixels, without adding UI elements. The Classic capture masks a third-party character-art region with an opaque redaction. **The redaction is intentional and not part of the application.**

The four stored WebP files are real screenshot evidence, **not a license grant**. The Theme Lab images may still show existing third-party fandom poster art or names, so **human rights review is required before use outside the repository**. Do not relabel them as rights-cleared commercial artwork. The original full PNGs remain retrievable through the CI artifacts linked above, subject to retention. No room secrets, private room codes or personal player identifiers were introduced by this repository gallery.

### Reproduce fresh screenshots locally

The optional [local capture helper](../../scripts/capture-repo-gallery.mjs) visits the **original Elemental Realms** Theme Lab (no copied character poster art), launches a local bot battle, and captures the actual game panel at **1440, 390 and 320px**. It checks all eight stat controls, browser errors and horizontal overflow. The helper requires a server on `127.0.0.1:4173` and installed Chromium; **it has not been run as part of this PR**.

```bash
npm install
# Terminal 1 (repository root):
npm run dev
# Terminal 2 (adjust browser path):
CHROME_PATH=/usr/bin/chromium node scripts/capture-repo-gallery.mjs
```

Alternative server: `python3 -m http.server 4173 --bind 127.0.0.1`. Browser support is provided by `playwright-core`; Chromium/Chrome must already exist.

**For new captures:** inspect crop legibility at 320/390px, redact person/room identifiers and third-party artwork when possible, optimize to WebP, and record capture source SHA/run and dimensions. Never manufacture “gameplay” using an image editor.

## Honest verification and outstanding gaps

- **Verified in source:** packaged themes and HTML/CSS, screenshot capture selectors from `themes/packs/qa/browser-smoke.mjs`, package scripts, original two-player API, and exact `main` baseline.
- **Authored here:** 2 original SVG images, a reproducible local screenshot helper, and 4 optimized, genuine browser-test WebP images; no application or database code changed.
- **Verified from retained CI artifacts:** authentic desktop, 390px and 320px full-page Theme Lab screenshots; a 390px classic solo battle screenshot. Source images and run IDs above are real. Optimized WebP review files are **committed to `docs/media/screenshots/` and embedded above**. **Not verified:** direct live Vercel capture, running the optional new helper, physical phone behavior or rights clearance for third-party franchise art.
- **Integration:** issue [#52](https://github.com/Rishikeshsanin/addictive-themed-card-games/issues/52) owns these assets; [showcase PR #51](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/51) owns `README.md`. The coordinator can choose which original artwork to link after reviewing final previews; this agent does **not** edit that README.

> **Production feature accuracy:** Twelve expansion theme solo bot matches do not use the existing Pokémon online 1v1 room API. Existing IP questions remain unresolved for third-party franchise packs.
