// ── DBM INTEGRATION LAYER ────────────────────────────────────────────────────
// Orchestrates the full data pipelines:
//   1. Form submission → normalized backend record
//   2. Backend record → QB export line items
//   3. Backend record → Slack message
//   4. Backend record → pay stub display data
//   5. Edit flow → updated submission
//
// Depends on dbm-core.js for all calculation primitives.

const {
  SCOPE_ES_TO_EN, DETAIL_CAT_ES_TO_EN, DETAIL_TYPE_ES_TO_EN,
  MULTIPLIER_ES_TO_EN, ACID_ES_TO_EN, CLEANUP_ES_TO_EN,
  DEFAULT_BPC,
  getUnit, toEnglish,
  calcScopePay, calcDetailPay, calcAcidPay, calcCleanPay,
  calcSubmissionTotal, buildQBMemo, toSlackChannel, validateSubmission,
} = require("./dbm-core.js");

// ── 1. FORM → BACKEND RECORD ─────────────────────────────────────────────────
//
// Raw form data (may contain Spanish display values) →
// Normalized record with all values converted to English for storage.
//
// formData shape:
//   weekEnding, projectDisplay, crewDisplay, category, payType
//   scopes: [{ scope (display), qty, multiplier (display) }]
//   details: [{ category (display), type (display), qty, railcuts }]
//   acidWash (display), cleanUp (display)
//   hours, leads, masons, laborers
//   notes, photos
//   newProjectFlag, newCrewFlag
//   lang: "en" | "es"

function normalizeFormData(formData) {
  const lang = formData.lang ?? "en";

  const normalizedScopes = (formData.scopes ?? [])
    .filter(s => s.scope)
    .map(s => {
      const enScope      = lang === "en" ? s.scope      : (SCOPE_ES_TO_EN[s.scope]       ?? s.scope);
      const enMultiplier = lang === "en" ? s.multiplier : (MULTIPLIER_ES_TO_EN[s.multiplier] ?? s.multiplier ?? "None");
      return {
        enScope,
        enMultiplier: enMultiplier || "None",
        qty:          s.qty ?? "",
        displayScope: s.scope,
        displayMultiplier: s.multiplier,
        bpc: formData.bpc ?? DEFAULT_BPC,
      };
    });

  const normalizedDetails = (formData.details ?? [])
    .filter(d => d.category && d.type)
    .map(d => {
      const enCat  = lang === "en" ? d.category : (DETAIL_CAT_ES_TO_EN[d.category] ?? d.category);
      const enType = lang === "en" ? d.type      : (DETAIL_TYPE_ES_TO_EN[d.type]   ?? d.type);
      return {
        enCat,
        enType,
        qty:      d.qty ?? 1,
        railcuts: d.railcuts ?? false,
        displayCat:  d.category,
        displayType: d.type,
      };
    });

  const enAcidWash = lang === "en"
    ? (formData.acidWash  || null)
    : (ACID_ES_TO_EN[formData.acidWash]    || formData.acidWash  || null);

  const enCleanUp  = lang === "en"
    ? (formData.cleanUp   || null)
    : (CLEANUP_ES_TO_EN[formData.cleanUp]  || formData.cleanUp   || null);

  return {
    // Identity
    weekEnding:     formData.weekEnding ?? "",
    projectDisplay: formData.projectDisplay ?? "",
    crewDisplay:    formData.crewDisplay ?? "",
    category:       formData.category ?? "",
    payType:        formData.payType ?? "",

    // Normalized pay data (always English)
    scopes:     normalizedScopes,
    details:    normalizedDetails,
    enAcidWash,
    enCleanUp,

    // Hourly
    hours:     formData.hours    ?? "",
    leads:     formData.leads    ?? "",
    masons:    formData.masons   ?? "",
    laborers:  formData.laborers ?? "",

    // Meta
    notes:          formData.notes   ?? "",
    photos:         formData.photos  ?? [],
    newProjectFlag: formData.newProjectFlag ?? null,
    newCrewFlag:    formData.newCrewFlag    ?? null,
    submittedAt:    formData.submittedAt    ?? new Date().toISOString(),
    lang,
  };
}

// ── 2. BACKEND RECORD → QB EXPORT LINE ITEMS ─────────────────────────────────
//
// Produces the array of line items that appear in QB_EXPORT.
// Each item: { payee, checkDate, bankAccount, qbCategory, memo, amount, billable, project, weekEnding, payType, rowType }
//
// Rules:
//   - 1 PAYEE row per submission (grand total)
//   - 1 LINE row per scope (brick and non-brick separate if multiplier)
//   - 1 LINE row per detail (railcuts as its own line if present)
//   - 1 LINE row for acid wash if selected
//   - 1 LINE row for clean up if selected
//   - Memo ≤ 40 chars

