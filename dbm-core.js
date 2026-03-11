// ── DBM CORE BUSINESS LOGIC ─────────────────────────────────────────────────
// Pure functions extracted from the Field Reporting App.
// No React dependencies — safe to unit test in Node.
// Updated 2026-03-11 to match Payroll_Template_V5 rate sheets exactly.
//
// V5 changes vs V4:
//   • Fire Feature split out of Fireplace → own category
//   • Gas split out of Fireplace → own category
//   • Cast Stone Cap (2ft x 2ft) removed
//   • Window/Door split: Tooth-In | Infill | Door Install (3 separate categories)
//   • "Infill Window" renamed "Infill Window/Door" to match sheet col B
//   • Railcuts added to Brick Column DETAIL_TREE
//   • BPC formula fix: PROJECTS col E index 5 (not col 6)

const COMMERCIAL_SCOPES = [
  "Brick", "Stone - MJ/DS", "Thin Brick/Stone",
  "4\" CMU - Veneer", "4\" CMU - Structural",
  "6\" CMU", "8\" CMU", "10\" CMU", "12\" CMU", "Cast Stone",
];

const RESIDENTIAL_SCOPES = [
  "Brick", "Stone - MJ", "Stone - DS", "Thin Brick/Stone",
  "4\" CMU", "6\" CMU", "8\" CMU", "10\" CMU", "12\" CMU",
  "Cast Stone", "Footing", "Stucco", "Pavers", "Flag Stone",
];

const SF_SCOPES = new Set([
  "Stone - MJ/DS", "Stone - MJ", "Stone - DS",
  "Thin Brick/Stone", "Footing", "Stucco", "Pavers", "Flag Stone",
]);
const LF_SCOPES = new Set(["Cast Stone"]);

const UNIT_RATES = {
  "Commercial Brick":                0.80,
  "Commercial Stone - MJ/DS":        10,
  "Commercial Thin Brick/Stone":     10,
  "Commercial 4\" CMU - Veneer":     5,
  "Commercial 4\" CMU - Structural": 7,
  "Commercial 6\" CMU":              10,
  "Commercial 8\" CMU":              10,
  "Commercial 10\" CMU":             10,
  "Commercial 12\" CMU":             12,
  "Commercial Cast Stone":           10,
  "Residential Brick":               0.35,
  "Residential Stone - MJ":         6,
  "Residential Stone - DS":         7,
  "Residential Thin Brick/Stone":   8,
  "Residential 4\" CMU":            4,
  "Residential 6\" CMU":            4,
  "Residential 8\" CMU":            5,
  "Residential 10\" CMU":           5,
  "Residential 12\" CMU":           6,
  "Residential Cast Stone":         6,
  "Residential Footing":            20,
  "Residential Stucco":             8,
  "Residential Pavers":             10,
  "Residential Flag Stone":         7,
};

const MULTIPLIER_RATES = {
  "None":                  1,
  "Highwork":              1.5,
  "Professional Scaffold": 1.1,
};

