# Changelog

## Unreleased

- New look: cute pastel theme (sky blue, pink, cream yellow, lavender), rounded Nunito / Fredoka fonts, candy-stripe progress bars, emoji labels instead of `[+]`-style text. The site is now called Trickster Companion.
- Light / Dark mode with an Auto setting that follows the device; the choice is remembered.
- Faded background art behind the page (on by default on desktop, off on phones to save data); can be switched on or off.
- Text contrast meets WCAG AA in both themes; no sideways scrolling on phones.
- Quest data moved out of `index.html` into `data/quests/*.json` (schema v2: typed objectives, prerequisites as quest ids), plus `data/npcs.json` and `data/images.json`. The app looks and behaves the same, and saved progress carries over.
- `scripts/validate.js` checks the data; `scripts/serve.js` runs the app locally.
- Branching rules: `dev` / `main` with `feature/`, `fix/`, `data/`, `docs/`, `chore/` work branches, merged locally without pull requests (see `CLAUDE.md`).

## 0.1.0 (2026-11-11): First public version

- Quest tracker for Episode 0 – Episode 1 and regional quests, published on GitHub Pages.
