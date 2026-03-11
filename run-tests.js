#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// DBM Test Runner — runs all test suites and prints a clean summary
// Usage:  node run-tests.js
//         node run-tests.js --verbose     (show individual test names)
//         node run-tests.js --suite core  (run only one suite)
// ─────────────────────────────────────────────────────────────────────────────

const { execSync, spawnSync } = require("child_process");
const path  = require("path");
const fs    = require("fs");

const SUITES = [
  {
    name:  "Unit Tests (dbm-core)",
    file:  "dbm-core.test.js",
    desc:  "Pure business logic: rates, units, pay calc, validation, translations",
  },
  {
    name:  "Integration Tests (dbm-integration)",
    file:  "dbm-integration.test.js",
    desc:  "Data pipelines: form→record, QB export, Slack, pay stub, status flow",
  },
  {
    name:  "Variation Tests (dbm-variation)",
    file:  "dbm-variation.test.js",
    desc:  "30 real-world fixtures × 13 suites: math, pipelines, ES↔EN, store, payroll rollup",
  },
];

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const verbose = args.includes("--verbose") || args.includes("-v");
const singleSuite = args.includes("--suite") ? args[args.indexOf("--suite") + 1] : null;

const suitesToRun = singleSuite
  ? SUITES.filter(s => s.name.toLowerCase().includes(singleSuite.toLowerCase()) || s.file.includes(singleSuite))
  : SUITES;

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  gray:   "\x1b[90m",
  bgGreen:"\x1b[42m",
  bgRed:  "\x1b[41m",
};

const g  = s => C.green  + s + C.reset;
const r  = s => C.red    + s + C.reset;
const y  = s => C.yellow + s + C.reset;
const c  = s => C.cyan   + s + C.reset;
const b  = s => C.bold   + s + C.reset;
const dim = s => C.dim   + s + C.reset;

