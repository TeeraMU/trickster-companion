// Checks the pure helpers in js/friends.js. usage: node scripts/test-friends.js
const assert = require("assert");
const F = require("../js/friends.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("makeCode gives TC-XXXX-XX without look-alike letters", () => {
  for (let i = 0; i < 200; i++) {
    const c = F.makeCode();
    assert.ok(F.CODE_RE.test(c), c);
    assert.ok(!/[01OI]/.test(c.slice(3)), c);
  }
});

t("normalizeCode accepts what people paste", () => {
  assert.strictEqual(F.normalizeCode("TC-7F3K-9Q"), "TC-7F3K-9Q");
  assert.strictEqual(F.normalizeCode(" tc 7f3k 9q "), "TC-7F3K-9Q");
  assert.strictEqual(F.normalizeCode("7F3K9Q"), "TC-7F3K-9Q");
  assert.strictEqual(F.normalizeCode("TC-7F3K"), null);
  assert.strictEqual(F.normalizeCode(""), null);
});

t("cleanName: 2-20 letters, Thai ok, no symbols", () => {
  assert.strictEqual(F.cleanName("  Milo   Cat "), "Milo Cat");
  assert.strictEqual(F.cleanName("แมวเหมียว"), "แมวเหมียว");
  assert.strictEqual(F.cleanName("Bunny_Jeanne-2"), "Bunny_Jeanne-2");
  assert.strictEqual(F.cleanName("a"), null);
  assert.strictEqual(F.cleanName("x".repeat(21)), null);
  assert.strictEqual(F.cleanName("<script>"), null);
});

t("canGive: my spares that they need, capped at what they need", () => {
  const me = { spares: [{ item: "Brass", n: 6 }, { item: "Onyx", n: 1 }], needs: [{ item: "Sea Ivory", n: 4 }] };
  const them = { needs: [{ item: "Brass", n: 2 }, { item: "Pearl", n: 5 }], spares: [{ item: "Sea Ivory", n: 10 }] };
  assert.deepStrictEqual(F.canGive(me, them), [{ item: "Brass", n: 2 }]);
  assert.deepStrictEqual(F.canGive(them, me), [{ item: "Sea Ivory", n: 4 }]);
  assert.deepStrictEqual(F.canGive({}, them), []);
});

t("timeAgo", () => {
  const now = 1_000_000_000;
  assert.strictEqual(F.timeAgo(now - 30e3, now), "just now");
  assert.strictEqual(F.timeAgo(now - 5 * 60e3, now), "5 min ago");
  assert.strictEqual(F.timeAgo(now - 3 * 3600e3, now), "3 h ago");
  assert.strictEqual(F.timeAgo(now - 3 * 86400e3, now), "3 days ago");
  assert.strictEqual(F.timeAgo(0, now), "");
});

console.log(`${n} passed`);
