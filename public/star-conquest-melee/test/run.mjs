// Headless runner for every check suite — Node built-ins only, no packages.
// Usage:
//   node test/run.mjs                 # all six suites, exit 0 only if all pass
//   node test/run.mjs --only golden   # one suite (wave1 | pause-ui | audio |
//                                     # enemy-tuning | radar | golden)
//   node test/run.mjs --capture       # re-baseline tests/fixtures/golden.json
//                                     # from the CURRENT build — do this only
//                                     # when the current build is the accepted one
//
// Unlike .ai-reference/tools/run-checks.mjs, this serves the repository itself
// on an ephemeral port and gives each suite its OWN page load: the golden
// traces must never inherit another suite's leftovers, so fresh loads are the
// deliberate hardening choice. It also fails on any console error the page
// produces, except the favicon 404 every bare page emits — filtered by URL,
// never by message text.
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const SUITES = [
  { key: "wave1", file: "tests/wave1-checks.js", fn: "runWave1Checks" },
  { key: "pause-ui", file: "tests/pause-ui-checks.js", fn: "runPauseUiChecks" },
  { key: "audio", file: "tests/audio-checks.js", fn: "runAudioChecks" },
  // the radar branch's two suites — they used to run only through the
  // .ai-reference runner copy, which no repository file can depend on
  { key: "enemy-tuning", file: "tests/enemy-tuning-checks.js", fn: "runEnemyTuningChecks" },
  { key: "radar", file: "tests/radar-checks.js", fn: "runRadarChecks" },
  { key: "golden", file: "tests/golden-traces.js", fn: "runGoldenTraces" },
];

const argv = process.argv.slice(2);
const capture = argv.includes("--capture");
// --capture-tick re-baselines ONLY the tickMode fixture set (the per-tick
// input path's parallel traces): the event-mode traces are judged on the same
// run and never rewritten. Use it after a retune of the tick path.
const captureTick = argv.includes("--capture-tick");
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
if (only && !SUITES.some((s) => s.key === only)) {
  console.error(`unknown suite "${only}" — one of: ${SUITES.map((s) => s.key).join(", ")}`);
  process.exit(1);
}
const suites = capture || captureTick ? SUITES.filter((s) => s.key === "golden")
  : SUITES.filter((s) => !only || s.key === only);

// ---- static server over the repo root --------------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".css": "text/css", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = resolve(ROOT, "." + path);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file === ROOT ? join(ROOT, "index.html") : file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream",
      "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- headless chrome --------------------------------------------------------
const CHROMES = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chromeBin = process.env.CHROME_BIN || CHROMES.find((p) => existsSync(p));
if (!chromeBin) {
  console.error("no Chrome binary found — set CHROME_BIN or install one of: " + CHROMES.join(", "));
  server.close();
  process.exit(1);
}
const profile = mkdtempSync(join(tmpdir(), "scm-golden-"));
const chrome = spawn(chromeBin, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--mute-audio",
  "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeErr = "";
const dbgPort = await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error("Chrome's DevTools endpoint never announced itself:\n" + chromeErr)), 15000);
  chrome.stderr.on("data", (d) => {
    chromeErr += d.toString();
    const m = chromeErr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) { clearTimeout(timer); res(Number(m[1])); }
  });
  chrome.on("exit", () => { clearTimeout(timer); rej(new Error("Chrome exited before DevTools came up:\n" + chromeErr)); });
  chrome.on("error", (e) => { clearTimeout(timer); rej(new Error("Chrome failed to launch (" + chromeBin + "): " + e.message)); });
}).catch((e) => { cleanup(); console.error(String(e.message || e)); process.exit(1); });

