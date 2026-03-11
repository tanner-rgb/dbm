// ── DBM API CLIENT ────────────────────────────────────────────────────────────
// Wraps all calls to the Google Apps Script backend.
// Import into any DBM React app.
//
// Usage:
//   import { useDBMApi, DBMApi } from './dbm-api-client';
//
//   // Hook (React)
//   const { projects, crews, loading } = useDBMApi();
//
//   // Direct calls
//   const result = await DBMApi.submit(normalizedRecord);
//   const subs   = await DBMApi.getSubmissions({ crew: 'Alan Gonzalez' });
//   await DBMApi.transition({ crewDisplay, weekEnding, newStatus, ownerNote });

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — set your deployed Apps Script URL here
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE = typeof window !== "undefined"
  ? (window.DBM_API_BASE || "YOUR_APPS_SCRIPT_DEPLOYMENT_URL_HERE")
  : "YOUR_APPS_SCRIPT_DEPLOYMENT_URL_HERE";

// How long to cache projects/crews lists before re-fetching (ms)
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

let _cache = {};

function _cacheGet(key) {
  const entry = _cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { delete _cache[key]; return null; }
  return entry.data;
}
function _cacheSet(key, data) { _cache[key] = { data, ts: Date.now() }; }
function _cacheClear(key) { if (key) delete _cache[key]; else _cache = {}; }

async function _get(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const url = API_BASE + (API_BASE.includes("?") ? "&" : "?") + qs;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Unknown server error");
  return data;
}

async function _post(body) {
  const res = await fetch(API_BASE, {
    method:   "POST",
    redirect: "follow",
    headers:  { "Content-Type": "application/json" },
    body:     JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Unknown server error");
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// DBMApi — direct async functions
// ─────────────────────────────────────────────────────────────────────────────

const DBMApi = {

  // Verify backend is reachable
  async ping() {
    return _get("ping");
  },

  // Submit a normalized field report record
  // Returns { success, submissionId, rowNumber }
  async submit(record) {
    _cacheClear("submissions");
    return _post({ action: "submit", record });
  },

  // Transition a stub status (owner action)
  // { crewDisplay, weekEnding, newStatus, ownerNote? }
  async transition(payload) {
    _cacheClear("submissions");
    return _post({ action: "transition", ...payload });
  },

  // Fetch submissions from PAY_STUB_TRACKER
  // Optional filters: { crew, week, status }
  async getSubmissions(filters = {}, opts = {}) {
    const cacheKey = "submissions:" + JSON.stringify(filters);
    if (!opts.force) {
      const cached = _cacheGet(cacheKey);
      if (cached) return cached;
    }
    const data = await _get("submissions", filters);
    _cacheSet(cacheKey, data);
    return data;
  },

  // Fetch projects list (cached)
  async getProjects(opts = {}) {
    if (!opts.force) {
      const cached = _cacheGet("projects");
      if (cached) return cached;
    }
    const data = await _get("projects");
    _cacheSet("projects", data);
    return data;
  },

  // Fetch crews list (cached)
  async getCrews(opts = {}) {
    if (!opts.force) {
      const cached = _cacheGet("crews");
      if (cached) return cached;
    }
    const data = await _get("crews");
    _cacheSet("crews", data);
    return data;
  },

  // Add a new project to the sheet
  async addProject(name, category, bpc) {
    _cacheClear("projects");
    return _post({ action: "addProject", name, category, bpc });
  },

  // Add a new crew to the sheet
  async addCrew(name) {
    _cacheClear("crews");
    return _post({ action: "addCrew", name });
  },

  clearCache: _cacheClear,
};

// ─────────────────────────────────────────────────────────────────────────────
// useDBMApi — React hook
// ─────────────────────────────────────────────────────────────────────────────
// Provides: projects, crews, submissions, loading, error, refresh, isConfigured
//
// Example:
//   const { projects, crews, loading, error } = useDBMApi();
//   const { submissions, refresh } = useDBMApi({ fetchSubmissions: true, crewFilter: 'Alan' });

function useDBMApi(options = {}) {
  const {
    fetchSubmissions = false,
    crewFilter       = "",
    weekFilter       = "",
    statusFilter     = "",
    autoRefresh      = false,
    refreshInterval  = 60000,
  } = options;

  // React must be available in scope when using this hook
  const { useState, useEffect, useCallback, useRef } = window.React || {};

  const [projects,    setProjects]    = useState([]);
  const [crews,       setCrews]       = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [configured,  setConfigured]  = useState(true);
  const intervalRef = useRef(null);

  const isConfigured = API_BASE !== "YOUR_APPS_SCRIPT_DEPLOYMENT_URL_HERE";

  const loadBase = useCallback(async () => {
    if (!isConfigured) { setConfigured(false); setLoading(false); return; }
    try {
      const [projData, crewData] = await Promise.all([
        DBMApi.getProjects(),
        DBMApi.getCrews(),
      ]);
      setProjects(projData.projects || []);
      setCrews(crewData.crews || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadSubmissions = useCallback(async (force = false) => {
    if (!isConfigured || !fetchSubmissions) return;
    try {
      const filters = {};
      if (crewFilter)   filters.crew   = crewFilter;
      if (weekFilter)   filters.week   = weekFilter;
      if (statusFilter) filters.status = statusFilter;
      const data = await DBMApi.getSubmissions(filters, { force });
      setSubmissions(data.submissions || []);
    } catch (e) {
      setError(e.message);
    }
  }, [fetchSubmissions, crewFilter, weekFilter, statusFilter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([loadBase(), loadSubmissions(true)]);
    setLoading(false);
  }, [loadBase, loadSubmissions]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await Promise.all([loadBase(), loadSubmissions()]);
      if (alive) setLoading(false);
    })();

    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(() => loadSubmissions(true), refreshInterval);
    }

    return () => {
      alive = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const submitRecord = useCallback(async (record) => {
    const result = await DBMApi.submit(record);
    await loadSubmissions(true);
    return result;
  }, [loadSubmissions]);

  const transitionStatus = useCallback(async (payload) => {
    const result = await DBMApi.transition(payload);
    await loadSubmissions(true);
    return result;
  }, [loadSubmissions]);

  return {
    projects,
    crews,
    submissions,
    loading,
    error,
    refresh,
    submitRecord,
    transitionStatus,
    isConfigured,
  };
}

// Export for both CommonJS (tests) and browser/module usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DBMApi, useDBMApi, API_BASE };
} else if (typeof window !== "undefined") {
  window.DBMApi    = DBMApi;
  window.useDBMApi = useDBMApi;
}
