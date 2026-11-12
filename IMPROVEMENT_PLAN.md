# Trickster Companion — แผนพัฒนา (Improvement Plan)

> อัปเดต: 2026-11-10 · ไฟล์ตั้งต้น: `trickster-quest-tracker.html` (ไฟล์เดียว ~325 KB, 6,022 บรรทัด)

---

## 0. สถานะปัจจุบัน (สิ่งที่มีอยู่แล้ว)

| ส่วน | รายละเอียด |
|---|---|
| ข้อมูล | 138 เควส แบบ hard-code ใน `const QUESTS = [...]` ครอบคลุม **EP0 → EP1 ch.3**, Coral Beach, Desert Beach, Megalopolis, Caballa Relics |
| Category | Episode 53 · Sticker 29 · General 22 · Key 16 · Monster 8 · Dungeon 4 · Everyday 4 · Job 2 |
| Field ต่อเควส | `id, order, title, npc, location, region, subRegion, category, minLevel, cycles, prereq (ข้อความ), classFilter, steps[], items[{name, qty, totalQty, method, source, map}], hunts[], rewards{baseExp, tmExp, galder, items[]}, notes` |
| UI | 4 แท็บ: Quests / Calculator / Drill Ref / Roadmap, filter ตาม class / region / category / status, ติ๊ก step และนับ cycle ได้ |
| รูป | `ITEM_IMAGES` ~600 รายการ hotlink ไปที่ `wikimirror.lifeto.co/asset.103.ggftw.net/...` |
| Save | `localStorage` key `trickster_quest_tracker_v1` (เก็บแค่ในเครื่องและ browser นั้น) |

**ข้อจำกัดหลักที่เห็นจากโค้ด**
1. ข้อมูลกับ UI อยู่ในไฟล์เดียวกัน เลยเพิ่ม EP2–EP6 ได้ยาก ไฟล์จะใหญ่มาก และแก้ผิดได้ง่าย
2. `prereq` กับ `npc` เป็นข้อความอิสระ ระบบจึงคำนวณลำดับเควสหรือ "ทำอะไรต่อ" เองไม่ได้
3. ไม่มีข้อมูลกลางของ **Map / Monster / NPC** ทุกอย่างพิมพ์เป็นข้อความซ้ำๆ ในแต่ละเควส จึงทำ "ไปตี map ไหน" ได้ไม่แม่น
4. Category มีได้แค่ค่าเดียวต่อเควส (เช่น Key Quest ที่ได้ Sticker ด้วยถูกนับรวมกัน)
5. ความคืบหน้าติดอยู่กับ browser เครื่องเดียว เปิดในมือถือแล้วไม่เห็น progress เดิม
6. รูปทั้งหมดพึ่ง mirror ภายนอก ถ้า mirror ล่มรูปจะหายทั้งหมด

> ⚠️ **ข้อควรระวังเรื่องข้อมูล**: หน้า wiki mirror แก้ไขล่าสุดปี 2013 และมีป้ายเตือนว่าข้อมูล *"much of the content is inaccurate"* ข้อมูลที่ดึงมาจึงต้องเทียบกับ server ที่เล่นจริงก่อนทุกครั้ง (ดูข้อ 9)

### Server ที่เล่น: [playtrickster.com](https://playtrickster.com/home)
- เป็น **เวอร์ชันเปิดใหม่ภาษาไทย** ("โลกใบเดิม · เรื่องราวใหม่") เพิ่งทำ CBT 1–4 พ.ย. 2026 มี client PC / Mac / Android / iOS
- ตัวละคร **9 ตัว**: Bunny, Buffalo, **White Bear (หมีขาว)**, Sheep, Dragon, Fox, Lion, Cat, Raccoon (ไม่มี Penguin) · มี Class 2 / Class 3 · เป้าหมาย Lv.200 / Lv.300 · Tower ถึงชั้น 72
- มีระบบใหม่ที่ wiki เก่าไม่มี: Auto Bot, Mount (สัตว์ขี่), Caballa Research, Progression Quest, Equipment Preset
- **ไม่มี wiki / database ของ server เอง** และหน้าเว็บไม่ได้บอกว่ามีถึง EP ไหน
- **ผลต่อแผน**: wiki ปี 2013 ใช้เป็น *โครงตั้งต้น* ได้เท่านั้น ตัวเลข (จำนวนของ, EXP, เลเวล) ต้องเช็กจากในเกมหรือ Discord (`playtrickster.com/discord`) และควรเพิ่มหมวด **Progression Quest** กับข้อมูลอาชีพ White Bear

---

## 1. เป้าหมาย (ตาม pain point)

> **"เปิดแอปแล้วรู้ทันทีว่า วันนี้ต้องไป map ไหน ตีตัวอะไร เก็บกี่ชิ้น ขุดอะไร แล้วเอาไปส่งใครที่ไหน กี่รอบ"**

ตัวชี้วัดง่ายๆ: ผู้เล่นต้องไม่ต้องเปิด wiki เพิ่มเลยระหว่างเล่น EP0 จนถึง EP สุดท้าย

---

## 2. ปรับโครงสร้างข้อมูล (พื้นฐานที่ทุกฟีเจอร์ต้องใช้) — *ทำก่อน*

แยกข้อมูลออกเป็น JSON และให้แต่ละรายการอ้างกันด้วย **ID** แทนข้อความ

```
data/
  quests/
    ep0.json  ep1.json … ep6.json
    region-coral-beach.json …
    job-1st.json  job-2nd.json  job-3rd.json
  maps.json       # id, name, zone, type(field/dungeon/town/mine), levelRange, connectsTo[], image
  monsters.json   # id, name, level, maps[], drops[{itemId, rate?}], image
  npcs.json       # id, name, mapId, coords?/landmark, image
  items.json      # id, name, type(drop/drill/quest/reward), drillGrade?, image
  classes.json    # 8 สาย × job tier (Bunny, Buffalo, Sheep, Dragon, Fox, Lion, Cat, Raccoon …)
```

**Quest schema ใหม่ (ร่าง)**

```jsonc
{
  "id": "ep0-c1-02",
  "title": "Prove Your Spirit!",         // อังกฤษเป็นหลัก (nameTh เพิ่มทีหลังได้ถ้าต้องการ)
  "categories": ["episode"],             // แท็บที่เควสนี้จะโผล่ (ได้หลายแท็บ เช่น ["key","sticker"])
  "tags": ["ep0", "tutorial"],           // ใช้ภายใน ไม่โชว์ใน UI
  "episode": 0, "chapter": 1, "order": 2,
  "giverNpc": "npc.bunny-maid",
  "turnInNpc": "npc.bunny-maid",         // แยกคนให้ กับคนรับส่ง
  "minLevel": 1,
  "classes": ["all"],                    // หรือ ["bunny"], ["!bunny"]
  "prereqs": ["ep0-c1-01"],              // ใช้ ID → สร้าง dependency graph ได้
  "repeat": { "cycles": 1, "reset": null },   // reset: "daily" | "weekly" | null
  "objectives": [
    { "type": "collect", "item": "item.baby-carrot", "qty": 2,
      "sources": [{ "kind": "drop", "monster": "mon.torobbie", "map": "map.coral-field-1" }] },
    { "type": "hunt", "monster": "mon.torobbie", "qty": 10, "map": "map.coral-field-1" },
    { "type": "drill", "item": "item.salt", "qty": 5, "map": "map.desert-field-2", "drillGrade": 1 },
    { "type": "talk", "npc": "npc.winnie" }
  ],
  "steps": ["…"],                        // ข้อความ step-by-step เดิมยังเก็บไว้แสดง
  "rewards": { "baseExp": 1374, "tmExp": 1374, "galder": 2000,
               "items": [{ "item": "item.level-up-guide", "qty": 1 }],
               "sticker": null, "unlocks": [] },
  "notes": "…",
  "source": { "url": "…", "verified": "2026-11", "server": "…" }  // ใช้ตรวจความถูกต้อง
}
```

**งานย่อย**
- [x] แปลง `QUESTS` เดิม 138 เควสเป็น JSON (schema v2) แล้ว — `data/quests/*.json` แยกตาม region, prereq เป็น ID แล้ว 133/138 (อีก 5 เป็นเงื่อนไขเลเวลล้วน) ✅ Phase 1.1
- [~] `npcs.json` (75 NPC) + `images.json` (630 รูป) เสร็จแล้ว · `maps / monsters / items` ยังเป็นข้อความในเควส → แยกตอนทำ 1.2 (หน้า Episode ต้องจัดกลุ่มตาม map/มอน)
- [x] `scripts/validate.js`: field ครบ, id ไม่ซ้ำ, category/class/source ถูกชนิด, NPC และ prereq ที่อ้างถึงมีจริง, prereq ไม่วน ✅
- [x] progress เดิมใช้ต่อได้เลย: id เควสและ step เหมือนเดิมทุกตัว key `trickster_quest_tracker_v1` ไม่ต้อง migrate ✅

