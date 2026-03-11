// DBM Field Reporting App — Unit Tests
// Node 22 built-in test runner: node --test dbm-core.test.js

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  COMMERCIAL_SCOPES, RESIDENTIAL_SCOPES, UNIT_RATES,
  MULTIPLIER_RATES, DETAIL_RATES, ACID_RATES, CLEAN_RATES, DEFAULT_BPC,
  SCOPE_ES_TO_EN, MULTIPLIER_ES_TO_EN, ACID_ES_TO_EN, CLEANUP_ES_TO_EN,
  getUnit, getScopeOptions, toEnglish,
  calcScopePay, buildDetailKey, calcDetailPay,
  calcAcidPay, calcCleanPay, calcSubmissionTotal,
  buildQBMemo, toSlackChannel, validateSubmission,
} = require("./dbm-core.js");

// ── HELPERS ───────────────────────────────────────────────────────────────────
const close = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. getUnit
// ═══════════════════════════════════════════════════════════════════════════════
describe("getUnit", () => {
  test("Brick → Cubes", () => {
    assert.equal(getUnit("Brick"), "Cubes");
  });

  test("Stone - MJ/DS → SF", () => {
    assert.equal(getUnit("Stone - MJ/DS"), "SF");
  });

  test("Stone - MJ → SF", () => {
    assert.equal(getUnit("Stone - MJ"), "SF");
  });

  test("Stone - DS → SF", () => {
    assert.equal(getUnit("Stone - DS"), "SF");
  });

  test("Thin Brick/Stone → SF", () => {
    assert.equal(getUnit("Thin Brick/Stone"), "SF");
  });

  test("Footing → SF", () => {
    assert.equal(getUnit("Footing"), "SF");
  });

  test("Stucco → SF", () => {
    assert.equal(getUnit("Stucco"), "SF");
  });

  test("Pavers → SF", () => {
    assert.equal(getUnit("Pavers"), "SF");
  });

  test("Flag Stone → SF", () => {
    assert.equal(getUnit("Flag Stone"), "SF");
  });

  test("Cast Stone → LF", () => {
    assert.equal(getUnit("Cast Stone"), "LF");
  });

  test("6\" CMU → EA", () => {
    assert.equal(getUnit("6\" CMU"), "EA");
  });

  test("8\" CMU → EA", () => {
    assert.equal(getUnit("8\" CMU"), "EA");
  });

  test("4\" CMU - Veneer → EA", () => {
    assert.equal(getUnit("4\" CMU - Veneer"), "EA");
  });

  test("empty string → null", () => {
    assert.equal(getUnit(""), null);
  });

  test("null → null", () => {
    assert.equal(getUnit(null), null);
  });

  test("undefined → null", () => {
    assert.equal(getUnit(undefined), null);
  });

  test("unknown scope → EA", () => {
    assert.equal(getUnit("Some Future Scope"), "EA");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. getScopeOptions
// ═══════════════════════════════════════════════════════════════════════════════
describe("getScopeOptions", () => {
  test("Commercial EN contains Brick", () => {
    assert.ok(getScopeOptions("Commercial", "en").includes("Brick"));
  });

  test("Commercial EN contains CMU - Veneer", () => {
    assert.ok(getScopeOptions("Commercial", "en").includes("4\" CMU - Veneer"));
  });

  test("Commercial EN does NOT contain Footing", () => {
    assert.ok(!getScopeOptions("Commercial", "en").includes("Footing"));
  });

  test("Residential EN contains Footing", () => {
    assert.ok(getScopeOptions("Residential", "en").includes("Footing"));
  });

  test("Residential EN contains Pavers", () => {
    assert.ok(getScopeOptions("Residential", "en").includes("Pavers"));
  });

  test("Residential EN does NOT contain CMU - Veneer", () => {
    assert.ok(!getScopeOptions("Residential", "en").includes("4\" CMU - Veneer"));
  });

  test("Commercial has 10 scopes", () => {
    assert.equal(getScopeOptions("Commercial", "en").length, 10);
  });

  test("Residential has 14 scopes", () => {
    assert.equal(getScopeOptions("Residential", "en").length, 14);
  });

  test("ES translation: Brick → Ladrillo", () => {
    assert.ok(getScopeOptions("Commercial", "es").includes("Ladrillo"));
  });

  test("ES translation: Cast Stone → Piedra Fundida", () => {
    assert.ok(getScopeOptions("Residential", "es").includes("Piedra Fundida"));
  });

  test("ES list same length as EN", () => {
    assert.equal(
      getScopeOptions("Commercial", "es").length,
      getScopeOptions("Commercial", "en").length
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. toEnglish (translation helper)
// ═══════════════════════════════════════════════════════════════════════════════
describe("toEnglish", () => {
  test("Ladrillo → Brick via SCOPE_ES_TO_EN", () => {
    assert.equal(toEnglish("Ladrillo", SCOPE_ES_TO_EN), "Brick");
  });

  test("already-English Brick → Brick (passthrough)", () => {
    assert.equal(toEnglish("Brick", SCOPE_ES_TO_EN), "Brick");
  });

  test("Ninguno → None via MULTIPLIER_ES_TO_EN", () => {
    assert.equal(toEnglish("Ninguno", MULTIPLIER_ES_TO_EN), "None");
  });

  test("Trabajo en Altura → Highwork", () => {
    assert.equal(toEnglish("Trabajo en Altura", MULTIPLIER_ES_TO_EN), "Highwork");
  });

  test("acid wash ES → EN", () => {
    assert.equal(toEnglish("Lavado Ácido ($150)", ACID_ES_TO_EN), "Acid Wash ($150)");
  });

  test("clean up ES → EN", () => {
    assert.equal(toEnglish("Limpieza ($300)", CLEANUP_ES_TO_EN), "Clean Up ($300)");
  });

  test("null → null", () => {
    assert.equal(toEnglish(null, SCOPE_ES_TO_EN), null);
  });

  test("empty string → empty string", () => {
    assert.equal(toEnglish("", SCOPE_ES_TO_EN), "");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. calcScopePay — Brick
// ═══════════════════════════════════════════════════════════════════════════════
describe("calcScopePay — Brick", () => {
  test("Commercial Brick 10 cubes, no multiplier: 10×500×$0.80 = $4,000", () => {
    const r = calcScopePay("Brick", "10", "None", "Commercial");
    assert.ok(close(r.total, 4000), `Expected 4000, got ${r.total}`);
  });

  test("Residential Brick 5 cubes, no multiplier: 5×500×$0.35 = $875", () => {
    const r = calcScopePay("Brick", "5", "None", "Residential");
    assert.ok(close(r.total, 875));
  });

  test("Brick unit is Cubes", () => {
    const r = calcScopePay("Brick", "1", "None", "Commercial");
    assert.equal(r.unit, "Cubes");
  });

  test("payQty = cubes × BPC (default 500)", () => {
    const r = calcScopePay("Brick", "3", "None", "Commercial");
    assert.equal(r.payQty, 1500);
  });

  test("payQty uses custom bpc when provided", () => {
    const r = calcScopePay("Brick", "2", "None", "Commercial", 416);
    assert.equal(r.payQty, 832);
  });

  test("Commercial Brick Highwork multiplier ×1.5", () => {
    const base = calcScopePay("Brick", "10", "None", "Commercial");
    const hw   = calcScopePay("Brick", "10", "Highwork", "Commercial");
    assert.ok(close(hw.total, base.total * 1.5));
  });

  test("Professional Scaffold multiplier ×1.1", () => {
    const base = calcScopePay("Brick", "10", "None", "Commercial");
    const ps   = calcScopePay("Brick", "10", "Professional Scaffold", "Commercial");
    assert.ok(close(ps.total, base.total * 1.1));
  });

  test("rate is $0.80 for Commercial Brick", () => {
    const r = calcScopePay("Brick", "1", "None", "Commercial");
    assert.ok(close(r.rate, 0.80));
  });

  test("rate is $0.35 for Residential Brick", () => {
    const r = calcScopePay("Brick", "1", "None", "Residential");
    assert.ok(close(r.rate, 0.35));
  });

  test("zero qty → zero total", () => {
    const r = calcScopePay("Brick", "0", "None", "Commercial");
    assert.ok(close(r.total, 0));
  });

  test("empty qty → zero total", () => {
    const r = calcScopePay("Brick", "", "None", "Commercial");
    assert.ok(close(r.total, 0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. calcScopePay — CMU / EA units
// ═══════════════════════════════════════════════════════════════════════════════
describe("calcScopePay — CMU / EA", () => {
  test("Commercial 6\" CMU 100 EA: 100×$10 = $1,000", () => {
    const r = calcScopePay("6\" CMU", "100", "None", "Commercial");
    assert.ok(close(r.total, 1000));
  });

  test("Commercial 12\" CMU 50 EA: 50×$12 = $600", () => {
    const r = calcScopePay("12\" CMU", "50", "None", "Commercial");
    assert.ok(close(r.total, 600));
  });

  test("Residential 4\" CMU 200 EA: 200×$4 = $800", () => {
    const r = calcScopePay("4\" CMU", "200", "None", "Residential");
    assert.ok(close(r.total, 800));
  });

  test("CMU payQty equals input qty (no BPC multiplication)", () => {
    const r = calcScopePay("8\" CMU", "75", "None", "Commercial");
    assert.equal(r.payQty, 75);
  });

  test("4\" CMU - Veneer rate $5", () => {
    const r = calcScopePay("4\" CMU - Veneer", "1", "None", "Commercial");
    assert.ok(close(r.rate, 5));
  });

  test("4\" CMU - Structural rate $7", () => {
    const r = calcScopePay("4\" CMU - Structural", "1", "None", "Commercial");
    assert.ok(close(r.rate, 7));
  });

  test("unknown scope → $0 rate, $0 total", () => {
    const r = calcScopePay("Fake Scope", "100", "None", "Commercial");
    assert.ok(close(r.total, 0));
    assert.ok(close(r.rate, 0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. calcScopePay — SF units (Stone, Stucco, etc.)
// ═══════════════════════════════════════════════════════════════════════════════
describe("calcScopePay — SF", () => {
  test("Residential Stone - MJ 100 SF: 100×$6 = $600", () => {
    const r = calcScopePay("Stone - MJ", "100", "None", "Residential");
    assert.ok(close(r.total, 600));
  });

  test("Residential Stucco 250 SF: 250×$8 = $2,000", () => {
    const r = calcScopePay("Stucco", "250", "None", "Residential");
    assert.ok(close(r.total, 2000));
  });

  test("Residential Pavers 300 SF: 300×$10 = $3,000", () => {
    const r = calcScopePay("Pavers", "300", "None", "Residential");
    assert.ok(close(r.total, 3000));
  });

  test("Residential Footing 50 SF: 50×$20 = $1,000", () => {
    const r = calcScopePay("Footing", "50", "None", "Residential");
    assert.ok(close(r.total, 1000));
  });

  test("SF unit returned for Stone - MJ/DS", () => {
    const r = calcScopePay("Stone - MJ/DS", "1", "None", "Commercial");
    assert.equal(r.unit, "SF");
  });

  test("Residential Flag Stone 80 SF: 80×$7 = $560", () => {
    const r = calcScopePay("Flag Stone", "80", "None", "Residential");
    assert.ok(close(r.total, 560));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. calcScopePay — LF (Cast Stone)
// ═══════════════════════════════════════════════════════════════════════════════
describe("calcScopePay — Cast Stone / LF", () => {
  test("Commercial Cast Stone 20 LF: 20×$10 = $200", () => {
    const r = calcScopePay("Cast Stone", "20", "None", "Commercial");
    assert.ok(close(r.total, 200));
  });

  test("Residential Cast Stone 15 LF: 15×$6 = $90", () => {
    const r = calcScopePay("Cast Stone", "15", "None", "Residential");
    assert.ok(close(r.total, 90));
  });

  test("unit is LF", () => {
    const r = calcScopePay("Cast Stone", "1", "None", "Commercial");
    assert.equal(r.unit, "LF");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. buildDetailKey
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildDetailKey", () => {
  test("Arch + Less 9ft → 'Arch (Less 9ft)'", () => {
    assert.equal(buildDetailKey("Arch", "Less 9ft"), "Arch (Less 9ft)");
  });

  test("Arch + 9ft–15ft → 'Arch (9ft–15ft)'", () => {
    assert.equal(buildDetailKey("Arch", "9ft–15ft"), "Arch (9ft–15ft)");
  });

  test("Brick Column + 4x4 → 'Brick Column (4x4)'", () => {
    assert.equal(buildDetailKey("Brick Column", "4x4"), "Brick Column (4x4)");
  });

  test("Fireplace + Brick Insert → 'Fireplace (Brick Insert)'", () => {
    assert.equal(buildDetailKey("Fireplace", "Brick Insert"), "Fireplace (Brick Insert)");
  });

  test("Window / Door + Tooth-In Window → correct key", () => {
    assert.equal(buildDetailKey("Window / Door", "Tooth-In Window"), "Window / Door (Tooth-In Window)");
  });

  test("unknown category → null", () => {
    assert.equal(buildDetailKey("Unknown Cat", "Some Type"), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. calcDetailPay
// ═══════════════════════════════════════════════════════════════════════════════
describe("calcDetailPay", () => {
  test("Arch Less 9ft ×1: $200", () => {
    const r = calcDetailPay("Arch", "Less 9ft", 1, false);
    assert.ok(close(r.total, 200));
  });

  test("Arch 9ft–15ft ×1: $500", () => {
    const r = calcDetailPay("Arch", "9ft–15ft", 1, false);
    assert.ok(close(r.total, 500));
  });

  test("Arch 16ft+ ×1: $800", () => {
    const r = calcDetailPay("Arch", "16ft+", 1, false);
    assert.ok(close(r.total, 800));
  });

  test("Arch ×3: base×3", () => {
    const r = calcDetailPay("Arch", "Less 9ft", 3, false);
    assert.ok(close(r.total, 600));
  });

  test("Brick Column Base/Small ×1: $75", () => {
    const r = calcDetailPay("Brick Column", "Base / Small", 1, false);
    assert.ok(close(r.total, 75));
  });

  test("Brick Column 4x4 ×1: $100", () => {
    const r = calcDetailPay("Brick Column", "4x4", 1, false);
    assert.ok(close(r.total, 100));
  });

  test("Brick Column Tall/Large ×1: $200", () => {
    const r = calcDetailPay("Brick Column", "Tall / Large", 1, false);
    assert.ok(close(r.total, 200));
  });

  test("Brick Column 4x4 + railcuts ×1: $100 + $200 = $300", () => {
    const r = calcDetailPay("Brick Column", "4x4", 1, true);
    assert.ok(close(r.base, 100));
    assert.ok(close(r.railcutsPay, 200));
    assert.ok(close(r.total, 300));
  });

  test("Brick Column 4x4 + railcuts ×2: ($100×2) + ($200×2) = $600", () => {
    const r = calcDetailPay("Brick Column", "4x4", 2, true);
    assert.ok(close(r.base, 200));
    assert.ok(close(r.railcutsPay, 400));
    assert.ok(close(r.total, 600));
  });

  test("railcuts on non-column detail: $0 railcuts pay", () => {
    // Railcuts only applies to Brick Column in the UI, but function should still handle it
    const r = calcDetailPay("Arch", "Less 9ft", 1, false);
    assert.ok(close(r.railcutsPay, 0));
  });

  test("Fireplace Brick Insert: $400", () => {
    const r = calcDetailPay("Fireplace", "Brick Insert", 1, false);
    assert.ok(close(r.total, 400));
  });

  test("Fireplace Masonry w/ Chimney: $2500", () => {
    const r = calcDetailPay("Fireplace", "Masonry w/ Chimney", 1, false);
    assert.ok(close(r.total, 2500));
  });

  test("Hearth Brick Hearth: $200", () => {
    const r = calcDetailPay("Hearth", "Brick Hearth", 1, false);
    assert.ok(close(r.total, 200));
  });

  test("Mantle Stone Mantle: $150", () => {
    const r = calcDetailPay("Mantle", "Stone Mantle", 1, false);
    assert.ok(close(r.total, 150));
  });

  test("Mailbox w/ Demo: $1000", () => {
    const r = calcDetailPay("Mailbox", "w/ Demo", 1, false);
    assert.ok(close(r.total, 1000));
  });

  test("Fire Feature Fire Pit: $350", () => {
    const r = calcDetailPay("Fire Feature", "Fire Pit", 1, false);
    assert.ok(close(r.total, 350));
  });

  test("Fire Feature Gas: $75", () => {
    const r = calcDetailPay("Fire Feature", "Gas", 1, false);
    assert.ok(close(r.total, 75));
  });

  test("Window / Door HM Doors Install & Grout: $400", () => {
    const r = calcDetailPay("Window / Door", "HM Doors Install & Grout", 1, false);
    assert.ok(close(r.total, 400));
  });

  test("unknown category/type → $0", () => {
    const r = calcDetailPay("Nonexistent", "Nonexistent", 1, false);
    assert.ok(close(r.total, 0));
  });

  test("qty defaults to 1 when falsy", () => {
    const r1 = calcDetailPay("Arch", "Less 9ft", 0, false);
    const r2 = calcDetailPay("Arch", "Less 9ft", 1, false);
    assert.ok(close(r1.total, r2.total));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. calcAcidPay / calcCleanPay
// ═══════════════════════════════════════════════════════════════════════════════
describe("calcAcidPay", () => {
  test("Acid Wash ($150) → 150", () => assert.ok(close(calcAcidPay("Acid Wash ($150)"), 150)));
  test("Acid Wash ($300) → 300", () => assert.ok(close(calcAcidPay("Acid Wash ($300)"), 300)));
  test("Acid Wash ($500) → 500", () => assert.ok(close(calcAcidPay("Acid Wash ($500)"), 500)));
  test("Acid Wash ($1000 Lg Comm.) → 1000", () => assert.ok(close(calcAcidPay("Acid Wash ($1000 Lg Comm.)"), 1000)));
  test("null → 0", () => assert.ok(close(calcAcidPay(null), 0)));
  test("empty → 0", () => assert.ok(close(calcAcidPay(""), 0)));
  test("unknown string → 0", () => assert.ok(close(calcAcidPay("Acid Wash ($9999)"), 0)));
});

describe("calcCleanPay", () => {
  test("Clean Up ($150) → 150", () => assert.ok(close(calcCleanPay("Clean Up ($150)"), 150)));
  test("Clean Up ($300) → 300", () => assert.ok(close(calcCleanPay("Clean Up ($300)"), 300)));
  test("Clean Up ($500) → 500", () => assert.ok(close(calcCleanPay("Clean Up ($500)"), 500)));
  test("Clean Up ($1000 Lg Comm.) → 1000", () => assert.ok(close(calcCleanPay("Clean Up ($1000 Lg Comm.)"), 1000)));
  test("null → 0", () => assert.ok(close(calcCleanPay(null), 0)));
  // Old "Clean ($150)" format should return 0 (renamed to Clean Up)
  test("old 'Clean ($150)' format → 0 (renamed)", () => assert.ok(close(calcCleanPay("Clean ($150)"), 0)));
});

describe("Acid Wash and Clean Up are independent", () => {
  test("both selected: total = acid + clean", () => {
    const acid = calcAcidPay("Acid Wash ($300)");
    const clean = calcCleanPay("Clean Up ($150)");
    assert.ok(close(acid + clean, 450));
  });

  test("only acid wash selected: clean = 0", () => {
    assert.ok(close(calcCleanPay(null), 0));
  });

  test("only clean up selected: acid = 0", () => {
    assert.ok(close(calcAcidPay(null), 0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. calcSubmissionTotal — full rollup
// ═══════════════════════════════════════════════════════════════════════════════
describe("calcSubmissionTotal", () => {
  test("single brick scope, no details, no clean", () => {
    const sub = {
      category: "Commercial",
      payType: "Unit",
      scopes: [{ enScope: "Brick", qty: "10", enMultiplier: "None" }],
      details: [],
      enAcidWash: null,
      enCleanUp: null,
    };
    const r = calcSubmissionTotal(sub);
    assert.ok(close(r.scopeTotal, 4000));   // 10×500×$0.80
    assert.ok(close(r.detailTotal, 0));
    assert.ok(close(r.acidPay, 0));
    assert.ok(close(r.cleanPay, 0));
    assert.ok(close(r.grand, 4000));
  });

  test("brick scope + arch detail + both clean types", () => {
    const sub = {
      category: "Residential",
      payType: "Unit",
      scopes: [{ enScope: "Brick", qty: "5", enMultiplier: "None" }],
      details: [{ enCat: "Arch", enType: "Less 9ft", qty: 2, railcuts: false }],
      enAcidWash: "Acid Wash ($150)",
      enCleanUp: "Clean Up ($300)",
    };
    const r = calcSubmissionTotal(sub);
    // Brick: 5×500×$0.35 = $875
    assert.ok(close(r.scopeTotal, 875));
    // Arch ×2: 2×$200 = $400
    assert.ok(close(r.detailTotal, 400));
    assert.ok(close(r.acidPay, 150));
    assert.ok(close(r.cleanPay, 300));
    assert.ok(close(r.grand, 875 + 400 + 150 + 300));
  });

  test("multiple scopes summed correctly", () => {
    const sub = {
      category: "Commercial",
      payType: "Unit",
      scopes: [
        { enScope: "Brick", qty: "10", enMultiplier: "None" },       // 4000
        { enScope: "6\" CMU", qty: "50", enMultiplier: "None" },     // 500
      ],
      details: [],
      enAcidWash: null,
      enCleanUp: null,
    };
    const r = calcSubmissionTotal(sub);
    assert.ok(close(r.scopeTotal, 4500));
    assert.ok(close(r.grand, 4500));
  });

  test("scope with Highwork multiplier", () => {
    const sub = {
      category: "Commercial",
      payType: "Unit",
      scopes: [{ enScope: "Brick", qty: "10", enMultiplier: "Highwork" }],
      details: [],
      enAcidWash: null,
      enCleanUp: null,
    };
    const r = calcSubmissionTotal(sub);
    assert.ok(close(r.scopeTotal, 6000));  // 4000 × 1.5
    assert.ok(close(r.grand, 6000));
  });

  test("detail with railcuts included in total", () => {
    const sub = {
      category: "Residential",
      payType: "Unit",
      scopes: [],
      details: [{ enCat: "Brick Column", enType: "4x4", qty: 1, railcuts: true }],
      enAcidWash: null,
      enCleanUp: null,
    };
    const r = calcSubmissionTotal(sub);
    assert.ok(close(r.detailTotal, 300));  // $100 + $200 railcuts
    assert.ok(close(r.grand, 300));
  });

  test("empty submission → all zeros", () => {
    const sub = { category: "Commercial", payType: "Unit", scopes: [], details: [], enAcidWash: null, enCleanUp: null };
    const r = calcSubmissionTotal(sub);
    assert.ok(close(r.grand, 0));
  });

  test("scopes with empty scope string are filtered out", () => {
    const sub = {
      category: "Commercial",
      payType: "Unit",
      scopes: [
        { enScope: "", qty: "10", enMultiplier: "None" },       // invalid
        { enScope: "Brick", qty: "5", enMultiplier: "None" },   // valid: 2000
      ],
      details: [],
      enAcidWash: null,
      enCleanUp: null,
    };
    const r = calcSubmissionTotal(sub);
    assert.ok(close(r.scopeTotal, 2000));
  });

  test("acid + clean both selected", () => {
    const sub = {
      category: "Commercial",
      payType: "Unit",
      scopes: [],
      details: [],
      enAcidWash: "Acid Wash ($500)",
      enCleanUp: "Clean Up ($500)",
    };
    const r = calcSubmissionTotal(sub);
    assert.ok(close(r.acidPay, 500));
    assert.ok(close(r.cleanPay, 500));
    assert.ok(close(r.grand, 1000));
  });

  test("real-world example: Epperly Heights", () => {
    // 28 cubes Brick Commercial Highwork + Arch <9ft ×2 + Acid Wash $150
    const sub = {
      category: "Commercial",
      payType: "Unit",
      scopes: [{ enScope: "Brick", qty: "28", enMultiplier: "Highwork" }],
      details: [{ enCat: "Arch", enType: "Less 9ft", qty: 2, railcuts: false }],
      enAcidWash: "Acid Wash ($150)",
      enCleanUp: null,
    };
    const r = calcSubmissionTotal(sub);
    const expectedBrick = 28 * 500 * 0.80 * 1.5; // 16800
    const expectedArch  = 2 * 200;               // 400
    const expectedAcid  = 150;
    assert.ok(close(r.scopeTotal, expectedBrick));
    assert.ok(close(r.detailTotal, expectedArch));
    assert.ok(close(r.acidPay, expectedAcid));
    assert.ok(close(r.grand, expectedBrick + expectedArch + expectedAcid));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. buildQBMemo
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildQBMemo", () => {
  test("brick memo format", () => {
    const m = buildQBMemo("brick", { qty: 28, rate: 0.80, bpc: 500 });
    assert.ok(m.includes("Brick"));
    assert.ok(m.includes("28cu"));
    assert.ok(m.length <= 40, `Memo too long: ${m.length} chars`);
  });

  test("scope memo format", () => {
    const m = buildQBMemo("scope", { enScope: "Stucco", qty: 250, unit: "SF", rate: 8 });
    assert.ok(m.includes("Stucco"));
    assert.ok(m.length <= 40);
  });

  test("detail memo format", () => {
    const m = buildQBMemo("detail", { enCat: "Arch", enType: "Less 9ft", qty: 2 });
    assert.ok(m.includes("Arch"));
    assert.ok(m.includes("Less 9ft"));
    assert.ok(m.length <= 40);
  });

  test("acid wash memo format", () => {
    const m = buildQBMemo("acid_wash", { amount: 150 });
    assert.ok(m.includes("Acid Wash"));
    assert.ok(m.includes("150"));
    assert.ok(m.length <= 40);
  });

  test("clean up memo format", () => {
    const m = buildQBMemo("clean_up", { amount: 300 });
    assert.ok(m.includes("Clean Up"));
    assert.ok(m.includes("300"));
    assert.ok(m.length <= 40);
  });

  test("hourly memo format", () => {
    const m = buildQBMemo("hourly", { hours: 8, leads: 1, masons: 2, laborers: 1 });
    assert.ok(m.includes("Hourly"));
    assert.ok(m.includes("8hr"));
    assert.ok(m.length <= 40);
  });

  test("unknown type → empty string", () => {
    const m = buildQBMemo("unknown_type", {});
    assert.equal(m, "");
  });

  test("all memo types are ≤ 40 chars", () => {
    const memos = [
      buildQBMemo("brick",         { qty: 28, rate: 0.80, bpc: 500 }),
      buildQBMemo("scope",         { enScope: "Stone - MJ/DS", qty: 1200, unit: "SF", rate: 10 }),
      buildQBMemo("scope_mult",    { enScope: "Brick", qty: 10, unit: "Cubes", rate: 0.80, enMultiplier: "Highwork" }),
      buildQBMemo("detail",        { enCat: "Fireplace", enType: "Masonry w/ Chimney", qty: 1 }),
      buildQBMemo("detail_railcuts", { enCat: "Brick Column", enType: "4x4", qty: 2 }),
      buildQBMemo("acid_wash",     { amount: 1000 }),
      buildQBMemo("clean_up",      { amount: 1000 }),
      buildQBMemo("hourly",        { hours: 10, leads: 2, masons: 4, laborers: 3 }),
    ];
    for (const m of memos) {
      assert.ok(m.length <= 40, `Memo exceeds 40 chars: "${m}" (${m.length})`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. toSlackChannel
// ═══════════════════════════════════════════════════════════════════════════════
describe("toSlackChannel", () => {
  test("Epperly Heights → #epperly-heights", () => {
    assert.equal(toSlackChannel("Epperly Heights"), "#epperly-heights");
  });

  test("1025 N Morgan Ave → #1025-n-morgan-ave", () => {
    assert.equal(toSlackChannel("1025 N Morgan Ave"), "#1025-n-morgan-ave");
  });

  test("Cherokee Youth Shelter (Talequah) → #cherokee-youth-shelter-talequah", () => {
    assert.equal(toSlackChannel("Cherokee Youth Shelter (Talequah)"), "#cherokee-youth-shelter-talequah");
  });

  test("507 NE 1st St → #507-ne-1st-st", () => {
    assert.equal(toSlackChannel("507 NE 1st St"), "#507-ne-1st-st");
  });

  test("no leading hyphen", () => {
    assert.ok(!toSlackChannel("Epperly Heights").startsWith("#-"));
  });

  test("no trailing hyphen", () => {
    assert.ok(!toSlackChannel("Epperly Heights").endsWith("-"));
  });

  test("all lowercase", () => {
    const ch = toSlackChannel("WINGS");
    assert.equal(ch, "#wings");
  });

  test("multiple spaces collapsed to single hyphen", () => {
    assert.equal(toSlackChannel("Spokes  Superquads"), "#spokes-superquads");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. validateSubmission
// ═══════════════════════════════════════════════════════════════════════════════
describe("validateSubmission", () => {
  const validUnit = {
    weekEnding: "2026-03-14",
    projectDisplay: "Epperly Heights",
    crewDisplay: "Alan Gonzalez",
    payType: "Unit",
    scopes: [{ enScope: "Brick", qty: "10", enMultiplier: "None" }],
    hours: "",
  };

  const validHourly = {
    weekEnding: "2026-03-14",
    projectDisplay: "Wings",
    crewDisplay: "Ubaldo Flores (Belly)",
    payType: "Hourly",
    scopes: [],
    hours: "8",
  };

  test("valid Unit submission passes", () => {
    const r = validateSubmission(validUnit);
    assert.ok(r.valid);
    assert.equal(r.errors.length, 0);
  });

  test("valid Hourly submission passes", () => {
    const r = validateSubmission(validHourly);
    assert.ok(r.valid);
  });

  test("missing weekEnding → error", () => {
    const r = validateSubmission({ ...validUnit, weekEnding: "" });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.toLowerCase().includes("week")));
  });

  test("missing project → error", () => {
    const r = validateSubmission({ ...validUnit, projectDisplay: "" });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.toLowerCase().includes("project")));
  });

  test("missing crew → error", () => {
    const r = validateSubmission({ ...validUnit, crewDisplay: "" });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.toLowerCase().includes("crew")));
  });

  test("missing payType → error", () => {
    const r = validateSubmission({ ...validUnit, payType: "" });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.toLowerCase().includes("pay type")));
  });

  test("Unit with no scopes → error", () => {
    const r = validateSubmission({ ...validUnit, scopes: [] });
    assert.ok(!r.valid);
    assert.ok(r.errors.some(e => e.toLowerCase().includes("scope")));
  });

  test("Unit with scope qty 0 → error", () => {
    const r = validateSubmission({ ...validUnit, scopes: [{ enScope: "Brick", qty: "0", enMultiplier: "None" }] });
    assert.ok(!r.valid);
  });

  test("multiple missing fields → multiple errors", () => {
    const r = validateSubmission({ weekEnding: "", projectDisplay: "", crewDisplay: "", payType: "", scopes: [] });
    assert.ok(r.errors.length >= 3);
  });

  test("details and clean not required for valid submission", () => {
    const sub = { ...validUnit, details: [], enAcidWash: null, enCleanUp: null };
    const r = validateSubmission(sub);
    assert.ok(r.valid);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. Rate table integrity checks
// ═══════════════════════════════════════════════════════════════════════════════
describe("Rate table integrity", () => {
  test("all Commercial scopes have a rate in UNIT_RATES", () => {
    const missing = COMMERCIAL_SCOPES.filter(s => UNIT_RATES[`Commercial ${s}`] === undefined);
    assert.deepEqual(missing, [], `Missing commercial rates: ${missing}`);
  });

  test("all Residential scopes have a rate in UNIT_RATES", () => {
    const missing = RESIDENTIAL_SCOPES.filter(s => UNIT_RATES[`Residential ${s}`] === undefined);
    assert.deepEqual(missing, [], `Missing residential rates: ${missing}`);
  });

  test("all unit rates are positive numbers", () => {
    for (const [key, rate] of Object.entries(UNIT_RATES)) {
      assert.ok(typeof rate === "number" && rate > 0, `Bad rate for ${key}: ${rate}`);
    }
  });

  test("all detail rates are positive numbers", () => {
    for (const [key, rate] of Object.entries(DETAIL_RATES)) {
      assert.ok(typeof rate === "number" && rate > 0, `Bad rate for ${key}: ${rate}`);
    }
  });

  test("multiplier rates are correct", () => {
    assert.equal(MULTIPLIER_RATES["None"], 1);
    assert.equal(MULTIPLIER_RATES["Highwork"], 1.5);
    assert.ok(close(MULTIPLIER_RATES["Professional Scaffold"], 1.1));
  });

  test("acid wash has 4 tiers", () => {
    assert.equal(Object.keys(ACID_RATES).length, 4);
  });

  test("clean up has 4 tiers", () => {
    assert.equal(Object.keys(CLEAN_RATES).length, 4);
  });

  test("all acid rates are positive", () => {
    for (const [k, v] of Object.entries(ACID_RATES)) {
      assert.ok(v > 0, `Bad acid rate: ${k}`);
    }
  });

  test("all clean rates are positive", () => {
    for (const [k, v] of Object.entries(CLEAN_RATES)) {
      assert.ok(v > 0, `Bad clean rate: ${k}`);
    }
  });

  test("DEFAULT_BPC is 500", () => {
    assert.equal(DEFAULT_BPC, 500);
  });

  test("Spanish scope map covers all EN commercial scopes", () => {
    const enValues = new Set(Object.values(SCOPE_ES_TO_EN));
    const missing = COMMERCIAL_SCOPES.filter(s => !enValues.has(s));
    assert.deepEqual(missing, [], `Not in ES map: ${missing}`);
  });

  test("Spanish scope map covers all EN residential scopes", () => {
    const enValues = new Set(Object.values(SCOPE_ES_TO_EN));
    const missing = RESIDENTIAL_SCOPES.filter(s => !enValues.has(s));
    assert.deepEqual(missing, [], `Not in ES map: ${missing}`);
  });
});
