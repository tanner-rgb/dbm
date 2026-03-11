// ═══════════════════════════════════════════════════════════════════════════════
// DBM FIELD REPORTING — Google Apps Script Backend
// Deploy as: Extensions → Apps Script → Deploy → Web App
//   Execute as: Me  |  Who has access: Anyone (or Anyone with Google Account)
//
// SETUP INSTRUCTIONS:
//   1. Open your Payroll_Template_V3.xlsx in Google Sheets (import it first)
//   2. Open Extensions → Apps Script
//   3. Paste this entire file
//   4. Set the CONFIG constants below
//   5. Deploy → New Deployment → Web App
//   6. Copy the deployment URL into the React app's API_BASE constant
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
const CONFIG = {
  // Google Sheets IDs (get from URL: docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit)
  PAYROLL_SHEET_ID:   "YOUR_SPREADSHEET_ID_HERE",

  // Slack webhook URL (Workspace → Apps → Incoming Webhooks)
  SLACK_WEBHOOK_URL:  "YOUR_SLACK_WEBHOOK_URL_HERE",

  // Google Drive folder ID where project photo subfolders will be created
  // (get from Drive folder URL)
  PHOTOS_FOLDER_ID:   "YOUR_DRIVE_FOLDER_ID_HERE",

  // Sheet tab names
  PAYROLL_INPUT_SHEET:   "PAYROLL_INPUT",
  PAY_STUB_TRACKER_SHEET: "PAY_STUB_TRACKER",
  PROJECTS_SHEET:        "PROJECTS",
  CREWS_SHEET:           "CREW_HOURLY_RATES",

  // Owner email for new project/crew flag notifications
  OWNER_EMAIL: "YOUR_EMAIL_HERE",
};

// ── CORS HEADERS ──────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function makeResponse(data, code) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

function makeError(message, code) {
  return makeResponse({ success: false, error: message, code: code || 400 });
}

// ── ROUTER ────────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action || "";
    switch (action) {
      case "submissions": return handleGetSubmissions(e);
      case "projects":    return handleGetProjects(e);
      case "crews":       return handleGetCrews(e);
      case "ping":        return makeResponse({ success: true, message: "DBM Backend v1.0", ts: new Date().toISOString() });
      default:            return makeError("Unknown action: " + action);
    }
  } catch (err) {
    return makeError("Internal error: " + err.message, 500);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || e.parameter.action || "";
    switch (action) {
      case "submit":     return handleSubmit(body);
      case "transition": return handleTransition(body);
      case "addProject": return handleAddProject(body);
      case "addCrew":    return handleAddCrew(body);
      default:           return makeError("Unknown action: " + action);
    }
  } catch (err) {
    return makeError("Internal error: " + err.message, 500);
  }
}

// ── HANDLER: SUBMIT ───────────────────────────────────────────────────────────
// Receives a normalized submission from the app and:
//   1. Appends row(s) to PAYROLL_INPUT
//   2. Appends row to PAY_STUB_TRACKER
//   3. Posts to Slack #project-name channel
//   4. Saves photos to Drive
//   5. Sends email if new project/crew flagged
//   6. Returns { success, submissionId, rowNumber }

function handleSubmit(body) {
  const record = body.record;
  if (!record) return makeError("Missing record");

  const ss = SpreadsheetApp.openById(CONFIG.PAYROLL_SHEET_ID);

  // 1. Append to PAYROLL_INPUT
  const rowNumber = appendPayrollRow(ss, record);

  // 2. Append to PAY_STUB_TRACKER
  const submissionId = appendStubTracker(ss, record, rowNumber);

  // 3. Post to Slack
  if (CONFIG.SLACK_WEBHOOK_URL && CONFIG.SLACK_WEBHOOK_URL !== "YOUR_SLACK_WEBHOOK_URL_HERE") {
    postToSlack(record);
  }

  // 4. Save photos to Drive
  if (record.photos && record.photos.length > 0) {
    savePhotos(record);
  }

  // 5. Flag email for new project/crew
  if ((record.newProjectFlag || record.newCrewFlag) &&
      CONFIG.OWNER_EMAIL !== "YOUR_EMAIL_HERE") {
    sendFlagEmail(record);
  }

  // 6. Auto-add new project/crew to sheets
  if (record.newProjectFlag) addProjectToSheet(ss, record);
  if (record.newCrewFlag)    addCrewToSheet(ss, record);

  return makeResponse({
    success: true,
    submissionId,
    rowNumber,
    message: "Submission saved",
  });
}