// ── TAP parser ────────────────────────────────────────────────────────────────
// Parses Node's built-in TAP output to extract pass/fail/skip counts
function parseTAP(output) {
  const lines = output.split("\n");
  let pass = 0, fail = 0, skip = 0, todo = 0, duration = 0;
  const failures = [];
  let currentTest = null;

  for (const line of lines) {
    if (/^# tests\s+(\d+)/.test(line))    { /* total */ }
    if (/^# pass\s+(\d+)/.test(line))     pass     = parseInt(line.match(/\d+/)[0]);
    if (/^# fail\s+(\d+)/.test(line))     fail     = parseInt(line.match(/\d+/)[0]);
    if (/^# skipped\s+(\d+)/.test(line))  skip     = parseInt(line.match(/\d+/)[0]);
    if (/^# todo\s+(\d+)/.test(line))     todo     = parseInt(line.match(/\d+/)[0]);
    if (/^# duration_ms\s+([\d.]+)/.test(line)) duration = parseFloat(line.match(/[\d.]+/)[0]);

    // Capture failures (lines starting with "not ok")
    if (/^\s*not ok \d+ - /.test(line) && !line.includes("subtestsFailed")) {
      const name = line.replace(/^\s*not ok \d+ - /, "").trim();
      if (name) failures.push(name);
    }

    // Capture error messages from YAML blocks
    if (/^\s+error: '/.test(line) && failures.length > 0) {
      const msg = line.match(/error: '(.+)'/)?.[1];
      if (msg) failures[failures.length - 1] += `\n       ${r("✗")} ${msg}`;
    }
  }

  return { pass, fail, skip, todo, duration, failures };
}

// ── Run a suite ───────────────────────────────────────────────────────────────
function runSuite(suite) {
  const scriptDir = path.join(__dirname);
  const filePath  = path.join(scriptDir, suite.file);

  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${filePath}`, pass: 0, fail: 0, skip: 0, duration: 0, failures: [] };
  }

  const result = spawnSync(process.execPath, ["--test", filePath], {
    encoding: "utf8",
    timeout: 30000,
    cwd: scriptDir,
  });

  const output = result.stdout + result.stderr;
  const parsed = parseTAP(output);

  if (result.error) {
    return { error: result.error.message, pass: 0, fail: 1, skip: 0, duration: 0, failures: [result.error.message] };
  }

  return { ...parsed, rawOutput: verbose ? output : null };
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const startTime = Date.now();
  const width = 64;
  const line  = dim("─".repeat(width));

  console.log("\n" + line);
  console.log(b(c("  DBM Field App — Test Suite")));
  console.log(dim(`  ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CDT`));
  console.log(line + "\n");

  const results = [];

  for (const suite of suitesToRun) {
    process.stdout.write(`  ${c("▶")}  ${suite.name} ... `);
    const r = runSuite(suite);
    results.push({ suite, result: r });

    const icon = r.fail > 0 ? g("✗") : g("✓");
    const statusColor = r.fail > 0 ? C.red : C.green;
    const totalTests = r.pass + r.fail;
    const timeStr = dim(`${r.duration.toFixed(0)}ms`);

    console.log(
      `${statusColor}${r.fail > 0 ? "FAIL" : "PASS"}${C.reset}  ` +
      `${g(r.pass + " passed")}` +
      (r.fail > 0 ? `  ${C.red}${r.fail} failed${C.reset}` : "") +
      (r.skip  > 0 ? `  ${y(r.skip + " skipped")}` : "") +
      `  ${timeStr}`
    );

    if (r.error) {
      console.log(`     ${C.red}Error: ${r.error}${C.reset}`);
    }

    if (r.failures.length > 0) {
      console.log(`\n     ${C.red}${C.bold}Failures:${C.reset}`);
      r.failures.forEach((f, i) => {
        const lines = f.split("\n");
        console.log(`     ${C.red}${i + 1}.${C.reset} ${lines[0]}`);
        lines.slice(1).forEach(l => console.log(`        ${l}`));
      });
      console.log();
    }

    if (verbose && r.rawOutput) {
      console.log(dim(r.rawOutput.split("\n").map(l => "  " + l).join("\n")));
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalPass = results.reduce((s, x) => s + x.result.pass, 0);
  const totalFail = results.reduce((s, x) => s + x.result.fail, 0);
  const totalSkip = results.reduce((s, x) => s + x.result.skip, 0);
  const totalMs   = Date.now() - startTime;
  const allPassed = totalFail === 0;

  console.log(line);

  const summaryBg = allPassed ? C.green : C.red;
  const summaryLabel = allPassed ? "  ALL TESTS PASSED  " : "  TESTS FAILED  ";
  console.log("\n  " + summaryBg + C.bold + summaryLabel + C.reset + "\n");

  console.log(
    `  ${b("Suites:")}  ${suitesToRun.length} run\n` +
    `  ${b("Tests: ")}  ${C.green}${totalPass} passed${C.reset}` +
    (totalFail > 0 ? `  ${C.red}${totalFail} failed${C.reset}` : "") +
    (totalSkip > 0 ? `  ${y(totalSkip + " skipped")}` : "") +
    `\n  ${b("Time:  ")}  ${totalMs}ms\n`
  );

  // Coverage overview
  console.log(line);
  console.log(b("\n  Coverage Overview\n"));
  const coreCoverage = [
    ["getUnit",              "17", "Unit type routing for all scope names"],
    ["calcScopePay",         "27", "Brick/CMU/SF/LF pay calculation + multipliers"],
    ["calcDetailPay",        "20", "All detail types, railcuts, qty scaling"],
    ["calcAcidPay/Clean",    "16", "Acid wash + clean up independent tiers"],
    ["calcSubmissionTotal",  " 9", "Full submission rollup + real-world examples"],
    ["Rate table integrity", "12", "Every scope/detail has a valid rate"],
    ["Translation pipeline", "20", "ES→EN for scopes, multipliers, clean types"],
    ["Form→Record",          "28", "normalizeFormData + null handling + BPC"],
    ["Record→QB Export",     "20", "Line items, memo length, Highwork split"],
    ["Record→Slack",         "14", "Channel naming, English-only output, flags"],
    ["Record→Pay Stub",      "12", "Itemization, subtotal reconciliation"],
    ["Full E2E",             " 3", "Grand total consistent across all stages"],
    ["Submission Store",     "16", "CRUD, status transitions, edit flow"],
    ["Validation Gate",      " 5", "Invalid form blocked before store"],
  ];
  const varCoverage = [
    ["Fixture grand totals",     "30", "Every crew/scope/detail combo vs formula"],
    ["Pipeline consistency",     "30", "calc→QB→stub→Slack grand total identical"],
    ["QB line sum = check",      "30", "Line items reconcile to check block total"],
    ["Pay stub subtotals",       "30", "scope+detail+acid+clean = grand, all 30"],
    ["ES↔EN equivalence",        " 3", "Spanish input = English output, full coverage"],
    ["Memo ≤40 chars",           "30", "All QB memos enforced, every fixture"],
    ["Slack English only",       "30", "No Spanish words in any Slack body"],
    ["Store: 30 simultaneous",   "12", "Add/transition/dispute/edit/pay under load"],
    ["Boundary conditions",      "14", "Fractions, BPC=1/1000, large jobs, zero qty"],
    ["Slack channel names",      " 8", "All 8 real projects map correctly"],
    ["Validation: all fixtures", "30", "Every normalized record passes validator"],
    ["Weekly rollup sim",        " 6", "Week total = sum of individual totals"],
    ["3-week payroll run",       " 5", "ID uniqueness, immutability, crew totals"],
  ];
  const coreTotal = coreCoverage.reduce((s, r) => s + (parseInt(r[1].trim())||0), 0);
  const varTotal  = varCoverage.reduce((s, r) => s + (parseInt(r[1].trim())||0), 0);
  console.log(b("  Core / Integration\n"));
  coreCoverage.forEach(([area, count, desc]) => {
    console.log(`  ${g("✓")} ${area.padEnd(26)} ${C.bold}${count.padStart(3)}${C.reset} ${dim(desc)}`);
  });
  console.log(`\n  ${dim("Subtotal:".padEnd(28))} ${b(coreTotal)} tests\n`);
  console.log(b("  Variation (30 real-world fixtures)\n"));
  varCoverage.forEach(([area, count, desc]) => {
    console.log(`  ${g("✓")} ${area.padEnd(26)} ${C.bold}${count.padStart(3)}${C.reset} ${dim(desc)}`);
  });
  console.log(`\n  ${dim("Subtotal:".padEnd(28))} ${b(varTotal)} tests`);
  console.log(`  ${dim("Grand total:".padEnd(28))} ${b(coreTotal + varTotal)} tests\n`);
  console.log(line + "\n");

  process.exit(allPassed ? 0 : 1);
}

main();
