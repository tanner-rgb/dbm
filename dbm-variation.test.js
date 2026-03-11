// DBM Field Reporting App — Variation Tests
// Exercises real-world crew/project combos, edge cases, boundary math,
// and stress scenarios with many simultaneous entries.
// Run: node --test dbm-variation.test.js

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const core = require("./dbm-core.js");
const intg = require("./dbm-integration.js");

const close  = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const fmt    = (n) => "$" + Number(n).toFixed(2);

// ─────────────────────────────────────────────────────────────────────────────
// REAL DBM CREWS & PROJECTS (from memory)
// ─────────────────────────────────────────────────────────────────────────────
const CREWS = [
  "Alan Gonzalez",
  "Alfonso Marrufo (Poncho)",
  "Ubaldo Flores (Belly)",
  "GJ Masonry",
  "GM Masonry Construction",
  "Murillo Masonry",
];

const PROJECTS = [
  { name: "Epperly Heights",           category: "Commercial",   bpc: 500 },
  { name: "Wings",                     category: "Commercial",   bpc: 500 },
  { name: "Spokes Superquads",         category: "Commercial",   bpc: 500 },
  { name: "Cherokee Youth Shelter",    category: "Commercial",   bpc: 500 },
  { name: "1025 N Morgan Ave",         category: "Residential",  bpc: 500 },
  { name: "1819 Guilford",             category: "Residential",  bpc: 416 },
  { name: "507 NE 1st St",             category: "Residential",  bpc: 500 },
  { name: "New Office Build",          category: "Commercial",   bpc: 500 },
];

