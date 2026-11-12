# Trickster Companion (fan-made)

Quest tracker & guides for **Trickster Online** (fan-made): how many items each quest needs, how many turn-ins are left, where to go and which monsters / drill spots to farm.

🌐 **Open it:** https://teeramu.github.io/trickster-companion/ (works on phone and computer)

## Quick start
1. Open the link. Pick your class in the **🎭** chip at the top so class-only quests are filtered. On a phone, the pages are in the bar at the bottom.
2. **📖 Episodes**: choose EP0 or EP1. The quest marked **▶ Now** is the one to do next.
   - **🗺️ Route**: the stops in order, drawn on the region map. Tap a stop to see that map.
   - **🎒 Items**: everything still to collect, grouped by map (monster + level, drill depth, shop, combine).
3. Tick steps or the whole quest as you play. The **▓░ %** chip at the top shows your overall progress (tap it for details). Progress is saved **in this browser only**: use **⚙️ → 💾 Export / 📂 Import** to move it to another device.
4. **📜 Quests & Items**: every quest with category tabs (Story, Key, Sticker, Card Girl, Town, …) and the items list for whatever you filter.
5. **⚙️** also has the theme (Auto / ☀️ Light / 🌙 Dark), **🐞 Report a problem** and **🗑️ Reset**.

### เริ่มใช้ (ภาษาไทย)
เปิดลิงก์ด้านบน → เลือกอาชีพที่ปุ่ม 🎭 → แท็บ **📖 Episodes** เลือก EP ที่เล่นอยู่ เควสที่มีป้าย **▶ Now** คือเควสถัดไป แท็บ **🗺️ Route** บอกลำดับ map ที่ต้องไป และ **🎒 Items** บอกของที่ต้องเก็บ ติ๊กเควสเมื่อทำเสร็จ (บันทึกไว้ในเบราว์เซอร์เครื่องนั้น ย้ายเครื่องใช้ ⚙️ → Export / Import) เจอข้อมูลผิดกด ⚙️ → **🐞 Report** ไม่ต้องล็อกอิน

## Found something wrong?
Open **⚙️ → 🐞 Report a problem** (or the link at the bottom of a quest's details). It opens a short Google Form, **no sign-in needed**, with the quest already filled in. Mention what you saw in game. If you have a GitHub account you can also open an issue (link at the bottom of the page).

### NPC pins
On the Route, tap **📍 Pin NPCs**, choose an NPC and tap where they stand on the map. Then share them:
- **📤 Send**: opens the same Google Form with your pins filled in, just press *Submit* (no sign-in), or
- **📋 Copy**: paste the text in a message to the project owner (LINE / Discord).

The owner downloads the form's answers as CSV and merges everyone's pins (`node scripts/merge-pins.js answers.csv`) so they show for all players.

## What's inside
- Episode 0 – Episode 1 plus Coral Beach, Desert Beach, Megalopolis and Caballa Relics quests (138)
- 60 maps from 5 regions with portal links, used for the route
- Data comes from the ggftw Trickster wiki (2013) and may not match the current server: please report differences

## Run locally
```bash
node scripts/serve.js        # then open http://localhost:8080/
node scripts/validate.js     # check data/*.json
```
Opening `index.html` directly as a file will not work: browsers block it from reading `data/*.json`.

## Roadmap
See [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) (written in Thai) and [CHANGELOG.md](CHANGELOG.md).

## Disclaimer
Trickster Online and all related images are property of their respective owners. This is a non-commercial fan project and is not affiliated with or endorsed by the game's developer or publisher. Item and map images are sourced from the ggftw Trickster wiki (via wikimirror.lifeto.co); other pictures are credited in [assets/CREDITS.md](assets/CREDITS.md). Quest data may be inaccurate; please verify in game.

## Contributing
Work happens on `dev`; `main` is what the live site shows. Work is done on `feature/...`, `fix/...`, `data/...`, `docs/...` branches from `dev` and merged back (git flow). Full rules are in [CLAUDE.md](CLAUDE.md).