// Keys match DETAIL_RATES!ColB exactly (used for VLOOKUP in sheet).
// Demo prefixed keys avoid collision with Column Caps "Large" = 100.
const DETAIL_RATES = {
  // Arch
  "Arch (Less 9ft)":    200,
  "Arch (9ft-15ft)":    500,
  "Arch (16ft Greater)": 800,
  // Brick Column
  "Brick Column (Base/Small)": 75,
  "Brick Column (4x4)":        100,
  "Brick Column (Two Story)":  200,
  "Railcuts":                  200,
  // Column Caps
  "Xtra Small": 2,
  "1ft x 1ft":  5,
  "2ft x 2ft":  25,
  "Medium":     50,
  "Large":      100,
  // Fireplace (Gas + Fire Feature are separate categories in V5)
  "Brick Hearth":                                              200,
  "Brick Insert Fireplace (Up to Mantle)":                     400,
  "Brick Insert Fireplace (Single Story - Ceiling)":           600,
  "Brick Insert Fireplace (Two Story - Ceiling)":              800,
  "Brick Insert Fireplace (Large Base - Two Story - Ceiling)": 1000,
  "Masonry (Brick/Stone) Fireplace w/ Chimney":                2500,
  "Firebox":                                                   500,
  "Firebox w/ Flu Tiles":                                      1500,
  "Isokern Firebox w/ Metal Pipe":                             900,
  "Isokern Firebox w/ Flu Tiles":                              1500,
  "Stone Mantle":                                              150,
  "Slab on Hearth":                                            150,
  // Fire Feature (own category in V5)
  "Fire Pit":     350,
  "Fire Feature": 150,
  // Mailbox
  "Mailbox (Brick or Rock)":  400,
  "Mailbox (New Home Build)": 250,
  "Mailbox (1 Planter)":      300,
  "Mailbox (2 Planters)":     350,
  "Mailbox w/ Demo":          1000,
  // Tooth-In (own category in V5)
  "Tooth-In Window": 100,
  "Tooth-In Door":   200,
  // Infill (own category in V5)
  "Infill Window/Door": 200,
  // Door Install (own category in V5)
  "HM Doors Install & Grout": 400,
  // Brick Design Detail
  "Herringbone/Diamond (Less 25SF)":   300,
  "Herringbone/Diamond (~25SF)":       500,
  "Herringbone/Diamond (Entire Wall)": 800,
  "Knockout w/o Gable":                500,
  "Knockout w/ Gable":                 800,
  "Brick Corbel":                      10,
  "Wings (Gables)":                    100,
  "Rowlock":                           2,
  // Cast Stone Detail
  "Header/Sill": 8,
  "Radius":      10,
  // Outdoor Kitchen
  "Openings (1)":  400,
  "Openings (3)":  600,
  "Openings (4)":  800,
  "Openings (5+)": 1200,
  // Residential Highwork
  "Some Highwork":    400,
  "Average Highwork": 800,
  "Heavy Highwork":   1000,
  "Extra Highwork":   200,
  // Demo (prefixed to avoid collision with Column Caps "Large" = 100)
  "Demo Small":  150,
  "Demo Medium": 500,
  "Demo Large":  1000,
  // "Extra Large" is Disc. — no fixed rate
  // Gas (own category in V5)
  "Gas": 75,
};

