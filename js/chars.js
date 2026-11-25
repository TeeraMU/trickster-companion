// 👤 Characters: one player can track several game characters, each with its own quest ticks, runs,
// steps (boss / guardian ticks too), Bag, class / 3rd job path and friends' focus. Builds, NPC pins and
// screen preferences are shared by all of them.
//
// The open character's progress lives in the usual top-level fields of appState (completedQuests …),
// so the rest of the app doesn't change; the others wait in appState.chars[i].data. appState.charId
// (this device only) says which one is open.
// Pure, runs under Node (node scripts/test-chars.js).
(function (root) {
  "use strict";

  const PER_CHAR = ["completedQuests", "completedCycles", "completedSteps", "inventory", "selectedClass", "selectedJobPath", "focus"];
  const MAX = 8;
  const MAIN = "main"; // the first character: the progress from before characters existed
  const DEFAULT_NAME = "Character 1";
  const NAME_MAX = 20;

  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

  function emptyProgress() {
    return { completedQuests: {}, completedCycles: {}, completedSteps: {}, inventory: {}, selectedClass: "All", selectedJobPath: "", focus: null };
  }

  /** The open character's progress, copied out of the state's top-level fields. */
  function snapshot(state) {
    const out = emptyProgress();
    for (const k of PER_CHAR) if (state && state[k] !== undefined) out[k] = clone(state[k]);
    return out;
  }

  /** A progress object with only the per-character fields, the missing ones empty. */
  function cleanProgress(p) {
    const out = emptyProgress();
    if (!p || typeof p !== "object") return out;
    for (const k of ["completedQuests", "completedCycles", "completedSteps", "inventory"]) if (p[k] && typeof p[k] === "object") out[k] = clone(p[k]);
    if (typeof p.selectedClass === "string" && p.selectedClass) out.selectedClass = p.selectedClass;
    if (typeof p.selectedJobPath === "string") out.selectedJobPath = p.selectedJobPath;
    if (p.focus && typeof p.focus === "object") out.focus = clone(p.focus);
    return out;
  }

  function cleanName(n, fallback) {
    const s = String(n == null ? "" : n).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
    return s || fallback || DEFAULT_NAME;
  }

  const validId = id => typeof id === "string" && /^[a-z0-9]{1,24}$/.test(id);

  function newId(taken) {
    for (;;) {
      const id = "c" + Math.random().toString(36).slice(2, 10);
      if (!taken.has(id)) return id;
    }
  }

  /**
   * Makes sure the state has at least one character and an open one. A state from before characters
   * gets "Character 1" (id main) holding its progress. Returns the state.
   */
  function ensure(state) {
    const seen = new Set();
    const list = (Array.isArray(state.chars) ? state.chars : []).filter(c => c && validId(c.id) && !seen.has(c.id) && seen.add(c.id))
      .slice(0, MAX)
      .map((c, i) => ({ id: c.id, name: cleanName(c.name, "Character " + (i + 1)), data: c.data ? cleanProgress(c.data) : null }));
    if (!list.length) list.push({ id: MAIN, name: DEFAULT_NAME, data: null });
    state.chars = list;
    if (!list.some(c => c.id === state.charId)) state.charId = list[0].id;
    // the open one's progress is the top-level fields
    const open = list.find(c => c.id === state.charId);
    if (open.data) { Object.assign(state, clone(open.data)); open.data = null; }
    return state;
  }

  const active = state => (state.chars || []).find(c => c.id === state.charId) || null;

  /** Opens another character: the open one's progress is put away, the other's comes in. false if nothing changed. */
  function switchTo(state, id) {
    ensure(state);
    if (id === state.charId) return false;
    const next = state.chars.find(c => c.id === id);
    if (!next) return false;
    active(state).data = snapshot(state);
    Object.assign(state, cleanProgress(next.data));
    next.data = null;
    state.charId = id;
    return true;
  }

  /**
   * A new character (not opened): empty, or a copy of the open one's progress (a character that played
   * along). Returns its id, or null when there are MAX already.
   */
  function add(state, name, copyOpen) {
    ensure(state);
    if (state.chars.length >= MAX) return null;
    const id = newId(new Set(state.chars.map(c => c.id)));
    const data = copyOpen ? snapshot(state) : emptyProgress();
    state.chars.push({ id, name: cleanName(name, "Character " + (state.chars.length + 1)), data });
    return id;
  }

  function rename(state, id, name) {
    ensure(state);
    const c = state.chars.find(x => x.id === id);
    if (!c) return false;
    c.name = cleanName(name, c.name);
    return true;
  }

  /** Deletes a character and its progress; the last one can't go. The open one: another opens first. */
  function remove(state, id) {
    ensure(state);
    if (state.chars.length <= 1 || !state.chars.some(c => c.id === id)) return false;
    if (id === state.charId) switchTo(state, state.chars.find(c => c.id !== id).id);
    state.chars = state.chars.filter(c => c.id !== id);
    return true;
  }

  /** Every character with its progress (the open one's from the top-level fields): [{ id, name, progress }] */
  function all(state) {
    // doesn't change the state: one from before characters is "Character 1" with its progress
    const list = Array.isArray(state.chars) && state.chars.length ? state.chars : [{ id: MAIN, name: DEFAULT_NAME, data: null }];
    const open = list.some(c => c.id === state.charId) ? state.charId : list[0].id;
    return list.map(c => ({ id: c.id, name: c.name, progress: c.id === open ? snapshot(state) : cleanProgress(c.data) }));
  }

  /** For the menu: [{ id, name, open, done }] (done = quests finished). */
  function list(state) {
    return all(state).map(c => ({ id: c.id, name: c.name, open: c.id === state.charId,
      done: Object.values(c.progress.completedQuests).filter(v => v === true).length }));
  }

  /**
   * Puts a full list back (from the cloud or a merge): [{ id, name, progress }]. The open character
   * stays open if it's still there, else the first one opens.
   */
  function setAll(state, chars) {
    const listIn = (chars || []).filter(c => c && validId(c.id)).slice(0, MAX);
    if (!listIn.length) listIn.push({ id: MAIN, name: DEFAULT_NAME, progress: emptyProgress() });
    const open = listIn.some(c => c.id === state.charId) ? state.charId : listIn[0].id;
    state.chars = listIn.map(c => ({ id: c.id, name: cleanName(c.name), data: c.id === open ? null : cleanProgress(c.progress) }));
    state.charId = open;
    Object.assign(state, cleanProgress(listIn.find(c => c.id === open).progress));
    return state;
  }

  const api = { PER_CHAR, MAX, MAIN, DEFAULT_NAME, NAME_MAX, emptyProgress, snapshot, cleanProgress, cleanName, ensure, active, switchTo, add, rename, remove, all, list, setAll };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TQChars = api;
})(this);
