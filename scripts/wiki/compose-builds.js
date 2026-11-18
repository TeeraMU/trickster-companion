// skills.raw.json + it/ + mon/ + classes.json -> <repo>/data/builds.json
// usage: node compose.js G:/Claude/Trickster
const fs = require('fs');
const repo = process.argv[2];
const raw = JSON.parse(fs.readFileSync('skills.raw.json', 'utf8'));
const classes = JSON.parse(fs.readFileSync(repo + '/data/classes.json', 'utf8')).classes;
const text = s => String(s).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const fileOf = n => n.replace(/ /g, '_').replace(/[\/:*?"<>|]/g, '-') + '.html';
// an item page reached through a redirect ("Officer Akto Card") is really another item ("Officer Okto Card")
const canonCache = {};
function canon(name) {
  if (name in canonCache) return canonCache[name];
  const f = 'it/' + fileOf(name);
  let real = name;
  if (fs.existsSync(f)) {
    const h1 = (fs.readFileSync(f, 'utf8').match(/<h1[^>]*firstHeading[^>]*>([^<]+)<\/h1>/) || [])[1];
    if (h1 && h1.trim() !== name) real = h1.trim().replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }
  return (canonCache[name] = real);
}

const TYPE = { Bunny: 'Power', Buffalo: 'Power', Sheep: 'Magic', Dragon: 'Magic', Fox: 'Sense', Lion: 'Sense', Cat: 'Charm', Raccoon: 'Charm' };
const STATS = ['AP', 'AC', 'DX', 'MP', 'MA', 'MD', 'WT', 'DA', 'LK', 'HP', 'DP', 'HV'];

// --- skills ----------------------------------------------------------------------------
const single = raw.single;
// every skill name the wiki knows, longest first (prerequisite texts run names together:
// "Seal of Water Mana Shield (Lv.10)")
const ALL_NAMES = [...new Set([...Object.values(raw.pages).flat(), ...Object.values(single)].map(s => s.name))]
  .sort((a, b) => b.length - a.length);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Bull's Eye (Lv.10) Burning Rave (Mastered)" -> [{ name, lv: "10" }, { name, lv: "M" }] */
function parsePrereq(text) {
  const out = [];
  let rest = ' ' + String(text || '') + ' ';
  for (const name of ALL_NAMES) {
    const m = rest.match(new RegExp('(^|\\s)' + reEsc(name) + '(?:\\s*\\((?:Lv\\.?\\s*)?([^)]*)\\))?(?=\\s|$)', 'i'));
    if (!m) continue;
    let lv = (m[2] || '').trim();
    if (/^(m|master|mastered)$/i.test(lv)) lv = 'M';
    out.push({ name, lv, at: m.index });
    rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  return out.sort((a, b) => a.at - b.at).map(({ name, lv }) => ({ name, lv }));
}

/** How the skill is got, from the wiki's notes: card pack, quest, Chaos Tower, from the start. */
function howToGet(notes) {
  const n = String(notes || '');
  let m;
  if ((m = n.match(/(?:Acquired|Obtained) from (?:the )?((?:Card Pack \w+)|(?:\w+ Card Pack))/i))) return { kind: 'cardpack', text: m[1].replace(/^(\w+) Card Pack$/i, 'Card Pack $1') };
  if ((m = n.match(/(?:Obtained|Acquired) (?:from|by) completing (?:the )?([^.]+?)(?: quest)?\./i))) return { kind: 'quest', text: m[1].trim() };
  if ((m = n.match(/(?:Obtained|Acquired) from (Chaos Tower[^.]*)\./i))) return { kind: 'drop', text: m[1].trim() };
  if (/upon creating/i.test(n)) return { kind: 'start', text: 'You start with it' };
  return null;
}

function clean(s, tmOverride) {
  const tmText = String(s.tm || '');
  const tm = tmOverride != null ? tmOverride : (parseInt(tmText, 10) || 0);
  // stats the caster's damage uses; "Target HV" / "Target DP" are the monster's, not yours
  const own = String(s.formula || '').replace(/\b(Target|Enemy|Monster)('s)?\s+[A-Z]{2}\b/gi, '');
  const uses = STATS.filter(st => new RegExp('\\b' + st + '\\b').test(own));
  return {
    name: s.name, icon: s.icon, tm, type: (s.type || '').replace('On-Off', 'On/Off'),
    learn: +s.learn || 0, master: +s.mastery || 0,
    items: s.items.filter(i => i.qty).map(i => ({ name: canon(i.name), qty: i.qty })),
    prereq: s.prereq && s.prereq !== 'None' ? s.prereq : '',
    needs: s.prereq && s.prereq !== 'None' ? parsePrereq(s.prereq) : [],
    how: howToGet(s.notes),
    desc: s.desc, formula: /^[-–\s]*$/.test(s.formula || '') ? '' : s.formula, uses,
    notes: (s.notes || '').slice(0, 600),
    // per level: { cols: ["Level", "MP", "Cooldown", …], rows: [["1", "300", …], …, ["Master", …]] }
    levels: s.levels && s.levels.rows.length ? s.levels : null
  };
}
function findSkill(page, name) {
  const lc = name.toLowerCase();
  return (raw.pages[page] || []).find(s => s.name.toLowerCase() === lc) || single[lc] || single[lc.replace(/ \(skill\)$/, '')];
}

// the skill set each job adds: 1st job from the type page, others from the job's own page;
// hybrids ("similar to Warrior skills") take the listed ones from that page with TM +50
const sets = {};
const missing = [];
for (const [cls, c] of Object.entries(classes)) {
  for (const j of c.jobs) {
    const info = raw.jobs[j.name];
    if (!info) { missing.push('job page ' + j.name); continue; }
    const page = j.stage === 1 ? TYPE[cls] + '_Skills' : (info.like || j.name).replace(/ /g, '_') + '_Skills';
    const list = [];
    for (const n of info.listed) {
      const s = findSkill(page, n);
      if (!s) { if (/^[A-Z]/.test(n) && !/ Skills$/.test(n)) missing.push(j.name + ': ' + n); continue; }
      if (list.some(x => x.name === s.name)) continue;
      let tm = null;
      if (info.like) {
        const own = String(s.tm).match(new RegExp(j.name + ':\\s*(\\d+)'));
        tm = own ? +own[1] : (parseInt(s.tm, 10) || 0) + 50;
      }
      list.push(clean(s, tm));
    }
    sets[j.name] = list;
  }
}

// --- mastery items: picture, how to get, monsters and their maps -------------------------
const itemImg = {};
for (const v of [...Object.values(raw.pages).flat(), ...Object.values(single)]) for (const it of v.items) {
  const n = canon(it.name);
  if (it.qty && (it.img || !(n in itemImg))) itemImg[n] = itemImg[n] || it.img || '';
}
const monsterInfo = name => {
  const f = 'mon/' + fileOf(name);
  if (!fs.existsSync(f)) return null;
  const h = fs.readFileSync(f, 'utf8');
  const loc = h.match(/<b>Locations<\/b>[\s\S]*?<tr>\s*<td[^>]*>([\s\S]*?)<\/td>/);
  const maps = loc ? [...loc[1].matchAll(/title="([^"]+)"/g)].map(m => m[1]) : [];
  if (!maps.length && loc && text(loc[1])) maps.push(...text(loc[1]).split(/\s*,\s*/));
  return maps;
};
const items = {};
for (const name of Object.keys(itemImg)) {
  const f = 'it/' + fileOf(name);
  let how = '';
  if (fs.existsSync(f)) {
    const h = fs.readFileSync(f, 'utf8');
    const m = h.match(/How to Obtain[\s\S]*?<\/tr>\s*<tr[^>]*>([\s\S]*?)<\/tr>/);
    how = m ? text(m[1]) : '';
  }
  const from = [];
  for (const x of how.matchAll(/(Take from|Dropped from|and)\s+\*?([A-Z][A-Za-z' .-]+?)\s*(?:\((?:Lv|Lvl)\.\s*(\d+)\))?(?=\.|$| and)/g)) {
    const monster = x[2].trim();
    from.push({ monster, level: x[3] ? +x[3] : 0, take: x[1] === 'Take from', maps: monsterInfo(monster) || [] });
  }
  items[name] = { img: itemImg[name], how, from };
}

// --- guides we know of (LifeTO; other server, so only a starting point) ------------------
const GUIDES = {
  Diva: [{ title: "Kyzuumi's Diva Guide (archived)", url: 'https://guides.lifeto.co/t/archived-kyzuumis-diva-guide/45' }],
  Duke: [{ title: 'Raccoon - Pure DP Duke Guide', url: 'https://guides.lifeto.co/t/2414' }],
  Raccoon: [{ title: 'Raccoon - Overall Guide', url: 'https://guides.lifeto.co/t/1300' }],
  Bunny: [{ title: "Loafie's Bunny Guide", url: 'https://guides.lifeto.co/t/2432' }],
  Lion: [{ title: 'LUCKY FIST lion build', url: 'https://guides.lifeto.co/t/1954' }]
};

const out = {
  about: 'Skills and mastery items per job, from the ggFTW Trickster wiki (wikimirror.lifeto.co). The wiki may differ from PlayTrickster: fixes go in skill-fixes.json, not here.',
  source: 'wikimirror.lifeto.co skill, job, card and monster pages (2026-11-17)',
  stats: {
    perLevel: 4, bonusPerLevel: 4, pipsPerLevel: 4,
    groups: { Power: ['AP', 'AC', 'DX'], Magic: ['MP', 'MA', 'MD'], Sense: ['WT', 'DA', 'LK'], Charm: ['HP', 'DP', 'HV'] },
    // what one attribute level gives (wiki Stats page)
    perAttrLevel: { AP: 4, AC: 0.25, DX: -1 / 13, MP: 30, MA: 0.25, MD: 4, WT: 80, DA: 0.25, LK: 0.25, HP: 30, DP: 4, HV: 0.25 },
    names: { AP: 'Attack Power', AC: 'Accuracy', DX: 'Attack Speed', MP: 'Magic Points', MA: 'Magic Attack', MD: 'Magic Defense', WT: 'Weight', DA: 'Perception', LK: 'Luck', HP: 'Health Points', DP: 'Defense', HV: 'Hit Evasion' }
  },
  classes: {},
  items
};
for (const [cls, c] of Object.entries(classes)) {
  out.classes[cls] = {
    type: TYPE[cls],
    guides: GUIDES[cls] || [],
    jobs: c.jobs.map(j => {
      const info = raw.jobs[j.name] || {};
      const chain = c.jobs.filter(o => o.stage < j.stage && (o.stage === 1 || o.stage === 2)).map(o => o.name);
      return { name: j.name, stage: j.stage, art: info.art || '', hybridOf: info.like || '', skillsFrom: [...chain, j.name], guides: GUIDES[j.name] || [] };
    })
  };
}
out.skills = sets;
// no indentation: ~700KB pretty, much less compact (the per-level tables are big)
fs.writeFileSync(repo + '/data/builds.json', JSON.stringify(out) + '\n');
console.log('jobs', Object.keys(sets).length, 'skills', Object.values(sets).flat().length, 'items', Object.keys(items).length);
console.log('items without monster maps:', Object.entries(items).filter(([, v]) => !v.from.some(f => f.maps.length)).map(([k]) => k).join(', '));
console.log('missing:', missing.join(' | '));