// Hierarchical tree drives app UI Category → Type dropdowns.
// Matches V5 DETAIL_RATES sheet structure exactly.
const DETAIL_TREE = {
  "Arch": [
    { type: "Arch (Less 9ft)",    rate: 200, unit: "EA" },
    { type: "Arch (9ft-15ft)",    rate: 500, unit: "EA" },
    { type: "Arch (16ft Greater)",rate: 800, unit: "EA" },
  ],
  "Brick Column": [
    { type: "Brick Column (Base/Small)", rate: 75,  unit: "EA" },
    { type: "Brick Column (4x4)",        rate: 100, unit: "EA" },
    { type: "Brick Column (Two Story)",  rate: 200, unit: "EA" },
    { type: "Railcuts",                  rate: 200, unit: "EA" },
  ],
  "Column Caps": [
    { type: "Xtra Small", rate: 2,   unit: "EA" },
    { type: "1ft x 1ft",  rate: 5,   unit: "EA" },
    { type: "2ft x 2ft",  rate: 25,  unit: "EA" },
    { type: "Medium",     rate: 50,  unit: "EA" },
    { type: "Large",      rate: 100, unit: "EA" },
  ],
  "Fireplace": [
    { type: "Brick Hearth",                                              rate: 200,  unit: "EA" },
    { type: "Brick Insert Fireplace (Up to Mantle)",                     rate: 400,  unit: "EA", note: "Plus Stone SF" },
    { type: "Brick Insert Fireplace (Single Story - Ceiling)",           rate: 600,  unit: "EA" },
    { type: "Brick Insert Fireplace (Two Story - Ceiling)",              rate: 800,  unit: "EA" },
    { type: "Brick Insert Fireplace (Large Base - Two Story - Ceiling)", rate: 1000, unit: "EA" },
    { type: "Masonry (Brick/Stone) Fireplace w/ Chimney",                rate: 2500, unit: "EA" },
    { type: "Firebox",                                                   rate: 500,  unit: "EA" },
    { type: "Firebox w/ Flu Tiles",                                      rate: 1500, unit: "EA" },
    { type: "Isokern Firebox w/ Metal Pipe",                             rate: 900,  unit: "EA" },
    { type: "Isokern Firebox w/ Flu Tiles",                              rate: 1500, unit: "EA" },
    { type: "Stone Mantle",                                              rate: 150,  unit: "EA" },
    { type: "Slab on Hearth",                                            rate: 150,  unit: "EA" },
  ],
  "Fire Feature": [
    { type: "Fire Pit",     rate: 350, unit: "EA", note: "Plus Stone SF" },
    { type: "Fire Feature", rate: 150, unit: "EA" },
  ],
  "Mailbox": [
    { type: "Mailbox (Brick or Rock)",  rate: 400,  unit: "EA" },
    { type: "Mailbox (New Home Build)", rate: 250,  unit: "EA" },
    { type: "Mailbox (1 Planter)",      rate: 300,  unit: "EA" },
    { type: "Mailbox (2 Planters)",     rate: 350,  unit: "EA" },
    { type: "Mailbox w/ Demo",          rate: 1000, unit: "EA" },
  ],
  "Tooth-In": [
    { type: "Tooth-In Window", rate: 100, unit: "EA" },
    { type: "Tooth-In Door",   rate: 200, unit: "EA" },
  ],
  "Infill": [
    { type: "Infill Window/Door", rate: 200, unit: "EA" },
  ],
  "Door Install": [
    { type: "HM Doors Install & Grout", rate: 400, unit: "EA" },
  ],
  "Brick Design Detail": [
    { type: "Herringbone/Diamond (Less 25SF)",    rate: 300, unit: "EA" },
    { type: "Herringbone/Diamond (~25SF)",         rate: 500, unit: "EA" },
    { type: "Herringbone/Diamond (Entire Wall)",   rate: 800, unit: "EA" },
    { type: "Knockout w/o Gable",                 rate: 500, unit: "EA" },
    { type: "Knockout w/ Gable",                  rate: 800, unit: "EA" },
    { type: "Brick Corbel",                       rate: 10,  unit: "EA" },
    { type: "Wings (Gables)",                     rate: 100, unit: "EA" },
    { type: "Rowlock",                            rate: 2,   unit: "LF" },
  ],
  "Cast Stone Detail": [
    { type: "Header/Sill", rate: 8,  unit: "LF" },
    { type: "Radius",      rate: 10, unit: "LF" },
  ],
  "Outdoor Kitchen": [
    { type: "Openings (1)",  rate: 400,  unit: "EA" },
    { type: "Openings (3)",  rate: 600,  unit: "EA" },
    { type: "Openings (4)",  rate: 800,  unit: "EA" },
    { type: "Openings (5+)", rate: 1200, unit: "EA" },
  ],
  "Residential Highwork": [
    { type: "Some Highwork",    rate: 400,  unit: "EA" },
    { type: "Average Highwork", rate: 800,  unit: "EA" },
    { type: "Heavy Highwork",   rate: 1000, unit: "EA" },
    { type: "Extra Highwork",   rate: 200,  unit: "EA" },
  ],
  "Demo": [
    { type: "Small",                rate: 150,  unit: "EA" },
    { type: "Medium (mailbox size)", rate: 500,  unit: "EA" },
    { type: "Large",                rate: 1000, unit: "EA" },
    { type: "Extra Large",          rate: null, unit: "EA", note: "Discretionary — enter manually" },
  ],
  "Gas": [
    { type: "Gas", rate: 75, unit: "EA" },
  ],
};

const ACID_RATES = {
  "Acid Wash ($150)":           150,
  "Acid Wash ($300)":           300,
  "Acid Wash ($500)":           500,
  "Acid Wash ($1000 Lg Comm.)": 1000,
};

const CLEAN_RATES = {
  "Clean ($150)":           150,
  "Clean ($300)":           300,
  "Clean ($500)":           500,
  "Clean ($1000 Lg Comm.)": 1000,
};

const DEFAULT_BPC = 500;

// ── TRANSLATION MAPS ─────────────────────────────────────────────────────────

