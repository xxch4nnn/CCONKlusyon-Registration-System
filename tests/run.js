#!/usr/bin/env node
/* Test runner — no dependencies (Node + an installed Edge/Chrome).
 *
 *   node tests/run.js                        # Apps Script mocks + scanner + scanner-fresh-load + wall
 *   node tests/run.js --only decode          # only case files whose name contains "decode"
 *   node tests/run.js --scanner some.html    # run the scanner suites against another copy
 *   node tests/run.js --display some.html    # run the wall suite against another copy
 *   node tests/run.js --no-gs                # skip the Apps Script mock tests
 *   node tests/camera.js                     # separate: real decoding against a fake camera (see that file)
 *
 * Each page suite loads the real HTML headless with a scripted fake server. Nothing here is shipped or
 * referenced by the app. Browser: set BROWSER=<path> to override auto-detection.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const flag = (name) => args.includes('--' + name);
const only = opt('only');
let failed = false;

function findBrowser() {
  const c = [process.env.BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  return c.find((p) => fs.existsSync(p));
}
const browser = findBrowser();

/* The head stub answers every request with an empty SUCCESS so nothing ever reaches the real network,
 * even the requests a page makes while it initialises (before a suite installs its own server). */
const HEAD_STUB = `<script>
window.fetch = function (u) {
  // "?slow" (used for the reload/persistence frames) answers after 5 s so the first paint can be inspected.
  var slow = /[?&]slow/.test(location.search);
  var resp = { ok: true, status: 200, redirected: false, url: 'https://stub/', text: function () { return Promise.resolve(JSON.stringify({ status: 'SUCCESS', attendees: [] })); }, json: function () { return Promise.resolve({ status: 'SUCCESS', attendees: [] }); } };
  return slow ? new Promise(function (res) { setTimeout(function () { res(resp); }, 5000); }) : Promise.resolve(resp);
};
</script>`;

function runSuite(label, o) {
  console.log('\n== ' + label + ' ==');
  let src = fs.readFileSync(o.html, 'utf8');
  src = o.transform(src);
  const seed = o.seed ? '<script>try{' + Object.keys(o.seed).map((k) => 'localStorage.setItem(' + JSON.stringify(k) + ',' + JSON.stringify(o.seed[k]) + ')').join(';') + '}catch(e){}</script>' : '';
  src = src.replace('<head>', '<head>' + HEAD_STUB + seed);
  if (!fs.existsSync(o.casesDir)) { console.log('(no cases directory)'); return; }
  const files = fs.readdirSync(o.casesDir).filter((f) => f.endsWith('.js') && (!only || f.includes(only))).sort();
  if (!files.length) { console.log('(no case files match)'); return; }
  const inject = '<pre id="out"></pre>\n<script>\n' + fs.readFileSync(o.harness, 'utf8') + '\n</script>\n' +
    files.map((f) => '<script>\n' + fs.readFileSync(path.join(o.casesDir, f), 'utf8') + '\n;(window.__loaded = window.__loaded || []).push(' + JSON.stringify(f) + ');\n</script>\n').join('') +
    '<script>window.addEventListener("load", function () { setTimeout(function () { window.__runAll(); }, 300); });</script>\n';
  src = src.replace('</body>', inject + '</body>');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-test-'));
  const page = path.join(tmp, 'page.html');
  fs.writeFileSync(page, src);
  const r = cp.spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files',
    '--user-data-dir=' + path.join(tmp, 'profile'), '--window-size=400,800', '--virtual-time-budget=900000', '--dump-dom',
    'file:///' + page.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 280000, maxBuffer: 64 * 1024 * 1024 });
  const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
  if (!m) { console.error('No test output from the browser (crashed or timed out).'); console.error((r.stderr || '').slice(0, 500)); failed = true; }
  else {
    const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    console.log('cases: ' + files.join(', ') + '\nfile: ' + path.relative(process.cwd(), o.html) + '\n');
    console.log(text);
    if (/FAILED/.test(text) || !/ALL PASS/.test(text)) failed = true;
    const loaded = ((/^LOADED ([^|]*)\|/m.exec(text) || [])[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
    const missing = files.filter((f) => !loaded.includes(f));
    if (missing.length) { console.error('\nCASE FILE(S) DID NOT LOAD: ' + missing.join(', ')); failed = true; }
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

// ---- 1. Apps Script mock tests -------------------------------------------------------------------
if (!flag('no-gs')) {
  console.log('== Apps Script (mocked globals) ==');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'code-gs.test.js')], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.status !== 0) { failed = true; process.stderr.write(r.stderr); }
}
if (!browser) { console.error('No Edge/Chrome found — set BROWSER=<path>.'); process.exit(2); }