// ── PAYROLL_INPUT ROW BUILDER ─────────────────────────────────────────────────
// Maps normalized record fields to PAYROLL_INPUT_V2 column layout (A–AX, 50 cols)
// Col: A=Week Ending, B=Project, C=Category, D=Crew,
//      E=Scope-A, F=Cubes-A, G=BrickCube-A, H=PayQty1(formula), I=Rate1,
//      J=BulkPay1, K=Mult-A, L=MultFactor1, M=MultPay1,
//      N=Scope-B, O=Cubes-B, P=BrickCube-B ... (same pattern)
//      W=Detail1-Scope, X=Detail1-Count, Y=Detail1-Rate(formula),
//      AB=Detail2-Scope, AC=Detail2-Count, AD=Detail2-Rate(formula),
//      AE=AcidWash, AF=CleanUp,
//      AG=Hours, AH=#Lead, AI=LeadRate, AJ=#Mason, AK=MasonRate, AL=#Labor, AM=LaborRate
//      AN–AX = totals (formula columns, left blank — sheet calculates)

function appendPayrollRow(ss, record) {
  const sheet = ss.getSheetByName(CONFIG.PAYROLL_INPUT_SHEET);
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const newRow = lastRow + 1;

  const scopes  = (record.scopes  || []).filter(s => s.enScope);
  const details = (record.details || []).filter(d => d.enCat && d.enType);
  const s0 = scopes[0]  || {};
  const s1 = scopes[1]  || {};
  const d0 = details[0] || {};
  const d1 = details[1] || {};

  // Build the detail scope label the way DETAIL_RATES is keyed
  function detailLabel(enCat, enType) {
    if (!enCat || !enType) return "";
    const wrappers = {
      "Arch":        `Arch (${enType})`,
      "Brick Column":`Brick Column (${enType})`,
      "Fireplace":   `Fireplace (${enType})`,
      "Hearth":      `Hearth (${enType})`,
      "Mantle":      `Mantle (${enType})`,
      "Mailbox":     `Mailbox (${enType})`,
      "Fire Feature":`Fire Feature (${enType})`,
      "Window / Door":`Window / Door (${enType})`,
    };
    return wrappers[enCat] || `${enCat} (${enType})`;
  }

  const row = [
    record.weekEnding,                             // A
    record.projectDisplay,                         // B
    record.category,                               // C
    record.crewDisplay,                            // D

    // Scope A
    s0.enScope    || "",                           // E
    s0.qty        || "",                           // F  (cubes/qty input)
    "",                                            // G  (brick/cube — sheet looks up)
    "",                                            // H  (pay qty — formula)
    "",                                            // I  (rate — formula)
    "",                                            // J  (bulk pay — formula)
    s0.enMultiplier || "None",                     // K
    "",                                            // L  (mult factor — formula)
    "",                                            // M  (mult pay — formula)

    // Scope B
    s1.enScope    || "",                           // N
    s1.qty        || "",                           // O
    "",                                            // P
    "",                                            // Q  (pay qty — formula)
    "",                                            // R
    "",                                            // S
    s1.enMultiplier || "None",                     // T
    "",                                            // U
    "",                                            // V

    // Detail 1
    detailLabel(d0.enCat, d0.enType),              // W
    d0.qty || "",                                  // X
    "",                                            // Y  (rate — formula)
    "",                                            // Z  (col 26 — placeholder)
    d0.railcuts ? "Yes" : "",                      // AA (railcuts flag)

    // Detail 2
    detailLabel(d1.enCat, d1.enType),              // AB
    d1.qty || "",                                  // AC
    "",                                            // AD (rate — formula)

    // Clean
    record.enAcidWash || "",                       // AE
    record.enCleanUp  || "",                       // AF

    // Hourly
    record.hours    || "",                         // AG
    record.leads    || "",                         // AH
    "",                                            // AI (lead rate — formula)
    record.masons   || "",                         // AJ
    "",                                            // AK (mason rate — formula)
    record.laborers || "",                         // AL
    "",                                            // AM (labor rate — formula)

    // Totals AN–AX: leave blank, sheet formulas calculate
  ];

  sheet.getRange(newRow, 1, 1, row.length).setValues([row]);
  return newRow;
}

