# Trickster Companion (fan-made)

Quest tracker, boss guide and character planner for **Trickster Online** (fan-made): what each quest needs and where to get it, every area boss with its trials as a checklist, and a planner that works out your stats and damage the way the game does.

🌐 **Open it:** https://teeramu.github.io/trickster-companion/ (works on phone and computer)

## What's inside
- **📖 Episodes**: EP0 to EP6 in play order. The quest marked **▶ Now** is the next one; **🗺️ Route** shows the stops on the region map and **🎒 Items** everything still to collect, grouped by map.
- **📜 Quests**: 1,230 quests from 25 areas (Coral Beach to Techichi, Tapasco, the Abyss, Tower of Chaos, 3rd jobs …) with category tabs, filters and search.
- **👑 Bosses**: the 11 area bosses from Tutankhamen to Spicy Dragon, then Koiosu and True Kronos in Tartarus. The trials to reach each one as a checklist, solved puzzles (Tenter Lion's mazes, Felix's sudoku, Tutankhamen's answers, Odinea's planks, the Tartarus cages …), its quests, numbers and drops.
- **🎒 Bag**: type what you have; quests, routes and items lists take it off.
- **🧭 Build guide**: every class and job: skills with formulas, TM, what masters them and where it drops, the stats each job uses.
- **🛠️ Planner**: up to 20 builds. Equipment typed in as the item window shows it (compound slots included), a status window that matches the game, buffs, skill power, and a **⚔️ Battle Summary** against any of the client's 1,309 monsters with the hit you'll see in game (physical attacks).
- **👥 Friends**: sign in with Google to sync your progress between devices, add friends by code and see their progress, bag and shared builds.

## Quick start
1. Open the link. Pick your class in the **🎭** chip at the top so class-only quests are filtered. On a phone, the pages are in the bar at the bottom.
2. **📖 Episodes**: choose the episode you're on and follow **▶ Now**. Tick steps or the whole quest as you play; the **▓░ %** chip shows your overall progress.
3. Progress is saved in this browser. **Sign in with Google** (⚙️) to keep it on every device, or use **⚙️ → 💾 Export / 📂 Import**.
4. **⚙️** also has the theme (Auto / ☀️ Light / 🌙 Dark), **🐞 Report a problem** and **🗑️ Reset**.

### เริ่มใช้ (ภาษาไทย)
เปิดลิงก์ด้านบน → เลือกอาชีพที่ปุ่ม 🎭 → แท็บ **📖 Episodes** เลือก EP ที่เล่นอยู่ เควสที่มีป้าย **▶ Now** คือเควสถัดไป ติ๊กเควสเมื่อทำเสร็จ ข้อมูลบันทึกในเบราว์เซอร์ ถ้าล็อกอิน Google (⚙️) จะ sync ทุกเครื่องและดูความคืบหน้าของเพื่อนได้
- **👑 Bosses**: ทาง Trial ไปหาบอสแต่ละตัวแบบติ๊กได้ พร้อมเฉลยปริศนา
- **🛠️ Planner**: จัดบิลด์ ใส่ของตามหน้าต่างไอเทมในเกม ดูสเตตัสและดาเมจที่จะเห็นในเกม
- เจอข้อมูลผิดกด ⚙️ → **🐞 Report** ไม่ต้องล็อกอิน

## Found something wrong?
Open **⚙️ → 🐞 Report a problem** (or the link at the bottom of a quest's details). It opens a short Google Form, **no sign-in needed**, with the quest already filled in. Mention what you saw in game. If you have a GitHub account you can also open an issue.

The planner gets better with numbers from the game: the **📝 Hits from the game** box in the Battle Summary keeps the hits you see, and your **Growth** window tells it your class's starting stats (4 of the 8 classes are checked so far).

### NPC pins
Many NPCs are already circled (📍). If one is wrong or missing: on the Route, tap **📍 Pin NPCs**, choose an NPC and tap where they stand on the map, then **📤 Send** (the same Google Form) or **📋 Copy** the text to the project owner. The owner merges everyone's pins with `node scripts/merge-pins.js answers.csv`.

## Where the data comes from
- Quests, items, maps, skills and boss pages: the ggFTW Trickster wiki (via wikimirror.lifeto.co, 2013 era), checked against the game where players reported differences.
- Tartarus bosses: the Our Trickster Online wiki (oto.fandom.com, CC-BY-SA).
- Monster numbers, mastery items the wiki has wrong, hybrid jobs' skills and buff values: the PlayTrickster client's own tables, marked **📦 From client** until someone sees them in game.

The live server may differ from all of these: please report what you see.

## Run locally
```bash
node scripts/serve.js        # then open http://localhost:8080/
node scripts/validate.js     # check data/*.json
node scripts/test-planner.js # and the other scripts/test-*.js
```
Opening `index.html` directly as a file will not work: browsers block it from reading `data/*.json`.

## Changes
See [CHANGELOG.md](CHANGELOG.md) for what changed in each version. (The 🗺️ Roadmap page in the app is the game's key-quest roadmap.)

## Disclaimer
Trickster Online and all related images are property of their respective owners. This is a non-commercial fan project and is not affiliated with or endorsed by the game's developer or publisher. Images are hotlinked from the ggFTW Trickster wiki (via wikimirror.lifeto.co) and oto.fandom.com; other pictures are credited in [assets/CREDITS.md](assets/CREDITS.md). Data may be inaccurate; please verify in game.

## Contributing
Work happens on `dev`; `main` is what the live site shows. Work is done on `feature/...`, `fix/...`, `data/...`, `docs/...` branches from `dev` and merged back (git flow). Full rules are in [CLAUDE.md](CLAUDE.md).
