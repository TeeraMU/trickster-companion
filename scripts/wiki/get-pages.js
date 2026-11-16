// node get.js <dir> <names.txt>: downloads wiki pages (title per line) into dir, 6 at a time
const fs = require('fs');
const [dir, list] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const B = 'https://wikimirror.lifeto.co/wiki.ggftw.com/trickster/';
const names = fs.readFileSync(list, 'utf8').split(/\r?\n/).filter(Boolean);
const file = n => dir + '/' + n.replace(/ /g, '_').replace(/[\/:*?"<>|]/g, '-') + '.html';
let ok = 0, bad = [];
async function one(n) {
  if (fs.existsSync(file(n)) && fs.statSync(file(n)).size > 500) { ok++; return; }
  const url = B + encodeURIComponent(n.replace(/ /g, '_')) + '.html';
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url);
      const body = await r.text();
      if (r.status === 200) { fs.writeFileSync(file(n), body); ok++; return; }
      if (r.status === 404) { bad.push(n); return; }
    } catch (e) { /* retry */ }
  }
  bad.push(n);
}
(async () => {
  const q = names.slice();
  await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) await one(q.shift()); }));
  console.log('ok', ok, 'missing', bad.length, bad.join(' | '));
})();
