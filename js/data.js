// Loads quest data from data/*.json (schema v2) and adapts it to the shape the current UI renders.
// Classic script (no modules) so it also loads under Node for scripts/validate.js.
(function (root) {
  "use strict";

  const CATEGORY_LABEL = {
    episode: "Episode", general: "General", monster: "Monster", dungeon: "Dungeon",
    daily: "Everyday", key: "Key", sticker: "Sticker", job: "Job", card: "Card", guardian: "Guardian"
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
      // the area chip a quest sits under: its file's region, unless the quest names another
      // (job quests from the towns sit with 3rd Job under 🎓 Job)
      area: q.area || region,
      path: q.path || null, // 3rd job path (e.g. "primadonna") for quests only that job does
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
        map: o.source.map,
        ...(o.source.quests ? { givers: o.source.quests } : {}) // quests that hand it out (data/item-sources.json)
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
  function buildQuestList(questFiles, itemSources) {
    if (itemSources) applyItemSources(questFiles, itemSources);
    const all = [];
    for (const file of questFiles) for (const q of file.quests) all.push(toLegacyQuest(q, file.region));
    return all.sort((a, b) => a.order - b.order);
  }

  // data/item-sources.json: { items: { name: { kind, from, map, quests? } } } replaces the source of
  // every objective collecting that item (fixes for wiki item pages that are wrong, e.g. Harkon).
  // Changes questFiles in place; returns how many objectives it changed.
  function applyItemSources(questFiles, itemSources) {
    const fix = (itemSources && itemSources.items) || {};
    let n = 0;
    for (const file of questFiles) for (const q of file.quests) for (const o of q.objectives || []) {
      const s = o.type === "collect" && fix[o.item];
      if (!s) continue;
      o.source = { kind: s.kind, from: s.from, map: s.map, ...(s.quests ? { quests: s.quests.slice() } : {}) };
      n++;
    }
    return n;
  }

  // { questId: [{ quest, active? }] } — prerequisites as quest ids (schema v2 only)
  function buildPrereqIndex(questFiles) {
    const out = {};
    for (const file of questFiles) for (const q of file.quests) out[q.id] = q.prereqs || [];
    return out;
  }

  // GitHub Pages sometimes answers 503 for a moment (often right after a deploy). One failed file
  // used to leave the page with no quests, so retry: network errors, 5xx and 429 get 3 more tries
  // (after 0.5 s, 1.5 s, 3 s); a 404 doesn't, since a missing file won't appear by waiting.
  const RETRY_WAITS = [500, 1500, 3000];

  async function fetchJson(url, fetchImpl, wait) {
    const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    const sleep = wait || (ms => new Promise(r => setTimeout(r, ms)));
    let lastError;
    for (let attempt = 0; attempt <= RETRY_WAITS.length; attempt++) {
      if (attempt) await sleep(RETRY_WAITS[attempt - 1]);
      let res;
      try {
        res = await f(url, { cache: "no-cache" });
      } catch (e) {
        lastError = e; // offline / dropped connection: try again
        continue;
      }
      if (res.ok) return res.json();
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status !== 429 && res.status < 500) break;
    }
    throw lastError;
  }

  async function loadAll(base) {
    const get = path => fetchJson(base + path).catch(e => { throw new Error(`${path}: ${e.message}`); });
    const index = await get("quests/index.json");
    const [questFiles, images, npcs, maps, npcPins, classes, itemSources] = await Promise.all([
      Promise.all(index.files.map(f => get("quests/" + f))),
      get("images.json"),
      get("npcs.json"),
      get("maps.json"),
      get("npc-pins.json"),
      get("classes.json").catch(() => ({ classes: {} })), // job sprites; the app works without them
      get("item-sources.json").catch(() => ({ items: {} })) // source fixes; the app works without them
    ]);
    return { quests: buildQuestList(questFiles, itemSources), prereqsById: buildPrereqIndex(questFiles), images, npcs, maps, npcPins, questFiles, classes: classes.classes || {} };
  }

  root.TQData = { CATEGORY_LABEL, SOURCE_LABEL, toLegacyQuest, buildQuestList, applyItemSources, buildPrereqIndex, loadAll, fetchJson, RETRY_WAITS };
})(typeof window !== "undefined" ? window : globalThis);