function buildQBExportBlock(record) {
  const cat      = record.category;
  const totals   = calcSubmissionTotal(record);
  const checkDate = record.weekEnding;
  const payee     = record.crewDisplay;
  const project   = record.projectDisplay;
  const week      = record.weekEnding;

  const base = {
    payee,
    checkDate,
    bankAccount: "DBM Checking",
    billable:    "Yes",
    project,
    weekEnding:  week,
    payType:     record.payType,
    qbCategory:  "Subcontractors - COS",
  };

  const lines = [];

  // Scope lines
  for (const s of totals.scopeLines) {
    const unit = getUnit(s.enScope);
    const isBrick = unit === "Cubes";
    const hasMultiplier = s.enMultiplier !== "None";

    if (isBrick) {
      const memo = buildQBMemo("brick", { qty: s.qty, rate: s.rate, bpc: s.bpc ?? DEFAULT_BPC });
      if (hasMultiplier) {
        // Split: base line + multiplier delta line for clarity
        lines.push({ ...base, rowType: "LINE", memo, amount: s.base });
        lines.push({
          ...base, rowType: "LINE",
          memo: `${s.enMultiplier} (×${s.multiplierFactor})`.slice(0, 40),
          amount: s.total - s.base,
        });
      } else {
        lines.push({ ...base, rowType: "LINE", memo, amount: s.total });
      }
    } else {
      const memoType = hasMultiplier ? "scope_mult" : "scope";
      const memo = buildQBMemo(memoType, {
        enScope: s.enScope, qty: s.payQty, unit: s.unit, rate: s.rate, enMultiplier: s.enMultiplier,
      });
      lines.push({ ...base, rowType: "LINE", memo, amount: s.total });
    }
  }

  // Detail lines
  for (const d of totals.detailLines) {
    const memo = buildQBMemo("detail", { enCat: d.enCat, enType: d.enType, qty: d.qty });
    lines.push({ ...base, rowType: "LINE", memo, amount: d.base });
    if (d.railcuts && d.railcutsPay > 0) {
      const rcMemo = `Railcuts ×${d.qty}`.slice(0, 40);
      lines.push({ ...base, rowType: "LINE", memo: rcMemo, amount: d.railcutsPay });
    }
  }

  // Acid wash
  if (totals.acidPay > 0) {
    const memo = buildQBMemo("acid_wash", { amount: totals.acidPay });
    lines.push({ ...base, rowType: "LINE", memo, amount: totals.acidPay });
  }

  // Clean up
  if (totals.cleanPay > 0) {
    const memo = buildQBMemo("clean_up", { amount: totals.cleanPay });
    lines.push({ ...base, rowType: "LINE", memo, amount: totals.cleanPay });
  }

  // Payee summary row (goes first)
  const payeeRow = {
    ...base,
    rowType: "PAYEE",
    memo:    `WEEK ${week} — Total: $${totals.grand.toFixed(2)}`.slice(0, 40),
    amount:  totals.grand,
    qbCategory: "",
  };

  return {
    payeeRow,
    lineItems: lines,
    totals,
    checkTotal: totals.grand,
    lineItemCount: lines.length,
  };
}

// ── 3. BACKEND RECORD → SLACK MESSAGE ────────────────────────────────────────
//
// Builds the plain-text Slack message body posted to #project-name.
// Always in English regardless of input lang.

function buildSlackMessage(record) {
  const totals = calcSubmissionTotal(record);
  const channel = toSlackChannel(record.projectDisplay);

  const lines = [
    `📋 *Field Report*`,
    `👷 ${record.crewDisplay}`,
    `📅 Week ending: ${record.weekEnding}`,
    `💼 ${record.payType}`,
    `📍 ${record.projectDisplay} (${record.category})`,
  ];

  if (record.payType === "Unit") {
    for (const s of totals.scopeLines) {
      const unit = getUnit(s.enScope);
      const multStr = s.enMultiplier !== "None" ? ` ×${s.multiplierFactor} (${s.enMultiplier})` : "";
      lines.push(`⬛ ${s.enScope} — ${s.qty} ${unit}${multStr} → ${_fmt(s.total)}`);
    }
    for (const d of totals.detailLines) {
      const rcStr = d.railcuts ? " + Railcuts" : "";
      lines.push(`🔩 ${d.enCat} / ${d.enType}${rcStr} ×${d.qty} → ${_fmt(d.total)}`);
    }
    if (totals.acidPay > 0) lines.push(`🧪 ${record.enAcidWash} → ${_fmt(totals.acidPay)}`);
    if (totals.cleanPay > 0) lines.push(`🧹 ${record.enCleanUp} → ${_fmt(totals.cleanPay)}`);
  } else {
    lines.push(`⏱ ${record.hours} hrs | ${record.leads} Lead · ${record.masons} Mason · ${record.laborers} Labor`);
  }

  if (record.notes) lines.push(`📝 ${record.notes}`);
  if (record.photos?.length > 0) lines.push(`📷 ${record.photos.length} photo(s)`);
  if (record.newProjectFlag) lines.push(`⚠️ NEW PROJECT: ${record.newProjectFlag}`);
  if (record.newCrewFlag)    lines.push(`⚠️ NEW CREW: ${record.newCrewFlag}`);

  lines.push(`💰 *Total: ${_fmt(totals.grand)}*`);

  return { channel, body: lines.join("\n"), totals };
}

