// Loads quest data from data/*.json (schema v2) and adapts it to the shape the current UI renders.
// Classic script (no modules) so it also loads under Node for scripts/validate.js.
(function (root) {
  "use strict";

  const CATEGORY_LABEL = {
    episode: "Episode", general: "General", monster: "Monster", dungeon: "Dungeon",
    daily: "Everyday", key: "Key", sticker: "Sticker", job: "Job", card: "Card"
  };
  const SOURCE_LABEL = { drop: "Drop", drill: "Drill", quest: "Quest", compound: "Compound", shop: "Shop" };
  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

  function classFilterLabel(classes) {
    const c = classes[0];
    if (c === "all") return "All";
    if (c.startsWith("!")) return "Not " + capitalize(c.slice(1));
    return capitalize(c);
  }

  // Schema v2 quest -> the flat shape used by the current renderer (items / hunts / classFilter ...).
  function toLegacyQuest(q, region) {
    const legacy = {
      id: q.id,
      order: q.order,
      title: q.title,
      npc: q.npc,
      npcIds: q.npcIds,
      location: q.location,
      region: region,
      subRegion: q.chapter,
      category: CATEGORY_LABEL[q.categories[0]],
      categories: q.categories.map(c => CATEGORY_LABEL[c]),
      minLevel: q.minLevel,
      cycles: q.cycles,
      prereq: q.prereqText,
      classFilter: classFilterLabel(q.classes),
      steps: q.steps,
      items: q.objectives.filter(o => o.type === "collect").map(o => ({
        name: o.item,
        qty: o.qty,
        totalQty: o.total !== undefined ? o.total : o.qty * q.cycles,
        method: SOURCE_LABEL[o.source.kind],
        source: o.source.from,
        map: o.source.map
      })),
      hunts: q.objectives.filter(o => o.type === "hunt").map(o => ({
        monster: o.monster, level: o.level, count: o.count, timeLimit: o.timeLimit, map: o.map
      })),
      rewards: q.rewards
    };
    if (q.notes !== undefined) legacy.notes = q.notes;
    return legacy;
  }

  // Quest files list quests by region; regions interleave in play order, so sort by `order`
  // (stable, and quests that share an order number are always in the same file).
  function buildQuestList(questFiles) {
    const all = [];
    for (const file of questFiles) for (const q of file.quests) all.push(toLegacyQuest(q, file.region));
    return all.sort((a, b) => a.order - b.order);
  }

  // { questId: [{ quest, active? }] } — prerequisites as quest ids (schema v2 only)
  function buildPrereqIndex(questFiles) {
    const out = {};
    for (const file of questFiles) for (const q of file.quests) out[q.id] = q.prereqs || [];
    return out;
  }

  async function loadAll(base) {
    const get = async path => {
      const res = await fetch(base + path, { cache: "no-cache" });
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return res.json();
    };
    const index = await get("quests/index.json");
    const [questFiles, images, npcs, maps, npcPins] = await Promise.all([
      Promise.all(index.files.map(f => get("quests/" + f))),
      get("images.json"),
      get("npcs.json"),
      get("maps.json"),
      get("npc-pins.json")
    ]);
    return { quests: buildQuestList(questFiles), prereqsById: buildPrereqIndex(questFiles), images, npcs, maps, npcPins, questFiles };
  }

  root.TQData = { CATEGORY_LABEL, SOURCE_LABEL, toLegacyQuest, buildQuestList, buildPrereqIndex, loadAll };
})(typeof window !== "undefined" ? window : globalThis);