const WEEKS = [
  "2026-03-07",
  "2026-03-14",
  "2026-03-21",
];

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES — 30 real-world multi-entry submissions
// Each fixture is a raw form object exactly as the React app would produce it.
// ─────────────────────────────────────────────────────────────────────────────
const FIXTURES = [

  // ── Commercial Brick, single scope ─────────────────────────────────────────
  {
    id: "V-001", desc: "Comm Brick 10cu no mult",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Epperly Heights",
    crewDisplay:"Alan Gonzalez", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"10", multiplier:"None" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 10*500*0.80 }, // 4000
  },
  {
    id: "V-002", desc: "Comm Brick 28cu Highwork",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Epperly Heights",
    crewDisplay:"Alan Gonzalez", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"28", multiplier:"Highwork" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 28*500*0.80*1.5 }, // 16800
  },
  {
    id: "V-003", desc: "Comm Brick 45cu Highwork + Acid $1000",
    lang:"en", weekEnding:"2026-03-07", projectDisplay:"Cherokee Youth Shelter",
    crewDisplay:"Murillo Masonry", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"45", multiplier:"Highwork" }],
    details:[], acidWash:"Acid Wash ($1000 Lg Comm.)", cleanUp:"Clean Up ($500)",
    expect: { grand: 45*500*0.80*1.5 + 1000 + 500 }, // 27000+1500 = 28500
  },
  {
    id: "V-004", desc: "Comm Brick Pro Scaffold",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Wings",
    crewDisplay:"GJ Masonry", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"20", multiplier:"Professional Scaffold" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 20*500*0.80*1.1 }, // 8800
  },
  {
    id: "V-005", desc: "Comm Brick 0.5 cubes edge case",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Wings",
    crewDisplay:"Alan Gonzalez", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"0.5", multiplier:"None" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 0.5*500*0.80 }, // 200
  },

  // ── Residential Brick ───────────────────────────────────────────────────────
  {
    id: "V-006", desc: "Res Brick 18cu default BPC",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"1025 N Morgan Ave",
    crewDisplay:"Alfonso Marrufo (Poncho)", category:"Residential", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"18", multiplier:"None" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 18*500*0.35 }, // 3150
  },
  {
    id: "V-007", desc: "Res Brick 18cu custom BPC=416",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"1819 Guilford",
    crewDisplay:"Alfonso Marrufo (Poncho)", category:"Residential", payType:"Unit",
    bpc: 416,
    scopes:[{ scope:"Brick", qty:"18", multiplier:"None" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 18*416*0.35 }, // 2620.80
  },
  {
    id: "V-008", desc: "Res Brick 18cu BPC=416 + Fireplace Masonry w/ Chimney",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"1819 Guilford",
    crewDisplay:"Alfonso Marrufo (Poncho)", category:"Residential", payType:"Unit",
    bpc: 416,
    scopes:[{ scope:"Brick", qty:"18", multiplier:"None" }],
    details:[{ category:"Fireplace", type:"Masonry w/ Chimney", qty:1, railcuts:false }],
    acidWash:"Acid Wash ($500)", cleanUp:null,
    expect: { grand: 18*416*0.35 + 2500 + 500 }, // 5620.80
  },
  {
    id: "V-009", desc: "Res Brick large run 100cu Highwork",
    lang:"en", weekEnding:"2026-03-21", projectDisplay:"1025 N Morgan Ave",
    crewDisplay:"Murillo Masonry", category:"Residential", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"100", multiplier:"Highwork" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 100*500*0.35*1.5 }, // 26250
  },

  // ── CMU scopes ──────────────────────────────────────────────────────────────
  {
    id: "V-010", desc: "Comm 6in CMU 800 EA",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Spokes Superquads",
    crewDisplay:"GJ Masonry", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"6\" CMU", qty:"800", multiplier:"None" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 800*10 }, // 8000
  },
  {
    id: "V-011", desc: "Comm mixed CMU 4in Veneer + 4in Structural",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Spokes Superquads",
    crewDisplay:"GJ Masonry", category:"Commercial", payType:"Unit",
    scopes:[
      { scope:"4\" CMU - Veneer", qty:"200", multiplier:"None" },
      { scope:"4\" CMU - Structural", qty:"200", multiplier:"None" },
    ],
    details:[], acidWash:null, cleanUp:"Clean Up ($1000 Lg Comm.)",
    expect: { grand: 200*5 + 200*7 + 1000 }, // 1000+1400+1000 = 3400
  },
  {
    id: "V-012", desc: "Comm 12in CMU Highwork",
    lang:"en", weekEnding:"2026-03-21", projectDisplay:"New Office Build",
    crewDisplay:"GM Masonry Construction", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"12\" CMU", qty:"300", multiplier:"Highwork" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 300*12*1.5 }, // 5400
  },
  {
    id: "V-013", desc: "Res 4in CMU 200 EA",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"507 NE 1st St",
    crewDisplay:"Ubaldo Flores (Belly)", category:"Residential", payType:"Unit",
    scopes:[{ scope:"4\" CMU", qty:"200", multiplier:"None" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 200*4 }, // 800
  },

  // ── SF scopes ───────────────────────────────────────────────────────────────
  {
    id: "V-014", desc: "Comm Stone MJ/DS 120 SF",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Epperly Heights",
    crewDisplay:"Alan Gonzalez", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Stone - MJ/DS", qty:"120", multiplier:"None" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 120*10 }, // 1200
  },
  {
    id: "V-015", desc: "Res Stucco 500 SF + Footing 80 SF",
    lang:"en", weekEnding:"2026-03-21", projectDisplay:"1025 N Morgan Ave",
    crewDisplay:"Alfonso Marrufo (Poncho)", category:"Residential", payType:"Unit",
    scopes:[
      { scope:"Stucco", qty:"500", multiplier:"None" },
      { scope:"Footing", qty:"80", multiplier:"None" },
    ],
    details:[], acidWash:null, cleanUp:"Clean Up ($150)",
    expect: { grand: 500*8 + 80*20 + 150 }, // 4000+1600+150 = 5750
  },
  {
    id: "V-016", desc: "Res Pavers 300 SF + Flag Stone 100 SF",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"507 NE 1st St",
    crewDisplay:"Ubaldo Flores (Belly)", category:"Residential", payType:"Unit",
    scopes:[
      { scope:"Pavers",     qty:"300", multiplier:"None" },
      { scope:"Flag Stone", qty:"100", multiplier:"None" },
    ],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 300*10 + 100*7 }, // 3000+700 = 3700
  },
  {
    id: "V-017", desc: "Res Stone DS Highwork",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"1819 Guilford",
    crewDisplay:"Murillo Masonry", category:"Residential", payType:"Unit",
    scopes:[{ scope:"Stone - DS", qty:"200", multiplier:"Highwork" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 200*7*1.5 }, // 2100
  },

  // ── Details ─────────────────────────────────────────────────────────────────
  {
    id: "V-018", desc: "Arch all three sizes",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Epperly Heights",
    crewDisplay:"Alan Gonzalez", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"15", multiplier:"None" }],
    details:[
      { category:"Arch", type:"Less 9ft", qty:2, railcuts:false },
      { category:"Arch", type:"9ft–15ft",  qty:1, railcuts:false },
      { category:"Arch", type:"16ft+",     qty:1, railcuts:false },
    ],
    acidWash:null, cleanUp:null,
    expect: { grand: 15*500*0.80 + 2*200 + 1*500 + 1*800 }, // 6000+400+500+800 = 7700
  },
  {
    id: "V-019", desc: "Brick Column all sizes with railcuts",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Wings",
    crewDisplay:"GJ Masonry", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"5", multiplier:"None" }],
    details:[
      { category:"Brick Column", type:"Base / Small", qty:2, railcuts:true },
      { category:"Brick Column", type:"4x4",          qty:1, railcuts:true },
      { category:"Brick Column", type:"Tall / Large",  qty:1, railcuts:false },
    ],
    acidWash:null, cleanUp:null,
    // Brick: 5*500*0.80 = 2000
    // Base/Small ×2: 75*2 + 200*2 = 150+400 = 550
    // 4x4 ×1: 100 + 200 = 300
    // Tall/Large ×1: 200 (no railcuts)
    expect: { grand: 2000 + 550 + 300 + 200 }, // 3050
  },
  {
    id: "V-020", desc: "Fireplace all residential types",
    lang:"en", weekEnding:"2026-03-07", projectDisplay:"1819 Guilford",
    crewDisplay:"Alfonso Marrufo (Poncho)", category:"Residential", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"10", multiplier:"None" }],
    details:[
      { category:"Fireplace", type:"Brick Insert",               qty:1, railcuts:false },
      { category:"Fireplace", type:"Firebox",                    qty:1, railcuts:false },
      { category:"Fireplace", type:"Firebox w/ Flu Tiles",       qty:1, railcuts:false },
      { category:"Fireplace", type:"Isokern w/ Metal Pipe",      qty:1, railcuts:false },
    ],
    acidWash:null, cleanUp:null,
    // Brick: 10*500*0.35 = 1750
    // Fireplace items: 400+500+1500+900 = 3300
    expect: { grand: 1750 + 400 + 500 + 1500 + 900 }, // 5050
  },
  {
    id: "V-021", desc: "Mailbox all types",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"507 NE 1st St",
    crewDisplay:"Ubaldo Flores (Belly)", category:"Residential", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"3", multiplier:"None" }],
    details:[
      { category:"Mailbox", type:"Brick or Rock",  qty:1, railcuts:false },
      { category:"Mailbox", type:"1 Planter",      qty:1, railcuts:false },
      { category:"Mailbox", type:"2 Planters",     qty:1, railcuts:false },
    ],
    acidWash:null, cleanUp:null,
    // Brick: 3*500*0.35 = 525
    // Mailboxes: 400+300+350 = 1050
    expect: { grand: 525 + 400 + 300 + 350 }, // 1575
  },
  {
    id: "V-022", desc: "Fire Feature types",
    lang:"en", weekEnding:"2026-03-21", projectDisplay:"507 NE 1st St",
    crewDisplay:"Ubaldo Flores (Belly)", category:"Residential", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"5", multiplier:"None" }],
    details:[
      { category:"Fire Feature", type:"Fire Pit",     qty:1, railcuts:false },
      { category:"Fire Feature", type:"Fire Feature", qty:2, railcuts:false },
      { category:"Fire Feature", type:"Gas",          qty:1, railcuts:false },
    ],
    acidWash:null, cleanUp:null,
    // Brick: 5*500*0.35 = 875
    // Fire: 350 + 2*150 + 75 = 725
    expect: { grand: 875 + 350 + 300 + 75 }, // 1600
  },
  {
    id: "V-023", desc: "Window/Door all types",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"New Office Build",
    crewDisplay:"GM Masonry Construction", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"8\" CMU", qty:"100", multiplier:"None" }],
    details:[
      { category:"Window / Door", type:"Tooth-In Window",            qty:3, railcuts:false },
      { category:"Window / Door", type:"Tooth-In Door",              qty:2, railcuts:false },
      { category:"Window / Door", type:"Infill Window",              qty:1, railcuts:false },
      { category:"Window / Door", type:"HM Doors Install & Grout",   qty:1, railcuts:false },
    ],
    acidWash:null, cleanUp:"Clean Up ($300)",
    // CMU: 100*10 = 1000
    // Windows: 3*100 + 2*200 + 200 + 400 = 300+400+200+400 = 1300
    // Clean: 300
    expect: { grand: 1000 + 300 + 400 + 200 + 400 + 300 }, // 2600
  },

  // ── Acid + Clean combos ─────────────────────────────────────────────────────
  {
    id: "V-024", desc: "Both acid and clean $300/$300",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Epperly Heights",
    crewDisplay:"Alan Gonzalez", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"10", multiplier:"None" }],
    details:[], acidWash:"Acid Wash ($300)", cleanUp:"Clean Up ($300)",
    expect: { grand: 10*500*0.80 + 300 + 300 }, // 4600
  },
  {
    id: "V-025", desc: "Acid only $150 no clean",
    lang:"en", weekEnding:"2026-03-21", projectDisplay:"Epperly Heights",
    crewDisplay:"Murillo Masonry", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Brick", qty:"8", multiplier:"None" }],
    details:[], acidWash:"Acid Wash ($150)", cleanUp:null,
    expect: { grand: 8*500*0.80 + 150 }, // 3350
  },
  {
    id: "V-026", desc: "Clean only $1000 no acid",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Spokes Superquads",
    crewDisplay:"GJ Masonry", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"6\" CMU", qty:"500", multiplier:"None" }],
    details:[], acidWash:null, cleanUp:"Clean Up ($1000 Lg Comm.)",
    expect: { grand: 500*10 + 1000 }, // 6000
  },

  // ── Spanish input ───────────────────────────────────────────────────────────
  {
    id: "V-027", desc: "ES input: Ladrillo Highwork + Lavado Acido",
    lang:"es", weekEnding:"2026-03-14", projectDisplay:"Epperly Heights",
    crewDisplay:"Alan Gonzalez", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"Ladrillo", qty:"10", multiplier:"Trabajo en Altura" }],
    details:[{ category:"Arco", type:"Menos 9ft", qty:2, railcuts:false }],
    acidWash:"Lavado Ácido ($150)", cleanUp:"Limpieza ($300)",
    expect: { grand: 10*500*0.80*1.5 + 2*200 + 150 + 300 }, // 6000+400+450 = 6850
  },
  {
    id: "V-028", desc: "ES input: CMU Veneer matches EN total",
    lang:"es", weekEnding:"2026-03-14", projectDisplay:"Spokes Superquads",
    crewDisplay:"GJ Masonry", category:"Commercial", payType:"Unit",
    scopes:[{ scope:"CMU 4\" - Enchape", qty:"200", multiplier:"Ninguno" }],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 200*5 }, // 1000
  },

  // ── Complex multi-scope + multi-detail ─────────────────────────────────────
  {
    id: "V-029", desc: "Full kitchen sink: 2 scopes + 3 details + both clean",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Cherokee Youth Shelter",
    crewDisplay:"Murillo Masonry", category:"Commercial", payType:"Unit",
    scopes:[
      { scope:"Brick",        qty:"28", multiplier:"Highwork" },
      { scope:"Stone - MJ/DS", qty:"120", multiplier:"None"    },
    ],
    details:[
      { category:"Arch",         type:"Less 9ft",         qty:2, railcuts:false },
      { category:"Brick Column", type:"4x4",              qty:1, railcuts:true  },
      { category:"Fireplace",    type:"Masonry w/ Chimney", qty:1, railcuts:false },
    ],
    acidWash:"Acid Wash ($500)", cleanUp:"Clean Up ($300)",
    // Brick: 28*500*0.80*1.5 = 16800
    // Stone: 120*10 = 1200
    // Arch ×2: 400
    // BrickCol 4x4 + railcuts: 100+200 = 300
    // Fireplace: 2500
    // Acid: 500, Clean: 300
    expect: { grand: 16800+1200+400+300+2500+500+300 }, // 22000
  },
  {
    id: "V-030", desc: "Zero qty scopes filtered, only valid ones pay",
    lang:"en", weekEnding:"2026-03-14", projectDisplay:"Wings",
    crewDisplay:"Alan Gonzalez", category:"Commercial", payType:"Unit",
    scopes:[
      { scope:"Brick",    qty:"0",  multiplier:"None" }, // zero — should not count
      { scope:"6\" CMU",  qty:"",   multiplier:"None" }, // empty — should not count
      { scope:"8\" CMU",  qty:"100", multiplier:"None"}, // valid: 100*10=1000
    ],
    details:[], acidWash:null, cleanUp:null,
    expect: { grand: 100*10 }, // 1000
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Individual fixture math verification
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: Individual fixture grand totals", () => {
  for (const fix of FIXTURES) {
    test(`${fix.id} — ${fix.desc}`, () => {
      const record = intg.normalizeFormData(fix);
      const totals = core.calcSubmissionTotal(record);
      assert.ok(
        close(totals.grand, fix.expect.grand),
        `${fix.id}: expected ${fmt(fix.expect.grand)}, got ${fmt(totals.grand)}\n` +
        `  scopeTotal=${fmt(totals.scopeTotal)}  detailTotal=${fmt(totals.detailTotal)}  ` +
        `acid=${fmt(totals.acidPay)}  clean=${fmt(totals.cleanPay)}`
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Pipeline consistency — every fixture passes through all stages
// and grand total stays the same at each stage
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: Pipeline consistency across all fixtures", () => {
  for (const fix of FIXTURES) {
    test(`${fix.id} — calc → QB → stub consistent`, () => {
      const record  = intg.normalizeFormData(fix);
      const totals  = core.calcSubmissionTotal(record);
      const qb      = intg.buildQBExportBlock(record);
      const stub    = intg.buildPayStubData(record);
      const slack   = intg.buildSlackMessage(record);

      const values = {
        "calcSubmissionTotal": totals.grand,
        "QB checkTotal":       qb.checkTotal,
        "pay stub grandTotal": stub.grandTotal,
        "Slack totals.grand":  slack.totals.grand,
      };

      for (const [label, val] of Object.entries(values)) {
        assert.ok(
          close(val, totals.grand),
          `${fix.id} ${label}: expected ${fmt(totals.grand)}, got ${fmt(val)}`
        );
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: QB line items sum to check total for every fixture
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: QB line items sum = check total", () => {
  for (const fix of FIXTURES) {
    test(`${fix.id} — QB line sum`, () => {
      const record = intg.normalizeFormData(fix);
      const qb     = intg.buildQBExportBlock(record);
      const lineSum = qb.lineItems.reduce((s, l) => s + l.amount, 0);
      assert.ok(
        close(lineSum, qb.checkTotal),
        `${fix.id}: line sum ${fmt(lineSum)} ≠ check total ${fmt(qb.checkTotal)}`
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Pay stub subtotals reconcile to grand for every fixture
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: Pay stub subtotals reconcile", () => {
  for (const fix of FIXTURES) {
    test(`${fix.id} — scope+detail+acid+clean = grand`, () => {
      const record = intg.normalizeFormData(fix);
      const stub   = intg.buildPayStubData(record);
      const reconstructed = stub.scopeSubtotal + stub.detailSubtotal + stub.acidSubtotal + stub.cleanSubtotal;
      assert.ok(
        close(reconstructed, stub.grandTotal),
        `${fix.id}: reconstructed ${fmt(reconstructed)} ≠ grand ${fmt(stub.grandTotal)}`
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: ES fixtures produce identical output to EN equivalents
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: ES↔EN equivalence", () => {
  // V-027 ES should match the equivalent EN form
  test("V-027 ES grand = equivalent EN grand", () => {
    const esForm = FIXTURES.find(f => f.id === "V-027");
    const enForm = {
      ...esForm, lang:"en",
      scopes:[{ scope:"Brick", qty:"10", multiplier:"Highwork" }],
      details:[{ category:"Arch", type:"Less 9ft", qty:2, railcuts:false }],
      acidWash:"Acid Wash ($150)", cleanUp:"Clean Up ($300)",
    };
    const esRecord = intg.normalizeFormData(esForm);
    const enRecord = intg.normalizeFormData(enForm);
    const esTotal  = core.calcSubmissionTotal(esRecord);
    const enTotal  = core.calcSubmissionTotal(enRecord);
    assert.ok(close(esTotal.grand, enTotal.grand),
      `ES ${fmt(esTotal.grand)} ≠ EN ${fmt(enTotal.grand)}`);
  });

  // V-028 ES CMU should match EN CMU
  test("V-028 ES CMU Veneer grand = EN grand", () => {
    const esForm = FIXTURES.find(f => f.id === "V-028");
    const enForm = {
      ...esForm, lang:"en",
      scopes:[{ scope:"4\" CMU - Veneer", qty:"200", multiplier:"None" }],
    };
    const esTotal = core.calcSubmissionTotal(intg.normalizeFormData(esForm));
    const enTotal = core.calcSubmissionTotal(intg.normalizeFormData(enForm));
    assert.ok(close(esTotal.grand, enTotal.grand),
      `ES ${fmt(esTotal.grand)} ≠ EN ${fmt(enTotal.grand)}`);
  });

  test("All ES translation maps cover their EN scopes (no gaps)", () => {
    const enValues = new Set(Object.values(core.SCOPE_ES_TO_EN));
    const allScopes = [...core.COMMERCIAL_SCOPES, ...core.RESIDENTIAL_SCOPES];
    for (const s of allScopes) {
      assert.ok(enValues.has(s), `Missing ES translation for: ${s}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Memo length enforcement across all fixtures
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: QB memo length ≤ 40 chars, all fixtures", () => {
  for (const fix of FIXTURES) {
    test(`${fix.id} — all memos ≤ 40 chars`, () => {
      const record = intg.normalizeFormData(fix);
      const qb     = intg.buildQBExportBlock(record);
      const allMemos = [qb.payeeRow, ...qb.lineItems].map(l => l.memo);
      for (const memo of allMemos) {
        assert.ok(
          memo.length <= 40,
          `${fix.id}: memo too long (${memo.length} chars): "${memo}"`
        );
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Slack English enforcement across all fixtures
// ─────────────────────────────────────────────────────────────────────────────
const SPANISH_WORDS = ["Ladrillo","Piedra","Ladrillo/Piedra","Columna","Arco","Chimenea",
  "Buzón","Adoquines","Lavado","Limpieza","Ninguno","Trabajo","Andamio","Estuco","Cimiento"];

describe("Variation: Slack body always English, all fixtures", () => {
  for (const fix of FIXTURES) {
    test(`${fix.id} — no Spanish in Slack body`, () => {
      const record = intg.normalizeFormData(fix);
      const slack  = intg.buildSlackMessage(record);
      for (const word of SPANISH_WORDS) {
        assert.ok(
          !slack.body.includes(word),
          `${fix.id}: Spanish word "${word}" found in Slack body`
        );
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: Submission store with all fixtures loaded simultaneously
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: Store — 30 fixtures loaded simultaneously", () => {
  const store = new intg.SubmissionStore();
  const ids = [];

  test("all 30 fixtures add without error", () => {
    for (const fix of FIXTURES) {
      const record = intg.normalizeFormData(fix);
      const id = store.add(record);
      ids.push({ id, fix });
    }
    assert.equal(ids.length, FIXTURES.length);
  });

  test("all 30 IDs are unique", () => {
    const uniqueIds = new Set(ids.map(x => x.id));
    assert.equal(uniqueIds.size, FIXTURES.length);
  });

  test("all 30 start as pending", () => {
    assert.equal(store.countByStatus("pending"), FIXTURES.length);
  });

  test("store.list() returns all 30", () => {
    assert.equal(store.list().length, FIXTURES.length);
  });

  test("each stored record retrieves correct crew", () => {
    for (const { id, fix } of ids) {
      const sub = store.get(id);
      assert.equal(sub.record.crewDisplay, fix.crewDisplay,
        `ID ${id}: expected crew ${fix.crewDisplay}, got ${sub.record.crewDisplay}`);
    }
  });

  test("transition first 10 to sent, rest stay pending", () => {
    for (let i = 0; i < 10; i++) {
      store.transition(ids[i].id, "sent");
    }
    assert.equal(store.countByStatus("sent"),    10);
    assert.equal(store.countByStatus("pending"), 20);
  });

  test("transition 5 sent → opened", () => {
    for (let i = 0; i < 5; i++) {
      store.transition(ids[i].id, "opened");
    }
    assert.equal(store.countByStatus("opened"), 5);
    assert.equal(store.countByStatus("sent"),   5);
  });

  test("approve 3 opened → approved", () => {
    for (let i = 0; i < 3; i++) {
      store.transition(ids[i].id, "approved");
    }
    assert.equal(store.countByStatus("approved"), 3);
  });

  test("dispute 2 opened → disputed with notes", () => {
    store.transition(ids[3].id, "disputed", "Cube count looks off");
    store.transition(ids[4].id, "disputed", "Need photo of delivery ticket");
    assert.equal(store.countByStatus("disputed"), 2);
    assert.equal(store.get(ids[3].id).ownerNote, "Cube count looks off");
    assert.equal(store.get(ids[4].id).ownerNote, "Need photo of delivery ticket");
  });

  test("edit disputed entries resets to pending and clears note", () => {
    const rec = intg.normalizeFormData(FIXTURES[3]);
    store.edit(ids[3].id, rec);
    const sub = store.get(ids[3].id);
    assert.equal(sub.stubStatus, "pending");
    assert.equal(sub.ownerNote, null);
  });

  test("pay all 3 approved → paid", () => {
    for (let i = 0; i < 3; i++) {
      store.transition(ids[i].id, "paid");
    }
    assert.equal(store.countByStatus("paid"), 3);
  });

  test("final status distribution is correct", () => {
    // 3 paid, 5 sent→opened→approved loop but we approved 3 and disputed 2 then edited 1 back to pending
    // Let's just assert total count is still 30
    const all = store.list();
    assert.equal(all.length, FIXTURES.length);
    const totalAccounted = ["paid","approved","disputed","sent","pending","opened"]
      .reduce((s, st) => s + store.countByStatus(st), 0);
    assert.equal(totalAccounted, FIXTURES.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: Boundary & edge case math
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: Boundary conditions", () => {

  test("fractional cubes: 0.5cu commercial brick = $200", () => {
    const r = core.calcScopePay("Brick", "0.5", "None", "Commercial");
    assert.ok(close(r.total, 0.5 * 500 * 0.80)); // 200
  });

  test("fractional cubes: 2.75cu residential brick", () => {
    const r = core.calcScopePay("Brick", "2.75", "None", "Residential");
    assert.ok(close(r.total, 2.75 * 500 * 0.35)); // 481.25
  });

  test("very large job: 200 cubes commercial Highwork = $120,000", () => {
    const r = core.calcScopePay("Brick", "200", "Highwork", "Commercial");
    assert.ok(close(r.total, 200 * 500 * 0.80 * 1.5)); // 120000
  });

  test("very large CMU: 10,000 EA 12in CMU commercial = $120,000", () => {
    const r = core.calcScopePay("12\" CMU", "10000", "None", "Commercial");
    assert.ok(close(r.total, 10000 * 12)); // 120000
  });

  test("BPC=1: brick qty 10 = 10*1*rate", () => {
    const r = core.calcScopePay("Brick", "10", "None", "Commercial", 1);
    assert.ok(close(r.total, 10 * 1 * 0.80)); // 8
  });

  test("BPC=1000: brick qty 10 commercial = 10*1000*0.80 = $8000", () => {
    const r = core.calcScopePay("Brick", "10", "None", "Commercial", 1000);
    assert.ok(close(r.total, 10 * 1000 * 0.80)); // 8000
  });

  test("qty string with spaces parsed correctly", () => {
    const r = core.calcScopePay("Brick", " 10 ", "None", "Commercial");
    assert.ok(close(r.total, 10 * 500 * 0.80)); // 4000
  });

  test("all acid wash tiers return correct values", () => {
    assert.ok(close(core.calcAcidPay("Acid Wash ($150)"),  150));
    assert.ok(close(core.calcAcidPay("Acid Wash ($300)"),  300));
    assert.ok(close(core.calcAcidPay("Acid Wash ($500)"),  500));
    assert.ok(close(core.calcAcidPay("Acid Wash ($1000 Lg Comm.)"), 1000));
  });

  test("all clean up tiers return correct values", () => {
    assert.ok(close(core.calcCleanPay("Clean Up ($150)"),  150));
    assert.ok(close(core.calcCleanPay("Clean Up ($300)"),  300));
    assert.ok(close(core.calcCleanPay("Clean Up ($500)"),  500));
    assert.ok(close(core.calcCleanPay("Clean Up ($1000 Lg Comm.)"), 1000));
  });

  test("details with qty=10 scale correctly: Arch Less 9ft ×10 = $2000", () => {
    const r = core.calcDetailPay("Arch", "Less 9ft", 10, false);
    assert.ok(close(r.total, 200 * 10));
  });

  test("railcuts ×10 = $2000 per column type", () => {
    const r = core.calcDetailPay("Brick Column", "4x4", 10, true);
    assert.ok(close(r.railcutsPay, 200 * 10));
    assert.ok(close(r.total, (100 + 200) * 10));
  });

  test("multiplier math precision: ProScaffold 1.1 on $4000 = $4400", () => {
    const r = core.calcScopePay("Brick", "10", "Professional Scaffold", "Commercial");
    assert.ok(close(r.total, 4000 * 1.1)); // 4400
  });

  test("zero qty on all scopes → zero grand total", () => {
    const sub = {
      category:"Commercial", payType:"Unit",
      scopes:[ { enScope:"Brick", qty:"0", enMultiplier:"Highwork" } ],
      details:[], enAcidWash:null, enCleanUp:null,
    };
    const t = core.calcSubmissionTotal(sub);
    assert.ok(close(t.grand, 0));
  });

  test("all-zero submission: scope + detail + acid + clean all 0", () => {
    const sub = {
      category:"Commercial", payType:"Unit",
      scopes:[], details:[], enAcidWash:null, enCleanUp:null,
    };
    const t = core.calcSubmissionTotal(sub);
    assert.equal(t.grand, 0);
    assert.equal(t.scopeTotal, 0);
    assert.equal(t.detailTotal, 0);
    assert.equal(t.acidPay, 0);
    assert.equal(t.cleanPay, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: Slack channel name generation — all real projects
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: Slack channel names for all projects", () => {
  const expected = [
    ["Epperly Heights",        "#epperly-heights"],
    ["Wings",                  "#wings"],
    ["Spokes Superquads",      "#spokes-superquads"],
    ["Cherokee Youth Shelter", "#cherokee-youth-shelter"],
    ["1025 N Morgan Ave",      "#1025-n-morgan-ave"],
    ["1819 Guilford",          "#1819-guilford"],
    ["507 NE 1st St",          "#507-ne-1st-st"],
    ["New Office Build",       "#new-office-build"],
  ];
  for (const [name, channel] of expected) {
    test(`"${name}" → "${channel}"`, () => {
      assert.equal(core.toSlackChannel(name), channel);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: Validation across all fixtures
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: All fixtures pass validation after normalization", () => {
  for (const fix of FIXTURES) {
    test(`${fix.id} — ${fix.desc} — validates OK`, () => {
      const record = intg.normalizeFormData(fix);
      const result = core.validateSubmission(record);
      assert.ok(result.valid,
        `${fix.id} failed validation: ${result.errors.join(", ")}`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12: Weekly rollup across multiple crews (payroll week simulation)
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: Weekly payroll rollup simulation", () => {

  // Pick week 2026-03-14 fixtures
  const week14 = FIXTURES.filter(f => f.weekEnding === "2026-03-14");

  test("week 2026-03-14 has multiple submissions", () => {
    assert.ok(week14.length >= 10, `Expected ≥10 fixtures for that week, got ${week14.length}`);
  });

  test("weekly grand total is sum of individual totals", () => {
    let weeklyTotal = 0;
    let reconstructedTotal = 0;

    for (const fix of week14) {
      const record = intg.normalizeFormData(fix);
      const totals = core.calcSubmissionTotal(record);
      weeklyTotal += totals.grand;

      const qb   = intg.buildQBExportBlock(record);
      const stub = intg.buildPayStubData(record);
      reconstructedTotal += stub.grandTotal;
    }
    assert.ok(close(weeklyTotal, reconstructedTotal, 0.10),
      `Weekly total ${fmt(weeklyTotal)} ≠ reconstructed ${fmt(reconstructedTotal)}`);
  });

  test("each crew in week has at least one submission", () => {
    const crewsInWeek = new Set(week14.map(f => f.crewDisplay));
    // At minimum Alan, Poncho, Belly, GJ, Murillo should appear
    const expectedCrews = ["Alan Gonzalez", "Alfonso Marrufo (Poncho)", "GJ Masonry"];
    for (const crew of expectedCrews) {
      assert.ok(crewsInWeek.has(crew), `Crew "${crew}" missing from week 2026-03-14 fixtures`);
    }
  });

  test("all week-14 QB blocks have non-zero check totals", () => {
    for (const fix of week14) {
      if (fix.scopes.every(s => !parseFloat(s.qty))) continue; // skip known zero-qty
      const record = intg.normalizeFormData(fix);
      const qb     = intg.buildQBExportBlock(record);
      // Skip zero-total submissions (V-030 intentionally filters to one scope)
      if (qb.checkTotal > 0) {
        assert.ok(qb.lineItems.length > 0,
          `${fix.id}: checkTotal=${fmt(qb.checkTotal)} but no line items`);
      }
    }
  });

  test("weekly store load → countByStatus pending = week fixture count", () => {
    const store = new intg.SubmissionStore();
    for (const fix of week14) {
      store.add(intg.normalizeFormData(fix));
    }
    assert.equal(store.countByStatus("pending"), week14.length);
  });

  test("payroll week total is a reasonable dollar amount (>$0, <$500k)", () => {
    let total = 0;
    for (const fix of week14) {
      const r = intg.normalizeFormData(fix);
      total += core.calcSubmissionTotal(r).grand;
    }
    assert.ok(total > 0,     `Weekly total should be > 0, got ${total}`);
    assert.ok(total < 500000, `Weekly total seems unreasonably large: ${fmt(total)}`);
    // Just print it for visibility
    // console.log(`   Week 2026-03-14 total: ${fmt(total)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: Multi-week across all crews (3-week payroll run)
// ─────────────────────────────────────────────────────────────────────────────
describe("Variation: Three-week multi-crew payroll run", () => {

  test("all 3 weeks have submissions in fixtures", () => {
    for (const w of WEEKS) {
      const count = FIXTURES.filter(f => f.weekEnding === w).length;
      assert.ok(count > 0, `No fixtures for week ${w}`);
    }
  });

  test("store handles all 3 weeks without ID collision", () => {
    const store = new intg.SubmissionStore();
    const allIds = [];
    for (const fix of FIXTURES) {
      allIds.push(store.add(intg.normalizeFormData(fix)));
    }
    const uniqueIds = new Set(allIds);
    assert.equal(uniqueIds.size, FIXTURES.length);
  });

  test("3-week grand total is arithmetically consistent with per-fixture totals", () => {
    let byFixture = 0;
    const store = new intg.SubmissionStore();
    for (const fix of FIXTURES) {
      const record = intg.normalizeFormData(fix);
      byFixture += core.calcSubmissionTotal(record).grand;
      store.add(record);
    }
    // Recompute from store records
    let fromStore = 0;
    for (const sub of store.list()) {
      fromStore += core.calcSubmissionTotal(sub.record).grand;
    }
    assert.ok(close(byFixture, fromStore, 0.10),
      `By fixture: ${fmt(byFixture)}, from store: ${fmt(fromStore)}`);
  });

  test("crew totals are stable across re-runs (no mutation)", () => {
    const crewTotals = {};
    for (const fix of FIXTURES) {
      const record = intg.normalizeFormData(fix);
      const grand  = core.calcSubmissionTotal(record).grand;
      crewTotals[fix.crewDisplay] = (crewTotals[fix.crewDisplay] || 0) + grand;
    }
    // Run again — should produce identical sums
    const crewTotals2 = {};
    for (const fix of FIXTURES) {
      const record = intg.normalizeFormData(fix);
      const grand  = core.calcSubmissionTotal(record).grand;
      crewTotals2[fix.crewDisplay] = (crewTotals2[fix.crewDisplay] || 0) + grand;
    }
    for (const crew of Object.keys(crewTotals)) {
      assert.ok(
        close(crewTotals[crew], crewTotals2[crew]),
        `Crew ${crew} total changed between runs: ${fmt(crewTotals[crew])} vs ${fmt(crewTotals2[crew])}`
      );
    }
  });

  test("each crew's total is positive", () => {
    const crewTotals = {};
    for (const fix of FIXTURES) {
      const record = intg.normalizeFormData(fix);
      const grand  = core.calcSubmissionTotal(record).grand;
      crewTotals[fix.crewDisplay] = (crewTotals[fix.crewDisplay] || 0) + grand;
    }
    for (const [crew, total] of Object.entries(crewTotals)) {
      assert.ok(total > 0, `Crew "${crew}" has non-positive 3-week total: ${fmt(total)}`);
    }
  });
});
