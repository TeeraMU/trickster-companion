// Route & maps: model (pure, testable under Node) + renderer (browser).
// Data: data/maps.json { regions, maps: [{ id, name, region, kind, image, box|parent, links }], names: { "quest map text": [mapId...] } }
//       data/npc-pins.json { npcId: { map, x, y } }  (x / y in % of the map image), plus pins saved in the browser.
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------------------------

  function indexMaps(mapsData) {
    const byId = new Map(mapsData.maps.map(m => [m.id, m]));
    const regions = new Map(mapsData.regions.map(r => [r.id, r]));
    return { byId, regions, names: mapsData.names };
  }

  /** Shortest list of map ids from a to b (inclusive) using portal links; null if not connected. */
  function shortestPath(idx, a, b) {
    if (a === b) return [a];
    const prev = new Map([[a, null]]);
    const queue = [a];
    while (queue.length) {
      const cur = queue.shift();
      for (const n of idx.byId.get(cur).links) {
        if (prev.has(n)) continue;
        prev.set(n, cur);
        if (n === b) {
          const path = [b];
          for (let p = cur; p !== null; p = prev.get(p)) path.unshift(p);
          return path;
        }
        queue.push(n);
      }
    }
    return null;
  }

  /** Of several possible maps, the one closest to where the player is (first one when unknown). */
  function nearest(idx, from, ids) {
    if (!from || ids.length < 2) return ids[0];
    let best = ids[0], bestLen = Infinity;
    for (const id of ids) {
      const p = shortestPath(idx, from, id);
      if (p && p.length < bestLen) { best = id; bestLen = p.length; }
    }
    return best;
  }

  function itemLeft(it, q, state) {
    if (state.completedQuests[q.id]) return 0;
    const runsLeft = Math.max(0, q.cycles - (state.completedCycles[q.id] || 0));
    return it.totalQty === it.qty * q.cycles ? it.qty * runsLeft : (runsLeft ? it.totalQty : 0);
  }

  /**
   * Stops for doing `quests` in order: accept at the quest's place, collect what's needed (nearest
   * map when several are possible), come back to hand in. Visits to the same map in a row merge
   * into one stop. Each stop lists the maps walked through to get there ("via").
   * action: { type: talk|accept|turnin|drop|drill|hunt|other|buy|combine, quest, text, alts }
   */
  function buildRoute(quests, state, idx, parse, have) {
    // items already in the bag are used up quest by quest; fully covered items need no farm stop
    const pool = Object.assign({}, have || {});
    const stops = [];
    let cur = null;
    const where = text => (idx.names[text] || []).filter(id => idx.byId.has(id));
    const go = (mapId, action) => {
      const last = stops[stops.length - 1];
      if (last && last.map === mapId) { last.actions.push(action); return; }
      const path = cur ? shortestPath(idx, cur, mapId) : null;
      stops.push({ map: mapId, actions: [action], via: path ? path.slice(1, -1) : [] });
      cur = mapId;
    };
    const alts = (ids, chosen) => ids.filter(id => id !== chosen);

    for (const q of quests) {
      if (state.completedQuests[q.id]) continue;
      const home = where(q.location)[0];
      const todo = [];
      for (const it of q.items || []) {
        if (it.method === "Quest") continue;
        const need = itemLeft(it, q, state);
        const got = Math.min(need, Math.max(0, pool[it.name] || 0));
        pool[it.name] = (pool[it.name] || 0) - got;
        const left = need - got;
        if (!left) continue;
        let type = "other", text = `${it.name} ×${left}`;
        if (it.method === "Drop") {
          const mon = parse.parseMonster(it.source);
          type = "drop";
          text = mon ? `${it.name} ×${left} from ${mon.monster} (Lv.${mon.level})` : `${it.name} ×${left} · ${it.source}`;
        } else if (it.method === "Drill") {
          const depth = parse.parseDrill(it.source);
          type = depth ? "drill" : "other";
          text = depth ? `Drill ${it.name} ×${left} at ${depth}` : `${it.name} ×${left} · ${it.source}`;
        } else if (it.method === "Shop") { type = "buy"; text = `Buy ${it.name} ×${left}`; }
        else if (it.method === "Compound") { type = "combine"; text = `Combine ${it.name} ×${left} · ${it.source}`; }
        todo.push({ ids: where(it.map), type, text, quest: q });
      }
      const runsLeft = Math.max(0, q.cycles - (state.completedCycles[q.id] || 0));
      for (const h of q.hunts || []) {
        todo.push({ ids: where(h.map), type: "hunt", text: `Defeat ${h.monster} ×${h.count * runsLeft}${h.timeLimit ? ` within ${h.timeLimit}` : ""}`, quest: q });
      }
      // combining needs the ingredients first
      todo.sort((a, b) => (a.type === "combine") - (b.type === "combine"));

      if (home) go(home, { type: todo.length ? "accept" : "talk", quest: q, text: `${todo.length ? "Accept" : "Talk to"} ${q.npc}` });
      for (const t of todo) {
        if (!t.ids.length) continue;
        const chosen = nearest(idx, cur, t.ids);
        go(chosen, { type: t.type, quest: q, text: t.text, alts: alts(t.ids, chosen) });
      }
      if (home && todo.length) go(home, { type: "turnin", quest: q, text: `Hand in to ${q.npc}` });
    }
    return stops;
  }

  /** Where to draw a map on its region overview: its own box, or its parent's (dungeons, mines). */
  function boxOf(idx, mapId) {
    for (let m = idx.byId.get(mapId), guard = 0; m && guard < 5; m = idx.byId.get(m.parent), guard++) {
      if (m.box) return { region: m.region, box: m.box, own: m.id === mapId };
    }
    return null;
  }

  const model = { indexMaps, shortestPath, nearest, buildRoute, boxOf };

  // ---------------------------------------------------------------------------------------
  // Renderer
  // ---------------------------------------------------------------------------------------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ACTION_ICON = { talk: "💬", accept: "🙋", turnin: "📤", drop: "⚔️", hunt: "⚔️", drill: "⛏️", other: "📦", buy: "🛒", combine: "⚗️" };

  function overviewSvg(idx, region, stops, selected) {
    const [W, H] = region.size;
    const seq = [];
    stops.forEach((s, i) => {
      for (const v of s.via) seq.push({ map: v, stop: null });
      seq.push({ map: s.map, stop: i });
    });
    const centers = seq.map(p => {
      const b = boxOf(idx, p.map);
      return b && b.region === region.id ? { x: (b.box[0] + b.box[2]) / 2, y: (b.box[1] + b.box[3]) / 2, stop: p.stop, map: p.map } : null;
    });
    // route line: consecutive points that are both on this overview
    let line = "";
    for (let i = 1; i < centers.length; i++) {
      const a = centers[i - 1], b = centers[i];
      if (a && b && (a.x !== b.x || a.y !== b.y)) line += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
    }
    const boxes = new Map();
    centers.forEach(c => {
      if (!c) return;
      const b = boxOf(idx, c.map).box;
      const key = b.join(",");
      if (!boxes.has(key)) boxes.set(key, { b, stops: [], via: true });
      const e = boxes.get(key);
      if (c.stop !== null) { e.stops.push(c.stop); e.via = false; }
    });
    const rects = [...boxes.values()].map(e => {
      const [x1, y1, x2, y2] = e.b;
      const isSel = e.stops.includes(selected);
      return `<rect class="rt-box ${e.via ? "is-via" : ""} ${isSel ? "is-selected" : ""}" x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" rx="8" />`;
    }).join("");
    const badges = [...boxes.values()].filter(e => e.stops.length).map(e => {
      const [x1, y1, x2, y2] = e.b;
      const nums = [...new Set(e.stops)].map(n => n + 1);
      const label = nums.length > 3 ? `${nums[0]}…${nums[nums.length - 1]}` : nums.join(",");
      const w = 16 + label.length * 9;
      // top-left corner of the box, so the map's own name on the picture stays readable
      const cx = Math.min(x1 + 8 + w / 2, x2 - w / 2), cy = y1 + 22;
      const sel = e.stops.includes(selected);
      return `<g class="rt-badge ${sel ? "is-selected" : ""}" onclick="selectRouteStop(${e.stops[0]})"><rect x="${cx - w / 2}" y="${cy - 14}" width="${w}" height="28" rx="14" /><text x="${cx}" y="${cy + 6}" text-anchor="middle">${label}</text></g>`;
    }).join("");
    return `
      <div class="rt-overview" style="aspect-ratio:${W} / ${H}">
        <img src="${esc(region.overview)}" alt="${esc(region.name)} map" loading="lazy" />
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          ${rects}<g class="rt-line">${line}</g>${badges}
        </svg>
      </div>`;
  }

  function stopNpcs(stop, npcName) {
    const seen = new Map();
    for (const a of stop.actions) {
      if (a.type !== "talk" && a.type !== "accept" && a.type !== "turnin") continue;
      for (const id of a.quest.npcIds || []) if (!seen.has(id)) seen.set(id, npcName(id));
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }

  function mapCard(idx, stop, i, ctx) {
    const m = idx.byId.get(stop.map);
    const npcs = stopNpcs(stop, ctx.npcName);
    const pins = npcs.map(n => ({ n, pin: ctx.pins[n.id] })).filter(p => p.pin && p.pin.map === m.id);
    const pinMode = ctx.ui.pinMode;
    const pinNpc = ctx.ui.pinNpc && npcs.some(n => n.id === ctx.ui.pinNpc) ? ctx.ui.pinNpc : (npcs[0] || {}).id;
    const image = m.image
      ? `<div class="rt-minimap ${pinMode ? "is-pinning" : ""}" ${pinMode ? `onclick="placeNpcPin(event, '${m.id}', '${esc(pinNpc || "")}')"` : ""}>
           <img src="${esc(m.image)}" alt="${esc(m.name)}" loading="lazy" />
           ${pins.map(p => `<span class="rt-pin" style="left:${p.pin.x}%;top:${p.pin.y}%" title="${esc(p.n.name)}"><span class="rt-pin-label">${esc(p.n.name)}</span></span>`).join("")}
         </div>`
      : `<div class="rt-noimage">No map picture on the wiki for this map.</div>`;
    const npcList = npcs.length ? `
      <ul class="rt-npcs">${npcs.map(n => {
        const p = ctx.pins[n.id];
        const here = p && p.map === m.id;
        return `<li>🙋 <strong>${esc(n.name)}</strong> ${here ? `<span class="rt-pinned">📍 pinned</span>` : `<span class="rt-unpinned">not pinned yet</span>`}
          ${pinMode && here ? `<button type="button" class="btn qc-small-btn" onclick="removeNpcPin('${n.id}')">Remove pin</button>` : ""}</li>`;
      }).join("")}</ul>` : "";
    const pinTools = npcs.length && m.image ? `
      <div class="rt-pin-tools">
        <button type="button" class="btn qc-small-btn" aria-pressed="${pinMode}" onclick="toggleNpcPinMode()">${pinMode ? "✅ Done pinning" : "📍 Pin NPCs"}</button>
        ${pinMode ? `
          <label class="rt-pin-pick">Pin: <select onchange="setPinNpc(this.value)">${npcs.map(n => `<option value="${n.id}" ${n.id === pinNpc ? "selected" : ""}>${esc(n.name)}</option>`).join("")}</select></label>
          <span class="rt-hint">then tap where they stand on the map</span>` : ""}
        ${ctx.pinCount ? `
          <span class="rt-share">Your ${ctx.pinCount} pin${ctx.pinCount === 1 ? "" : "s"}:
            <button type="button" class="btn qc-small-btn" onclick="sendNpcPins()" title="Opens a short form with your pins filled in (no sign-in)">📤 Send</button>
            <button type="button" class="btn qc-small-btn" onclick="copyNpcPins()" title="Copy as text to paste in LINE / Discord">📋 Copy</button>
            <button type="button" class="btn qc-small-btn" onclick="exportNpcPins()" title="Download npc-pins.json">⬇️ File</button>
          </span>` : ""}
      </div>` : "";
    return `
      <div class="rt-mapcard">
        <div class="rt-mapcard-head">
          <span class="rt-num">${i + 1}</span>
          <div><strong>${esc(m.name)}</strong> <a class="rt-wiki" href="${esc(m.page)}" target="_blank" rel="noopener">wiki ↗</a></div>
        </div>
        ${image}
        ${npcList}
        ${pinTools}
      </div>`;
  }

  /** The route panel: region switch, overview with the route drawn, selected stop's map, stop list. */
  function renderRoutePanel(stops, ctx) {
    const idx = ctx.idx;
    if (!stops.length) {
      return `<div class="ep-panel ep-route" data-pane="route"><div class="ep-panel-head"><h3>🗺️ Route</h3></div><div class="ep-empty">✅ Nothing left to walk to here!</div></div>`;
    }
    const selected = Math.min(Math.max(0, ctx.ui.stop || 0), stops.length - 1);
    const stopRegion = s => (boxOf(idx, s.map) || {}).region;
    const regionIds = [...new Set(stops.flatMap(s => [...s.via, s.map]).map(id => (boxOf(idx, id) || {}).region).filter(Boolean))];
    const regionId = regionIds.includes(ctx.ui.region) && ctx.ui.regionFollows === false ? ctx.ui.region : (stopRegion(stops[selected]) || regionIds[0]);
    const region = idx.regions.get(regionId);
    const regionTabs = regionIds.length > 1 ? `
      <div class="rt-regions">${regionIds.map(r => `<button type="button" class="pill-btn ${r === regionId ? "active" : ""}" onclick="selectRouteRegion('${r}')">${esc(idx.regions.get(r).name)}</button>`).join("")}</div>` : "";
    const list = stops.map((s, i) => {
      const m = idx.byId.get(s.map);
      const via = s.via.length ? `<div class="rt-via">via ${s.via.map(v => esc(idx.byId.get(v).name)).join(" → ")}</div>` : "";
      return `
        <li class="rt-stop ${i === selected ? "is-selected" : ""}" onclick="selectRouteStop(${i})">
          <span class="rt-num">${i + 1}</span>
          <div class="rt-stop-main">
            ${via}
            <div class="rt-stop-map">${esc(m.name)}</div>
            <ul class="rt-actions">${s.actions.map(a => `
              <li>${ACTION_ICON[a.type] || "•"} ${esc(a.text)}${a.alts && a.alts.length ? ` <span class="rt-alt">(or ${a.alts.slice(0, 3).map(x => esc(idx.byId.get(x).name)).join(", ")}${a.alts.length > 3 ? "…" : ""})</span>` : ""}</li>`).join("")}</ul>
          </div>
        </li>`;
    }).join("");
    return `
      <div class="ep-panel ep-route" data-pane="route">
        <div class="ep-panel-head">
          <h3>🗺️ Route · ${stops.length} stop${stops.length === 1 ? "" : "s"}</h3>
        </div>
        <p class="ep-hint">${esc(ctx.hint)}</p>
        ${regionTabs}
        ${region ? overviewSvg(idx, region, stops, selected) : ""}
        ${mapCard(idx, stops[selected], selected, ctx)}
        <ol class="rt-stops">${list}</ol>
      </div>`;
  }

  root.TQRoute = Object.assign({ renderRoutePanel }, model);
})(typeof window !== "undefined" ? window : globalThis);
