# Build guide data (data/builds.json)

Made from the ggFTW Trickster wiki mirror (wikimirror.lifeto.co). Run in an empty work folder
(not inside the repo):

1. Download pages: the `<Job>.html` and `<Job>_Skills.html` pages into `job/` and `sk/`
   (`Power/Magic/Sense/Charm_Skills` for 1st jobs), with `node <repo>/scripts/wiki/get-pages.js <dir> <titles.txt>`.
2. `node <repo>/scripts/wiki/build-skills.js` -> `skills.raw.json` (skill tables, job art, hybrid lists).
   Skills missing from the job tables (no mastery column) are read from their own pages in `one/`.
3. Download the mastery item pages into `it/` and their monsters into `mon/`.
4. `node <repo>/scripts/wiki/compose-builds.js <repo>` -> `<repo>/data/builds.json`.
5. `node scripts/test-build.js`.

PlayTrickster may differ from the wiki: note in-game corrections instead of editing builds.json by hand.