const SCOPE_ES_TO_EN = {
  "Ladrillo":                "Brick",
  "Piedra - MJ/DS":          "Stone - MJ/DS",
  "Ladrillo/Piedra Delgado": "Thin Brick/Stone",
  "CMU 4\" - Enchape":       "4\" CMU - Veneer",
  "CMU 4\" - Estructural":   "4\" CMU - Structural",
  "CMU 6\"":                 "6\" CMU",
  "CMU 8\"":                 "8\" CMU",
  "CMU 10\"":                "10\" CMU",
  "CMU 12\"":                "12\" CMU",
  "Piedra Fundida":          "Cast Stone",
  "Piedra - MJ":             "Stone - MJ",
  "Piedra - DS":             "Stone - DS",
  "CMU 4\"":                 "4\" CMU",
  "Cimiento":                "Footing",
  "Estuco":                  "Stucco",
  "Adoquines":               "Pavers",
  "Piedra Laja":             "Flag Stone",
};

// V5: 15 detail categories
const DETAIL_CAT_ES_TO_EN = {
  "Arco":                          "Arch",
  "Columna de Ladrillo":           "Brick Column",
  "Tapas de Columna":              "Column Caps",
  "Chimenea":                      "Fireplace",
  "Elemento de Fuego":             "Fire Feature",
  "Buzón":                         "Mailbox",
  "Inserción":                     "Tooth-In",
  "Relleno":                       "Infill",
  "Instalación de Puerta":         "Door Install",
  "Detalle de Diseño Ladrillo":    "Brick Design Detail",
  "Detalle de Piedra Fundida":     "Cast Stone Detail",
  "Cocina Exterior":               "Outdoor Kitchen",
  "Trabajo en Altura Residencial": "Residential Highwork",
  "Demolición":                    "Demo",
  "Gas":                           "Gas",
};

const DETAIL_TYPE_ES_TO_EN = {
  // Arch
  "Menos 9ft":   "Arch (Less 9ft)",
  "9ft-15ft":    "Arch (9ft-15ft)",
  "16ft Mayor":  "Arch (16ft Greater)",
  // Brick Column
  "Base / Pequeña":   "Brick Column (Base/Small)",
  "4x4":              "Brick Column (4x4)",
  "Dos Pisos":        "Brick Column (Two Story)",
  "Cortes de Rieles": "Railcuts",
  // Column Caps
  "Xtra Pequeño": "Xtra Small",
  "1ft x 1ft":    "1ft x 1ft",
  "2ft x 2ft":    "2ft x 2ft",
  "Mediano":      "Medium",
  "Grande":       "Large",
  // Fireplace
  "Hogar de Ladrillo":                               "Brick Hearth",
  "Chimenea de Inserción (Hasta Repisa)":             "Brick Insert Fireplace (Up to Mantle)",
  "Chimenea de Inserción (Un Piso - Techo)":          "Brick Insert Fireplace (Single Story - Ceiling)",
  "Chimenea de Inserción (Dos Pisos - Techo)":        "Brick Insert Fireplace (Two Story - Ceiling)",
  "Chimenea de Inserción (Base Grande - Dos Pisos)":  "Brick Insert Fireplace (Large Base - Two Story - Ceiling)",
  "Chimenea de Mampostería con Chimenea":             "Masonry (Brick/Stone) Fireplace w/ Chimney",
  "Caja de Fuego":                                   "Firebox",
  "Caja de Fuego con Revestimiento":                  "Firebox w/ Flu Tiles",
  "Isokern con Tubo Metálico":                       "Isokern Firebox w/ Metal Pipe",
  "Isokern con Revestimiento":                       "Isokern Firebox w/ Flu Tiles",
  "Repisa de Piedra":                                "Stone Mantle",
  "Losa en Hogar":                                   "Slab on Hearth",
  // Fire Feature
  "Fogata":            "Fire Pit",
  "Elemento de Fuego": "Fire Feature",
  // Mailbox
  "Buzón (Ladrillo o Roca)":   "Mailbox (Brick or Rock)",
  "Buzón (Casa Nueva)":        "Mailbox (New Home Build)",
  "Buzón (1 Maceta)":          "Mailbox (1 Planter)",
  "Buzón (2 Macetas)":         "Mailbox (2 Planters)",
  "Buzón con Demolición":      "Mailbox w/ Demo",
  // Tooth-In
  "Ventana Tooth-In": "Tooth-In Window",
  "Puerta Tooth-In":  "Tooth-In Door",
  // Infill
  "Ventana/Puerta de Relleno": "Infill Window/Door",
  // Door Install
  "Instalación y Lechada de Puertas HM": "HM Doors Install & Grout",
  // Brick Design Detail
  "Espina de Pez/Diamante (Menos 25SF)":   "Herringbone/Diamond (Less 25SF)",
  "Espina de Pez/Diamante (~25SF)":        "Herringbone/Diamond (~25SF)",
  "Espina de Pez/Diamante (Pared Entera)": "Herringbone/Diamond (Entire Wall)",
  "Knockout sin Frontón":                  "Knockout w/o Gable",
  "Knockout con Frontón":                  "Knockout w/ Gable",
  "Voladizo de Ladrillo":                  "Brick Corbel",
  "Alas (Frontones)":                      "Wings (Gables)",
  "Moldura":                               "Rowlock",
  // Cast Stone Detail
  "Cabezal/Alféizar": "Header/Sill",
  "Radio":            "Radius",
  // Outdoor Kitchen
  "Aberturas (1)":  "Openings (1)",
  "Aberturas (3)":  "Openings (3)",
  "Aberturas (4)":  "Openings (4)",
  "Aberturas (5+)": "Openings (5+)",
  // Residential Highwork
  "Algo de Altura":   "Some Highwork",
  "Altura Promedio":  "Average Highwork",
  "Mucha Altura":     "Heavy Highwork",
  "Altura Extra":     "Extra Highwork",
  // Demo
  "Pequeño":                "Small",
  "Mediano (Tamaño Buzón)": "Medium (mailbox size)",
  "Grande Demo":            "Large",
  "Extra Grande":           "Extra Large",
  // Gas
  "Gas": "Gas",
};

