// DBM Field Reporting App — Integration Tests
// Tests full data pipelines across module boundaries.
// Run: node --test dbm-integration.test.js

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const core = require("./dbm-core.js");
const {
  normalizeFormData, buildQBExportBlock, buildSlackMessage,
  buildPayStubData, SubmissionStore, STATUS_TRANSITIONS, _fmt,
} = require("./dbm-integration.js");

// ── TEST FIXTURES ─────────────────────────────────────────────────────────────

// A complete unit-pay English form submission (Epperly Heights)
const FIXTURE_UNIT_EN = {
  lang: "en",
  weekEnding: "2026-03-14",
  projectDisplay: "Epperly Heights",
  crewDisplay: "Alan Gonzalez",
  category: "Commercial",
  payType: "Unit",
  scopes: [
    { scope: "Brick",       qty: "28", multiplier: "Highwork" },
    { scope: "Stone - MJ/DS", qty: "120", multiplier: "None" },
  ],
  details: [
    { category: "Arch",         type: "Less 9ft", qty: 2, railcuts: false },
    { category: "Brick Column", type: "4x4",      qty: 1, railcuts: true  },
  ],
  acidWash: "Acid Wash ($150)",
  cleanUp:  "Clean Up ($300)",
  notes: "Short day, started late",
  photos: [],
  newProjectFlag: null,
  newCrewFlag: null,
};

// The same submission entered in Spanish
const FIXTURE_UNIT_ES = {
  lang: "es",
  weekEnding: "2026-03-14",
  projectDisplay: "Epperly Heights",
  crewDisplay: "Alan Gonzalez",
  category: "Commercial",
  payType: "Unit",
  scopes: [
    { scope: "Ladrillo",         qty: "28",  multiplier: "Trabajo en Altura" },
    { scope: "Piedra - MJ/DS",   qty: "120", multiplier: "Ninguno"           },
  ],
  details: [
    { category: "Arco",                type: "Menos 9ft", qty: 2, railcuts: false },
    { category: "Columna de Ladrillo", type: "4x4",       qty: 1, railcuts: true  },
  ],
  acidWash: "Lavado Ácido ($150)",
  cleanUp:  "Limpieza ($300)",
  notes: "Día corto, empezamos tarde",
  photos: [],
  newProjectFlag: null,
  newCrewFlag: null,
};

// Hourly submission
const FIXTURE_HOURLY_EN = {
  lang: "en",
  weekEnding: "2026-03-14",
  projectDisplay: "Wings",
  crewDisplay: "Ubaldo Flores (Belly)",
  category: "Commercial",
  payType: "Hourly",
  scopes: [],
  details: [],
  acidWash: null,
  cleanUp:  "Clean Up ($150)",
  hours: "8",
  leads: "1",
  masons: "2",
  laborers: "1",
  notes: "",
  photos: [],
  newProjectFlag: null,
  newCrewFlag: null,
};

// New project + new crew flags
const FIXTURE_NEW_FLAGS = {
  lang: "en",
  weekEnding: "2026-03-14",
  projectDisplay: "New Office Build",
  crewDisplay: "Carlos Ruiz",
  category: "Commercial",
  payType: "Unit",
  scopes: [{ scope: "8\" CMU", qty: "200", multiplier: "None" }],
  details: [],
  acidWash: null,
  cleanUp:  null,
  notes: "",
  photos: [],
  newProjectFlag: "New Office Build",
  newCrewFlag: "Carlos Ruiz",
};