---

## 3. แก้ Pain Point #1 — "ต้องเก็บกี่ชิ้น ส่งกี่รอบ NPC อยู่ไหน"

### 3.1 Quest Card แบบใหม่ (อ่านจบใน 3 วินาที)
```
┌──────────────────────────────────────────────┐
│ [NPC รูป] Bunny Maid · 📍 Blooming Cora   Lv.1 │
│ Prove Your Spirit!            [EP0] [Story]  │
│ ── ต้องทำ ─────────────────────────────────  │
│ 🥕 Baby Carrot   0/2   ⚔ Torobbie @ Field 1  │
│ 🔁 รอบที่ 1/3   (ทั้งหมดต้องใช้ 6 ชิ้น)        │
│ ── ส่งที่ ─────────────────────────────────── │
│ Bunny Maid · Blooming Cora → [ดูแผนที่]       │
│ 🎁 1,374 EXP · 2,000 G · Level Up Guide       │
└──────────────────────────────────────────────┘
```
- แสดง **ต่อรอบ / รวมทุกรอบ / เหลืออีก** ของแต่ละ item ชัดเจน
- ช่องนับจำนวน (+/−) ให้กรอกได้ว่ามีของในมือกี่ชิ้นแล้ว (เก็บใน state)
- แยกบรรทัด **"รับเควสที่"** กับ **"ส่งที่"** เมื่อเป็นคนละ NPC

### 3.2 NPC Directory
- หน้ารวม NPC ทั้งหมด: รูป, map, จุดสังเกต (เช่น "ข้างร้านขายยา"), รายชื่อเควสที่ NPC นั้นเกี่ยวข้อง
- กดชื่อ NPC ตรงไหนก็ได้ในแอป → เด้ง popup ตำแหน่ง

### 3.3 Inventory / "ของที่มีแล้ว"
- กรอกจำนวนของที่มีในมือครั้งเดียว ระบบจะหักให้ทุกเควสที่ใช้ item เดียวกัน
- แจ้งเตือนว่า **ของชิ้นนี้ใช้กับหลายเควส อย่าขาย/อย่าส่งไปก่อน** (เช่น ของที่ทั้ง Key Quest และ Sticker Quest ใช้)

### 3.4 ตัวอย่าง: กดเข้าแท็บ 📖 Story → Episode 1 (ใช้ข้อมูลจริง 20 เควสที่มีอยู่)

**คำตอบสั้นๆ: ไม่ได้แสดงการ์ดทั้งหมดพร้อมกัน** หน้า EP แบ่งเป็น 3 ส่วนจากบนลงล่าง
1. **ภาพรวม** — ความคืบหน้า + EXP รวม
2. **ของที่ต้องเก็บ (Shopping list)** — **รวมทั้ง EP** หรือ **เฉพาะ chapter ปัจจุบัน** (มีปุ่มสลับ) จัดกลุ่มตาม map
3. **ลำดับเควส** — เควสที่ทำเสร็จแล้วพับเก็บ, เควส **"▶ ทำอยู่"** กางการ์ดเต็ม, เควสที่ยังล็อกเป็นสีเทาบรรทัดเดียว

**หลักสำคัญ**: แยก **"ของที่ต้องฟาร์มเอง"** (ตี / ขุด / ซื้อ) ออกจาก **"ของที่ได้จากเควสก่อนหน้า"** (เช่น Antique Mirror, Weird Piece 1–3) ของแบบหลังไม่ต้องไปหา จึง **ไม่ใส่ใน Shopping list** แค่แสดงเป็น 🔗 บนการ์ด → list สั้นลงมาก

```
📖 EPISODE 1                                   [ทั้ง EP ▾ | Chapter ปัจจุบัน]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Progress  ███████░░░░░░░░░░░░░  7/20 quests        EXP รวมทั้ง EP 10.1M
  Ch.1 Nefertiti's Necklace   7/10  ●●●●●●●○○○   Lv.45+
  Ch.2 Unknown Ancient Box    0/5   ○○○○○        Lv.50+  🔒
  Ch.3 Harkon Searchers       0/5   ○○○○○        Lv.52+  🔒

🎒 ของที่ต้องเก็บ — ทั้ง EP1 (เหลือ)                         จัดตาม map
───────────────────────────────────────────────────────────────────────────
🗺 Southeast / Southwest Forest                    Ch.1 · มอน Lv.47
   ⚔ Forest Wasp      → 🍯 Honey ×2  · Royal Jelly ×2
   ⛏ ขุด 10–20m Land  → Ginseng ×2
🗺 Relics Field 2–4                                Ch.1 · มอน Lv.61
   ⚔ Mimic            → Gold ×5
   ⛏ ขุด 20–40m Land  → Golden Egg ×1 · Fantastic Powder ×1 (Field 4)
🗺 Oops Wharf Field 1–4                            Ch.2 · มอน Lv.75–88  🔒
   ⚔ Quiem (F1–2)     → Baby Powder ×3
   ⚔ Black Foe (F2–3) → Piece of Lumber ×5   (หรือขุด 40–60m)
   ⚔ Crow (F4)        → Bell Cluster ×2
   ⛏ ขุด 40–60m Land  → Thick Rope ×3
🗺 Relics Dungeon 3–4                              Ch.2 · มอน Lv.84     🔒
   ⚔ Naranjo          → Lamplight ×2
🗺 Path to Mermaid Palace 1–2                      Ch.3 · มอน Lv.80–86  🔒
   ⚔ Pirate Boxer B   → Power Plan Battery ×5 · Harkon Heirloom (สุ่ม)
   ⚔ Super Golden Mole→ Super Bean Shell ×2
   ⛏ ขุด 60–80m Rock  → Fairy's Drink ×1 · Harkon Heirloom (สุ่ม)
   📦 เปิด Harkon Heirloom → Harkon Necklace ×1 · Ornament ×3 · Shard ×1
🛒 ซื้อ   Distilled Water ×3 (Item Shop, Megalopolis)
💰 อื่นๆ  50 Galder Coupon ×5 · 500 Galder Coupon ×2
⚗ ผสม   Ginseng Tea · Honey Tea (Paul, Megalopolis) · Transparent Medicine (Paul, Oops Wharf)

📜 ลำดับเควส — Chapter 1
───────────────────────────────────────────────────────────────────────────
 ✅ 1  Monkey T — Honest Monkey T                              (พับไว้)
 ✅ 2  Old Artist — Old Artist's Request                        (พับไว้)
  …
 ✅ 7  Louis Bitton — Louis the Great                           (พับไว้)
┌─ ▶ ทำอยู่ ────────────────────────────────────────────────────────────────┐
│ 8  Model Mermaid Babe & Old Artist — A Mirror for the Beauty   Lv.45     │
│    📍 รับ/ส่ง: Relics Field 1 - Atlas                                     │
│    🔗 Fantastic Hand Mirror ×1   ← ได้จาก "Louis the Great" แล้ว ✓        │
│    🎁 515,226 EXP · Chuu~ Check · Restored Necklace                       │
│    [✓ เสร็จแล้ว]                                                         │
└───────────────────────────────────────────────────────────────────────────┘
 ○ 9  Love Hunter Robin — Necklace's Owner         📍 Path to Caballa Relics
 ○ 10 Rosaline Gracia — Rosaline's Document        📍 Megalopolis Square
       ⚗ ต้องใช้ Honey Tea (Honey ×1 · Royal Jelly ×2 · Distilled Water ×2)

▸ Chapter 2 — Unknown Ancient Box  (0/5, 🔒 ต้องจบ Ch.1 + Lv.50)
▸ Chapter 3 — Harkon Searchers     (0/5, 🔒)
```

**รายละเอียดที่ได้จากตัวอย่างนี้**
- **ทำไม "รวมทั้ง EP" ถึงมีประโยชน์**: Honey ใช้ทั้งเควส 2 และ 10 ถ้าไปตี Forest Wasp ครั้งเดียวเก็บ 2 ชิ้นเลยก็ไม่ต้องย้อนกลับมาอีก (เช่นเดียวกับ Distilled Water ×3)
- **ของที่ล็อกอยู่ (🔒)** แสดงไว้แต่สีจาง เพื่อให้วางแผนล่วงหน้าได้ ถ้าไม่อยากเห็นให้กดสลับเป็น "Chapter ปัจจุบัน"
- **เลเวลมอน vs เลเวลเควส**: Ch.2 เควส Lv.50+ แต่มอนจริง Lv.75–88 → badge มอน Lv บอกให้รู้ว่าอาจต้องรอหรือไปกับปาร์ตี้ (ตามที่ตกลงไว้ว่าเลเวลเป็นแค่ข้อมูลประกอบ)
- **ของสุ่ม** (Harkon Heirloom) บอกตรงๆ ว่า "สุ่ม" แทนการใส่ตัวเลขที่ไม่แน่นอน
- **คำเตือนพิเศษ** จาก notes ขึ้นเป็น badge ⚠ บนการ์ด เช่น Old Artist "ต้องคุยตอนกลางวันในเกม"
- **ผสมของ (⚗)** แสดงสูตรและ NPC ที่ผสมบนการ์ด และวัตถุดิบถูกรวมเข้า Shopping list ให้อัตโนมัติ
- บน **มือถือ**: ส่วน Shopping list กับ ลำดับเควส เป็น 2 แท็บย่อยสลับกัน ไม่ต้องเลื่อนยาว

