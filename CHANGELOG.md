# Changelog

## Unreleased

- New **🎒 Bag** page: type how many of each item you have (− / + or type a number). **🔒 Keep** lists every item still needed by a quest you haven't finished (don't sell these), **🎯 Still missing** what you still have to get, **💰 Extra** what you have more than you need (and items no quest needs any more: OK to sell).
- Items in your Bag are subtracted everywhere: *Items to collect* shows "×1 have 1 of 2" or "✅ have all", the Route skips farm stops you already have enough for, and quest cards show 🎒 have N and 🔒 +N quests when other quests need the same item.
- The Bag is saved with your progress (Export / Import include it).
- Quests page: areas are now grouped: **✨ All · 📖 Story · 📍 Zones · 🎓 Job**. Pick a group to see its quests, then a chip to narrow it to one area (tap it again to go back). Each chip shows the level it starts at, and zones are sorted by level. 🎓 Job holds every job change: 2nd Job, Enlightenment and 3rd Job (2nd Job and Enlightenment moved out of Caballa Relics and Megalopolis).

- **Key quests after Caballa Relics** (30 quests): Oops Wharf (4), Mermaid Palace (3), Ghost Blue (3), Rose Garden (4), Black Swamp (5), Snow Hill (6) and Techichi Volcano (6), in unlock order, with where each item comes from (monster and map, drill area, or which quest hands it over, including the Adventurer's Book chain). Sticker items list that area's sticker quests; the sticker quests themselves aren't in yet.

- **3rd job advancement** (Lv.130+, TM 120+) for all 17 3rd jobs, in 4 steps: Path of Tribulation → your job's Guardian Stone and Happisto's Compass Frame → the 16 Tribunal hunts → become your 3rd job. Pick your class at the top to see only your two (Dragon: three) paths. Shown on the Quests page under 🎓 Job / 📍 3rd Job; maps outside the route maps (Rose Garden, Seabed, Vamp Dungeon, Snow Hill…) are named but not drawn yet.

- Quests page: the area cards are now one row of chips (📖 EP0, EP1, EP2 … then 📍 towns), built from the data so new episodes and towns appear by themselves; scrolls sideways when it gets long.

- **NPC positions from the wiki**: 48 NPCs are already circled on their maps (taken from the circle the wiki draws on each Episode 0–2 quest), marked "📍 from the wiki". Your own pins still win.
- Pins are now kept per NPC **and** map, so an NPC who stands in several maps (Monkey T, Nefertiti) can be pinned in each. Pins saved the old way are converted automatically.
- `merge-pins.js`: a player pin replaces a wiki pin (the wiki is from 2013); players who disagree are still reported as conflicts.

- **Episode 2** (29 quests, 3 chapters: Sword of Vengeance, Song of Memories, Prelude of The Cursed Soul) from the wiki's Episode 2 page, with where every item comes from (monster and map from the monster pages) and the order quests unlock in.
- New regions on the route maps: **Mirage Island** and **Mermaid Palace** (19 new maps with pictures and portals; the Paths to Mermaid Palace now sit on the Mermaid Palace map).

## 0.3.0 (2026-11-12): Compact header, no-login reports

- Header is one 60px bar: logo, page tabs, class chip, progress chip (details drop down) and ⚙️ (theme, export / import, report, reset). Expand / Collapse all moved to the Quests page. On phones and small tablets the page tabs are a bottom bar.
- Background on/off button removed: pictures always show.
- Report and Send pins open a Google Form, no sign-in needed; merge-pins.js reads its Sheet CSV.

## 0.2.1 (2026-11-12): Share NPC pins

- Sharing NPC pins: **📤 Send** opens a GitHub form with your pins filled in, **📋 Copy** copies them to paste in LINE / Discord, **⬇️ File** downloads them. Only your own pins are sent.
- `scripts/merge-pins.js` merges pins from files, pasted chat text or open GitHub issues (`--issues`): new NPCs are added, pins close together are averaged, different spots are reported as conflicts.

## 0.2.0 (2026-11-12): Episodes, route and a new look

- New logo next to the name and a browser-tab / home-screen icon (Add to Home Screen uses `site.webmanifest`).
- Description is now *Quest tracker & Guides*.
- Character wallpaper on the right of the page, shown softly through frosted panels. Fixed: the background pictures never showed because the page body painted over them.
- **🐞 Report** button (and a link under each quest's details) opens a GitHub form for bugs or wrong quest info.
- README: quick start for players (English + Thai).
- **🗺️ Route** on the Episodes page: the stops to walk, in order, for what's left of the episode or chapter (accept, collect, hand in), with the maps you pass through. Drawn on the region map (Coral Beach, Desert Beach, Megalopolis, Caballa Relics, Oops Wharf) with numbered stops; tap a stop to see that map. On phones it is the middle sub-tab.
- **📍 NPC pins**: tap *Pin NPCs*, pick an NPC and tap where they stand on the map. Pins are saved in your browser; *Export pins* downloads `npc-pins.json` to add to the project for everyone.
- New data: `data/maps.json` (60 maps from the wiki with pictures, portal links and their place on the region maps; every map name used in the quests is linked to real maps) and `data/npc-pins.json`.
- The separate Items & Drill Calculator tab is gone: **📜 Quests & Items** now shows the quest list with an **🎒 Items to collect** panel beside it (same filters: category, region, class, search, status), grouped by map like the Episodes page. Switch between *Still needed* and *Everything*. On phones, two sub-tabs.
- Fixed: Card Girl cards were counted once per run (5×) in item totals; each card is needed once.
- Big category tabs with icons and done/total counts (Story, Key, Sticker, Card Girl, Town, Monster, Dungeon, Daily, Job) replace the row of small filter pills. Tabs with no quests for your class or region are hidden.
- A quest can now be in more than one category: the three sticker hand-in Key quests also show under Sticker, and Card Identification (Fairy Nono) also under Card Girl. Card Girl quests have their own tab instead of being mixed into Town.
- New quest card: NPC picture, name and place; ⚠️ badges for special conditions (e.g. *Must be in-game DAYTIME*, *Have 1x Super Alarm Clock in inventory*); a **To do** list that is always visible, with each item's icon, amount and where to get it (monster and level, drill depth, shop, combine recipe, or 🔗 which earlier quest hands it over and ✓ once you have it); rewards at a glance. Quests with several runs show *per run · total · left*. Steps, tips and prerequisites open with ▾.
- Finished quests fold down to their title line.
- New **📖 Episodes** page (now the start page): pick EP0 / EP1, see progress and EXP, the quest you should do next (opened and marked ▶ Now), finished quests folded away, and locked quests with what they still need.
- **Items to collect** for the whole episode or just the current chapter, grouped by map: which monster drops what and how many, what to drill and at which depth, what to buy and what to combine. Items handed over by earlier quests are left out; items only needed by locked quests are marked 🔒.
- On phones the Episodes page switches between 📜 Quests and 🎒 Items with two tabs.
- Fixed: EP1 Ch.3 (Tango - Tango's Love) now requires finishing EP1 Ch.2 first.
- New look: cute pastel theme (sky blue, pink, cream yellow, lavender), rounded Nunito / Fredoka fonts, candy-stripe progress bars, emoji labels instead of `[+]`-style text. The site is now called Trickster Companion.
- Light / Dark mode with an Auto setting that follows the device; the choice is remembered.
- Faded background art behind the page (on by default on desktop, off on phones to save data); can be switched on or off.
- Text contrast meets WCAG AA in both themes; no sideways scrolling on phones.
- Quest data moved out of `index.html` into `data/quests/*.json` (schema v2: typed objectives, prerequisites as quest ids), plus `data/npcs.json` and `data/images.json`. The app looks and behaves the same, and saved progress carries over.
- `scripts/validate.js` checks the data; `scripts/serve.js` runs the app locally.
- Branching rules: `dev` / `main` with `feature/`, `fix/`, `data/`, `docs/`, `chore/` work branches, merged locally without pull requests (see `CLAUDE.md`).

## 0.1.0 (2026-11-11): First public version

- Quest tracker for Episode 0 – Episode 1 and regional quests, published on GitHub Pages.