// ---- 2. scanner.html ------------------------------------------------------------------------------
const scannerHtml = path.resolve(opt('scanner') || path.join(root, 'scanner.html'));
const SCANNER_EXPOSE = `
  // ---- test hooks (tests/run.js) ----
  const __opt = (fn) => { try { return fn(); } catch (e) { return null; } };
  window.__t = {
    onScanSuccess, submitCheckin, readQueue, writeQueue, queueOffline, trySyncOfflineQueue, readDiag, closeModal, settings, CONFIG,
    onDecode: __opt(function () { return onDecode; }),
    parsePassCode: __opt(function () { return parsePassCode; }),
    requireStation: __opt(function () { return requireStation; }),
    validStation: __opt(function () { return validStation; }),
    checkBackend: __opt(function () { return checkBackend; }),
    resetBackendState: function () { __opt(function () { backendState = 'unknown'; backendVersion = null; renderBackend(); }); },
    get deviceId() { return deviceId; },
    // Re-read the station from storage (tests clear/seed localStorage, then call this).
    resyncStation: function () { __opt(function () { deviceId = storedStation(); }); },
    resetScanState: function () {
      __opt(function () { scanLocked = false; inFlight = false; recentCodes.clear(); });
      __opt(function () { cand = { text: null, n: 0, t: 0 }; });
      __opt(function () { lastRejected = { text: null, t: 0 }; });
    }
  };
`;
function scannerTransform(src) {
  // Camera and (old builds') station prompt are stubbed; the camera-start call is replaced by a counter so
  // tests can see whether/when the app would have started it.
  src = src.replace(/prompt\('Usher station \/ device name[^']*'\)/, "'Entrance-1'");
  const camRe = /\n {2}(requireStation\(\)\.then\(startCamera\)|startCamera\(\));\n/;
  if (!camRe.test(src)) throw new Error('camera start call not found — update tests/run.js');
  src = src.replace(camRe, (m, call) => call.startsWith('requireStation')
    ? '\n  requireStation().then(function () { window.__cameraStarted = (window.__cameraStarted || 0) + 1; });\n'
    : '\n  /* startCamera() disabled for tests */\n');
  const marker = '})();\n</script>';
  const at = src.lastIndexOf(marker);
  if (at < 0) throw new Error('script end marker not found');
  return src.slice(0, at) + SCANNER_EXPOSE + src.slice(at);
}
runSuite('scanner.html (station already set)', {
  html: scannerHtml, transform: scannerTransform, seed: { cco_device_id: 'Entrance-1' },
  harness: path.join(__dirname, 'scanner', 'harness.js'), casesDir: path.join(__dirname, 'scanner', 'cases')
});
runSuite('scanner.html (fresh install: no station saved)', {
  html: scannerHtml, transform: scannerTransform, seed: null,
  harness: path.join(__dirname, 'scanner', 'harness.js'), casesDir: path.join(__dirname, 'scanner', 'fresh')
});

// ---- 3. display.html ------------------------------------------------------------------------------
const displayHtml = path.resolve(opt('display') || path.join(root, 'display.html'));
runSuite('display.html (projector wall)', {
  html: displayHtml, seed: null,
  transform: (src) => {
    const marker = '})();\n</script>';
    const at = src.lastIndexOf(marker);
    if (at < 0) throw new Error('display script end marker not found');
    return src.slice(0, at) + `
  // ---- test hooks (tests/run.js) ----
  window.__d = {
    CONFIG: CONFIG,
    reset: function () {
      try { store.clear(); heroEls.clear(); tileEls.clear(); } catch (e) { /* */ }
      try { lastFullAt = Date.now(); } catch (e) { /* older builds */ }
      try { checkedInFromRoster = 0; } catch (e) { /* */ }
      try { render(); } catch (e) { /* */ }
    }
  };
` + src.slice(at);
  },
  harness: path.join(__dirname, 'display', 'harness.js'), casesDir: path.join(__dirname, 'display', 'cases')
});

process.exit(failed ? 1 : 0);
