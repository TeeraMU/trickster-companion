# Changelog

## Unreleased

- Bag counts go up to 999 (3-digit numbers used to be cut off in the box).

## 0.6.0 (2026-11-12): Google sync and Friends

- **👥 Friends** (needs Google sign-in): pick a name friends will see and get a friend code (TC-XXXX-XX) to share. Add friends by their code to see their class / 3rd job path, how far they are, where they are and their next quest, what they still need and what they have spare, with 🎁 "You can give" / 🤝 "They have spare" when your Bags match. Needs list the current area's items first and leave out money (Galder checks and coupons). Updates on its own. Friends never see your Google name or email; 🔄 New code stops the old one from working.
- Phones: the bottom bar fits all six pages in one row.
- **📌 Share as my focus** (Quests → Items to collect): pin the area and categories you're working on, e.g. 🔑 Key + 🏷️ Sticker at Oops Wharf. Friends then see "📌 Focus: … (3 / 16 done)" and only the items those quests need. Unpin to go back to your current area. The focus syncs with your progress.
- **Sync with Google (optional)**: ⚙️ → Sign in with Google keeps your progress (ticked quests, steps and runs, your Bag, your NPC pins, class and 3rd job path) on every device you sign in on, and updates the others within a few seconds. Without signing in nothing changes: progress stays in this browser. The first time you sign in on a browser that already has different progress, you choose: merge both, use your account's, or use this browser's. Offline changes are kept and sent later. Your data is only readable by you.

## 0.5.1 (2026-11-12): Fixes: locked quest chains, missing item pictures