function _fmt(n) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── 4. BACKEND RECORD → PAY STUB DISPLAY DATA ────────────────────────────────
//
// Transforms a stored record into the display structure the pay stub UI needs.
// Mirrors what the React PayStubView component derives from its props.

function buildPayStubData(record) {
  const totals = calcSubmissionTotal(record);

  return {
    // Header
    weekEnding:     record.weekEnding,
    projectDisplay: record.projectDisplay,
    crewDisplay:    record.crewDisplay,
    category:       record.category,
    payType:        record.payType,

    // Scope lines (for itemized display)
    scopeLines: totals.scopeLines.map(s => ({
      label:      s.enScope,
      subLabel:   `${s.qty} ${getUnit(s.enScope)} × $${s.rate}${s.enMultiplier !== "None" ? " × " + s.enMultiplier : ""}`,
      amount:     s.total,
    })),

    // Detail lines
    detailLines: totals.detailLines.flatMap(d => {
      const rows = [{
        label:    `${d.enCat} — ${d.enType}`,
        subLabel: `${d.qty} × $${d.rate}`,
        amount:   d.base,
      }];
      if (d.railcuts && d.railcutsPay > 0) {
        rows.push({ label: "Railcuts", subLabel: "flat fee", amount: d.railcutsPay });
      }
      return rows;
    }),

    // Clean
    acidWashLine:  totals.acidPay  > 0 ? { label: record.enAcidWash,  amount: totals.acidPay  } : null,
    cleanUpLine:   totals.cleanPay > 0 ? { label: record.enCleanUp,   amount: totals.cleanPay } : null,

    // Subtotals
    scopeSubtotal:  totals.scopeTotal,
    detailSubtotal: totals.detailTotal,
    acidSubtotal:   totals.acidPay,
    cleanSubtotal:  totals.cleanPay,
    grandTotal:     totals.grand,

    // Hourly
    hours:    record.hours,
    leads:    record.leads,
    masons:   record.masons,
    laborers: record.laborers,

    // Meta
    notes:          record.notes,
    photos:         record.photos,
    newProjectFlag: record.newProjectFlag,
    newCrewFlag:    record.newCrewFlag,
  };
}

// ── 5. SUBMISSION STORE (in-memory, mirrors React useState) ──────────────────
//
// Minimal store that tracks submissions and status transitions.
// Used to test the edit → resubmit → status reset flow.

const STATUS_TRANSITIONS = {
  pending:  ["sent"],
  sent:     ["opened"],
  opened:   ["approved", "disputed"],
  approved: ["paid"],
  disputed: ["pending"],   // foreman edits → back to pending
  paid:     [],
};

class SubmissionStore {
  constructor() {
    this._submissions = new Map();
    this._nextId = 1;
  }

  add(record) {
    const id = `sub_${this._nextId++}`;
    this._submissions.set(id, {
      id,
      record,
      stubStatus: "pending",
      ownerNote:  null,
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
    });
    return id;
  }

  get(id) {
    return this._submissions.get(id) ?? null;
  }

  list() {
    return Array.from(this._submissions.values());
  }

  // Foreman edits a submission — resets to pending, clears owner note
  edit(id, updatedRecord) {
    const sub = this._submissions.get(id);
    if (!sub) throw new Error(`Submission ${id} not found`);
    this._submissions.set(id, {
      ...sub,
      record:     updatedRecord,
      stubStatus: "pending",
      ownerNote:  null,
      updatedAt:  new Date().toISOString(),
    });
    return this.get(id);
  }

  // Owner transitions status
  transition(id, newStatus, ownerNote = null) {
    const sub = this._submissions.get(id);
    if (!sub) throw new Error(`Submission ${id} not found`);
    const allowed = STATUS_TRANSITIONS[sub.stubStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot transition from ${sub.stubStatus} → ${newStatus}`);
    }
    this._submissions.set(id, {
      ...sub,
      stubStatus: newStatus,
      ownerNote:  ownerNote ?? sub.ownerNote,
      updatedAt:  new Date().toISOString(),
    });
    return this.get(id);
  }

  countByStatus(status) {
    return Array.from(this._submissions.values()).filter(s => s.stubStatus === status).length;
  }

  clear() { this._submissions.clear(); this._nextId = 1; }
}

module.exports = {
  normalizeFormData,
  buildQBExportBlock,
  buildSlackMessage,
  buildPayStubData,
  SubmissionStore,
  STATUS_TRANSITIONS,
  _fmt,
};
