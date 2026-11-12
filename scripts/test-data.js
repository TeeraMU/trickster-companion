// Checks the retrying JSON fetch in js/data.js. usage: node scripts/test-data.js
const assert = require("assert");
require("../js/data.js");
const { fetchJson, RETRY_WAITS } = globalThis.TQData;

// a fake fetch that answers from a list of outcomes: a number = HTTP status, "net" = network error
function fakeFetch(outcomes) {
  const calls = [];
  const f = async url => {
    calls.push(url);
    const o = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    if (o === "net") throw new Error("Failed to fetch");
    return { ok: o === 200, status: o, json: async () => ({ fine: true }) };
  };
  f.calls = calls;
  return f;
}
const waits = [];
const noWait = ms => { waits.push(ms); return Promise.resolve(); };

let n = 0;
const t = async (name, fn) => { waits.length = 0; await fn(); n++; console.log("ok  " + name); };

(async () => {
  await t("200 first time: one request, no waiting", async () => {
    const f = fakeFetch([200]);
    assert.deepStrictEqual(await fetchJson("a.json", f, noWait), { fine: true });
    assert.strictEqual(f.calls.length, 1);
    assert.deepStrictEqual(waits, []);
  });

  await t("503 then 200: retried and loaded", async () => {
    const f = fakeFetch([503, 503, 200]);
    assert.deepStrictEqual(await fetchJson("a.json", f, noWait), { fine: true });
    assert.strictEqual(f.calls.length, 3);
    assert.deepStrictEqual(waits, RETRY_WAITS.slice(0, 2));
  });

  await t("network error then 200: retried", async () => {
    const f = fakeFetch(["net", 200]);
    assert.deepStrictEqual(await fetchJson("a.json", f, noWait), { fine: true });
    assert.strictEqual(f.calls.length, 2);
  });

  await t("429 is retried too", async () => {
    const f = fakeFetch([429, 200]);
    await fetchJson("a.json", f, noWait);
    assert.strictEqual(f.calls.length, 2);
  });

  await t("404 is not retried", async () => {
    const f = fakeFetch([404, 200]);
    await assert.rejects(fetchJson("a.json", f, noWait), /HTTP 404/);
    assert.strictEqual(f.calls.length, 1);
  });

  await t("always 503: gives up after 4 tries with the last error", async () => {
    const f = fakeFetch([503]);
    await assert.rejects(fetchJson("a.json", f, noWait), /HTTP 503/);
    assert.strictEqual(f.calls.length, RETRY_WAITS.length + 1);
  });

  console.log(`${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
