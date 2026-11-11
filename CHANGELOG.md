# Changelog

## Unreleased

- Quest data moved out of `index.html` into `data/quests/*.json` (schema v2: typed objectives, prerequisites as quest ids), plus `data/npcs.json` and `data/images.json`. The app looks and behaves the same, and saved progress carries over.
- `scripts/validate.js` checks the data; `scripts/serve.js` runs the app locally.
- Branching rules: `dev` / `main` with `feature/`, `fix/`, `data/`, `docs/`, `chore/` work branches, merged locally without pull requests (see `CLAUDE.md`).

## 0.1.0 (2026-11-11): First public version

- Quest tracker for Episode 0 – Episode 1 and regional quests, published on GitHub Pages.