const MULTIPLIER_ES_TO_EN = {
  "Ninguno":             "None",
  "Trabajo en Altura":   "Highwork",
  "Andamio Profesional": "Professional Scaffold",
};

const ACID_ES_TO_EN = {
  "Lavado Ácido ($150)":           "Acid Wash ($150)",
  "Lavado Ácido ($300)":           "Acid Wash ($300)",
  "Lavado Ácido ($500)":           "Acid Wash ($500)",
  "Lavado Ácido ($1000 Lg Comm.)": "Acid Wash ($1000 Lg Comm.)",
};

const CLEANUP_ES_TO_EN = {
  "Limpieza ($150)":           "Clean ($150)",
  "Limpieza ($300)":           "Clean ($300)",
  "Limpieza ($500)":           "Clean ($500)",
  "Limpieza ($1000 Lg Comm.)": "Clean ($1000 Lg Comm.)",
};

// ── PURE FUNCTIONS ────────────────────────────────────────────────────────────

function getUnit(enScope) {
  if (!enScope) return null;
  if (enScope === "Brick") return "Cubes";
  if (SF_SCOPES.has(enScope)) return "SF";
  if (LF_SCOPES.has(enScope)) return "LF";
  return "EA";
}

function getScopeOptions(category, lang = "en") {
  const enList = category === "Commercial" ? COMMERCIAL_SCOPES : RESIDENTIAL_SCOPES;
  if (lang === "en") return enList;
  return enList.map(s => {
    const entry = Object.entries(SCOPE_ES_TO_EN).find(([, v]) => v === s);
    return entry ? entry[0] : s;
  });
}

function toEnglish(value, map) {
  if (!value) return value;
  return map[value] || value;
}

function calcScopePay(enScope, qty, enMultiplier, category, bpc = DEFAULT_BPC) {
  const key = `${category} ${enScope}`;
  const rate = UNIT_RATES[key] ?? 0;
  const unit = getUnit(enScope);
  const numQty = parseFloat(String(qty).trim()) || 0;
  const payQty = unit === "Cubes" ? numQty * bpc : numQty;
  const base = payQty * rate;
  const multiplierFactor = MULTIPLIER_RATES[enMultiplier] ?? 1;
  const total = base * multiplierFactor;
  return { rate, payQty, unit, base, multiplierFactor, total };
}

function getDetailRate(enCat, enType) {
  if (enCat === "Demo") {
    if (enType === "Extra Large") return null;
    if (enType === "Medium (mailbox size)") return DETAIL_RATES["Demo Medium"];
    const key = `Demo ${enType}`;
    if (DETAIL_RATES[key] !== undefined) return DETAIL_RATES[key];
  }
  return DETAIL_RATES[enType] ?? 0;
}

