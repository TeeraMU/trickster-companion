// What gets synced to the cloud and how two copies are combined. Pure (no browser, no Firebase)
// so it runs under Node: node scripts/test-sync.js
(function (root) {
  "use strict";

  const SCHEMA = 1;
  const isNode = typeof module !== "undefined" && module.exports;
  // saved builds are cleaned and merged by js/planner.js, characters by js/chars.js
  const planner = () => (isNode ? require("./planner.js") : root.TQPlanner);
  const chars = () => (isNode ? require("./chars.js") : root.TQChars);

  // The progress worth keeping on every device. Screen preferences (filters, open page, theme) stay
  // per device. Each character's progress: the first character's in the top-level fields (as before
  // characters existed, so an older copy of the app still reads it), the others' in charData by id;
  // chars lists them all in order with their names. Which one is open stays per device.
  function progressPart(p) {
    p = p || {};
    return {
      completedQuests: trueOnly(p.completedQuests),
      completedCycles: positiveOnly(p.completedCycles),
      completedSteps: trueOnly(p.completedSteps),
      inventory: positiveOnly(p.inventory),
      selectedClass: p.selectedClass || "All",
      selectedJobPath: p.selectedJobPath || "",
      focus: p.focus || null // scope pinned for friends (Friends page)
    };
  }

  /** The payload from a list of characters [{ id, name, progress }] and the shared parts. */
  function build(list, shared) {
    const first = list[0];
    const charData = {};
    for (const c of list.slice(1)) charData[c.id] = progressPart(c.progress);
    return Object.assign({ schema: SCHEMA }, progressPart(first.progress), {
      pins: Object.assign({}, shared.pins || {}),
      hideBag: !!shared.hideBag, // "Share my Bag with friends" switched off
      builds: planner().cleanBuilds(shared.builds), // Build planner's saved builds
      chars: list.map(c => ({ id: c.id, name: c.name })),
      charData
    });
  }

  function pick(state, pins) {
    state = state || {};
    return build(chars().all(state), { pins, hideBag: state.hideBag, builds: state.planner && state.planner.builds });
  }

  /**
   * Every character in a payload: [{ id, name, progress }]. A copy without chars (saved before
   * characters, or by an older copy of the app) is one character, "Character 1".
   */
  function charsOf(p) {
    p = p || {};
    const C = chars();
    const list = Array.isArray(p.chars) && p.chars.length ? p.chars : [{ id: C.MAIN, name: C.DEFAULT_NAME }];
    return list.map((c, i) => ({ id: c.id, name: c.name, progress: i === 0 ? progressPart(p) : progressPart((p.charData || {})[c.id]) }));
  }

  function trueOnly(o) {
    const out = {};
    for (const [k, v] of Object.entries(o || {})) if (v === true) out[k] = true;
    return out;
  }

  function positiveOnly(o) {
    const out = {};
    for (const [k, v] of Object.entries(o || {})) if (Number(v) > 0) out[k] = Number(v);
    return out;
  }

  // One character's two copies: ticked on either = ticked, the higher run / item count wins,
  // class and 3rd job path come from `a` (this device).
  function mergeProgress(a, b) {
    const max = (x, y) => {
      const out = Object.assign({}, x);
      for (const [k, v] of Object.entries(y || {})) out[k] = Math.max(out[k] || 0, v);
      return out;
    };
    return {
      completedQuests: Object.assign({}, b.completedQuests, a.completedQuests),
      completedCycles: max(a.completedCycles, b.completedCycles),
      completedSteps: Object.assign({}, b.completedSteps, a.completedSteps),
      inventory: max(a.inventory, b.inventory),
      selectedClass: a.selectedClass && a.selectedClass !== "All" ? a.selectedClass : b.selectedClass || "All",
      selectedJobPath: a.selectedJobPath || b.selectedJobPath || "",
      focus: a.focus || b.focus || null
    };
  }

  // Combine two copies (first sign-in on a device that already has progress, "Merge both"): the same
  // character (by id) on both is merged, the others are kept; names and order from `a` (this device).
  // Pins from `a` win over `b`.
  function merge(a, b) {
    a = a || pick({}, {});
    b = b || pick({}, {});
    const A = charsOf(a), B = charsOf(b);
    const list = A.map(c => {
      const other = B.find(x => x.id === c.id);
      return other ? { id: c.id, name: c.name, progress: mergeProgress(c.progress, other.progress) } : c;
    });
    for (const c of B) if (!list.some(x => x.id === c.id) && list.length < chars().MAX) list.push(c);
    return build(list, {
      pins: Object.assign({}, b.pins, a.pins),
      hideBag: !!(a.hideBag || b.hideBag), // private on either copy stays private
      builds: planner().mergeBuilds(a.builds, b.builds)
    });
  }

  // Short summary for the "which copy?" question: { quests, steps, items, pins, builds, chars }
  // (quests, steps and items of every character together)
  function summary(p) {
    p = p || {};
    const n = o => Object.keys(o || {}).length;
    const list = charsOf(p);
    const sum = f => list.reduce((s, c) => s + n(c.progress[f]), 0);
    return { quests: sum("completedQuests"), steps: sum("completedSteps"), items: sum("inventory"), pins: n(p.pins), builds: (p.builds || []).length, chars: list.length };
  }

  function isEmpty(p) {
    const s = summary(p);
    return !s.quests && !s.steps && !s.items && !s.pins && !s.builds && s.chars <= 1;
  }

  // Same progress? (key order doesn't matter; a copy saved before builds or characters were synced
  // has none: no builds, one character "Character 1")
  function same(a, b) {
    const norm = p => {
      const list = charsOf(p);
      const full = build(list, { pins: (p || {}).pins, hideBag: (p || {}).hideBag, builds: (p || {}).builds || [] });
      return JSON.stringify(sortKeys(full));
    };
    return norm(a) === norm(b);
  }

  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") return Object.keys(v).sort().reduce((o, k) => (o[k] = sortKeys(v[k]), o), {});
    return v;
  }

  const api = { SCHEMA, pick, merge, summary, isEmpty, same, charsOf };
  if (isNode) module.exports = api;
  else root.TQSync = api;
})(this);
