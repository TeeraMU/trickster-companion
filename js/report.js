// Links to the "Report" Google Form (no sign-in needed for players). Answers go to the owner's
// Google Sheet; scripts/merge-pins.js reads the exported CSV. Form made by scripts/google-form-setup.gs.
(function (root) {
  "use strict";

  const FORM = {
    url: "https://docs.google.com/forms/d/e/1FAIpQLSccc5lJ6iE889kes8t0CCOiENIsWgZrIOEx-Q4nL71vY_IxIg/viewform",
    entry: { type: "entry.1563089867", quest: "entry.1265842410", details: "entry.5538716", pins: "entry.142101024" },
    type: {
      data: "Wrong quest info / ข้อมูลเควสผิด",
      bug: "Bug / ใช้งานไม่ได้",
      pins: "NPC pins / หมุด NPC",
      idea: "Idea / ไอเดีย"
    }
  };
  const GITHUB_ISSUES = "https://github.com/TeeraMU/trickster-companion/issues/new/choose";
  const MAX_URL = 7000; // longer prefilled links risk being cut by the browser or Google

  /** reportUrl("data", { quest: "ep0-c1-01 · Heidi ..." }) / reportUrl("pins", { pins: "{...}" }) / reportUrl() */
  function reportUrl(kind, fields) {
    const params = new URLSearchParams({ usp: "pp_url" });
    if (kind && FORM.type[kind]) params.set(FORM.entry.type, FORM.type[kind]);
    for (const [k, v] of Object.entries(fields || {})) if (FORM.entry[k] && v) params.set(FORM.entry[k], v);
    return FORM.url + "?" + params.toString();
  }

  root.TQReport = { FORM, GITHUB_ISSUES, MAX_URL, reportUrl };
})(typeof window !== "undefined" ? window : globalThis);
