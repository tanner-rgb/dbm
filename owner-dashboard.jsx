import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — replace with real API calls once backend is wired
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_SUBMISSIONS = [
  {
    id: "DBM-20260314-1", weekEnding: "2026-03-14", crewDisplay: "Alan Gonzalez",
    projectDisplay: "Epperly Heights", category: "Commercial", payType: "Unit",
    stubStatus: "opened", ownerNote: null, stubSent: true, checkPrinted: false,
    scopeLines: [
      { label: "Brick", subLabel: "28 Cubes × $0.80 × Highwork", amount: 16800 },
      { label: "Stone - MJ/DS", subLabel: "120 SF × $10", amount: 1200 },
    ],
    detailLines: [
      { label: "Arch — Less 9ft", subLabel: "2 × $200", amount: 400 },
      { label: "Brick Column — 4x4", subLabel: "1 × $100", amount: 100 },
      { label: "Railcuts", subLabel: "flat fee", amount: 200 },
    ],
    acidWashLine:  { label: "Acid Wash ($150)",  amount: 150 },
    cleanUpLine:   { label: "Clean Up ($300)",   amount: 300 },
    grandTotal: 19150, notes: "Short day, started late", photos: [],
    newProjectFlag: null, newCrewFlag: null,
  },
  {
    id: "DBM-20260314-2", weekEnding: "2026-03-14", crewDisplay: "Ubaldo Flores (Belly)",
    projectDisplay: "Wings", category: "Commercial", payType: "Unit",
    stubStatus: "pending", ownerNote: null, stubSent: false, checkPrinted: false,
    scopeLines: [{ label: "8\" CMU", subLabel: "250 EA × $10", amount: 2500 }],
    detailLines: [],
    acidWashLine: null, cleanUpLine: { label: "Clean Up ($150)", amount: 150 },
    grandTotal: 2650, notes: "", photos: [],
    newProjectFlag: null, newCrewFlag: null,
  },
  {
    id: "DBM-20260314-3", weekEnding: "2026-03-14", crewDisplay: "Alfonso Marrufo (Poncho)",
    projectDisplay: "1819 Guilford", category: "Residential", payType: "Unit",
    stubStatus: "disputed", ownerNote: "Cube count doesn't match delivery ticket — please recount and resubmit",
    stubSent: true, checkPrinted: false,
    scopeLines: [{ label: "Brick", subLabel: "18 Cubes × $0.35", amount: 3150 }],
    detailLines: [{ label: "Fireplace — Masonry w/ Chimney", subLabel: "1 × $2500", amount: 2500 }],
    acidWashLine: { label: "Acid Wash ($500)", amount: 500 },
    cleanUpLine: null,
    grandTotal: 6150, notes: "", photos: [],
    newProjectFlag: null, newCrewFlag: null,
  },
  {
    id: "DBM-20260314-4", weekEnding: "2026-03-14", crewDisplay: "GJ Masonry",
    projectDisplay: "Spokes Superquads", category: "Commercial", payType: "Unit",
    stubStatus: "approved", ownerNote: null, stubSent: true, checkPrinted: false,
    scopeLines: [
      { label: "6\" CMU", subLabel: "800 EA × $10", amount: 8000 },
      { label: "4\" CMU - Structural", subLabel: "200 EA × $7", amount: 1400 },
    ],
    detailLines: [],
    acidWashLine: null, cleanUpLine: { label: "Clean Up ($1000 Lg Comm.)", amount: 1000 },
    grandTotal: 10400, notes: "", photos: [],
    newProjectFlag: null, newCrewFlag: null,
  },
  {
    id: "DBM-20260314-5", weekEnding: "2026-03-14", crewDisplay: "Murillo Masonry",
    projectDisplay: "Cherokee Youth Shelter", category: "Commercial", payType: "Unit",
    stubStatus: "paid", ownerNote: null, stubSent: true, checkPrinted: true,
    scopeLines: [{ label: "Brick", subLabel: "45 Cubes × $0.80 × Highwork", amount: 27000 }],
    detailLines: [{ label: "Arch — 9ft–15ft", subLabel: "3 × $500", amount: 1500 }],
    acidWashLine: null, cleanUpLine: { label: "Clean Up ($500)", amount: 500 },
    grandTotal: 29000, notes: "", photos: [],
    newProjectFlag: null, newCrewFlag: null,
  },
  {
    id: "DBM-20260314-6", weekEnding: "2026-03-07", crewDisplay: "GM Masonry Construction",
    projectDisplay: "New Office Build", category: "Commercial", payType: "Unit",
    stubStatus: "pending", ownerNote: null, stubSent: false, checkPrinted: false,
    scopeLines: [{ label: "8\" CMU", subLabel: "200 EA × $10", amount: 2000 }],
    detailLines: [],
    acidWashLine: null, cleanUpLine: null,
    grandTotal: 2000, notes: "", photos: [],
    newProjectFlag: "New Office Build", newCrewFlag: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { label: "Pending",  bg: "#E5E7EB", color: "#374151", dot: "#9CA3AF" },
  sent:     { label: "Sent",     bg: "#DBEAFE", color: "#1D4ED8", dot: "#3B82F6" },
  opened:   { label: "Opened",   bg: "#FEF3C7", color: "#92400E", dot: "#F59E0B" },
  approved: { label: "Approved", bg: "#D1FAE5", color: "#065F46", dot: "#10B981" },
  disputed: { label: "Disputed", bg: "#FEF9C3", color: "#713F12", dot: "#EAB308" },
  paid:     { label: "Paid",     bg: "#BBF7D0", color: "#14532D", dot: "#22C55E" },
};

const ALLOWED_TRANSITIONS = {
  pending:  ["sent"],
  sent:     ["opened"],
  opened:   ["approved", "disputed"],
  approved: ["paid"],
  disputed: [],  // foreman must edit+resubmit → back to pending
  paid:     [],
};

const DBM_GREEN  = "#6DD44E";
const DBM_GRAY   = "#999999";
const DBM_DARK   = "#2E2E2E";

const fmt = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWeek = (w) => { const d = new Date(w + "T12:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status, size = "sm" }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const pad = size === "lg" ? "6px 14px" : "3px 10px";
  const fs  = size === "lg" ? "13px" : "11px";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: cfg.bg, color: cfg.color,
      borderRadius: 99, padding: pad, fontSize: fs,
      fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.02em",
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
      {cfg.label.toUpperCase()}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAY STUB PANEL
// ─────────────────────────────────────────────────────────────────────────────
function PayStubPanel({ sub, onClose, onTransition }) {
  const [disputeNote, setDisputeNote] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [acting, setActing] = useState(false);
  const allowed = ALLOWED_TRANSITIONS[sub.stubStatus] || [];

  const act = async (newStatus, note = null) => {
    setActing(true);
    await onTransition(sub, newStatus, note || null);
    setActing(false);
    setShowDispute(false);
    setDisputeNote("");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560,
        maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: DBM_DARK }}>
                {sub.crewDisplay}
              </span>
              <StatusBadge status={sub.stubStatus} size="lg" />
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: DBM_GRAY }}>
              {sub.projectDisplay} · {fmtWeek(sub.weekEnding)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: DBM_GRAY, lineHeight: 1 }}>×</button>
        </div>

        {/* Dispute note warning */}
        {sub.ownerNote && (
          <div style={{ margin: "12px 24px 0", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>OWNER NOTE</div>
            <div style={{ fontSize: 13, color: "#78350F", lineHeight: 1.5 }}>{sub.ownerNote}</div>
          </div>
        )}

        {/* Flag warnings */}
        {(sub.newProjectFlag || sub.newCrewFlag) && (
          <div style={{ margin: "12px 24px 0", background: "#FFF7ED", border: "1px solid #FDBA74", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: "#C2410C", marginBottom: 4 }}>⚠ REVIEW REQUIRED</div>
            {sub.newProjectFlag && <div style={{ fontSize: 13, color: "#9A3412" }}>New Project: <strong>{sub.newProjectFlag}</strong></div>}
            {sub.newCrewFlag    && <div style={{ fontSize: 13, color: "#9A3412" }}>New Crew: <strong>{sub.newCrewFlag}</strong></div>}
          </div>
        )}

        {/* Line items */}
        <div style={{ padding: "16px 24px" }}>
          {/* Scopes */}
          {sub.scopeLines.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid #F9FAFB" }}>
              <div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 600, color: DBM_DARK }}>{s.label}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: DBM_GRAY }}>{s.subLabel}</div>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: DBM_DARK }}>{fmt(s.amount)}</div>
            </div>
          ))}

          {/* Details */}
          {sub.detailLines.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid #F9FAFB" }}>
              <div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 500, color: "#4B5563" }}>{d.label}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: DBM_GRAY }}>{d.subLabel}</div>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#4B5563" }}>{fmt(d.amount)}</div>
            </div>
          ))}

          {/* Acid / Clean */}
          {sub.acidWashLine && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F9FAFB" }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, color: "#4B5563" }}>{sub.acidWashLine.label}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#4B5563" }}>{fmt(sub.acidWashLine.amount)}</span>
            </div>
          )}
          {sub.cleanUpLine && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F9FAFB" }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, color: "#4B5563" }}>{sub.cleanUpLine.label}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#4B5563" }}>{fmt(sub.cleanUpLine.amount)}</span>
            </div>
          )}

          {/* Grand total */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, padding: "12px 16px", background: "#F0FDF4", borderRadius: 10, border: `2px solid ${DBM_GREEN}` }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: DBM_DARK }}>TOTAL</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 700, color: "#15803D" }}>{fmt(sub.grandTotal)}</span>
          </div>

          {sub.notes && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#F9FAFB", borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#6B7280" }}>
              📝 {sub.notes}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          {allowed.includes("approved") && (
            <button onClick={() => act("approved")} disabled={acting} style={{
              background: DBM_GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "13px 20px",
              fontSize: 15, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, cursor: "pointer",
              letterSpacing: "0.04em",
            }}>
              {acting ? "..." : "✓  APPROVE"}
            </button>
          )}
          {allowed.includes("paid") && (
            <button onClick={() => act("paid")} disabled={acting} style={{
              background: "#15803D", color: "#fff", border: "none", borderRadius: 10, padding: "13px 20px",
              fontSize: 15, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, cursor: "pointer",
            }}>
              {acting ? "..." : "💵  MARK PAID / PRINT CHECK"}
            </button>
          )}
          {allowed.includes("sent") && (
            <button onClick={() => act("sent")} disabled={acting} style={{
              background: "#2563EB", color: "#fff", border: "none", borderRadius: 10, padding: "13px 20px",
              fontSize: 15, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, cursor: "pointer",
            }}>
              {acting ? "..." : "📤  SEND PAY STUB"}
            </button>
          )}
          {allowed.includes("opened") && (
            <button onClick={() => act("opened")} disabled={acting} style={{
              background: "#F59E0B", color: "#fff", border: "none", borderRadius: 10, padding: "13px 20px",
              fontSize: 15, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, cursor: "pointer",
            }}>
              {acting ? "..." : "👁  MARK OPENED"}
            </button>
          )}
          {allowed.includes("disputed") && (
            <div>
              {!showDispute ? (
                <button onClick={() => setShowDispute(true)} style={{
                  background: "none", color: "#B45309", border: "1.5px solid #FCD34D", borderRadius: 10,
                  padding: "11px 20px", fontSize: 14, fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700, cursor: "pointer", width: "100%",
                }}>
                  ↩  RETURN FOR CHANGES
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={disputeNote}
                    onChange={e => setDisputeNote(e.target.value)}
                    placeholder="Describe what needs to change..."
                    rows={3}
                    style={{
                      border: "1.5px solid #FCD34D", borderRadius: 8, padding: "10px 12px",
                      fontFamily: "'DM Mono', monospace", fontSize: 12, resize: "vertical",
                      background: "#FFFBEB", outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setShowDispute(false); setDisputeNote(""); }} style={{
                      flex: 1, background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 8,
                      padding: "10px", fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 600, cursor: "pointer",
                    }}>Cancel</button>
                    <button onClick={() => act("disputed", disputeNote)} disabled={!disputeNote.trim() || acting} style={{
                      flex: 2, background: "#EAB308", color: "#fff", border: "none", borderRadius: 8,
                      padding: "10px", fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700, cursor: disputeNote.trim() ? "pointer" : "not-allowed",
                      opacity: disputeNote.trim() ? 1 : 0.6,
                    }}>Send Back</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBMISSION CARD
// ─────────────────────────────────────────────────────────────────────────────
function SubmissionCard({ sub, onOpen }) {
  const isFlag = sub.newProjectFlag || sub.newCrewFlag;
  return (
    <div onClick={() => onOpen(sub)} style={{
      background: "#fff", borderRadius: 12, padding: "14px 16px",
      cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s",
      border: isFlag ? "1.5px solid #FDBA74" : "1px solid #E5E7EB",
      display: "flex", alignItems: "center", gap: 14,
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
    >
      {/* Color stripe */}
      <div style={{
        width: 4, alignSelf: "stretch", borderRadius: 4, flexShrink: 0,
        background: STATUS_CONFIG[sub.stubStatus]?.dot || "#9CA3AF",
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, color: DBM_DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sub.crewDisplay}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: "#15803D", flexShrink: 0, marginLeft: 8 }}>
            {fmt(sub.grandTotal)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: DBM_GRAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sub.projectDisplay} · {fmtWeek(sub.weekEnding)}
          </span>
          <StatusBadge status={sub.stubStatus} />
        </div>
        {isFlag && (
          <div style={{ marginTop: 4, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#C2410C", fontWeight: 700 }}>
            ⚠ {sub.newProjectFlag ? "NEW PROJECT" : ""}{sub.newProjectFlag && sub.newCrewFlag ? " + " : ""}{sub.newCrewFlag ? "NEW CREW" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY STATS BAR
// ─────────────────────────────────────────────────────────────────────────────
function StatsBar({ submissions }) {
  const total = submissions.reduce((s, x) => s + x.grandTotal, 0);
  const byStatus = {};
  submissions.forEach(s => { byStatus[s.stubStatus] = (byStatus[s.stubStatus] || 0) + 1; });
  const unpaid = submissions.filter(s => !["paid"].includes(s.stubStatus)).reduce((s, x) => s + x.grandTotal, 0);
  const disputed = byStatus.disputed || 0;
  const readyToPay = submissions.filter(s => s.stubStatus === "approved").reduce((s, x) => s + x.grandTotal, 0);

  const stat = (label, value, accent) => (
    <div style={{ textAlign: "center", padding: "0 20px" }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 700, color: accent || DBM_DARK }}>{value}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: DBM_GRAY, marginTop: 2, letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );

  return (
    <div style={{
      display: "flex", justifyContent: "center", flexWrap: "wrap",
      background: "#fff", borderRadius: 12, padding: "16px 0",
      border: "1px solid #E5E7EB", marginBottom: 20, gap: 0,
    }}>
      {stat("TOTAL WEEK", fmt(total), DBM_DARK)}
      <div style={{ width: 1, background: "#E5E7EB", margin: "4px 0" }} />
      {stat("OUTSTANDING", fmt(unpaid), "#D97706")}
      <div style={{ width: 1, background: "#E5E7EB", margin: "4px 0" }} />
      {stat("READY TO PAY", fmt(readyToPay), "#15803D")}
      <div style={{ width: 1, background: "#E5E7EB", margin: "4px 0" }} />
      {stat("DISPUTED", disputed, disputed > 0 ? "#EAB308" : DBM_GRAY)}
      <div style={{ width: 1, background: "#E5E7EB", margin: "4px 0" }} />
      {stat("STUBS", submissions.length, DBM_DARK)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QB EXPORT PANEL
// ─────────────────────────────────────────────────────────────────────────────
function QBExportPanel({ submissions, onClose }) {
  const ready = submissions.filter(s => ["approved", "paid"].includes(s.stubStatus));
  const weekTotal = ready.reduce((s, x) => s + x.grandTotal, 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: DBM_DARK }}>QB EXPORT</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: DBM_GRAY, marginTop: 2 }}>{ready.length} checks · {fmt(weekTotal)} total</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: DBM_GRAY }}>×</button>
        </div>

        <div style={{ padding: 24 }}>
          {ready.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, fontFamily: "'DM Mono', monospace", fontSize: 13, color: DBM_GRAY }}>
              No approved stubs to export.<br />Approve stubs first.
            </div>
          ) : (
            <>
              {/* Check blocks */}
              {ready.map((sub, i) => (
                <div key={sub.id} style={{ marginBottom: 20, border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
                  {/* Payee row */}
                  <div style={{ background: "#D1FAE5", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700, color: DBM_DARK }}>{sub.crewDisplay}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#059669" }}>PAYEE · {sub.projectDisplay} · Week {sub.weekEnding}</div>
                    </div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: "#15803D" }}>{fmt(sub.grandTotal)}</div>
                  </div>
                  {/* Line items */}
                  <div style={{ padding: "4px 0" }}>
                    {[...sub.scopeLines, ...sub.detailLines,
                      ...(sub.acidWashLine ? [sub.acidWashLine] : []),
                      ...(sub.cleanUpLine  ? [sub.cleanUpLine]  : [])
                    ].map((li, j) => (
                      <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "5px 14px", background: j % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#374151", maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {li.label || li.subLabel || "—"}
                        </span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#374151" }}>{fmt(li.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* QB Category note */}
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#1E40AF" }}>
                  QB Category: <strong>Subcontractors - COS</strong> · Bank: <strong>DBM Checking</strong> · Billable: Yes
                </div>
              </div>

              <button style={{
                width: "100%", background: DBM_GREEN, color: "#fff", border: "none",
                borderRadius: 10, padding: "14px", fontSize: 16,
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
                cursor: "pointer", letterSpacing: "0.06em",
              }}>
                📥  COPY TO QB_EXPORT SHEET
              </button>
              <p style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 10, color: DBM_GRAY, marginTop: 10 }}>
                Or use the daily trigger in the Apps Script backend to auto-populate.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN OWNER DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export default function OwnerDashboard() {
  const [submissions, setSubmissions] = useState(MOCK_SUBMISSIONS);
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeWeek,   setActiveWeek]   = useState("all");
  const [openSub,      setOpenSub]      = useState(null);
  const [showQB,       setShowQB]       = useState(false);
  const [toast,        setToast]        = useState(null);

  // Derive weeks for filter
  const weeks = [...new Set(submissions.map(s => s.weekEnding))].sort().reverse();

  // Apply filters
  const filtered = submissions.filter(s => {
    if (activeFilter !== "all" && s.stubStatus !== activeFilter) return false;
    if (activeWeek   !== "all" && s.weekEnding  !== activeWeek)  return false;
    return true;
  });

  const showToast = (msg, color = DBM_GREEN) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

  const handleTransition = async (sub, newStatus, note) => {
    // In production: await DBMApi.transition({ crewDisplay: sub.crewDisplay, weekEnding: sub.weekEnding, newStatus, ownerNote: note });
    setSubmissions(prev => prev.map(s =>
      s.id === sub.id ? { ...s, stubStatus: newStatus, ownerNote: note || s.ownerNote,
        stubSent: newStatus === "sent" ? true : s.stubSent,
        checkPrinted: newStatus === "paid" ? true : s.checkPrinted,
      } : s
    ));
    setOpenSub(prev => prev ? { ...prev, stubStatus: newStatus, ownerNote: note || prev.ownerNote } : null);
    const msgs = { approved: "✓ Approved", paid: "💵 Marked Paid", sent: "📤 Stub Sent", opened: "👁 Marked Opened", disputed: "↩ Returned for changes" };
    showToast(msgs[newStatus] || "Updated", newStatus === "disputed" ? "#EAB308" : DBM_GREEN);
    if (newStatus !== "disputed") setOpenSub(null);
  };

  const disputedCount  = submissions.filter(s => s.stubStatus === "disputed").length;
  const approvedTotal  = submissions.filter(s => s.stubStatus === "approved").reduce((s, x) => s + x.grandTotal, 0);
  const pendingCount   = submissions.filter(s => s.stubStatus === "pending").length;

  const FILTERS = [
    { key: "all",      label: "All" },
    { key: "pending",  label: "Pending" },
    { key: "sent",     label: "Sent" },
    { key: "opened",   label: "Opened" },
    { key: "approved", label: "Approved" },
    { key: "disputed", label: `Disputed${disputedCount ? ` (${disputedCount})` : ""}` },
    { key: "paid",     label: "Paid" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "sans-serif" }}>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <div style={{ background: DBM_DARK, padding: "0 20px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* DBM logo mark */}
            <svg width="28" height="28" viewBox="0 0 28 28">
              <rect x="2" y="14" width="11" height="6" rx="1" fill={DBM_GREEN}/>
              <rect x="15" y="14" width="11" height="6" rx="1" fill={DBM_GREEN}/>
              <rect x="8" y="8" width="11" height="6" rx="1" fill="#fff" opacity="0.9"/>
              <rect x="2" y="20" width="11" height="6" rx="1" fill="#888"/>
              <rect x="15" y="20" width="11" height="6" rx="1" fill="#888"/>
            </svg>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "0.06em", lineHeight: 1 }}>DBM</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: DBM_GREEN, letterSpacing: "0.12em", lineHeight: 1 }}>OWNER DASHBOARD</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {approvedTotal > 0 && (
              <button onClick={() => setShowQB(true)} style={{
                background: DBM_GREEN, color: "#fff", border: "none", borderRadius: 8,
                padding: "7px 14px", fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em",
              }}>
                QB EXPORT · {fmt(approvedTotal)}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>

        {/* Alert bar */}
        {(disputedCount > 0 || pendingCount > 0) && (
          <div style={{ background: disputedCount > 0 ? "#FEF9C3" : "#EFF6FF", border: `1px solid ${disputedCount > 0 ? "#FDE047" : "#93C5FD"}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontFamily: "'DM Mono', monospace", fontSize: 12, color: disputedCount > 0 ? "#713F12" : "#1E40AF" }}>
            {disputedCount > 0 && `⚠ ${disputedCount} stub${disputedCount > 1 ? "s" : ""} disputed — foreman action needed.  `}
            {pendingCount  > 0 && `📋 ${pendingCount} pending stub${pendingCount > 1 ? "s" : ""} to review.`}
          </div>
        )}

        {/* Stats */}
        <StatsBar submissions={submissions.filter(s => activeWeek === "all" || s.weekEnding === activeWeek)} />

        {/* Week filter */}
        {weeks.length > 1 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
            {["all", ...weeks].map(w => (
              <button key={w} onClick={() => setActiveWeek(w)} style={{
                background: activeWeek === w ? DBM_DARK : "#fff",
                color:      activeWeek === w ? "#fff" : "#6B7280",
                border: "1px solid #E5E7EB", borderRadius: 8,
                padding: "5px 12px", fontSize: 11,
                fontFamily: "'DM Mono', monospace", cursor: "pointer", whiteSpace: "nowrap",
                fontWeight: activeWeek === w ? 700 : 400,
              }}>
                {w === "all" ? "All weeks" : fmtWeek(w)}
              </button>
            ))}
          </div>
        )}

        {/* Status filter pills */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
          {FILTERS.map(f => {
            const cfg = STATUS_CONFIG[f.key];
            const active = activeFilter === f.key;
            return (
              <button key={f.key} onClick={() => setActiveFilter(f.key)} style={{
                background: active ? (cfg?.bg || DBM_DARK) : "#fff",
                color:      active ? (cfg?.color || "#fff") : "#6B7280",
                border:     active ? `1.5px solid ${cfg?.dot || DBM_DARK}` : "1px solid #E5E7EB",
                borderRadius: 99, padding: "5px 14px", fontSize: 11,
                fontFamily: "'DM Mono', monospace", cursor: "pointer", whiteSpace: "nowrap",
                fontWeight: active ? 700 : 400,
              }}>
                {f.label.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Cards */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", fontFamily: "'DM Mono', monospace", fontSize: 13, color: DBM_GRAY }}>
            No stubs match this filter.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(sub => (
              <SubmissionCard key={sub.id} sub={sub} onOpen={setOpenSub} />
            ))}
          </div>
        )}

        {/* Footer count */}
        <div style={{ textAlign: "center", marginTop: 24, fontFamily: "'DM Mono', monospace", fontSize: 11, color: DBM_GRAY }}>
          {filtered.length} of {submissions.length} stubs
        </div>
      </div>

      {/* Modals */}
      {openSub && (
        <PayStubPanel
          sub={openSub}
          onClose={() => setOpenSub(null)}
          onTransition={handleTransition}
        />
      )}
      {showQB && (
        <QBExportPanel
          submissions={submissions}
          onClose={() => setShowQB(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: toast.color, color: "#fff", borderRadius: 99,
          padding: "10px 24px", fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 15, fontWeight: 700, letterSpacing: "0.04em",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)", zIndex: 2000,
          animation: "fadeIn 0.2s ease",
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { height: 4px; width: 4px; } ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }
      `}</style>
    </div>
  );
}
