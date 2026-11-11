# Trickster Companion: working rules

A fan-made quest tracker and farming helper for Trickster Online, served as a static site on GitHub Pages.
The roadmap is in `IMPROVEMENT_PLAN.md` (Thai). UI text and data are in English.

## Branches

- Two long-lived branches:
  - **`dev`** (the default branch): finished work combined and tested together.
  - **`main`**: only what's released. **GitHub Pages deploys from `main`**, so the live site
    (https://teeramu.github.io/trickster-companion/) changes only when we release.
- Work branches are named by **what kind of change** they are:

  | Prefix | For | From | PR into |
  |---|---|---|---|
  | `feature/` | new behaviour (`feature/map-priority`) | `dev` | `dev` |
  | `fix/` | a bug in `dev` (`fix/cycle-counter`) | `dev` | `dev` |
  | `refactor/` | code moved or tidied, no behaviour change (`refactor/split-quest-data`) | `dev` | `dev` |
  | `data/` | quest / map / monster / item data only (`data/ep2-quests`) | `dev` | `dev` |
  | `docs/` | documents only (`docs/plan-friends`) | `dev` | `dev` |
  | `chore/` | tooling, scripts, CI, repo setup (`chore/validate-script`) | `dev` | `dev` |
  | `release/` | a version bump (`release/v0.2.0`) | `dev` | `dev` |
  | `hotfix/` | an urgent bug on the live site (`hotfix/v0.1.1-blank-page`) | `main` | `main`, then `main` into `dev` |

- **Never commit or push to `dev` or `main` directly.** Push your branch and open a pull request
  (`gh pr create --base dev`, or `--base main` for a hotfix), then merge it on GitHub.
- A git hook (`.githooks/pre-push`) refuses pushes to `dev` and `main`. Switch it on once per clone:
  `git config core.hooksPath .githooks`. If it stops a push, move the commits to a branch. Never bypass it.
- Start from the latest `dev`: `git switch dev && git pull`, then `git switch -c feature/...`.
  While a branch lives long, bring `dev` into it now and then (`git merge dev`).
- Keep a pull request to one piece of work. Say in its description what changed and how it was checked.
- Don't rewrite pushed history (no force-push to shared branches, no amending pushed commits).

## Before opening a pull request

- Open `index.html` in a browser (desktop and phone width) and check the changed part works.
- Add a line under `## Unreleased` in `CHANGELOG.md` for anything a user would notice.
- Data changes: say where the data came from (wiki page or in-game check).

## Releasing (when `dev` is solid)

1. On `release/vX.Y.Z` from `dev`: rename `## Unreleased` in `CHANGELOG.md` to
   `## X.Y.Z (date): short title`. PR into `dev`, merge.
2. Open a pull request **from `dev` into `main`** (`gh pr create --base main --head dev`), merge it.
   GitHub Pages redeploys the live site from `main`.
3. Tag `main`: `git switch main && git pull && git tag vX.Y.Z && git push origin vX.Y.Z`.

Hotfix: `git switch main && git pull && git switch -c hotfix/vX.Y.Z-what`, fix, add a
`## X.Y.Z (date)` section to `CHANGELOG.md`, PR into `main`, merge, tag, then open a PR
**from `main` into `dev`** (`gh pr create --base dev --head main`) so `dev` gets the fix too.

## Images

Game images come from the ggftw Trickster wiki (via wikimirror.lifeto.co) and belong to the game's owners.
Non-commercial use only, keep the disclaimer in `README.md` and the site footer. See section 7.2 of the plan.