**ข้อมูลที่ต้องเพิ่มใน schema เพื่อให้หน้านี้ทำงานได้**
- `objectives[].sources[].kind` แยก `drop / drill / shop / compound / quest-reward / random-box` ให้ชัด (ตอนนี้ปนกันในช่อง `method`/`source`)
- `drill: { depth: "10-20m", terrain: "land" | "rock" | "water" }`
- `compound: { npc, ingredients: [{ item, qty }] }`
- `warnings: ["daytime-only"]`

### 3.5 รวม Calculator เข้า Checklist + แผนที่ + เส้นทาง (ตกลง 2026-11-11)

**ปัญหา**: Quest Checklist กับ Items & Drill Calculator แยกกันแล้วดูซับซ้อน ต้องสลับไปมา

**1.6 รวมเป็นหน้าเดียว**
- Checklist = รายการเควส (ซ้าย) + **🎒 Items to collect** (ขวา) แบบเดียวกับหน้า Episode ใช้ตัวกรองเดียวกัน (หมวด / พื้นที่ / อาชีพ / ค้นหา / สถานะ)
- สลับได้: "เหลือที่ต้องเก็บ" / "ทั้งหมด"
- มือถือ: แท็บย่อย 📜 Quests / 🎒 Items
- ตัดแท็บ Calculator; Drill Depth guide คงไว้เป็นหน้าอ้างอิง

**1.7 แผนที่ + เส้นทาง + ปักหมุด NPC** — ข้อมูลจาก wiki (เช็กแล้ว)
| ของที่ต้องใช้ | wiki มีไหม | หมายเหตุ |
|---|---|---|
| แผนที่ภาพรวมของโซน | ✅ เช่น `Coral_Beach_Map.png` 530×540 มีกรอบแต่ละ map + จุด portal | ใช้เป็นฉากหลังของเส้นทาง |
| แผนที่ราย map | ⚠️ มีแต่เล็ก (188–220px) | ใช้เป็นภาพประกอบ / ปักหมุด NPC |
| ทางเชื่อมระหว่าง map | ✅ รายการ "Portal/Transfer to" | บางหน้ามี template ค้าง ต้องเก็บกวาด |
| ตำแหน่ง NPC | ❌ มีแค่รายชื่อ NPC ต่อ map | ใช้ **โหมดปักหมุด** |

- `data/maps.json`: `{ id, name, region, image, overview: { x, y, w, h } /* กรอบบนแผนที่โซน (%) */, links: [mapId] }`
- `data/npc-pins.json`: `{ npcId: { map, x, y } }` (% ของภาพ) — ผู้ใช้ปักผ่าน **โหมดปักหมุด** ในแอป แล้ว export เป็นไฟล์ commit เข้า repo
- **เส้นทาง** = จุดแวะเรียงตามลำดับเควสที่เหลือ รวมจุดติดกันใน map เดียว เช่น
  ① Blooming Cora: คุย Heidi, Bunny Maid → ② Coral Field 1: ตี Torobbie ×2 (Baby Carrot) → ③ Blooming Cora: ส่งของ
  + map ที่ต้องเดินผ่านคำนวณจาก `links` (BFS) แล้ววาดเส้น + เลขลำดับบนแผนที่โซน
- NPC ที่ยังไม่ได้ปักหมุด: แสดงชื่อ + ไฮไลต์ทั้ง map แทน

---

## 4. แก้ Pain Point #2 — "ไป map ไหนก่อนดี" (Map Priority)

> **โจทย์หลัก**: อยากรู้แค่ว่า **ไป map ไหนก่อน · ตีตัวไหน · ใช้ของกี่ชิ้น · ขุดอะไรกี่อัน**
> เลเวลเป็นเรื่อง **รอง** (ไอเทมทำให้ตัวละครเก่งเกินเลเวลได้) → ไม่ใช้เลเวลตัดเควสทิ้ง แค่แสดงเป็นข้อมูลประกอบ

### 4.1 เควสที่นำมาคิด
- เควสที่ **ยังไม่เสร็จ** + **prereq ครบแล้ว** (รับเควสได้จริง) + **อาชีพตรง** (เฉพาะเควสเปลี่ยนอาชีพ)
- ไม่กรองด้วยเลเวล — แสดงเลเวลมอนสเตอร์ไว้ให้ผู้เล่นตัดสินใจเอง
- เลือกได้ว่าจะคิดจากเควสทุกหมวด หรือเฉพาะหมวดที่เลือก (เช่น เอาแค่ Story + Sticker)

### 4.2 วิธีจัดลำดับ map (เรียบง่าย อธิบายได้)
1. รวม objective ที่เหลือ (ตี / ดรอป / ขุด) ทุกอันเข้ากลุ่มตาม map
2. เรียง map ตาม **จำนวนเควสที่ map นั้นช่วยให้คืบหน้า** (มากไปน้อย)
3. ถ้าเท่ากัน → map ที่มีเควส Story / ลำดับ EP เก่ากว่ามาก่อน
4. แสดงเลเวลมอนสเตอร์เป็น **badge เฉยๆ** (ไม่หักคะแนน) เช่น `Lv.40–45`

### 4.3 หน้าตาที่ต้องการ (หน้า "ไปไหนดี")
```
🗺 ไป map ไหนดี                          [หมวด: ทั้งหมด ▾]

1) Desert Beach Field 3                 ⭐ ช่วย 4 เควส · มอน Lv.40–45
   ⚔ ตี   Mummy Dog ×20 · Sand Bat ×10
   🎒 ดรอป Dog Bone ×12 (จาก Mummy Dog) · Bat Wing ×6 (จาก Sand Bat)
   ⛏ ขุด   Salt ×5 · Sand Glass ×3
   ▸ ดูว่าใช้กับเควสไหนบ้าง

2) Pyramid B1                           ⭐ ช่วย 3 เควส · มอน Lv.48–52
   ...
```
- จำนวนเป็น **ยอดรวมทุกรอบที่ยังเหลือ** หักของที่มีในมือแล้ว (inventory ข้อ 3.3)
- กดขยายดูได้ว่าแต่ละชิ้นเป็นของเควสไหน และต้องส่งให้ NPC คนไหน
- ทำเครื่องหมาย "ฟาร์มเสร็จแล้ว" รายบรรทัดได้

### 4.4 ภายหลัง (ถ้าต้องการ)
- โหมดฟาร์มแบบกด +1 บนมือถือ
- เรียงลำดับการส่งของตาม town
- เตือน Daily และนับเวลาถึง reset

---

## 5. แยกหมวดเควสให้ชัด (Pain Point #3)

### Tag หรือ Category แยก — อันไหนดีกว่า?

**คำตอบ: ใช้ Category เป็นแท็บใหญ่ให้กดง่าย แต่ในข้อมูลให้ 1 เควสอยู่ได้หลายหมวด**

| แบบ | ข้อดี | ข้อเสีย |
|---|---|---|
| Category เดียวต่อเควส (แบบปัจจุบัน) | ง่าย | เควสที่เป็นทั้ง Key และได้ Sticker จะโผล่แค่แท็บเดียว ทำให้หาไม่เจอ |
| Tag ล้วน (chip เล็กๆ หลายอัน) | ยืดหยุ่น | กดยากบนมือถือ คนใช้ต้องคิดเองว่าจะกรองอะไร |
| ✅ **แท็บ Category + เควสอยู่ได้หลายแท็บ** | กดแท็บเดียวเห็นครบ ใช้ง่ายบนมือถือ | ต้องกำหนด `categories: [...]` ในข้อมูล |

- **บนหน้าจอ**: แถบแท็บไอคอนใหญ่เลื่อนแนวนอน (📖 Story · 🎓 Job · 🏷 Sticker · 🔑 Key · …) กดทีเดียวจบ ไม่มี chip ให้เลือกหลายอัน
- **ในข้อมูล**: `"categories": ["key", "sticker"]` → เควสนี้โผล่ทั้งแท็บ Key และแท็บ Sticker
- Tag ย่อยอื่นๆ (เช่น `needs-drill`, `party`) เก็บไว้ในข้อมูลใช้ภายใน ไม่ต้องโชว์ใน UI ตอนนี้