function calcDetailPay(enCat, enType, qty) {
  const rate = getDetailRate(enCat, enType);
  const q = parseInt(qty) || 1;
  const base = (rate ?? 0) * q;
  return { enCat, enType, rate, qty: q, base, total: base };
}

function calcAcidPay(enAcidWash) { return ACID_RATES[enAcidWash] ?? 0; }
function calcCleanPay(enCleanUp) { return CLEAN_RATES[enCleanUp] ?? 0; }

function calcSubmissionTotal(submission) {
  const cat = submission.category ?? "";
  const scopeLines = (submission.scopes ?? [])
    .filter(s => s.enScope && parseFloat(String(s.qty || 0).trim()) > 0)
    .map(s => ({ ...s, ...calcScopePay(s.enScope, s.qty, s.enMultiplier ?? "None", cat, s.bpc ?? DEFAULT_BPC) }));
  const detailLines = (submission.details ?? [])
    .filter(d => d.enCat && d.enType)
    .map(d => ({ ...d, ...calcDetailPay(d.enCat, d.enType, d.qty) }));
  const scopeTotal  = scopeLines.reduce((s, x) => s + x.total, 0);
  const detailTotal = detailLines.reduce((s, x) => s + x.total, 0);
  const acidPay     = calcAcidPay(submission.enAcidWash);
  const cleanPay    = calcCleanPay(submission.enCleanUp);
  const grand       = scopeTotal + detailTotal + acidPay + cleanPay;
  return { scopeLines, detailLines, scopeTotal, detailTotal, acidPay, cleanPay, grand };
}

function buildQBMemo(lineType, data) {
  switch (lineType) {
    case "brick":      return `Brick ${data.qty}cu @$${data.rate}x${data.bpc ?? DEFAULT_BPC}`.slice(0, 40);
    case "scope":      return `${data.enScope} ${data.qty}${data.unit} @$${data.rate}`.slice(0, 40);
    case "scope_mult": return `${data.enScope} ${data.qty}${data.unit} @$${data.rate} +${data.enMultiplier}`.slice(0, 40);
    case "detail":     return `${data.enCat}: ${data.enType} x${data.qty}`.slice(0, 40);
    case "acid_wash":  return `Acid Wash $${data.amount}`.slice(0, 40);
    case "clean_up":   return `Clean $${data.amount}`.slice(0, 40);
    case "hourly":     return `Hourly ${data.hours}hr ${data.leads}L+${data.masons}M+${data.laborers}Lab`.slice(0, 40);
    default:           return "";
  }
}

function toSlackChannel(projectName) {
  return "#" + projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function validateSubmission(sub) {
  const errors = [];
  if (!sub.weekEnding)     errors.push("Week ending date is required");
  if (!sub.projectDisplay) errors.push("Project is required");
  if (!sub.crewDisplay)    errors.push("Crew is required");
  if (!sub.payType)        errors.push("Pay type is required");
  if (sub.payType === "Unit") {
    const valid = (sub.scopes ?? []).filter(s => s.enScope && parseFloat(String(s.qty || 0).trim()) > 0);
    if (valid.length === 0) errors.push("At least one scope with quantity > 0 is required");
  }
  if (sub.payType === "Hourly") {
    if (!parseFloat(sub.hours) > 0) errors.push("Hours worked is required");
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  COMMERCIAL_SCOPES, RESIDENTIAL_SCOPES, SF_SCOPES, LF_SCOPES,
  UNIT_RATES, MULTIPLIER_RATES, DETAIL_RATES, DETAIL_TREE,
  ACID_RATES, CLEAN_RATES, DEFAULT_BPC,
  SCOPE_ES_TO_EN, DETAIL_CAT_ES_TO_EN, DETAIL_TYPE_ES_TO_EN,
  MULTIPLIER_ES_TO_EN, ACID_ES_TO_EN, CLEANUP_ES_TO_EN,
  getUnit, getScopeOptions, toEnglish,
  calcScopePay, getDetailRate, calcDetailPay,
  calcAcidPay, calcCleanPay, calcSubmissionTotal,
  buildQBMemo, toSlackChannel, validateSubmission,
};
