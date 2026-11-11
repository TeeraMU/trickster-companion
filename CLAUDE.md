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

## Before merging into `dev`

- Open `index.html` in a browser (desktop and phone width) and check the changed part works.
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