// ── PAY STUB TRACKER ──────────────────────────────────────────────────────────
function appendStubTracker(ss, record, payrollRow) {
  const sheet = ss.getSheetByName(CONFIG.PAY_STUB_TRACKER_SHEET);
  const lastRow = Math.max(sheet.getLastRow(), 3); // row 1-3 are headers
  const newRow = lastRow + 1;
  const submissionId = "DBM-" + Utilities.formatDate(new Date(), "America/Chicago", "yyyyMMdd") + "-" + payrollRow;

  sheet.getRange(newRow, 1, 1, 11).setValues([[
    record.weekEnding,       // A: Week Ending
    record.crewDisplay,      // B: Crew / Payee
    record.projectDisplay,   // C: Project
    record.payType,          // D: Pay Type
    "",                      // E: Total Pay (formula could reference PAYROLL_INPUT)
    "No",                    // F: Stub Sent?
    "",                      // G: Date Sent
    "No",                    // H: Opened?
    "PENDING",               // I: Status
    record.notes || "",      // J: Foreman Notes
    "No",                    // K: Check Printed?
  ]]);

  return submissionId;
}

// ── SLACK POST ────────────────────────────────────────────────────────────────
function postToSlack(record) {
  const channel = "#" + record.projectDisplay
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const lines = [
    `📋 *Field Report*`,
    `👷 ${record.crewDisplay}`,
    `📅 Week ending: ${record.weekEnding}`,
    `💼 ${record.payType}`,
    `📍 ${record.projectDisplay} (${record.category})`,
  ];

  const scopes = (record.scopes || []).filter(s => s.enScope);
  for (const s of scopes) {
    const unit = getUnit(s.enScope);
    const mult = s.enMultiplier !== "None" ? ` ×${s.enMultiplier}` : "";
    lines.push(`⬛ ${s.enScope} — ${s.qty} ${unit}${mult}`);
  }

  const details = (record.details || []).filter(d => d.enCat && d.enType);
  for (const d of details) {
    const rc = d.railcuts ? " + Railcuts" : "";
    lines.push(`🔩 ${d.enCat} / ${d.enType}${rc} ×${d.qty}`);
  }

  if (record.enAcidWash) lines.push(`🧪 ${record.enAcidWash}`);
  if (record.enCleanUp)  lines.push(`🧹 ${record.enCleanUp}`);
  if (record.notes)      lines.push(`📝 ${record.notes}`);
  if (record.newProjectFlag) lines.push(`⚠️ *NEW PROJECT: ${record.newProjectFlag}*`);
  if (record.newCrewFlag)    lines.push(`⚠️ *NEW CREW: ${record.newCrewFlag}*`);

  const payload = {
    channel: channel,
    text: lines.join("\n"),
    username: "DBM Field Bot",
    icon_emoji: ":bricks:",
  };

  UrlFetchApp.fetch(CONFIG.SLACK_WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

// ── DRIVE PHOTO SAVE ──────────────────────────────────────────────────────────
function savePhotos(record) {
  const rootFolder = DriveApp.getFolderById(CONFIG.PHOTOS_FOLDER_ID);

  // Find or create project subfolder
  const projectName = record.projectDisplay.replace(/[^a-zA-Z0-9 \-_]/g, "");
  let projectFolder;
  const existing = rootFolder.getFoldersByName(projectName);
  projectFolder = existing.hasNext() ? existing.next() : rootFolder.createFolder(projectName);

  // Week subfolder
  const weekName = "Week-" + record.weekEnding;
  let weekFolder;
  const existingWeek = projectFolder.getFoldersByName(weekName);
  weekFolder = existingWeek.hasNext() ? existingWeek.next() : projectFolder.createFolder(weekName);

  // Save each photo (base64 data URL → blob)
  record.photos.forEach(function(photo, i) {
    try {
      const base64 = photo.url.split(",")[1];
      const mimeType = photo.url.split(";")[0].split(":")[1] || "image/jpeg";
      const ext = mimeType === "image/png" ? ".png" : ".jpg";
      const filename = record.crewDisplay.replace(/[^a-zA-Z0-9]/g, "_") + "_" + (i + 1) + ext;
      const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, filename);
      weekFolder.createFile(blob);
    } catch (e) {
      Logger.log("Photo save error: " + e.message);
    }
  });
}

// ── FLAG EMAIL ────────────────────────────────────────────────────────────────
function sendFlagEmail(record) {
  const subject = "⚠️ DBM: New " + (record.newProjectFlag ? "Project" : "Crew") + " flagged for review";
  const body = [
    "A field report was submitted with a new entry that needs your review:",
    "",
    record.newProjectFlag ? "New Project: " + record.newProjectFlag : "",
    record.newCrewFlag    ? "New Crew: "    + record.newCrewFlag    : "",
    "",
    "Submitted by: " + record.crewDisplay,
    "Project: "      + record.projectDisplay,
    "Week ending: "  + record.weekEnding,
    "",
    "Please add rates and confirm in the Payroll Template.",
  ].filter(Boolean).join("\n");

  GmailApp.sendEmail(CONFIG.OWNER_EMAIL, subject, body);
}

// ── HANDLER: TRANSITION ───────────────────────────────────────────────────────
// Updates PAY_STUB_TRACKER status for a submission
// body: { submissionId, crewDisplay, weekEnding, newStatus, ownerNote }

function handleTransition(body) {
  const { crewDisplay, weekEnding, newStatus, ownerNote } = body;
  if (!crewDisplay || !weekEnding || !newStatus) {
    return makeError("Missing required fields: crewDisplay, weekEnding, newStatus");
  }

  const ss = SpreadsheetApp.openById(CONFIG.PAYROLL_SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.PAY_STUB_TRACKER_SHEET);
  const data = sheet.getDataRange().getValues();

  // Find matching row (skip header rows 1-3)
  for (let i = 3; i < data.length; i++) {
    const rowWeek = String(data[i][0]);
    const rowCrew = String(data[i][1]);
    const weekMatch = rowWeek.includes(weekEnding) || weekEnding.includes(rowWeek.substring(0, 10));
    if (weekMatch && rowCrew === crewDisplay) {
      const rowNum = i + 1;
      sheet.getRange(rowNum, 9).setValue(newStatus.toUpperCase()); // I: Status
      if (ownerNote) {
        const existing = sheet.getRange(rowNum, 10).getValue();
        const updated = existing ? existing + "\n[Owner]: " + ownerNote : "[Owner]: " + ownerNote;
        sheet.getRange(rowNum, 10).setValue(updated); // J: Notes
      }
      if (newStatus === "sent") {
        sheet.getRange(rowNum, 6).setValue("Yes");   // F: Stub Sent
        sheet.getRange(rowNum, 7).setValue(Utilities.formatDate(new Date(), "America/Chicago", "MM/dd/yyyy")); // G: Date Sent
      }
      if (newStatus === "opened") {
        sheet.getRange(rowNum, 8).setValue("Yes");   // H: Opened
      }
      if (newStatus === "paid") {
        sheet.getRange(rowNum, 11).setValue("Yes");  // K: Check Printed
      }

      // Notify via Slack if disputed
      if (newStatus === "disputed" && ownerNote &&
          CONFIG.SLACK_WEBHOOK_URL !== "YOUR_SLACK_WEBHOOK_URL_HERE") {
        postDisputeNotice(crewDisplay, weekEnding, ownerNote);
      }

      return makeResponse({ success: true, updatedRow: rowNum, newStatus });
    }
  }

  return makeError("Submission not found for crew: " + crewDisplay + " week: " + weekEnding, 404);
}

function postDisputeNotice(crewDisplay, weekEnding, ownerNote) {
  const payload = {
    text: `⚠️ *Pay stub returned for changes*\n👷 ${crewDisplay} | Week: ${weekEnding}\n📝 ${ownerNote}`,
    username: "DBM Field Bot",
    icon_emoji: ":warning:",
  };
  UrlFetchApp.fetch(CONFIG.SLACK_WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

// ── HANDLER: GET SUBMISSIONS ──────────────────────────────────────────────────
// Returns submissions from PAY_STUB_TRACKER
// Params: crew (optional), week (optional), status (optional)

function handleGetSubmissions(e) {
  const filterCrew   = e.parameter.crew   || "";
  const filterWeek   = e.parameter.week   || "";
  const filterStatus = e.parameter.status || "";

  const ss = SpreadsheetApp.openById(CONFIG.PAYROLL_SHEET_ID);
  const trackerSheet = ss.getSheetByName(CONFIG.PAY_STUB_TRACKER_SHEET);
  const payrollSheet = ss.getSheetByName(CONFIG.PAYROLL_INPUT_SHEET);

  const trackerData = trackerSheet.getDataRange().getValues();
  const payrollData = payrollSheet.getDataRange().getValues();

  const submissions = [];

  // Build a lookup from PAYROLL_INPUT: crew+week → pay data
  const payrollIndex = {};
  for (let i = 1; i < payrollData.length; i++) {
    const row = payrollData[i];
    const week = String(row[0]).substring(0, 10);
    const crew = String(row[3]);
    const project = String(row[1]);
    const key = crew + "|" + week + "|" + project;
    if (!payrollIndex[key]) payrollIndex[key] = [];
    payrollIndex[key].push(row);
  }

  // Parse tracker rows (skip header rows 1-3)
  for (let i = 3; i < trackerData.length; i++) {
    const row = trackerData[i];
    if (!row[0] && !row[1]) continue; // empty row

    const week    = String(row[0]).substring(0, 10);
    const crew    = String(row[1]);
    const project = String(row[2]);
    const payType = String(row[3]);
    const status  = String(row[8] || "PENDING").toLowerCase();

    // Apply filters
    if (filterCrew   && crew   !== filterCrew)   continue;
    if (filterWeek   && week   !== filterWeek)   continue;
    if (filterStatus && status !== filterStatus.toLowerCase()) continue;

    const key = crew + "|" + week + "|" + project;
    const payrollRows = payrollIndex[key] || [];

    submissions.push({
      id:          "DBM-" + week.replace(/-/g, "") + "-" + (i - 2),
      weekEnding:  week,
      crewDisplay: crew,
      projectDisplay: project,
      payType:     payType,
      stubStatus:  status,
      stubSent:    String(row[5]) === "Yes",
      dateSent:    String(row[6] || ""),
      opened:      String(row[7]) === "Yes",
      ownerNote:   String(row[9] || "") || null,
      checkPrinted: String(row[10]) === "Yes",
      hasPayrollData: payrollRows.length > 0,
      rowIndex:    i + 1,
    });
  }

  return makeResponse({ success: true, submissions, count: submissions.length });
}

// ── HANDLER: GET PROJECTS ─────────────────────────────────────────────────────
function handleGetProjects(e) {
  const ss = SpreadsheetApp.openById(CONFIG.PAYROLL_SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.PROJECTS_SHEET);
  const data = sheet.getDataRange().getValues();
  const projects = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    projects.push({
      name:     String(row[0]),
      category: String(row[1] || ""),
      active:   String(row[3] || "").toLowerCase() === "yes",
      bpc:      row[5] ? Number(row[5]) : 500,
    });
  }
  return makeResponse({ success: true, projects });
}

// ── HANDLER: GET CREWS ────────────────────────────────────────────────────────
function handleGetCrews(e) {
  const ss = SpreadsheetApp.openById(CONFIG.PAYROLL_SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.CREWS_SHEET);
  const data = sheet.getDataRange().getValues();
  const crews = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[1]) continue;
    crews.push({
      displayName: String(row[1]),
      payName:     String(row[0] || row[1]),
      leadRate:    row[2] ? Number(row[2]) : null,
      masonRate:   row[3] ? Number(row[3]) : null,
      laborRate:   row[4] ? Number(row[4]) : null,
    });
  }
  return makeResponse({ success: true, crews });
}