**รายการหมวด (category)**

| Icon | Category | คำอธิบาย |
|---|---|---|
| 📖 | Episode / Story | EP0 – EP สุดท้าย แบ่งตาม Chapter |
| 🎓 | Job Change | เปลี่ยนอาชีพขั้น 1 / 2 / 3 ของทุกสาย |
| 🏷 | Sticker | เควสได้ Sticker (แสดงความคืบหน้า เช่น "Desert 5/7") |
| 🔑 | Key Quest | เควสปลดล็อก dungeon / พื้นที่ |
| ⚔ | Monster / Hunt | ล่ามอนสเตอร์ |
| 🏰 | Dungeon / Boss | |
| 🃏 | Card Girl / Card | เควสการ์ด, skill mastery |
| 🔁 | Daily / Repeatable | มี reset timer |
| 📦 | Storage / System | Keeper Julio, Enlightenment ฯลฯ |
| 📈 | Progression | Progression Quest ของ server ใหม่ (Class 2/3, Lv.200/300, Tower) |
| 🎉 | Event | เควสตามช่วงเวลา (เปิดหรือปิดได้) |

**มุมมองเพิ่มเติม**
- **Sticker Book**: ตารางสะสม sticker ทุกโซน ช่องที่ยังไม่ได้เป็นสีเทา
- **Episode Timeline**: แถบแนวนอน EP0 ▸ EP1 ▸ … พร้อม % ความคืบหน้าแต่ละ chapter

---

## 6. ข้อมูลให้ครบ EP0 → EP สุดท้าย + Job Change (Pain Point #4)

### ข้อมูลใน wiki mirror มีถึง EP ไหน → **EP6 (Songs of Love and Fate) เป็นตอนสุดท้าย** (หน้า `Episode_7_Quests` ไม่มี / 404)

| EP | Chapter ใน wiki | Tracker ตอนนี้ |
|---|---|---|
| EP0 | 3 | ✅ ครบ (33 เควส) |
| EP1 | 3 | ✅ ครบ (20 เควส) |
| EP2 | 3 | ❌ |
| EP3 | 3 + Bonus | ❌ |
| EP4 | 3 + Bonus | ❌ |
| EP5 | 3 + Bonus | ❌ |
| EP6 | 4 + Bonus (~42 เควส) | ❌ |

- คุณภาพข้อมูลใน EP6: Ch.1 (Alteo Doomsday) ครบดี มีจำนวนของ แต่ chapter หลังๆ มี placeholder ค้างอยู่ (`{{{Next}}}`, `{{{Notes}}}`, "Unknown Item") → ต้องเติมจากในเกม
- ยังไม่ได้เช็กความครบของ EP2–EP5 ทีละหน้า (ทำตอนเริ่มแต่ละ batch)
- **server playtrickster.com อาจเปิดไม่ถึง EP6** หรือเรื่องราวต่างไป ("เรื่องราวใหม่") ข้อมูลจาก wiki จึงใช้เป็นโครงเท่านั้น

หน้า wiki อื่นที่เกี่ยวข้อง: `Second_Job_Advancement`, `Third_Job_Advancement`, `New_Dark_Lord_Job_Advancement`, `How_to_Obtain_3rd_Job_Skills`

**ลำดับการเติมข้อมูล**: ดู Roadmap ข้อ 12 — Phase 1 ปรับ 138 เควสเดิม (EP0–EP1 + region) เข้า schema ใหม่ → Phase 2 EP2 → Phase 3 EP3–EP6 ทีละ EP · Job Change / Progression / side content แทรกตามจังหวะ

**ขั้นตอนต่อ EP**: ดึงจาก wiki → แปลงเป็น JSON (ให้ Claude ช่วย parse) → รัน validate → เทียบกับเกมจริงอย่างน้อย 1 เควสต่อ chapter → ติด `source.verified`

> Server นี้มี 9 ตัวละคร (รวม **White Bear** ที่ wiki เก่าไม่มี) → `classes.json` ทำตาม 9 ตัวนี้ ส่วนเควสเปลี่ยนอาชีพของ White Bear และ Progression Quest ต้องเก็บข้อมูลจากในเกมเอง
> เพราะไม่รู้ว่า server เปิดถึง EP ไหน → เติมข้อมูลตาม EP ที่ server เปิดจริงก่อน ส่วนที่เหลือค่อยทำเมื่อ server เปิด

---

## 7. Deploy ให้เปิดในมือถือได้ (Pain Point #5)

**ตัดสินใจแล้ว: repo public + GitHub Pages** ใช้ฟรี push แล้วเว็บอัปเดตเอง ได้ URL `https://teeramu.github.io/trickster-companion/`

- คนอื่นเปิด **GitHub Issue** แจ้งข้อมูลผิดได้ (ข้อ 9)
- ⚠️ repo public จะเห็นรูปเกมทุกรูปใน repo → ใส่ README ว่าเป็น **fan project ไม่แสวงหากำไร** พร้อมเครดิต wiki / ผู้พัฒนาเกม และเก็บเฉพาะรูปที่ใช้จริง (ย่อเป็น webp)
- ห้าม commit key หรือ secret ใดๆ ลง repo (Firebase web config ใส่ได้ เพราะออกแบบมาให้เปิดเผย ความปลอดภัยอยู่ที่ Security Rules ดูข้อ 7.1)

**สิ่งที่ต้องทำเพิ่มเพื่อให้ใช้บนมือถือได้ดี**
- [ ] **PWA**: `manifest.json` + service worker → "Add to Home Screen" ใช้ offline ได้ ไอคอนเหมือนแอป
- [ ] **ย้าย progress ข้ามเครื่อง** (localStorage แยกตามเครื่อง):
  - ระยะแรก: ปุ่ม **Export / Import** เป็นไฟล์ JSON
  - ระยะถัดไป: **Login Google + sync ผ่าน Firebase** (ดูข้อ 7.1)
- [ ] **Multi-character profile**: เก็บ progress แยกตามตัวละคร (main / alt)
- [ ] เรื่องรูป: ดาวน์โหลดจาก wiki mirror มาเก็บใน `assets/` แทน hotlink (ดูข้อ 7.2)

**ขั้นตอนโดยย่อ**
```bash
git init && git add . && git commit -m "init"
gh repo create trickster-companion --public --source=. --push
```
แล้วเปิด repo → Settings → Pages → Deploy from branch `main` / root (เปลี่ยนเป็น GitHub Actions เมื่อมี build step)

### 7.1 Sync progress: Local + Login Google — **ดีครับ แนะนำแบบ "local-first"**

**หลักการ**: แอปใช้ได้เต็มที่โดยไม่ต้องล็อกอิน (เก็บใน `localStorage` เหมือนเดิม) ล็อกอิน Google เป็น **ทางเลือก** เพื่อ sync ข้ามเครื่อง

| ตัวเลือก | เหมาะไหม | หมายเหตุ |
|---|---|---|
| ✅ **Firebase Auth (Google) + Firestore** | แนะนำ | ใช้กับเว็บ static บน GitHub Pages ได้ ไม่ต้องมี server, free tier (Spark) เหลือเฟือสำหรับใช้คนเดียวหรือหลักร้อยคน, มี SDK ทำ offline cache ให้ |
| Supabase (Google login + Postgres) | ได้ | ดีถ้าอยากใช้ SQL แต่โปรเจกต์ free จะถูก pause ถ้าไม่มีคนใช้ 1 สัปดาห์ |
| Google Drive `appDataFolder` | ได้ | เก็บในไดรฟ์ของผู้ใช้เอง ไม่มี database กลาง แต่โค้ดยุ่งกว่า |

**การทำงาน**
1. ไม่ล็อกอิน → เก็บ local อย่างเดียว (มี Export/Import เป็นสำรอง)
2. กด "Sign in with Google" ครั้งแรก → อัปโหลด progress ในเครื่องขึ้นไป (ถ้าบน cloud มีอยู่แล้ว ให้ถามว่าจะใช้ของเครื่องนี้, ของ cloud หรือ **รวมกัน**)
3. หลังจากนั้นทุกครั้งที่ติ๊ก → เขียน local ทันที แล้ว sync ขึ้น cloud แบบ debounce (~2 วินาที)
4. **วิธี merge**: เก็บ `updatedAt` ราย quest / step ถ้าชนกันให้ค่าที่ใหม่กว่าชนะ (ติ๊กบนมือถือแล้วไปเปิดคอมก็ไม่หาย)
5. เก็บแยกตาม profile ตัวละคร: `users/{uid}/profiles/{profileId}`

