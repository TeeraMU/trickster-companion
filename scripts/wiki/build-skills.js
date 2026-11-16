// Reads the wiki skill pages (sk/*.html) and job pages (job/*.html) -> skills.raw.json
// usage: node build-skills.js
const fs = require('fs');
const ROOT = 'https://wikimirror.lifeto.co/';
const abs = u => u.replace(/^(\.\.\/)+/, ROOT);
const text = s => String(s).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const cells = row => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)(?=<\/t[dh]>|<t[dh][\s>]|$)/g)].map(m => m[1]);

function parsePage(file) {
  const h = fs.readFileSync(file, 'utf8');
  const out = [];
  const parts = h.split(/<table/).slice(1).map(t => '<table' + t);
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (!/TM Level/.test(t) || !/Prerequisite/.test(t)) continue;
    const rows = t.split(/<tr[^>]*>/).slice(1);
    const hi = rows.findIndex(r => /TM Level/.test(r) && /Prerequisite/.test(r));
    const data = rows[hi + 1];
    if (!data) continue;
    const head = cells(rows[hi]).map(text);
    const c = cells(data);
    const col = n => { const k = head.indexOf(n); return k >= 0 ? c[k] : undefined; };
    const iconM = (col('Icon') || '').match(/src="([^"]+)"/);
    const name = text(col('Name') || ''), tm = text(col('TM Level') || ''), type = text(col('Type') || col('Skill Type') || '');
    const learn = text(col('Learn') || ''), mastery = text(col('Mastery') || ''), itemHtml = col('Mastery Item') || '', prereq = text(col('Prerequisite') || '');
    const desc = rows[hi + 2] ? text(cells(rows[hi + 2])[0] || '') : '';
    // items: "<img ..> <a>Purple Worm Card</a> x5", maybe several
    const items = [];
    for (const m of (itemHtml || '').matchAll(/<a href="([^"]+)" title="([^"]+)">[^<]*<\/a>\s*x\s*(\d+)/g)) {
      const img = (itemHtml.match(new RegExp('title="' + m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"><img[^>]*src="([^"]+)"')) || [])[1];
      items.push({ name: m[2], qty: +m[3], img: img ? abs(img) : '' });
    }
    if (!items.length && text(itemHtml)) items.push({ name: text(itemHtml), qty: 0, img: '' });
    // formula / notes: the next table
    let formula = '', notes = '';
    const nx = parts[i + 1] || '';
    const fm = nx.match(/<b>Formula<\/b>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/);
    if (fm) formula = text(fm[1]);
    const nm = nx.match(/<b>Notes<\/b>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/);
    if (nm) notes = text(nm[1]);
    if (!name) continue;
    // per-level table (Level | MP | Cooldown | Magnifcation | …): the next table whose header starts "Level"
    let levels = null;
    for (let k = i + 1; k <= i + 3 && k < parts.length; k++) {
      if (/Mastery Item|TM Level/.test(parts[k])) break;
      const lrows = parts[k].split(/<tr[^>]*>/).slice(1).map(r => cells(r).map(text));
      if (!lrows.length || lrows[0][0] !== 'Level') continue;
      const head = lrows[0];
      const keep = head.map((h, c) => c === 0 || (h && lrows.slice(1).some(r => (r[c] || '') !== '')));
      const fix = h => h.replace(/Magnifcation/i, 'Magnification');
      levels = {
        cols: head.filter((_, c) => keep[c]).map(fix),
        // level rows only ("1".."10", "Master"; not the "Top of Page" link row)
        rows: lrows.slice(1).filter(r => r[0] && r.length > 1 && /^(\d+|M|Master|Lv\.?\s*\d+)$/i.test(r[0])).map(r => r.filter((_, c) => keep[c]))
      };
      break;
    }
    out.push({ name, icon: iconM ? abs(iconM[1]) : '', tm, type, learn, mastery, items, prereq, desc, formula, notes, levels });
  }
  return out;
}

const pages = {};
for (const f of fs.readdirSync('sk')) {
  const h = fs.readFileSync('sk/' + f, 'utf8');
  if (/404 Not Found/.test(h.slice(0, 400))) continue;
  pages[f.replace(/\.html$/, '')] = parsePage('sk/' + f);
}
// skills missing from the job tables (no mastery column): their own pages
const single = {};
for (const f of fs.readdirSync('one')) {
  const h = fs.readFileSync('one/' + f, 'utf8');
  if (/404 Not Found/.test(h.slice(0, 400))) continue;
  for (const s of parsePage('one/' + f)) single[s.name.toLowerCase()] = s;
}

const jobs = {};
for (const f of fs.readdirSync('job')) {
  const h = fs.readFileSync('job/' + f, 'utf8');
  const name = f.replace(/\.html$/, '').replace(/_/g, ' ');
  const art = (h.match(/src="([^"]*\/thumb\/[^"]+\.(?:png|jpg|gif)\/\d+px-[^"]+)"/) || [])[1];
  const t = text(h.replace(/<script[\s\S]*?<\/script>/g, ''));
  const like = (t.match(/skills are similar to ([A-Z][A-Za-z ]+?) skills/) || [])[1] || '';
  const sk = (h.match(/click one of the below skills for in-depth information\.([\s\S]*?)(Hair Dye|Advancing|Retrieved)/) || [])[1] || '';
  // "They cannot learn Evolution, Beast Claw, or Fatal Wound." names skills the job does NOT get
  const cannot = new Set([...((sk.match(/cannot learn([\s\S]*?)\.\s*(<|$)/) || [])[1] || '').matchAll(/title="([^"]+)"/g)].map(m => m[1]));
  const listed = [...sk.matchAll(/<a href="[^"]+" title="([^"]+)">/g)].map(m => m[1]).filter(n => !/^Image/.test(n) && !cannot.has(n));
  const desc = (t.match(/Description (.*?) (Skills|Appearance) /) || [])[1] || '';
  jobs[name] = { art: art ? abs(art) : '', like, listed: [...new Set(listed)], desc: desc.slice(0, 600) };
}
fs.writeFileSync('skills.raw.json', JSON.stringify({ pages, jobs, single }, null, 1));
console.log('single pages:', Object.keys(single).length);
for (const [k, v] of Object.entries(pages)) console.log(k.padEnd(22), v.length, v.filter(s => !s.icon).length ? 'no-icon:' + v.filter(s => !s.icon).length : '');
for (const [k, v] of Object.entries(jobs)) console.log(k.padEnd(14), v.art ? 'art' : 'NO ART', v.like || '', v.listed.length);