// ── HANDLER: ADD PROJECT ──────────────────────────────────────────────────────
function handleAddProject(body) {
  const { name, category, bpc } = body;
  if (!name || !category) return makeError("Missing name or category");
  const ss = SpreadsheetApp.openById(CONFIG.PAYROLL_SHEET_ID);
  addProjectToSheet(ss, { newProjectFlag: name, category, bpc });
  return makeResponse({ success: true, message: "Project added: " + name });
}

function addProjectToSheet(ss, record) {
  const sheet = ss.getSheetByName(CONFIG.PROJECTS_SHEET);
  const lastRow = sheet.getLastRow() + 1;
  sheet.getRange(lastRow, 1, 1, 4).setValues([[
    record.newProjectFlag || record.projectDisplay,
    record.category || "",
    "",
    "Yes",
  ]]);
  if (record.bpc) sheet.getRange(lastRow, 6).setValue(record.bpc);
}

// ── HANDLER: ADD CREW ─────────────────────────────────────────────────────────
function handleAddCrew(body) {
  const { name } = body;
  if (!name) return makeError("Missing crew name");
  const ss = SpreadsheetApp.openById(CONFIG.PAYROLL_SHEET_ID);
  addCrewToSheet(ss, { newCrewFlag: name });
  return makeResponse({ success: true, message: "Crew added: " + name });
}