**Security Rules (สำคัญ)**: อ่าน/เขียนได้เฉพาะ `users/{uid}` ที่ตรงกับคนที่ล็อกอิน
```
match /users/{uid}/{doc=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

**สิ่งที่ผู้ใช้ต้องทำเอง** (ต้องใช้บัญชี Google ของตัวเอง): สร้าง Firebase project, เปิด Google sign-in, สร้าง Firestore, เพิ่มโดเมน `teeramu.github.io` ใน Authorized domains แล้วส่ง web config มาใส่ในโค้ด

### 7.2 รูป / Icon — ใช้จาก wiki mirror

**แหล่งรูป**: [wikimirror.lifeto.co — Trickster wiki](https://wikimirror.lifeto.co/wiki.ggftw.com/trickster/Main_Page.html)
- ไฟล์รูปจริงอยู่ที่ `https://wikimirror.lifeto.co/asset.103.ggftw.net/wiki/to-w/images/<a>/<ab>/<File>.gif` (ตัวเดียวกับที่ `ITEM_IMAGES` ~600 รายการใช้อยู่ตอนนี้)
- รายการรูปแยกหมวด: `Category_Image_List`, `Image_List_-_Drill.html`, `Image_List_-_Weapon.html`, `Image_List_-_Pet.html` ฯลฯ
- หน้า NPC / Monster / Item แต่ละหน้ามีรูปของตัวเอง → ใช้ตอนเติมข้อมูลแต่ละ batch

**สถานะทางลิขสิทธิ์**: รูปเป็นของบริษัทเกม ไม่ใช่ของ wiki → ใช้แบบ fan project ที่ "เจ้าของเกมมักไม่ว่า" ไม่ใช่ "ได้รับอนุญาตแล้ว"

**กติกาที่ใช้**
1. ไม่หารายได้ — ไม่มีโฆษณา, donate หรือขายของ
2. ใส่ disclaimer ใน README และ footer ของเว็บ:
   > *Trickster Online and all related images are property of their respective owners. This is a non-commercial fan project. Images sourced from the ggftw Trickster wiki (via wikimirror.lifeto.co).*
3. ใช้เฉพาะ icon ที่จำเป็น (item, monster, NPC, class, map thumbnail) ไม่ใช้โลโก้เกม / artwork ใหญ่เป็นแบรนด์ของเว็บ ไม่ทำให้ดูเหมือนเว็บทางการ
4. มีสวิตช์ `SHOW_GAME_IMAGES` ปิดรูปทั้งหมดได้ทันที (fallback เป็น emoji/ตัวอักษร) ถ้ามีคำขอให้ลบ
5. (แนะนำ) ถามทีมงานใน Discord ของ playtrickster.com ว่าใช้ icon ใน fan tool ได้ไหม

**วิธีเก็บ: ดาวน์โหลดมาเก็บใน repo** (แทน hotlink)
- เร็ว, ใช้ offline ได้ (PWA), ไม่กิน bandwidth ของ lifeto, ไม่พังถ้า mirror ล่ม
- สคริปต์ `scripts/fetch-images.js`: อ่านรายการรูปจาก data → ดาวน์โหลดเฉพาะที่ใช้จริง → แปลง webp → เก็บที่ `assets/img/{items,monsters,npcs,maps,classes}/<id>.webp`
- ดาวน์โหลดแบบสุภาพ: ทีละไฟล์ มีหน่วงเวลา, ใช้ cache ไม่โหลดซ้ำ
- เก็บที่มาของทุกรูปใน `assets/CREDITS.md` (id → URL ต้นทาง)
- ใน data ใช้ `image: "items/baby-carrot.webp"` แทน URL เต็ม

### 7.2b รวมหมุด NPC จากเพื่อน (ทำแล้ว 2026-11-12)

| ช่วง | เพื่อนทำ | เจ้าของ repo ทำ |
|---|---|---|
| **ตอนนี้ (ไม่มี login)** | B: กด **📤 Send pins** → เปิดฟอร์ม GitHub ที่ใส่หมุดไว้แล้ว → Submit (ต้องมีบัญชี GitHub ฟรี) · A: กด **📋 Copy pins** → วางในแชท LINE / Discord | บอก Claude "รวม pins" → `node scripts/merge-pins.js --issues` หรือไฟล์ / ข้อความที่ได้มา → validate → commit |
| **หลังมี login Google (Phase 4)** | ปักแล้วหมุดส่งขึ้น Firebase เอง ไม่ต้องกดส่ง ไม่ต้องใช้ GitHub | ตรวจ/อนุมัติหมุดใหม่ในหน้า admin หรือ export จาก Firebase แล้วรวมด้วยสคริปต์เดิม |

- **ไม่ต้อง login 2 ระบบ**: GitHub เป็นทางชั่วคราวก่อนมี login; หลัง Phase 4 ผู้เล่นใช้แค่บัญชี Google · หมุดที่รวมไว้แล้วใน `data/npc-pins.json` เป็นค่าเริ่มต้นให้ทุกคนต่อไป
- **กติการวม**: NPC ใหม่ → เพิ่ม · ปักใกล้กัน (≤ 5% ของภาพ) → เฉลี่ยถ่วงตามจำนวนคน (`n`) · ปักคนละที่/คนละ map → ไม่เปลี่ยน + รายงานให้เจ้าของเลือก

### 7.3 แชร์ Progress ให้เพื่อนเห็น (Friends & Party) — ต่อยอดจาก Login

**ทำได้ครับ** เพราะ progress อยู่บน Firestore แล้ว แค่เพิ่ม "หน้าโปรไฟล์ที่แชร์ได้" ให้เพื่อนเปิดดู

#### สิ่งที่เพื่อนจะเห็น
```
👥 Friends                                         [+ เพิ่มเพื่อน] [🔗 แชร์ของฉัน]
───────────────────────────────────────────────────────────────────────────
🐱 MeowKnight (Cat · Lv.52)                         🟢 อัปเดต 5 นาทีที่แล้ว
   📖 กำลังทำ: EP1 Ch.3 — Explorer Reina: Reina's Preparation
   🎒 Power Plan Battery 3/5  ·  ต้องการอีก 2
   🎁 มีเผื่อ: Honey ×4 · Royal Jelly ×3 · Distilled Water ×2
   [ดูโปรไฟล์]

🦊 FoxyLady (Fox · Lv.47)                           ⚪ อัปเดต 2 วันที่แล้ว
   📖 กำลังทำ: EP1 Ch.1 — Rosaline Gracia: Rosaline's Document
   🎒 Royal Jelly 0/2 · Honey 0/1          💡 MeowKnight มีเผื่อ!
```

#### ฟีเจอร์
| ฟีเจอร์ | รายละเอียด |
|---|---|
| **Public profile card** | ตัวละคร (อาชีพ + Lv), EP/เควสที่ทำอยู่, % ความคืบหน้าแต่ละ EP, Sticker ที่สะสม |
| **ของในมือ / ต้องการ / มีเผื่อ** | ระบบคำนวณจาก inventory (ข้อ 3.3) + เควสที่เหลือ → "ต้องการอีก X" และ "มีเกินจากที่ต้องใช้ X" ให้อัตโนมัติ ผู้เล่นติ๊กเพิ่มได้ว่า "เก็บไว้เผื่อเพื่อน" |
| **Match อัตโนมัติ** | 💡 ถ้าเพื่อนต้องการของที่เรามีเผื่อ (หรือกลับกัน) ขึ้นแจ้งบนการ์ด |
| **Party (กลุ่ม)** | สร้างกลุ่ม 2–8 คน → เห็น **Shopping list รวมของทั้งปาร์ตี้** แยกตาม map (ใครขาดอะไรกี่ชิ้น) → ไปตี map เดียวกันทีเดียวจบ |
| **Real-time** | ใช้ Firestore `onSnapshot` → เพื่อนติ๊กปุ๊บ อัปเดตปั๊บ |

> ⚠️ ต้องเพิ่ม field `tradable: true/false` ใน `items.json` เพราะของเควสหลายชิ้นในเกมส่งต่อให้คนอื่นไม่ได้ → ของที่ trade ไม่ได้จะไม่ขึ้นใน "มีเผื่อ" แต่ยังโชว์ว่า "รู้ว่า drop ที่ไหน ไปตีด้วยกันได้"

#### วิธีเพิ่มเพื่อน (ไม่ต้องรู้อีเมลกัน)
- แต่ละ profile ตัวละครมี **Friend Code** สั้นๆ เช่น `CAT-7KQ2` หรือแชร์เป็นลิงก์ `.../#/u/CAT-7KQ2`
- ลิงก์เปิดดูได้แม้ไม่ล็อกอิน (ถ้าตั้งเป็น "ใครมีลิงก์ก็ดูได้") → ส่งใน Discord / LINE ได้เลย
- แสดงชื่อเป็น **ชื่อตัวละครที่ตั้งเอง** ไม่ใช่ชื่อหรืออีเมล Google

