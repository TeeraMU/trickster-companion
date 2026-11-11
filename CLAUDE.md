# Trickster Companion: working rules

A fan-made quest tracker and farming helper for Trickster Online, served as a static site on GitHub Pages.
The roadmap is in `IMPROVEMENT_PLAN.md` (Thai). UI text and data are in English.

## Branches (git flow, solo)

- Two long-lived branches:
  - **`dev`** (the default branch): finished work combined and tested together.
  - **`main`**: only what's released. **GitHub Pages deploys from `main`**, so the live site
    (https://teeramu.github.io/trickster-companion/) changes only when we release.
- Work branches are named by **what kind of change** they are:

  | Prefix | For | From | Merge into |
  |---|---|---|---|
  | `feature/` | new behaviour (`feature/map-priority`) | `dev` | `dev` |
  | `fix/` | a bug in `dev` (`fix/cycle-counter`) | `dev` | `dev` |
  | `refactor/` | code moved or tidied, no behaviour change (`refactor/split-quest-data`) | `dev` | `dev` |
  | `data/` | quest / map / monster / item data only (`data/ep2-quests`) | `dev` | `dev` |
  | `docs/` | documents only (`docs/plan-friends`) | `dev` | `dev` |
  | `chore/` | tooling, scripts, CI, repo setup (`chore/validate-script`) | `dev` | `dev` |
  | `release/` | getting a version ready (`release/v0.2.0`) | `dev` | `main` and `dev` |
  | `hotfix/` | an urgent bug on the live site (`hotfix/v0.1.1-blank-page`) | `main` | `main` and `dev` |

- **Solo project: no pull requests.** Merge locally and push. Still follow the flow:
  don't commit straight onto `dev` or `main`; do the work on a branch and merge it in.
- Start from the latest `dev`, work, then merge back with `--no-ff` so each piece of work stays
  visible in the history:

  ```bash
  git switch dev && git pull
  git switch -c feature/map-priority
  # ...commit...
  git switch dev && git merge --no-ff feature/map-priority && git push
  git branch -d feature/map-priority
  ```

- A branch may be pushed (`git push -u origin <branch>`) as a backup while it's in progress;
  delete it on GitHub after merging (`git push origin --delete <branch>`).
- Keep one branch to one piece of work. Don't rewrite pushed history (no force-push to `dev` or `main`).

## Project layout

- `index.html`: the app (markup and rendering). It holds no quest data.
- `css/app.css`: all styles. Colors are tokens on `:root` (light) and `:root[data-theme="dark"]`;
  use the tokens (`--text-*`, `--accent-*` for fills, `--ink-*` for text on tints), never raw colors.
  Keep text at WCAG AA (4.5:1) in both themes.
- `assets/`: images we host (`bg/`, `brand/`, `icons/`), credited in `assets/CREDITS.md`.
  `site.webmanifest` uses relative paths: the site lives under `/trickster-companion/` on GitHub Pages.
- `js/data.js`: loads `data/*.json` and adapts schema v2 to the shape the renderer uses.
- `js/quest-card.js`: the quest card (`renderQuestCard` in index.html delegates to it). Helpers
  (counts per run, warnings, which quest hands over an item) are pure and run under Node.
- `js/route.js`: route (stops in order, BFS over portal links) and the map / NPC pin panel.
- `data/maps.json`: regions (overview picture), maps (`box` on the 530x540 overview or a `parent`,
  two-way `links`), and `names`: every map text used in quests -> map ids (first = default).
  validate.js fails when a quest uses a map text that isn't listed.
- `data/npc-pins.json`: `{ npcId: { map, x, y } }` in % of the map picture. Players pin in the app
  and send the exported file; replace this file with it (validate.js checks it).
- `js/episode.js`: the Episodes page. Model functions (quest status, items to collect) are pure and
  run under Node; the renderer gets everything it needs through a context object.
- `data/quests/index.json`: the list of quest files, in load order. Each `data/quests/<region>.json`
  holds `{ region, quests: [...] }`; the app sorts all quests by `order`.
- `data/npcs.json` (id, name), `data/images.json` (name -> image URL).
- `scripts/validate.js`: checks the data. `scripts/serve.js`: local server.

Quest ids and the order of `steps` are what saved progress is keyed on: never rename an id or
reorder steps of an existing quest (players would lose ticks). Add new steps at the end.

## Run locally

The app reads `data/*.json` with `fetch`, which browsers block for `file://` pages, so open it through
the local server: `node scripts/serve.js` then http://localhost:8080/.

## Before merging into `dev`

- Data changed: `node scripts/validate.js` shows 0 errors.
- Open the app through `node scripts/serve.js` (desktop and phone width) and check the changed part works.
- Add a line under `## Unreleased` in `CHANGELOG.md` for anything a user would notice.
- Data changes: say in the commit message where the data came from (wiki page or in-game check).

## Releasing (when `dev` is solid)

```bash
git switch dev && git pull
git switch -c release/vX.Y.Z
# CHANGELOG.md: rename "## Unreleased" to "## X.Y.Z (date): short title", commit
git switch main && git pull && git merge --no-ff release/vX.Y.Z
git tag vX.Y.Z && git push origin main vX.Y.Z      # GitHub Pages redeploys the live site
git switch dev && git merge --no-ff release/vX.Y.Z && git push
git branch -d release/vX.Y.Z
```

Hotfix: the same, but branch `hotfix/vX.Y.Z-what` from `main`, fix it, add a `## X.Y.Z (date)`
section to `CHANGELOG.md`, merge `--no-ff` into `main`, tag, push, then merge it into `dev` too.

## Images

Game images come from the ggftw Trickster wiki (via wikimirror.lifeto.co) and belong to the game's owners.
Non-commercial use only, keep the disclaimer in `README.md` and the site footer. See section 7.2 of the plan.