function addCrewToSheet(ss, record) {
  const sheet = ss.getSheetByName(CONFIG.CREWS_SHEET);
  const lastRow = sheet.getLastRow() + 1;
  const name = record.newCrewFlag || record.crewDisplay;
  // Add with same name in both pay name and crew columns, rates to be filled
  sheet.getRange(lastRow, 1, 1, 2).setValues([[name, name]]);
}

// ── UTILITY: getUnit (mirrors dbm-core.js, needed here without imports) ───────
function getUnit(enScope) {
  if (!enScope) return null;
  if (enScope === "Brick") return "Cubes";
  const SF = ["Stone - MJ/DS","Stone - MJ","Stone - DS","Thin Brick/Stone",
              "Footing","Stucco","Pavers","Flag Stone"];
  if (SF.indexOf(enScope) > -1) return "SF";
  if (enScope === "Cast Stone") return "LF";
  return "EA";
}

// ── TRIGGER: Daily QB Export Refresh ─────────────────────────────────────────
// Install via: Triggers → Add Trigger → refreshQBExport → Time-driven → Day timer
function refreshQBExport() {
  const ss = SpreadsheetApp.openById(CONFIG.PAYROLL_SHEET_ID);
  const payroll = ss.getSheetByName(CONFIG.PAYROLL_INPUT_SHEET);
  const qbSheet = ss.getSheetByName("QB_EXPORT");
  const tracker = ss.getSheetByName(CONFIG.PAY_STUB_TRACKER_SHEET);

  const payrollData = payroll.getDataRange().getValues();
  const trackerData = tracker.getDataRange().getValues();

  // Build status lookup: crew|week → status
  const statusLookup = {};
  for (let i = 3; i < trackerData.length; i++) {
    const row = trackerData[i];
    if (!row[0]) continue;
    const key = String(row[1]) + "|" + String(row[0]).substring(0, 10);
    statusLookup[key] = String(row[8] || "PENDING").toUpperCase();
  }

  // Clear existing QB data rows (keep header rows 1-7)
  const lastRow = qbSheet.getLastRow();
  if (lastRow > 7) qbSheet.getRange(8, 1, lastRow - 7, 12).clearContent();

  let writeRow = 8;
  const GREEN_BG = "#D8F0D0";
  const WHITE_BG = "#FFFFFF";
  const ALT_BG   = "#F5F5F5";

  // Group payroll rows by crew+week+project
  const groups = {};
  for (let i = 1; i < payrollData.length; i++) {
    const row = payrollData[i];
    if (!row[0] || !row[3]) continue;
    const week    = String(row[0]).substring(0, 10);
    const crew    = String(row[3]);
    const project = String(row[1]);
    const key = crew + "|" + week + "|" + project;
    if (!groups[key]) groups[key] = { week, crew, project, category: String(row[2]), rows: [] };
    groups[key].rows.push(row);
  }

  for (const key in groups) {
    const g = groups[key];
    const statusKey = g.crew + "|" + g.week;
    const status = statusLookup[statusKey] || "PENDING";

    // Collect line items from all payroll rows in this group
    const lineItems = [];
    let checkTotal = 0;

    for (const row of g.rows) {
      // The formula-calculated total columns are AN(40)–AX(50)
      // In a live sheet these would be calculated; here we read the cached values
      const totalScopeA  = row[39] || 0;  // AN
      const totalScopeB  = row[40] || 0;  // AO
      const totalDetail1 = row[42] || 0;  // AQ
      const totalDetail2 = row[43] || 0;  // AR
      const totalAcid    = row[45] || 0;  // AT
      const totalClean   = row[46] || 0;  // AU
      const totalHourly  = row[48] || 0;  // AW
      const combined     = row[49] || 0;  // AX

      // Build short memos from input columns
      const scopeA = String(row[4] || "");
      const qtyA   = row[5] || "";
      const multA  = String(row[10] || "None");
      if (scopeA && totalScopeA) {
        const unit = getUnit(scopeA.replace(/^(Commercial|Residential)\s+/, ""));
        const multStr = multA !== "None" ? " +" + multA : "";
        lineItems.push({
          memo: (scopeA.replace(/^(Commercial|Residential)\s+/, "") + " " + qtyA + (unit||"") + multStr).slice(0, 40),
          amount: Number(totalScopeA),
        });
      }
      const scopeB = String(row[13] || "");
      if (scopeB && totalScopeB) {
        const unit = getUnit(scopeB.replace(/^(Commercial|Residential)\s+/, ""));
        lineItems.push({
          memo: (scopeB.replace(/^(Commercial|Residential)\s+/, "") + " " + (row[14]||"") + (unit||"")).slice(0, 40),
          amount: Number(totalScopeB),
        });
      }
      if (row[22] && totalDetail1) lineItems.push({ memo: String(row[22]).slice(0, 40), amount: Number(totalDetail1) });
      if (row[27] && totalDetail2) lineItems.push({ memo: String(row[27]).slice(0, 40), amount: Number(totalDetail2) });
      if (row[30] && totalAcid)    lineItems.push({ memo: ("Acid Wash " + row[30]).slice(0, 40), amount: Number(totalAcid) });
      if (row[31] && totalClean)   lineItems.push({ memo: ("Clean Up " + row[31]).slice(0, 40), amount: Number(totalClean) });
      if (totalHourly)             lineItems.push({ memo: ("Hourly " + (row[32]||"") + "hr").slice(0, 40), amount: Number(totalHourly) });

      checkTotal += Number(combined) || lineItems.reduce((s, l) => s + l.amount, 0);
    }

    if (lineItems.length === 0) continue;

    // Write PAYEE row
    const payeeRowData = [
      g.crew, g.week, "", "DBM Checking", "",
      ("WEEK " + g.week + " — Total: $" + checkTotal.toFixed(2)).slice(0, 40),
      checkTotal, "Yes", g.project, g.week, g.category, "PAYEE"
    ];
    qbSheet.getRange(writeRow, 1, 1, 12).setValues([payeeRowData]);
    qbSheet.getRange(writeRow, 1, 1, 12).setBackground(GREEN_BG);
    qbSheet.getRange(writeRow, 7).setNumberFormat("$#,##0.00");
    writeRow++;

    // Write LINE rows
    lineItems.forEach(function(li, idx) {
      const lineRowData = [
        "", "", "", "DBM Checking", "Subcontractors - COS",
        li.memo, li.amount, "Yes", g.project, g.week, "", "LINE"
      ];
      qbSheet.getRange(writeRow, 1, 1, 12).setValues([lineRowData]);
      qbSheet.getRange(writeRow, 1, 1, 12).setBackground(idx % 2 === 0 ? WHITE_BG : ALT_BG);
      qbSheet.getRange(writeRow, 7).setNumberFormat("$#,##0.00");
      writeRow++;
    });

    // Spacer row between check blocks
    writeRow++;
  }

  Logger.log("QB Export refreshed: " + writeRow + " rows written");
}

// ── TEST FUNCTION (run manually to verify setup) ──────────────────────────────
function testSetup() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.PAYROLL_SHEET_ID);
    Logger.log("✅ Spreadsheet connected: " + ss.getName());
    const sheets = ["PAYROLL_INPUT", "PAY_STUB_TRACKER", "QB_EXPORT", "PROJECTS", "CREW_HOURLY_RATES"];
    sheets.forEach(function(name) {
      const s = ss.getSheetByName(name);
      Logger.log(s ? "✅ Sheet found: " + name : "❌ Sheet missing: " + name);
    });
    const folder = DriveApp.getFolderById(CONFIG.PHOTOS_FOLDER_ID);
    Logger.log("✅ Drive folder: " + folder.getName());
  } catch (e) {
    Logger.log("❌ Setup error: " + e.message);
  }
}