#### ความเป็นส่วนตัว (opt-in ทั้งหมด)
| ระดับ | ใครเห็น |
|---|---|
| 🔒 Private (ค่าเริ่มต้น) | เฉพาะตัวเอง |
| 👥 Friends | เฉพาะคนที่เราเพิ่มเป็นเพื่อน / ในปาร์ตี้ |
| 🔗 Link | ใครมีลิงก์ก็ดูได้ (อ่านอย่างเดียว) |
- เลือกได้ว่าจะแชร์อะไรบ้าง: ความคืบหน้าเควส / ของในมือ / เลเวล
- ไม่เคยแสดงอีเมล, รูป Google หรือ uid

#### โครงข้อมูล Firestore
```
users/{uid}/profiles/{profileId}        # ข้อมูลเต็ม (private, เจ้าของเท่านั้น)
publicProfiles/{friendCode}             # สรุปที่ "ตั้งใจแชร์" — เจ้าของเขียน, คนอื่นอ่านตาม visibility
  { ownerUid, name, class, level, visibility, current: {...}, needs: [...], spare: [...], updatedAt }
parties/{partyId}                       # { name, members: [uid...], inviteCode }
```
- แยก `publicProfiles` ออกจากข้อมูลเต็ม → ต่อให้ตั้ง rule ผิด ข้อมูลส่วนตัวก็ไม่รั่ว
- Security Rules: เขียนได้เฉพาะ `ownerUid == request.auth.uid`, อ่านได้ตาม `visibility` / สมาชิกปาร์ตี้
- ค่าใช้จ่าย: ยังอยู่ใน free tier สบายๆ สำหรับกลุ่มเพื่อนหลักสิบ–ร้อยคน

#### ลำดับการทำ
1. Share link อ่านอย่างเดียว (ง่ายสุด ได้ประโยชน์ทันที)
2. Friend list + needs / spare + match 💡
3. Party + Shopping list รวม + real-time

---

## 8. UX/UI (Pain Point #6)

**หลักการ**: mobile-first, กดได้ด้วยนิ้วโป้ง, ใช้ไอคอนแทนข้อความยาว, สีบอกสถานะ

- **Bottom navigation** (บนมือถือ): 🏠 วันนี้ · 📜 เควส · 🗺 Map · 🎒 ของ · ⚙ ตั้งค่า
- **หน้าแรก = "ไปไหนดี"** แสดง map ที่ควรไปก่อน (ข้อ 4) + เควสที่ค้างอยู่
- **Map Browser** (ตามแบบ wiki): เลือกโซน → map → เห็นรูป map, มอนสเตอร์ (รูป + Lv + ของดรอป), ของที่ขุดได้, NPC ใน map และเควสที่เกี่ยวข้อง
- **Monster / Item page**: กดรูปของ → เห็นว่าใช้ในเควสไหน ดรอปจากตัวไหน ที่ map ไหน
- **Global search** ช่องเดียว ค้นได้ทั้งเควส, NPC, item, monster, map
- **สีสถานะ**: เทา = ยังทำไม่ได้ (ติด prereq/level), ขาว = ทำได้, เหลือง = ทำอยู่, เขียว = เสร็จ
- **ไอคอนอาชีพ** (Power/Magic/Sense/Charm และแต่ละสาย) ใช้ใน filter/profile
- **Light / Dark mode** (Auto ตามเครื่อง) + ปรับขนาดตัวอักษร → รายละเอียดข้อ 8.1
- **ภาษา: อังกฤษ** ทั้ง UI และข้อมูล เพราะ wiki / แหล่ง research เป็นอังกฤษ ชื่อตรงกับต้นทาง ตรวจความถูกต้องง่ายกว่า (ถ้าภายหลังอยากใส่ชื่อไทยในเกม ให้เพิ่ม field `nameTh` เป็น optional ไว้ค้นหาได้)
- **Onboarding 3 หน้า**: เลือกอาชีพ → ใส่เลเวล → ติ๊กว่าผ่าน EP ไหนแล้ว (ติ๊กเควสก่อนหน้าให้อัตโนมัติ)
- **Accessibility**: contrast ผ่านเกณฑ์, ปุ่มขนาดอย่างน้อย 44px, ไม่ใช้สีอย่างเดียวบอกสถานะ

### 8.1 Theme ใหม่: น่ารัก สดใส + Light / Dark mode

**ภาพอ้างอิง** (ผู้ใช้ส่งมา 2026-11-11): artwork ทางการของ Trickster — ตัวละครหลายตัวบนเรือ ท้องฟ้าสีฟ้า เมฆขาว นกนางนวล และตัวละครแกะผมชมพูกับโลโก้ "Trickster Evolution"
→ โทนที่ต้องการ: **สดใส พาสเทล การ์ตูนอนิเมะ ผจญภัยทะเล**

#### Palette (ดึงจากภาพอ้างอิง)
| Token | Light | Dark | มาจาก |
|---|---|---|---|
| `--bg` | ฟ้าอ่อนไล่ขาว `#EAF6FF → #FFFFFF` | กรมท่าม่วงยามค่ำ `#141B33 → #1E1838` | ท้องฟ้า / ฟ้ากลางคืน |
| `--card` | ขาวนวล `#FFFFFF` (โปร่ง 85–90%) | `#232A48` (โปร่ง 85–90%) | เมฆ |
| `--primary` | ฟ้าทะเล `#3BA7F0` | `#6CC4FF` | ทะเล / ท้องฟ้า |
| `--accent-pink` | ชมพูพาสเทล `#FF8FB8` | `#FF9EC6` | ผมแกะ, sticker |
| `--accent-yellow` | เหลืองครีม `#FFD45C` | `#FFD970` | ตัวเหลืองหน้าเรือ |
| `--accent-lavender` | ม่วงลาเวนเดอร์ `#A98BFF` | `#B9A2FF` | ผมม่วง, ไม้เท้า |
| `--success` / `--warn` / `--danger` | เขียวมิ้นต์ / ส้มพีช / แดงชมพู | สว่างขึ้น 1 ระดับ | สถานะเควส |

- สีสถานะเควส (ข้อ 8) ใช้ token เดิม: เทา = ล็อก, ขาว/ฟ้า = ทำได้, เหลือง = ทำอยู่, เขียวมิ้นต์ = เสร็จ
- ข้อความต้องผ่าน contrast WCAG AA (4.5:1) ทั้งสองโหมด → สีพาสเทลใช้กับพื้น/ขอบ/ไอคอน ไม่ใช้กับตัวหนังสือบนพื้นขาว

#### สไตล์ "น่ารัก"
- **ฟอนต์กลมมน**: Google Fonts `Nunito` (ตัวเนื้อหา) + `Fredoka` (หัวข้อ/ตัวเลขใหญ่)
- **มุมโค้งมาก** (การ์ด 16–20px, ปุ่ม/ชิปเป็นทรงแคปซูล), **เงานุ่ม**, ขอบ 2px สีพาสเทล
- **Progress bar** แบบลายทางลูกกวาด (candy stripe) + ไอคอนดาว ⭐ เมื่อครบ 100%
- **ไอคอนหมวด** (ข้อ 5) เป็นวงกลมพื้นพาสเทลคนละสี
- **Micro-animation** เล็กน้อย: ติ๊กเควสเสร็จมีเด้ง/ประกาย ✨ (ปิดเองเมื่อเครื่องตั้ง `prefers-reduced-motion`)
- **Empty state** ใช้รูปมอนน่ารัก (เช่น Torobbie / Poppuri จาก wiki) พร้อมข้อความสั้นๆ

#### Light / Dark mode
- สวิตช์ 3 ค่า: **Auto (ตามเครื่อง)** · ☀️ Light · 🌙 Dark — ค่าเริ่มต้น Auto
- ทำด้วย CSS variables: `:root` = light, `[data-theme="dark"]` และ `@media (prefers-color-scheme: dark)` เมื่อเป็น Auto
- จำค่าที่เลือกใน `localStorage` (และ sync ตาม profile เมื่อมี login ใน Phase 4)
- ตั้ง `<meta name="theme-color">` ให้แถบ browser บนมือถือเปลี่ยนสีตามโหมด

#### ภาพพื้นหลัง (Background art)
- ชั้นพื้นหลังแบบ `position: fixed` อยู่หลังเนื้อหาทั้งหมด: รูป artwork + **gradient ทับ** ให้จางลง (Light ~15–20%, Dark ~8–12% + เบลอเล็กน้อย) → ตัวหนังสือยังอ่านง่าย
- การ์ดใช้พื้นโปร่งแสง + `backdrop-filter: blur()` (แบบกระจกฝ้า) ให้เห็นภาพข้างหลังเล็กน้อย
- **ตั้งค่าได้**: เปิด/ปิดภาพพื้นหลัง (ค่าเริ่มต้นเปิดบนคอม, **ปิดบนมือถือ**เพื่อความเร็วและแบต — เปิดเองได้)
- ไฟล์: webp ย่อขนาด ~1600px กว้าง ≤ 250 KB, โหลดแบบ lazy หลังเนื้อหาหลัก ไม่ให้หน้าแรกช้า
- มีภาพ 2 ชุด: กลางวัน (Light) / ยามค่ำ (Dark) ถ้าหาได้ ไม่งั้นใช้ภาพเดียวกันแต่ overlay ต่างกัน

