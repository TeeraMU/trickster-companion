// What gets synced to the cloud and how two copies are combined. Pure (no browser, no Firebase)
// so it runs under Node: node scripts/test-sync.js
(function (root) {
  "use strict";

  const SCHEMA = 1;

  // The progress worth keeping on every device. Screen preferences (filters, open page, theme) stay
  // per device.
  function pick(state, pins) {
    return {
      schema: SCHEMA,
      completedQuests: trueOnly(state.completedQuests),
      completedCycles: positiveOnly(state.completedCycles),
      completedSteps: trueOnly(state.completedSteps),
      inventory: positiveOnly(state.inventory),
      pins: Object.assign({}, pins || {}),
      selectedClass: state.selectedClass || "All",
      selectedJobPath: state.selectedJobPath || ""
    };
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

  // Combine two copies (first sign-in on a device that already has progress, "Merge both"):
  // ticked on either = ticked, the higher run / item count wins, pins from `a` win over `b`,
  // class and 3rd job path come from `a` (this device).
  function merge(a, b) {
    a = a || pick({}, {});
    b = b || pick({}, {});
    const max = (x, y) => {
      const out = Object.assign({}, x);
      for (const [k, v] of Object.entries(y || {})) out[k] = Math.max(out[k] || 0, v);
      return out;
    };
    return {
      schema: SCHEMA,
      completedQuests: Object.assign({}, b.completedQuests, a.completedQuests),
      completedCycles: max(a.completedCycles, b.completedCycles),
      completedSteps: Object.assign({}, b.completedSteps, a.completedSteps),
      inventory: max(a.inventory, b.inventory),
      pins: Object.assign({}, b.pins, a.pins),
      selectedClass: a.selectedClass && a.selectedClass !== "All" ? a.selectedClass : b.selectedClass || "All",
      selectedJobPath: a.selectedJobPath || b.selectedJobPath || ""
    };
  }

  // Short summary for the "which copy?" question: { quests, steps, items, pins }
  function summary(p) {
    p = p || {};
    const n = o => Object.keys(o || {}).length;
    return { quests: n(p.completedQuests), steps: n(p.completedSteps), items: n(p.inventory), pins: n(p.pins) };
  }

  function isEmpty(p) {
    const s = summary(p);
    return !s.quests && !s.steps && !s.items && !s.pins;
  }

  // Same progress? (key order doesn't matter)
  function same(a, b) {
    const norm = p => JSON.stringify(sortKeys(Object.assign({}, p, { schema: SCHEMA })));
    return norm(a) === norm(b);
  }

  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") return Object.keys(v).sort().reduce((o, k) => (o[k] = sortKeys(v[k]), o), {});
    return v;
  }

  const api = { SCHEMA, pick, merge, summary, isEmpty, same };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TQSync = api;
})(this);