- Fixed: 42 quest items showed a plain 📦 box instead of their picture (3rd job ores and gems like Brass, Glass Piece, Magic Powder, Magnetite; the Oops Wharf boss Requiem items and cards). Pictures now come from each item's wiki page; many items share another item's icon in game (Brass looks like Steel Piece). Sailor's Requiem pt. 1 has no wiki page, so it keeps the box.
- Fixed: 12 quest chains that could never unlock (EP0 Don's Push 3rd / 4th Stage, EP1 Ch.1 Old Artist / Sabrina / Model Mermaid Babe, EP1 Ch.2 Weird Box and the 3 Weird Pieces, Caballa Relics Catch That Thief! and Launch! Caballa V). A quest that sends you on side quests waited for them to be finished before it opened, while they waited for it to be accepted. Each now opens as the wiki says (usually after the previous step), and its side quests open as soon as it does. validate.js now reports any such loop.

## 0.5.0 (2026-11-12): Oops Wharf and Mermaid Palace in full, combined category tabs

- **Oops Wharf town quests** (29 new): the 12 quests that give an **Oops Sticker** (Skipper Min - Urgent Issue needs 7), Frog Shaman, Genius Cochma, Lethos, Officer Tera, Monkey T, Explorer Reina's treasure hunts, Marinel's daily and the way to Mermaid Palace. Where every item comes from (monster, level and maps, or drill area) is taken from each item's wiki page. 22 more NPCs circled on their maps from the wiki. 
- **The rest of Oops Wharf** (30 more, 63 in all): the boss **Requiem for the Spirits** chain (13 quests, Shaman Girl Jia → Copyfish DomDom → La Vida, Vice Captain and the Black Pirate Swabs), **Captain Skull's Dread Pirate set** (Star Gazer Stella and Jia), **Fading Tower** hunts for Hunter Yuri (Lv.70-109), **Phantom Dungeon** hunts for Jia (Lv.170+), **Mind's Eye** quests (Lv.240+) and Genius Cochma's Survey 1. Hunts show the monster, its level, the time limit and where it lives; quests with other targets at higher levels list them in the notes. The boss paths, Fading Tower and Phantom Dungeon aren't on the route maps yet. Left out: Officer Tera's party quest and Julio's Storage Mission 3 (their wiki pages are empty).
- **Mermaid Palace quests** (35 new, 38 in all): the 12 that give a **Palace Proof Sticker** (Captain Stan - Mermaid Palace Stickers needs them), Card Girl 1-5 (the "Unknown Item" cards and riddles spelled out), Genius Cochma, Frog Shaman, La Vida, Prince Sebastian / Fairy Asrai / Sea Spirit Rumo, Guard Gilbert, Lethos, Clerk Z. Smith, Entertainer Elicia's daily, Love Hunter Robin's dungeon hunt, Monkey T (5), treasure hunts and Captain Stan - Megalo Ship's Heidi. Every map is on the route maps. 17 more NPCs circled from the wiki.
- Play order: each zone now has its own block, so in "All" the Oops Wharf quests no longer mix with the Mermaid Palace to Techichi key quests.
- Category tabs combine: tap 🔑 Key, then 🏷️ Sticker, to see only key quests and the sticker quests they need. Tap a lit tab again to drop it; ✨ All shows everything again.

## 0.4.0 (2026-11-12): Episode 2, 3rd job, key quests to Techichi, Bag

### New quests
- **Episode 2** (29 quests, 3 chapters: Sword of Vengeance, Song of Memories, Prelude of The Cursed Soul) from the wiki's Episode 2 page, with where every item comes from (monster and map from the monster pages) and the order quests unlock in.
- **3rd job advancement** (Lv.130+, TM 120+) for all 17 3rd jobs, in 4 steps: Path of Tribulation → your job's Guardian Stone and Happisto's Compass Frame → the 16 Tribunal hunts → become your 3rd job.
- **Key quests after Caballa Relics** (30 quests): Oops Wharf (4), Mermaid Palace (3), Ghost Blue (3), Rose Garden (4), Black Swamp (5), Snow Hill (6) and Techichi Volcano (6), in unlock order, with where each item comes from (monster and map, drill area, or which quest hands it over, including the Adventurer's Book chain). Sticker items list that area's sticker quests; the sticker quests themselves aren't in yet.
- Maps outside the route maps (Seabed, Rose Garden, Swamp, Snow Hill, Techichi…) are named on the quests but not drawn yet.

### Quests page
- Areas are grouped: **✨ All · 📖 Story · 📍 Zones · 🎓 Job**. Pick a group to see its quests, then a chip to narrow it to one area (tap it again to go back). Each chip shows the level it starts at, and zones are sorted by level. Built from the data, so new episodes, towns and jobs appear by themselves.
- 🎓 Job holds every job change: 2nd Job (moved out of Caballa Relics) and 3rd Job.
- **Pick your 3rd job**: under 🎓 Job → 3rd Job, "Which 3rd job?" lists your class's paths (Cat: Diva / Primadonna). Pick one and only that path's quests stay, 22 instead of 86, in progress, items to collect, the route and the Bag too. Picking a path sets your class; changing class clears a path that no longer fits.
- New 🛡️ **Guardian** category: Fairy Nono & 4 Arbiters (Card Identification & Trickster Crest), under Megalopolis.

### Bag
- New **🎒 Bag** page: type how many of each item you have (− / + or type a number). **🔒 Keep** lists every item still needed by a quest you haven't finished (don't sell these), **🎯 Still missing** what you still have to get, **💰 Extra** what you have more than you need (and items no quest needs any more: OK to sell).
- Items in your Bag are subtracted everywhere: *Items to collect* shows "×1 have 1 of 2" or "✅ have all", the Route skips farm stops you already have enough for, and quest cards show 🎒 have N and 🔒 +N quests when other quests need the same item.
- The Bag is saved with your progress (Export / Import include it).

### Maps and NPC pins
- New regions on the route maps: **Mirage Island** and **Mermaid Palace** (19 new maps with pictures and portals; the Paths to Mermaid Palace now sit on the Mermaid Palace map).
- **NPC positions from the wiki**: 57 NPCs are already circled on their maps (taken from the circle the wiki draws on the Episode 0–2 and key quest pages), marked "📍 from the wiki". Your own pins still win.
- Pins are now kept per NPC **and** map, so an NPC who stands in several maps (Monkey T, Nefertiti) can be pinned in each. Pins saved the old way are converted automatically.
- `merge-pins.js`: a player pin replaces a wiki pin (the wiki is from 2013); players who disagree are still reported as conflicts.

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