#### เรื่องลิขสิทธิ์ภาพพื้นหลัง (ต่อจากข้อ 7.2)
> ⚠️ artwork ทางการ (key art, wallpaper) มีความเสี่ยงสูงกว่า icon เล็กๆ เพราะเป็นงานศิลปะเต็มชิ้นที่ทำเพื่อโปรโมต
- ✅ ใช้เป็น **พื้นหลังจางๆ เพื่อตกแต่ง** + ใส่เครดิตใน footer ("Background art © Trickster Online / publisher")
- ✅ มีสวิตช์ปิด และถ้าเจ้าของขอให้ลบ → ลบไฟล์ แล้วพื้นหลังกลับเป็น gradient ล้วน (ดีไซน์ต้องสวยได้แม้ไม่มีรูป)
- ❌ **ไม่ใช้โลโก้ "Trickster Evolution"** หรือ artwork เป็นโลโก้/แบรนด์ของเว็บ — ชื่อเว็บยังเป็น "Trickster Companion (fan-made)" ใช้ตัวอักษร + ไอคอนของเราเอง
- แหล่งภาพ: ภาพที่ผู้ใช้ส่งมา / wallpaper ทางการจากหน้าเว็บหรือ Discord ของ playtrickster.com → บันทึกที่มาใน `assets/CREDITS.md`
- (แนะนำ) ถามทีมงานใน Discord พร้อมกับเรื่อง icon (ข้อ 7.2 ข้อ 5)

#### หน้าตาโดยรวม (ตัวอย่าง Light)
```
┌──────────────────────────────────────────────┐  ← พื้นหลัง: ฟ้า + เมฆ + artwork จางๆ
│ ✦ Trickster Companion            ☀️/🌙  ⚙    │
│ ╭──────────────────────────────────────────╮ │
│ │ 📖 EPISODE 1          ⭐ 7/20             │ │  ← การ์ดขาวโปร่ง มุมโค้ง 20px
│ │ ▓▓▓▓▓▓▓░░░░░░░░  (ลายทางลูกกวาดสีฟ้า-ชมพู) │ │
│ ╰──────────────────────────────────────────╯ │
│  (📖)  (🎓)  (🏷)  (🔑)  (⚔)   ← ไอคอนหมวดวงกลมพาสเทล │
└──────────────────────────────────────────────┘
```

---

## 9. คุณภาพข้อมูล (สำคัญมาก เพราะ wiki เก่าและบางส่วนผิด)

- [ ] ทุกเควสมี `source.url` + `source.verified` (เดือน/ปีที่เช็ก) + server ที่เช็ก
- [ ] Badge "⚠ ยังไม่ได้ verify" บนการ์ดที่ยังไม่ได้เช็ก
- [ ] ปุ่ม **"Report wrong data"** → เปิด GitHub Issue พร้อม template (quest id ใส่ให้อัตโนมัติ)
- [ ] CI (GitHub Actions) รัน validate script ทุกครั้งที่ push หรือเปิด PR
- [ ] หน้า Changelog ของข้อมูล

---

## 10. Build Guide / Stat / Skill (Pain Point #7 — อนาคต)

ออกแบบ data ไว้ตั้งแต่ตอนนี้ แต่ลงมือทำทีหลัง

```
data/builds/
  fox-explorer-dex-crit.json
```
```jsonc
{
  "id": "fox-explorer-crit",
  "class": "fox", "jobPath": ["Archaeologist", "Explorer", "..."],
  "playstyle": ["solo-farm", "pvp"],
  "statPlan": [ { "lv": "1-50", "focus": { "DEX": 2, "AGI": 1 } }, ... ],
  "skillPlan": [ { "lv": 10, "skill": "skill.xxx", "points": 5, "why": "…" } ],
  "gear": [ { "lvRange": "1-50", "slot": "weapon", "item": "item.xxx" } ],
  "cards": [], "notes": "…", "author": "…", "updated": "…"
}
```
- **Stat simulator**: ใส่เลเวล → คำนวณแต้มที่ได้ → ลองกระจายสเตตัส ดูค่าที่ได้
- **Skill tree viewer**: ต่ออาชีพ แสดง prereq skill และ skill ขั้น 3
- **Leveling guide**: Lv ช่วงไหนควรไป map ไหน (ใช้ `maps.levelRange` + เควสที่แนะนำ ซึ่งต่อกับระบบ Suggest ได้เลย)
- เชื่อมกับ Profile: ตัวละครที่เลือก build ไว้จะเห็น reminder ตอนเลเวลอัป เช่น "Lv.50 → ใส่ skill X 5 แต้ม"
- ระบบเสริมที่ wiki มี: Drilling, Tempering, Forging, Refinement, Pet, Synergy, Experience Chart ทำเป็นหน้า reference ได้

---

## 11. ไอเดียเพิ่มเติม (นอกเหนือจากที่ขอ)

### ✅ ยืนยันแล้ว: รายการ "ห้ามขาย" (ทำใน Phase 1 ข้อ 1.8)
- หน้ารวม item ทุกชิ้นที่ **ยังต้องใช้กับเควสที่ยังไม่เสร็จ** พร้อมจำนวนรวมที่ต้องเก็บไว้ และชื่อเควสที่ใช้
- ไอคอน 🔒 บน item นั้นทุกที่ในแอป (การ์ดเควส, หน้า map, inventory)
- เรียงตาม "ใช้หลายเควสที่สุด" ก่อน → รู้เลยว่าชิ้นไหนสำคัญ
- ถ้ากรอกจำนวนที่มีในมือ จะเห็นว่า "มีเกิน X ชิ้น ขายได้" หรือ "ยังขาด X ชิ้น"
- คำนวณจากข้อมูล `objectives` อย่างเดียว ไม่ต้องเพิ่มข้อมูลใหม่

### ไอเดียอื่น
| ไอเดีย | ประโยชน์ |
|---|---|
| **Dependency graph view** | เห็นสายเควสเป็นแผนผัง ว่าติดเควสไหนอยู่ |
| **EXP planner** | ใส่เลเวลเป้าหมาย → บอกว่าต้องทำเควสไหนบ้างให้ถึง (ใช้ Experience Chart) |
| **Drill planner** | ของที่ต้องขุดทั้งหมด แยกตาม drill grade และ map |
| **Party mode** | ย้ายไปเป็นแผนจริงแล้ว → ข้อ 7.3 |
| **Session log / สถิติ** | บันทึกว่าแต่ละวันทำอะไรไปบ้าง ได้กี่ EXP |
| **Notification** (PWA) | เตือน Daily reset / Event |
| **Print / Export checklist** | ทำ shopping list ของที่ต้องเก็บเป็นภาพไว้แปะข้างจอ |

---

## 12. Roadmap (แบ่ง Phase ใหม่: ใช้ได้ก่อน → EP2 → EP ถัดไป)

> หลักคิด: **ทำให้ใช้เล่นจริงได้ก่อน** แล้วค่อยเติมเนื้อหา **ทีละ EP** ฟีเจอร์เสริมค่อยตามมา
> แต่ละ Phase จบด้วยการ release (merge เข้า `main` + tag) → เว็บจริงอัปเดต

### Phase 1 — ใช้ได้จริง (EP0–EP1) → release `v0.2.0`

> ⚡ **release v0.2.0 ก่อนกำหนด (2026-11-12)** หลังจบ 1.7 เพื่อให้เพื่อนลองใช้จริง · v0.2.1 ส่งหมุด NPC · v0.3.0 หัวเว็บใหม่ + แถบล่างมือถือ + Report ผ่าน Google Form · เหลือ 1.8

**เป้าหมาย**: เปิดบนมือถือแล้วเล่น EP0–EP1 ได้จนจบ **โดยไม่ต้องเปิด wiki** — รู้ว่าต้องเก็บอะไรกี่ชิ้น ส่งกี่รอบ NPC อยู่ไหน ไป map ไหน ตีตัวไหน ขุดอะไร