function cleanup() {
  try { chrome.kill("SIGKILL"); } catch { /* already down */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
  server.close();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const seen = new Set();
  const errors = [];
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP socket failed")); });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (!m.method) return;
    seen.add(m.method);
    // the console-error gate: network/log errors and thrown exceptions both
    // count; the favicon request every bare page makes is filtered by URL
    if (m.method === "Log.entryAdded") {
      const e = m.params.entry;
      if (e.level === "error" && !(e.url && e.url.includes("/favicon.ico"))) {
        errors.push(`[${e.source}] ${e.text}${e.url ? " (" + e.url + ")" : ""}`);
      }
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      errors.push("[exception] " + (d.exception?.description || d.text));
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push("[console.error] " + m.params.args.map((a) => a.description ?? String(a.value)).join(" "));
    }
  };
  return {
    ready, errors,
    saw: (method) => seen.has(method),
    send(method, params) {
      const mid = ++id;
      return new Promise((res) => { pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
    },
    close: () => ws.close(),
  };
}

const suiteExpr = (file, fn, arg) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && document.readyState !== "complete"; i++) await wait(50);
  for (let i = 0; i < 100 && !window.__test; i++) await wait(50);
  if (!window.__test) return { error: "window.__test never appeared" };
  const src = await fetch(${JSON.stringify(file)} + "?t=" + Date.now()).then((r) => r.text());
  (0, eval)(src);
  if (typeof window[${JSON.stringify(fn)}] !== "function") return { error: ${JSON.stringify(fn)} + " is not defined" };
  const r = await window[${JSON.stringify(fn)}](${arg});
  return { total: r.total, passed: r.passed,
    failed: r.failed.map((f) => ({ name: f.name, info: f.info })),
    capture: r.capture || null,
    captureTick: r.captureTick || null,
    tunables: window.__test.enc.tunables(),
    flight: window.__test.flightTunables() };
})()`;

async function runSuite(s) {
  const tab = await fetch(`http://127.0.0.1:${dbgPort}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const c = cdp(tab.webSocketDebuggerUrl);
  try {
    await c.ready;
    await c.send("Runtime.enable");
    await c.send("Page.enable");
    await c.send("Log.enable");
    await c.send("Page.navigate", { url: `${BASE}/index.html` });
    for (let i = 0; i < 200 && !c.saw("Page.loadEventFired"); i++) await sleep(50);
    if (!c.saw("Page.loadEventFired")) return { error: "the page never fired its load event" };
    await sleep(300); // the boot tail and the async card loads settle
    const arg = s.key === "golden" && capture ? "{ capture: true }"
      : s.key === "golden" && captureTick ? "{ captureTick: true }" : "";
    const res = await c.send("Runtime.evaluate", {
      expression: suiteExpr(s.file, s.fn, arg), awaitPromise: true, returnByValue: true, timeout: 120000,
    });
    if (res.result?.exceptionDetails) {
      return { error: res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text };
    }
    const v = res.result?.result?.value;
    if (!v) return { error: "the suite returned nothing" };
    v.consoleErrors = c.errors;
    return v;
  } finally {
    c.close();
    await fetch(`http://127.0.0.1:${dbgPort}/json/close/${tab.id}`).catch(() => {});
  }
}

let exitCode = 0;
try {
  for (const s of suites) {
    const r = await runSuite(s);
    if (r.error) {
      console.log(`${s.key.padEnd(9)} ERROR: ${r.error}`);
      exitCode = 1;
      continue;
    }
    if (capture && s.key === "golden") {
      if (!r.capture) { console.log("golden    ERROR: capture mode returned no payload"); exitCode = 1; continue; }
      let sha = "unknown";
      try { sha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { /* not fatal */ }
      // the tickMode set rides its own --capture-tick flag — a blanket event
      // re-baseline must carry it across unchanged, never drop it
      let prevTick = null;
      try { prevTick = JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "golden.json"), "utf8")).tickMode || null; } catch { /* fresh file */ }
      const fixture = {
        meta: { sha, capturedAt: new Date().toISOString(), tunables: r.tunables, flight: r.flight },
        traces: r.capture.traces,
      };
      if (prevTick) fixture.tickMode = prevTick;
      await mkdir(join(ROOT, "tests", "fixtures"), { recursive: true });
      await writeFile(join(ROOT, "tests", "fixtures", "golden.json"), JSON.stringify(fixture, null, 2) + "\n");
      console.log(`golden    captured ${Object.keys(fixture.traces).length} traces at ${sha.slice(0, 7)} → tests/fixtures/golden.json`);
    }
    if (captureTick && s.key === "golden") {
      if (!r.captureTick) { console.log("golden    ERROR: capture-tick mode returned no payload"); exitCode = 1; continue; }
      let sha = "unknown";
      try { sha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { /* not fatal */ }
      const path = join(ROOT, "tests", "fixtures", "golden.json");
      const fixture = JSON.parse(await readFile(path, "utf8")); // event traces stay byte-identical
      fixture.tickMode = {
        meta: { sha, capturedAt: new Date().toISOString(), tunables: r.tunables, flight: r.flight,
          note: "captured PRE-RETUNE at the shipped constants — recapture with --capture-tick after the human retunes the tick path" },
        traces: r.captureTick.traces,
      };
      await writeFile(path, JSON.stringify(fixture, null, 2) + "\n");
      console.log(`golden    captured ${Object.keys(fixture.tickMode.traces).length} tickMode traces at ${sha.slice(0, 7)} → tests/fixtures/golden.json`);
    }
    const bad = r.failed.length > 0 || r.consoleErrors.length > 0;
    console.log(`${s.key.padEnd(9)} ${r.passed}/${r.total} passed${bad ? "" : " ✓"}`);
    for (const f of r.failed) console.log(`  FAIL ${f.name}${f.info ? " :: " + f.info : ""}`);
    for (const e of r.consoleErrors) console.log(`  CONSOLE ${e}`);
    if (bad) exitCode = 1;
  }
} catch (e) {
  console.error(String(e?.stack || e));
  exitCode = 2;
} finally {
  cleanup();
}
process.exit(exitCode);