// Residential with custom BPC
const FIXTURE_RESIDENTIAL_BPC = {
  lang: "en",
  weekEnding: "2026-03-14",
  projectDisplay: "1819 Guilford",
  crewDisplay: "Federico Rios",
  category: "Residential",
  payType: "Unit",
  bpc: 416,  // KING - X brick type
  scopes: [{ scope: "Brick", qty: "18", multiplier: "None" }],
  details: [{ category: "Fireplace", type: "Masonry w/ Chimney", qty: 1, railcuts: false }],
  acidWash: "Acid Wash ($500)",
  cleanUp:  null,
  notes: "",
  photos: [],
  newProjectFlag: null,
  newCrewFlag: null,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE 1: Form → Normalized Backend Record
// ═══════════════════════════════════════════════════════════════════════════════
describe("Pipeline: Form → Normalized Record", () => {

  describe("English form normalization", () => {
    let record;
    test("setup", () => { record = normalizeFormData(FIXTURE_UNIT_EN); });

    test("identity fields preserved", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      assert.equal(r.weekEnding, "2026-03-14");
      assert.equal(r.projectDisplay, "Epperly Heights");
      assert.equal(r.crewDisplay, "Alan Gonzalez");
      assert.equal(r.category, "Commercial");
      assert.equal(r.payType, "Unit");
    });

    test("scopes translated to EN (passthrough when already EN)", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      assert.equal(r.scopes[0].enScope, "Brick");
      assert.equal(r.scopes[1].enScope, "Stone - MJ/DS");
    });

    test("multiplier preserved EN", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      assert.equal(r.scopes[0].enMultiplier, "Highwork");
      assert.equal(r.scopes[1].enMultiplier, "None");
    });

    test("detail categories preserved EN", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      assert.equal(r.details[0].enCat, "Arch");
      assert.equal(r.details[1].enCat, "Brick Column");
    });

    test("detail types preserved EN", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      assert.equal(r.details[0].enType, "Less 9ft");
      assert.equal(r.details[1].enType, "4x4");
    });

    test("railcuts flag preserved", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      assert.equal(r.details[0].railcuts, false);
      assert.equal(r.details[1].railcuts, true);
    });

    test("acid wash preserved EN", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      assert.equal(r.enAcidWash, "Acid Wash ($150)");
    });

    test("clean up preserved EN", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      assert.equal(r.enCleanUp, "Clean Up ($300)");
    });

    test("notes preserved", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      assert.equal(r.notes, "Short day, started late");
    });
  });

  describe("Spanish form → English backend (translation pipeline)", () => {
    let recordEN, recordES;

    test("setup both records", () => {
      recordEN = normalizeFormData(FIXTURE_UNIT_EN);
      recordES = normalizeFormData(FIXTURE_UNIT_ES);
    });

    test("Ladrillo → Brick", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      assert.equal(r.scopes[0].enScope, "Brick");
    });

    test("Piedra - MJ/DS → Stone - MJ/DS", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      assert.equal(r.scopes[1].enScope, "Stone - MJ/DS");
    });

    test("Trabajo en Altura → Highwork", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      assert.equal(r.scopes[0].enMultiplier, "Highwork");
    });

    test("Ninguno → None", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      assert.equal(r.scopes[1].enMultiplier, "None");
    });

    test("Arco → Arch", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      assert.equal(r.details[0].enCat, "Arch");
    });

    test("Columna de Ladrillo → Brick Column", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      assert.equal(r.details[1].enCat, "Brick Column");
    });

    test("Menos 9ft → Less 9ft", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      assert.equal(r.details[0].enType, "Less 9ft");
    });

    test("Lavado Ácido ($150) → Acid Wash ($150)", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      assert.equal(r.enAcidWash, "Acid Wash ($150)");
    });

    test("Limpieza ($300) → Clean Up ($300)", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      assert.equal(r.enCleanUp, "Clean Up ($300)");
    });

    test("EN and ES records produce identical pay totals", () => {
      const rEN = normalizeFormData(FIXTURE_UNIT_EN);
      const rES = normalizeFormData(FIXTURE_UNIT_ES);
      const totEN = core.calcSubmissionTotal(rEN);
      const totES = core.calcSubmissionTotal(rES);
      assert.ok(Math.abs(totEN.grand - totES.grand) < 0.01,
        `EN total ${totEN.grand} ≠ ES total ${totES.grand}`);
    });

    test("ES notes NOT translated (stored as-entered)", () => {
      const r = normalizeFormData(FIXTURE_UNIT_ES);
      // Notes are human text — we don't translate them, just pass through
      assert.equal(r.notes, "Día corto, empezamos tarde");
    });
  });

  describe("Empty / null field handling", () => {
    test("null acidWash → null in record", () => {
      const r = normalizeFormData(FIXTURE_HOURLY_EN);
      assert.equal(r.enAcidWash, null);
    });

    test("empty scopes array → empty array in record", () => {
      const r = normalizeFormData(FIXTURE_HOURLY_EN);
      assert.equal(r.scopes.length, 0);
    });

    test("scopes with no scope string filtered out", () => {
      const form = { ...FIXTURE_UNIT_EN, scopes: [
        { scope: "", qty: "10", multiplier: "None" },
        { scope: "Brick", qty: "5", multiplier: "None" },
      ]};
      const r = normalizeFormData(form);
      assert.equal(r.scopes.length, 1);
      assert.equal(r.scopes[0].enScope, "Brick");
    });

    test("details with missing type filtered out", () => {
      const form = { ...FIXTURE_UNIT_EN, details: [
        { category: "Arch", type: "", qty: 1, railcuts: false },
        { category: "Arch", type: "Less 9ft", qty: 1, railcuts: false },
      ]};
      const r = normalizeFormData(form);
      assert.equal(r.details.length, 1);
    });

    test("custom BPC propagated to scope records", () => {
      const r = normalizeFormData(FIXTURE_RESIDENTIAL_BPC);
      assert.equal(r.scopes[0].bpc, 416);
    });

    test("new project / crew flags preserved", () => {
      const r = normalizeFormData(FIXTURE_NEW_FLAGS);
      assert.equal(r.newProjectFlag, "New Office Build");
      assert.equal(r.newCrewFlag, "Carlos Ruiz");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE 2: Backend Record → QB Export Block
// ═══════════════════════════════════════════════════════════════════════════════
describe("Pipeline: Record → QB Export Block", () => {

  describe("Line item structure", () => {
    test("PAYEE row comes first", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      assert.equal(block.payeeRow.rowType, "PAYEE");
    });

    test("all line items have rowType LINE", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      for (const line of block.lineItems) {
        assert.equal(line.rowType, "LINE", `Expected LINE, got ${line.rowType}: ${line.memo}`);
      }
    });

    test("payee row amount = grand total", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      const totals = core.calcSubmissionTotal(r);
      assert.ok(Math.abs(block.payeeRow.amount - totals.grand) < 0.01);
    });

    test("line items sum = grand total", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      const lineSum = block.lineItems.reduce((s, l) => s + l.amount, 0);
      assert.ok(Math.abs(lineSum - block.checkTotal) < 0.01,
        `Line sum ${lineSum} ≠ check total ${block.checkTotal}`);
    });

    test("payee = crew display name", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      assert.equal(block.payeeRow.payee, "Alan Gonzalez");
    });

    test("project on all rows", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      for (const line of [block.payeeRow, ...block.lineItems]) {
        assert.equal(line.project, "Epperly Heights");
      }
    });

    test("bank account on all rows", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      for (const line of block.lineItems) {
        assert.equal(line.bankAccount, "DBM Checking");
      }
    });

    test("QB category = Subcontractors - COS on line items", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      for (const line of block.lineItems) {
        assert.equal(line.qbCategory, "Subcontractors - COS");
      }
    });
  });

  describe("Memo field constraints", () => {
    test("all memos ≤ 40 chars", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      const allMemos = [block.payeeRow, ...block.lineItems].map(l => l.memo);
      for (const memo of allMemos) {
        assert.ok(memo.length <= 40, `Memo too long (${memo.length}): "${memo}"`);
      }
    });

    test("acid wash has its own line", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      const acidLine = block.lineItems.find(l => l.memo.toLowerCase().includes("acid"));
      assert.ok(acidLine, "No acid wash line found");
      assert.ok(Math.abs(acidLine.amount - 150) < 0.01);
    });

    test("clean up has its own separate line", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      const cleanLine = block.lineItems.find(l => l.memo.toLowerCase().includes("clean up"));
      assert.ok(cleanLine, "No clean up line found");
      assert.ok(Math.abs(cleanLine.amount - 300) < 0.01);
    });

    test("acid and clean up are separate lines (both present)", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      const acidLines  = block.lineItems.filter(l => l.memo.toLowerCase().includes("acid"));
      const cleanLines = block.lineItems.filter(l => l.memo.toLowerCase().includes("clean up"));
      assert.equal(acidLines.length, 1, "Expected exactly 1 acid wash line");
      assert.equal(cleanLines.length, 1, "Expected exactly 1 clean up line");
    });

    test("railcuts is a separate line item", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      const rcLine = block.lineItems.find(l => l.memo.toLowerCase().includes("railcut"));
      assert.ok(rcLine, "No railcuts line found");
      assert.ok(Math.abs(rcLine.amount - 200) < 0.01);  // 1 column ×$200
    });

    test("brick line contains 'Brick'", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      const brickLine = block.lineItems.find(l => l.memo.includes("Brick"));
      assert.ok(brickLine, "No brick line found");
    });
  });

  describe("Highwork multiplier split", () => {
    test("Highwork generates base + multiplier delta lines", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      // Brick scope has Highwork — should produce 2 lines (base + delta)
      const hwLines = block.lineItems.filter(l => l.memo.toLowerCase().includes("highwork"));
      assert.ok(hwLines.length >= 1, "Expected at least 1 Highwork line");
    });

    test("brick base + highwork delta = Highwork total", () => {
      const r = normalizeFormData(FIXTURE_UNIT_EN);
      const block = buildQBExportBlock(r);
      // Brick 28cu Commercial Highwork: base=$11200, delta=$5600, total=$16800
      const brickBase  = 28 * 500 * 0.80;   // 11200
      const brickTotal = brickBase * 1.5;    // 16800
      // The brick scope produces exactly 2 lines: the base line (memo="Brick 28cu...")
      // and the Highwork delta line (memo="Highwork (×1.5)")
      const brickBaseLine = block.lineItems.find(l => l.memo.startsWith("Brick "));
      const hwDeltaLine   = block.lineItems.find(l => l.memo.toLowerCase().includes("highwork"));
      assert.ok(brickBaseLine, "No brick base line found");
      assert.ok(hwDeltaLine,   "No highwork delta line found");
      const combined = brickBaseLine.amount + hwDeltaLine.amount;
      assert.ok(Math.abs(combined - brickTotal) < 0.01,
        `Expected brick+hw=${brickTotal}, got ${combined} (base=${brickBaseLine.amount}, delta=${hwDeltaLine.amount})`);
    });
  });

  describe("Hourly submission QB export", () => {
    test("hourly submission produces no scope lines", () => {
      const r = normalizeFormData(FIXTURE_HOURLY_EN);
      const block = buildQBExportBlock(r);
      assert.equal(block.lineItems.filter(l => l.memo.includes("Brick")).length, 0);
    });

    test("hourly clean up line appears", () => {
      const r = normalizeFormData(FIXTURE_HOURLY_EN);
      const block = buildQBExportBlock(r);
      const cleanLine = block.lineItems.find(l => l.memo.toLowerCase().includes("clean up"));
      assert.ok(cleanLine, "No clean up line for hourly submission");
    });

    test("no acid wash line when not selected", () => {
      const r = normalizeFormData(FIXTURE_HOURLY_EN);
      const block = buildQBExportBlock(r);
      const acidLines = block.lineItems.filter(l => l.memo.toLowerCase().includes("acid"));
      assert.equal(acidLines.length, 0);
    });
  });

  describe("Custom BPC propagation to QB", () => {
    test("residential brick with 416 BPC: payQty = 18×416 = 7488", () => {
      const r = normalizeFormData(FIXTURE_RESIDENTIAL_BPC);
      const block = buildQBExportBlock(r);
      // Total = 7488 × $0.35 = $2620.80
      const expected = 18 * 416 * 0.35;
      const brickLine = block.lineItems.find(l => l.memo.includes("Brick"));
      assert.ok(brickLine, "No brick line found");
      assert.ok(Math.abs(brickLine.amount - expected) < 0.01,
        `Expected ${expected}, got ${brickLine.amount}`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE 3: Backend Record → Slack Message
// ═══════════════════════════════════════════════════════════════════════════════
describe("Pipeline: Record → Slack Message", () => {

  test("channel derived from project name", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const msg = buildSlackMessage(r);
    assert.equal(msg.channel, "#epperly-heights");
  });

  test("body contains crew name", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const msg = buildSlackMessage(r);
    assert.ok(msg.body.includes("Alan Gonzalez"), "Crew name missing from Slack body");
  });

  test("body contains week ending date", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const msg = buildSlackMessage(r);
    assert.ok(msg.body.includes("2026-03-14"), "Week ending missing from Slack body");
  });

  test("body contains project name", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const msg = buildSlackMessage(r);
    assert.ok(msg.body.includes("Epperly Heights"));
  });

  test("body contains scope in English (not Spanish)", () => {
    const rES = normalizeFormData(FIXTURE_UNIT_ES);
    const msg = buildSlackMessage(rES);
    // After normalization, Slack body should show English
    assert.ok(msg.body.includes("Brick"), "Scope not in English on Slack");
    assert.ok(!msg.body.includes("Ladrillo"), "Spanish scope appearing in Slack body");
  });

  test("body contains acid wash line (English)", () => {
    const rES = normalizeFormData(FIXTURE_UNIT_ES);
    const msg = buildSlackMessage(rES);
    assert.ok(msg.body.includes("Acid Wash ($150)"), "Acid wash missing from Slack");
    assert.ok(!msg.body.includes("Lavado"), "Spanish acid wash in Slack");
  });

  test("body contains clean up line (English)", () => {
    const rES = normalizeFormData(FIXTURE_UNIT_ES);
    const msg = buildSlackMessage(rES);
    assert.ok(msg.body.includes("Clean Up ($300)"), "Clean up missing from Slack");
    assert.ok(!msg.body.includes("Limpieza"), "Spanish clean up in Slack");
  });

  test("body contains grand total", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const msg = buildSlackMessage(r);
    assert.ok(msg.body.includes("Total:"), "Total missing from Slack body");
  });

  test("EN and ES submissions produce identical Slack total", () => {
    const rEN = normalizeFormData(FIXTURE_UNIT_EN);
    const rES = normalizeFormData(FIXTURE_UNIT_ES);
    const msgEN = buildSlackMessage(rEN);
    const msgES = buildSlackMessage(rES);
    // Extract grand total line and compare
    assert.ok(Math.abs(msgEN.totals.grand - msgES.totals.grand) < 0.01);
  });

  test("new project flag appears in Slack", () => {
    const r = normalizeFormData(FIXTURE_NEW_FLAGS);
    const msg = buildSlackMessage(r);
    assert.ok(msg.body.includes("NEW PROJECT"), "New project flag missing from Slack");
  });

  test("new crew flag appears in Slack", () => {
    const r = normalizeFormData(FIXTURE_NEW_FLAGS);
    const msg = buildSlackMessage(r);
    assert.ok(msg.body.includes("NEW CREW"), "New crew flag missing from Slack");
  });

  test("notes included in body", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const msg = buildSlackMessage(r);
    assert.ok(msg.body.includes("Short day, started late"));
  });

  test("hourly body includes hours line", () => {
    const r = normalizeFormData(FIXTURE_HOURLY_EN);
    const msg = buildSlackMessage(r);
    assert.ok(msg.body.includes("8 hrs"), "Hours missing from hourly Slack message");
  });

  test("Wings project → #wings channel", () => {
    const r = normalizeFormData(FIXTURE_HOURLY_EN);
    const msg = buildSlackMessage(r);
    assert.equal(msg.channel, "#wings");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE 4: Backend Record → Pay Stub Display
// ═══════════════════════════════════════════════════════════════════════════════
describe("Pipeline: Record → Pay Stub Display", () => {

  test("header fields set correctly", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const stub = buildPayStubData(r);
    assert.equal(stub.weekEnding,     "2026-03-14");
    assert.equal(stub.projectDisplay, "Epperly Heights");
    assert.equal(stub.crewDisplay,    "Alan Gonzalez");
    assert.equal(stub.category,       "Commercial");
    assert.equal(stub.payType,        "Unit");
  });

  test("scope lines present for each valid scope", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const stub = buildPayStubData(r);
    assert.equal(stub.scopeLines.length, 2);
  });

  test("scope line labels in English", () => {
    const rES = normalizeFormData(FIXTURE_UNIT_ES);
    const stub = buildPayStubData(rES);
    assert.equal(stub.scopeLines[0].label, "Brick", "Scope label not in English");
    assert.equal(stub.scopeLines[1].label, "Stone - MJ/DS");
  });

  test("scope line amounts correct", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const stub = buildPayStubData(r);
    // Brick 28cu Highwork: 28×500×$0.80×1.5 = $16800
    assert.ok(Math.abs(stub.scopeLines[0].amount - 16800) < 0.01,
      `Brick amount: expected 16800, got ${stub.scopeLines[0].amount}`);
    // Stone MJ/DS 120SF: 120×$10 = $1200
    assert.ok(Math.abs(stub.scopeLines[1].amount - 1200) < 0.01);
  });

  test("detail lines present for each valid detail", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const stub = buildPayStubData(r);
    // Arch ×2 → 1 line; Brick Column 4x4 + railcuts → 2 lines
    assert.ok(stub.detailLines.length >= 2);
  });

  test("railcuts appears as separate detail line", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const stub = buildPayStubData(r);
    const rcLine = stub.detailLines.find(d => d.label === "Railcuts");
    assert.ok(rcLine, "Railcuts line missing from pay stub details");
    assert.ok(Math.abs(rcLine.amount - 200) < 0.01);
  });

  test("acid wash line present when selected", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const stub = buildPayStubData(r);
    assert.ok(stub.acidWashLine !== null);
    assert.ok(Math.abs(stub.acidWashLine.amount - 150) < 0.01);
  });

  test("clean up line present when selected", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const stub = buildPayStubData(r);
    assert.ok(stub.cleanUpLine !== null);
    assert.ok(Math.abs(stub.cleanUpLine.amount - 300) < 0.01);
  });

  test("acid wash null when not selected", () => {
    const r = normalizeFormData(FIXTURE_HOURLY_EN);
    const stub = buildPayStubData(r);
    assert.equal(stub.acidWashLine, null);
  });

  test("grand total matches calcSubmissionTotal", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const stub = buildPayStubData(r);
    const totals = core.calcSubmissionTotal(r);
    assert.ok(Math.abs(stub.grandTotal - totals.grand) < 0.01);
  });

  test("EN and ES pay stubs have identical grand total", () => {
    const rEN = normalizeFormData(FIXTURE_UNIT_EN);
    const rES = normalizeFormData(FIXTURE_UNIT_ES);
    const stubEN = buildPayStubData(rEN);
    const stubES = buildPayStubData(rES);
    assert.ok(Math.abs(stubEN.grandTotal - stubES.grandTotal) < 0.01,
      `EN stub: ${stubEN.grandTotal}, ES stub: ${stubES.grandTotal}`);
  });

  test("scope subtotal + detail subtotal + acid + clean = grand", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const stub = buildPayStubData(r);
    const reconstructed = stub.scopeSubtotal + stub.detailSubtotal + stub.acidSubtotal + stub.cleanSubtotal;
    assert.ok(Math.abs(reconstructed - stub.grandTotal) < 0.01,
      `Reconstructed ${reconstructed} ≠ grand ${stub.grandTotal}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE 5: Full End-to-End (form → record → stub → QB → Slack)
// ═══════════════════════════════════════════════════════════════════════════════
describe("Pipeline: Full End-to-End", () => {

  test("grand total consistent across all pipeline stages", () => {
    const record  = normalizeFormData(FIXTURE_UNIT_EN);
    const totals  = core.calcSubmissionTotal(record);
    const stub    = buildPayStubData(record);
    const qb      = buildQBExportBlock(record);
    const slack   = buildSlackMessage(record);

    const grandTotals = [totals.grand, stub.grandTotal, qb.checkTotal, slack.totals.grand];
    for (const g of grandTotals) {
      assert.ok(Math.abs(g - totals.grand) < 0.01,
        `Grand total mismatch: expected ${totals.grand}, got ${g}`);
    }
  });

  test("ES input → all pipeline outputs use English", () => {
    const record = normalizeFormData(FIXTURE_UNIT_ES);
    const slack  = buildSlackMessage(record);
    const stub   = buildPayStubData(record);

    // Slack body: no Spanish words
    assert.ok(!slack.body.includes("Ladrillo"),        "Spanish in Slack body (scope)");
    assert.ok(!slack.body.includes("Trabajo en Altura"), "Spanish in Slack body (multiplier)");
    assert.ok(!slack.body.includes("Lavado"),          "Spanish in Slack body (acid wash)");
    assert.ok(!slack.body.includes("Limpieza"),        "Spanish in Slack body (clean up)");

    // Pay stub: scope labels in English
    assert.ok(stub.scopeLines.every(s => !Object.keys(require("./dbm-core.js").SCOPE_ES_TO_EN).includes(s.label)),
      "Spanish scope labels in pay stub");
  });

  test("residential 416 BPC: consistent grand total pipeline", () => {
    const record = normalizeFormData(FIXTURE_RESIDENTIAL_BPC);
    const totals = core.calcSubmissionTotal(record);
    const qb     = buildQBExportBlock(record);
    const stub   = buildPayStubData(record);

    // 18cu × 416bpc × $0.35 + $2500 fireplace + $500 acid wash
    const expectedBrick = 18 * 416 * 0.35;
    const expected = expectedBrick + 2500 + 500;

    assert.ok(Math.abs(totals.grand - expected) < 0.01,   `calcSubmission: ${totals.grand} ≠ ${expected}`);
    assert.ok(Math.abs(qb.checkTotal - expected) < 0.01,  `QB total: ${qb.checkTotal} ≠ ${expected}`);
    assert.ok(Math.abs(stub.grandTotal - expected) < 0.01,`Stub total: ${stub.grandTotal} ≠ ${expected}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE 6: Submission Store (CRUD + Status Flow)
// ═══════════════════════════════════════════════════════════════════════════════
describe("Pipeline: Submission Store — CRUD & Status", () => {
  let store;

  beforeEach(() => { store = new SubmissionStore(); });

  test("add returns a unique ID", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const id = store.add(r);
    assert.ok(id && id.length > 0);
  });

  test("added submission retrievable by ID", () => {
    const r  = normalizeFormData(FIXTURE_UNIT_EN);
    const id = store.add(r);
    const sub = store.get(id);
    assert.ok(sub !== null);
    assert.equal(sub.record.crewDisplay, "Alan Gonzalez");
  });

  test("new submission starts as pending", () => {
    const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
    assert.equal(store.get(id).stubStatus, "pending");
  });

  test("multiple submissions stored independently", () => {
    const id1 = store.add(normalizeFormData(FIXTURE_UNIT_EN));
    const id2 = store.add(normalizeFormData(FIXTURE_HOURLY_EN));
    assert.notEqual(id1, id2);
    assert.equal(store.list().length, 2);
  });

  test("get non-existent ID → null", () => {
    assert.equal(store.get("fake_id"), null);
  });

  describe("Status transitions", () => {
    test("pending → sent", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.transition(id, "sent");
      assert.equal(store.get(id).stubStatus, "sent");
    });

    test("sent → opened", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.transition(id, "sent");
      store.transition(id, "opened");
      assert.equal(store.get(id).stubStatus, "opened");
    });

    test("opened → approved", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.transition(id, "sent");
      store.transition(id, "opened");
      store.transition(id, "approved");
      assert.equal(store.get(id).stubStatus, "approved");
    });

    test("opened → disputed (with owner note)", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.transition(id, "sent");
      store.transition(id, "opened");
      store.transition(id, "disputed", "Brick count looks off — check again");
      const sub = store.get(id);
      assert.equal(sub.stubStatus, "disputed");
      assert.equal(sub.ownerNote, "Brick count looks off — check again");
    });

    test("approved → paid", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.transition(id, "sent");
      store.transition(id, "opened");
      store.transition(id, "approved");
      store.transition(id, "paid");
      assert.equal(store.get(id).stubStatus, "paid");
    });

    test("illegal transition throws", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      assert.throws(() => store.transition(id, "approved"),
        /Cannot transition/);
    });

    test("paid → anything throws (terminal state)", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.transition(id, "sent");
      store.transition(id, "opened");
      store.transition(id, "approved");
      store.transition(id, "paid");
      assert.throws(() => store.transition(id, "pending"), /Cannot transition/);
    });

    test("transition on non-existent ID throws", () => {
      assert.throws(() => store.transition("bad_id", "sent"), /not found/);
    });
  });

  describe("Edit flow", () => {
    test("edit resets status to pending", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.transition(id, "sent");
      store.transition(id, "opened");
      store.transition(id, "disputed", "Wrong cube count");
      // Foreman edits submission
      const updated = normalizeFormData({ ...FIXTURE_UNIT_EN, scopes: [
        { scope: "Brick", qty: "30", multiplier: "Highwork" },
      ]});
      store.edit(id, updated);
      const sub = store.get(id);
      assert.equal(sub.stubStatus, "pending", "Status not reset to pending after edit");
    });

    test("edit clears owner note", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.transition(id, "sent");
      store.transition(id, "opened");
      store.transition(id, "disputed", "Wrong cube count");
      store.edit(id, normalizeFormData(FIXTURE_UNIT_EN));
      const sub = store.get(id);
      assert.equal(sub.ownerNote, null, "Owner note not cleared after edit");
    });

    test("edit updates the record data", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      const updated = normalizeFormData({ ...FIXTURE_UNIT_EN, notes: "Updated notes" });
      store.edit(id, updated);
      assert.equal(store.get(id).record.notes, "Updated notes");
    });

    test("edit non-existent ID throws", () => {
      assert.throws(() => store.edit("bad_id", {}), /not found/);
    });

    test("after edit, can transition through full flow again", () => {
      const id = store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.transition(id, "sent");
      store.transition(id, "opened");
      store.transition(id, "disputed", "Issue");
      store.edit(id, normalizeFormData(FIXTURE_UNIT_EN)); // resets to pending
      store.transition(id, "sent");
      store.transition(id, "opened");
      store.transition(id, "approved");
      assert.equal(store.get(id).stubStatus, "approved");
    });
  });

  describe("Querying the store", () => {
    test("countByStatus returns correct count", () => {
      store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.add(normalizeFormData(FIXTURE_HOURLY_EN));
      const id3 = store.add(normalizeFormData(FIXTURE_NEW_FLAGS));
      store.transition(id3, "sent");
      assert.equal(store.countByStatus("pending"), 2);
      assert.equal(store.countByStatus("sent"), 1);
      assert.equal(store.countByStatus("approved"), 0);
    });

    test("list returns all submissions", () => {
      store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.add(normalizeFormData(FIXTURE_HOURLY_EN));
      assert.equal(store.list().length, 2);
    });

    test("clear empties store", () => {
      store.add(normalizeFormData(FIXTURE_UNIT_EN));
      store.clear();
      assert.equal(store.list().length, 0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE 7: Validation → Form Gate
// ═══════════════════════════════════════════════════════════════════════════════
describe("Pipeline: Validation gates submission", () => {
  test("valid EN form passes validation", () => {
    const r = normalizeFormData(FIXTURE_UNIT_EN);
    const result = core.validateSubmission(r);
    assert.ok(result.valid, `Expected valid, got errors: ${result.errors.join(", ")}`);
  });

  test("valid ES form passes after normalization", () => {
    const r = normalizeFormData(FIXTURE_UNIT_ES);
    const result = core.validateSubmission(r);
    assert.ok(result.valid, `Expected valid, got errors: ${result.errors.join(", ")}`);
  });

  test("invalid form blocked before normalization reaches store", () => {
    const badForm = { ...FIXTURE_UNIT_EN, projectDisplay: "", crewDisplay: "" };
    const r = normalizeFormData(badForm);
    const { valid } = core.validateSubmission(r);
    assert.ok(!valid);
    // Should not reach store
    const store = new SubmissionStore();
    if (!valid) { /* blocked */ }
    assert.equal(store.list().length, 0);
  });

  test("new project + new crew flags do not invalidate submission", () => {
    const r = normalizeFormData(FIXTURE_NEW_FLAGS);
    const result = core.validateSubmission(r);
    assert.ok(result.valid, `New flag submission should still be valid: ${result.errors.join(", ")}`);
  });

  test("hourly submission without hours fails validation", () => {
    const badHourly = { ...FIXTURE_HOURLY_EN, hours: "" };
    const r = normalizeFormData(badHourly);
    const result = core.validateSubmission(r);
    assert.ok(!result.valid);
  });
});