| # | งาน | อ้างอิง | Branch |
|---|---|---|---|
| 1.1 ✅ | แยกข้อมูล 138 เควสเดิมเป็น JSON + schema ใหม่ (objective แยก drop / drill / shop / compound / quest-reward, NPC/map เป็น ID) + validate script + ย้าย progress เดิมไม่ให้หาย | ข้อ 2 | `refactor/split-quest-data` |
| 1.2 ✅ | **Theme ใหม่ + Light/Dark**: design tokens (สี/ฟอนต์/มุมโค้ง), สวิตช์ Auto/Light/Dark, ภาพพื้นหลังจางๆ ปิดได้ — ทำก่อนเพื่อให้หน้าใหม่ 1.3–1.7 ใช้สไตล์เดียวกันเลย ไม่ต้องแต่งซ้ำ | ข้อ 8.1 | `feature/cute-theme` |
| 1.3 ✅ | **หน้า Episode**: ภาพรวม + ของที่ต้องเก็บจัดตาม map (สลับ ทั้ง EP / Chapter ปัจจุบัน) + ลำดับเควส (เควสที่ทำอยู่กางเต็ม) | ข้อ 3.4 | `feature/episode-view` |
| 1.4 ✅ | **Quest card ใหม่**: ต่อรอบ / รวม / เหลือ, รับเควสที่ / ส่งที่, สูตรผสม, คำเตือน ⚠ | ข้อ 3.1 | `feature/quest-card` |
| 1.5 ✅ | **แท็บ Category** ไอคอนใหญ่ เควสอยู่ได้หลายแท็บ | ข้อ 5 | `feature/category-tabs` |
| 1.6 ✅ | **รวม Calculator เข้า Quest Checklist**: รายการเควสซ้าย + "🎒 Items to collect" จัดตาม map ขวา (ตามตัวกรอง), ตัดแท็บ Calculator, Drill guide คงไว้ | ข้อ 3.5 | `feature/merge-calculator` |
| 1.7 ✅ | **แผนที่ + เส้นทาง + ปักหมุด NPC**: แผนที่ภาพรวมของโซนพร้อมไฮไลต์ map ที่ต้องไป, เส้นทางเป็นจุดแวะเรียงลำดับ (คุย/ตี/ขุด/ส่ง) + map ที่ต้องเดินผ่าน, โหมดปักหมุดตำแหน่ง NPC | ข้อ 3.5 | `feature/map-route` |
| 1.8 ✅ | **ของในมือ** (+/−) หักจากยอดที่ต้องเก็บ + **รายการห้ามขาย** 🔒 | ข้อ 3.3, 11 | `feature/inventory` |
| 1.9 ✅ | **มือถือ**: responsive + bottom nav + Export/Import progress + Add to Home Screen (manifest + icons) · *ยังไม่มี service worker สำหรับใช้ offline* | ข้อ 7, 8 | `feature/mobile` |
| 1.10 ✅ | **เอาปุ่ม 🖼️ Background on/off ออก** (ผู้ใช้ขอ 2026-11-12): ภาพพื้นหลังแสดงตลอด รวมถึงมือถือ · หัวเว็บย่อเหลือแถบเดียว 60px + เมนู ⚙️ (v0.3.0) | ข้อ 8.1 | `feature/remove-bg-toggle` |

**ยังไม่ทำใน Phase 1**: login/sync, เพื่อน/party, หน้า "ไป map ไหนดี" แบบรวมทุก EP (หน้า Episode ข้อ 1.3 ตอบคำถาม "ไป map ไหน ตีอะไร ขุดอะไร" ภายใน EP ได้แล้ว), map/monster DB, build guide
**เสร็จเมื่อ**: เล่น EP1 จบทั้ง EP บนมือถือได้จากแอปอย่างเดียว

### Phase 2 — EP2 → release `v0.4.0` (ข้อมูล EP2 ทำแล้ว 2026-11-12)

**เป้าหมาย**: หน้า EP2 ใช้ได้ครบเหมือน EP1

| # | งาน | Branch |
|---|---|---|
| 2.1 | อ่านหน้า `Episode_2_Quests` บน wiki → เช็กว่าข้อมูลครบแค่ไหน (จำนวนของ, placeholder ค้าง) | `data/ep2-quests` |
| 2.2 | แปลงเป็น JSON ตาม schema + เพิ่ม NPC / map / monster / item ใหม่ของ EP2 | `data/ep2-quests` |
| 2.3 | ดึงรูปที่ EP2 ใช้ (ข้อ 7.2) | `data/ep2-quests` |
| 2.4 | รัน validate + เทียบกับในเกมอย่างน้อย 1 เควสต่อ chapter → ติด `source.verified` | `data/ep2-quests` |
| 2.5 | แก้ UI ที่ข้อมูล EP2 ทำให้เห็นปัญหา (ถ้ามี) | `fix/...` |

**เสร็จเมื่อ**: เล่น EP2 จบได้จากแอปอย่างเดียว

### Phase 3 — EP ถัดไป ทีละ EP (ทยอยทำ)

ใช้ขั้นตอนเดียวกับ Phase 2 ทุก EP — **1 EP = 1 branch `data/epN-quests` = 1 release**

| ลำดับ | เนื้อหา | Release |
|---|---|---|
| 3.1 | EP3 (3 ch + Bonus) | `v0.4.0` |
| 3.2 | EP4 (3 ch + Bonus) | `v0.5.0` |
| 3.3 | EP5 (3 ch + Bonus) | `v0.6.0` |
| 3.4 | EP6 (4 ch + Bonus, ข้อมูล wiki ไม่ครบ ต้องเติมจากในเกม) | `v0.7.0` |

- **Job Change / Progression Quest / White Bear** แทรกเป็น release ย่อยเมื่อถึงเลเวลที่ต้องใช้ (branch `data/job-change-2nd` ฯลฯ)
- ถ้าเจอว่า server ยังไม่เปิดถึง EP ไหน หยุดรอที่ EP นั้น แล้วไปทำ Phase 4 ระหว่างรอ

### Phase 4 — ฟีเจอร์เสริม (แทรกระหว่าง Phase 3 ได้)

| งาน | อ้างอิง |
|---|---|
| หน้า "ไป map ไหนดี" แบบรวมทุก EP / ทุกหมวด | ข้อ 4 |
| Login Google + sync (Firebase) | ข้อ 7.1 |
| แชร์ progress ให้เพื่อน / Party | ข้อ 7.3 |
| Map browser, หน้า monster / item, NPC directory | ข้อ 3.2, 8 |
| Sticker Book, side content (Tower of Chaos, Eclipse's Shadow ฯลฯ) | ข้อ 5, 6 |
| Build guide, stat sim, skill tree, leveling guide | ข้อ 10 |

---

## 13. Tech Stack ที่แนะนำ

- **คงความเรียบง่าย**: Vanilla JS (ES modules) + JSON ยังไม่ต้องใช้ framework ใช้ได้ทันทีบน GitHub Pages
- ถ้า UI เริ่มซับซ้อน (ราว Phase 4) ค่อยย้ายไป **Vite + Preact/Svelte** (bundle เล็ก เหมาะกับมือถือ) แล้ว deploy ผ่าน GitHub Actions
- Node script สำหรับ: convert ข้อมูลเดิม, validate, ดาวน์โหลดและ optimize รูป (เป็น webp)
- State: `localStorage` + versioned migration → ภายหลังค่อยเพิ่ม cloud sync ถ้าจำเป็น

---

## 14. การตัดสินใจ

**ตัดสินใจแล้ว**
- ✅ Server: [playtrickster.com](https://playtrickster.com/home) (เวอร์ชันไทยเปิดใหม่ 2026)
- ✅ Repo: **public** → deploy ด้วย GitHub Pages
- ✅ ภาษา: **อังกฤษ** (research ง่าย ตรงกับแหล่งข้อมูล)
- ✅ Sync: **local-first + Login Google (Firebase)** แบบ optional
- ✅ ขอบเขตข้อมูล: EP0–EP6 ตาม wiki (EP6 เป็นตอนสุดท้าย)
- ✅ ระบบแนะนำ: เน้น "ไป map ไหนก่อน" ไม่ใช้เลเวลเป็นตัวตัดสิน
- ✅ หมวด: แท็บ Category ใหญ่ กดง่าย และเควสเดียวอยู่ได้หลายแท็บ
- ✅ รายการห้ามขาย: ทำใน Phase 1
- ✅ รวม Calculator เข้า Checklist (1.6) + แผนที่/เส้นทาง/ปักหมุด NPC เอง (1.7) ก่อน release v0.2.0
- ✅ UI: theme น่ารัก สดใส (ฟ้า/ชมพู/เหลือง/ลาเวนเดอร์) + Light/Dark (Auto) + ภาพพื้นหลังจางๆ ปิดได้ → Phase 1 ข้อ 1.2 (spec ข้อ 8.1)
- ✅ แชร์ progress ให้เพื่อน / Party: ทำใน Phase 4 (opt-in, ค่าเริ่มต้น private)
- ✅ ลำดับงาน: Phase 1 ใช้ได้จริง (EP0–EP1) → Phase 2 EP2 → Phase 3 EP3–EP6 ทีละ EP → Phase 4 ฟีเจอร์เสริม

**ยังเปิดอยู่**
1. playtrickster.com เปิดถึง EP ไหนแล้ว (เช็กในเกมหรือ Discord) → ใช้จัดลำดับ Batch ข้อ 6
