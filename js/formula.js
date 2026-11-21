// Skill formulas from the wiki ("[AP + (HV × 16)] × (m ÷ 8)") worked out with a build's stats and a
// skill level's table row. Only arithmetic is read: numbers, + − × ÷ * / ( ) [ ], stat names and the
// level table's columns; anything else ends an expression, so nothing in the text is ever run as code.
// Pure, runs under Node (node scripts/test-planner.js).
(function (root) {
  "use strict";

  /** "240%" -> 2.4, "1,390" -> 1390, "+4" -> 4, "3 seconds" -> 3; null when there's no number. */
  function cellValue(v) {
    const s = String(v == null ? "" : v).replace(/,/g, "").trim();
    const m = /^[+]?(-?\d+(?:\.\d+)?)/.exec(s);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return /%/.test(s) ? n / 100 : n;
  }

  const STAT_WORDS = {
    "Max HP": "HP", "MAX HP": "HP", "Players MAX HP": "HP", "Current HP": "HP", "Total AC": "AC", "Base AP": "AP",
    "Normal Attack Damage": "AP", "Attack Power": "AP",
    AP: "AP", AC: "AC", DX: "DX", MP: "MP", MA: "MA", MD: "MD", WT: "WT", DA: "DA", LK: "LK", HP: "HP", DP: "DP", HV: "HV"
  };
  const ELEMENT_WORDS = ["Fire", "Water", "Wind", "Earth", "Elec", "Light", "Dark"];

  /**
   * The names a formula may use and their values: stats, "<Element> Attr" (attack element, % / 100)
   * and every column of the level table row (by full name, without its "(x)" part, and as the x).
   * stats: { AP: 5000, … }, elements: { Fire: 30 }, table: { cols, rows }, lv: "1".."10" | "M"
   */
  function formulaVars(stats, elements, table, lv) {
    const vars = new Map();
    for (const [w, k] of Object.entries(STAT_WORDS)) if (stats[k] != null) vars.set(w, stats[k]);
    // the wiki names elements several ways: "Fire Attr", "Water Attribute", "Soil%", "Darkness Attribute %"
    const ELEMENT_ALIASES = { Earth: ["Soil"], Elec: ["Electric"], Dark: ["Darkness"] };
    for (const e of ELEMENT_WORDS) {
      const v = ((elements || {})[e] || 0) / 100;
      for (const w of [e, ...(ELEMENT_ALIASES[e] || [])]) {
        vars.set(w + " Attr", v);
        vars.set(w + " Attribute", v);
        if (w !== "Light") vars.set(w, v); // "Water%"; not "Light", which is also a word
      }
    }
    if (table && table.rows && table.rows.length) {
      const row = lv === "M" ? table.rows[table.rows.length - 1]
        : table.rows.find(r => r[0] === String(lv)) || table.rows[table.rows.length - 1];
      table.cols.forEach((c, i) => {
        if (i === 0) return;
        const v = cellValue(row[i]);
        if (v == null) return;
        const col = String(c).trim();
        const short = col.replace(/\s*\([^)]*\)\s*$/, "").trim();
        const inner = /\(([^)]+)\)\s*$/.exec(col); // "Mag. Ratio (m)" -> m, "Attack Power (Magnification)" -> Magnification
        const set = (k, force) => { if (k && (force || !vars.has(k))) vars.set(k, v); };
        set(col, true);
        set(short);
        if (inner) set(inner[1].trim());
        // "Mag. Ratio" and "Magnification Ratio" are the same column on the wiki
        if (/^Magnification Ratio$/i.test(short)) { set("Mag. Ratio"); set("Mag.Ratio"); }
        if (/^Mag\.? ?Ratio$/i.test(short)) set("Magnification Ratio");
        set(short.split(" ").pop()); // "Magic Power" also answers to "Power"
      });
    }
    return vars;
  }

  // ---- tokens --------------------------------------------------------------------------------
  function tokenize(text, names) {
    const out = [];
    const sorted = [...names].sort((a, b) => b.length - a.length);
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (/\s/.test(ch)) { i++; continue; }
      const num = /^(?:\d+(?:\.\d+)?|\.\d+)%?/.exec(text.slice(i));
      if (num) { out.push({ t: "num", v: num[0].endsWith("%") ? parseFloat(num[0]) / 100 : parseFloat(num[0]), at: i }); i += num[0].length; continue; }
      if ("+-−×÷*/()[]".includes(ch)) {
        const op = { "×": "*", "÷": "/", "−": "-", "[": "(", "]": ")" }[ch] || ch;
        out.push({ t: "op", v: op, at: i }); i++; continue;
      }
      // a name: the longest known one that ends on a word boundary
      const name = sorted.find(n => text.startsWith(n, i) && !/[A-Za-z0-9]/.test(text[i + n.length] || ""));
      if (name && !/[A-Za-z]/.test(text[i - 1] || "")) {
        out.push({ t: "var", v: name, at: i });
        i += name.length;
        while (/[\s%]/.test(text[i] || "") && text.slice(i).trimStart().startsWith("%")) i = text.indexOf("%", i) + 1; // "Magnification%": the value is already a ratio
        continue;
      }
      out.push({ t: "stop", at: i }); // a word we don't know ends the expression
      while (i < text.length && /[A-Za-z']/.test(text[i])) i++;
      if (i < text.length && !/[A-Za-z']/.test(text[i]) && out[out.length - 1].at === i) i++;
    }
    return out;
  }

  // ---- expressions: runs of tokens between stops, parsed with + − × ÷ and brackets ------------
  function parse(tokens, vars) {
    let p = 0;
    const peek = () => tokens[p];
    function primary() {
      const t = tokens[p];
      if (!t) throw 0;
      if (t.t === "num") { p++; return { v: t.v, stat: false }; }
      if (t.t === "var") { p++; return { v: vars.get(t.v), stat: t.v in STAT_WORDS }; }
      if (t.t === "op" && t.v === "(") {
        p++;
        const e = expr();
        if (!peek() || peek().v !== ")") throw 0;
        p++;
        return e;
      }
      if (t.t === "op" && t.v === "-") { p++; const e = primary(); return { v: -e.v, stat: e.stat }; }
      throw 0;
    }
    function term() {
      let a = primary();
      while (peek() && peek().t === "op" && (peek().v === "*" || peek().v === "/")) {
        const op = tokens[p++].v, b = primary();
        a = { v: op === "*" ? a.v * b.v : a.v / b.v, stat: a.stat || b.stat };
      }
      return a;
    }
    function expr() {
      let a = term();
      while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
        const op = tokens[p++].v, b = term();
        a = { v: op === "+" ? a.v + b.v : a.v - b.v, stat: a.stat || b.stat };
      }
      return a;
    }
    const e = expr();
    if (p !== tokens.length) throw 0;
    return e;
  }

  /**
   * Every damage expression in a formula: [{ label, text, value }]. A label is the words just before
   * it ("First Hit", "WITH Fire Attr"); expressions without a stat (a lone "1.5") are left out.
   */
  function evalFormula(formula, vars) {
    // the wiki also writes "x" for ×, and one column name with a typo
    const text = String(formula || "").replace(/\s+/g, " ")
      .replace(/(^|[\s)\]\d])[xX](?=\s*[\d([A-Z])/g, "$1×").replace(/Magnifcation/g, "Magnification");
    const tokens = tokenize(text, vars.keys());
    const parts = [];
    let run = [], lastEnd = 0;
    const flush = end => {
      // a word we can't read inside brackets ("AP × [(PBL × 0.6) …") breaks the whole expression
      let depth = 0;
      for (const t of run) if (t.t === "op") depth += t.v === "(" ? 1 : t.v === ")" ? -1 : 0;
      if (depth > 0 && end < text.length) { run = []; return; }
      // trim operators hanging at either end ("= AP × m" / "AP × m ="), then try ever shorter tails
      while (run.length && run[0].t === "op" && !["(", "-"].includes(run[0].v)) run.shift();
      while (run.length && run[run.length - 1].t === "op" && run[run.length - 1].v !== ")") run.pop();
      for (let s = 0; s < run.length; s++) {
        try {
          const r = parse(run.slice(s), vars);
          const ops = run.slice(s).some(t => t.t === "op" && t.v !== "(" && t.v !== ")");
          if (r.stat && ops && Number.isFinite(r.v)) {
            const from = run[s].at, to = end;
            // the label: words between the last expression and this one ("First Hit:", "WITH Fire Attr:")
            const label = text.slice(lastEnd, from).replace(/[=:.]/g, " ").replace(/\s+/g, " ").trim().slice(-40);
            parts.push({ label, text: text.slice(from, to).trim().replace(/[=:]$/, "").trim(), value: r.v });
            lastEnd = to;
            break;
          }
        } catch (e) { /* not an expression from here */ }
      }
      run = [];
    };
    tokens.forEach((t, i) => {
      if (t.t === "stop") flush(t.at);
      else run.push(t);
      if (i === tokens.length - 1) flush(text.length);
    });
    return parts;
  }

  const api = { cellValue, formulaVars, evalFormula };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TQFormula = api;
})(this);
