#!/usr/bin/env node
/* Test runner — no dependencies (Node + an installed Edge/Chrome).
 *
 *   node tests/run.js                       # Apps Script mock tests + scanner tests against ../scanner.html
 *   node tests/run.js --scanner some.html   # scanner tests against another copy (e.g. `git show HEAD:scanner.html`)
 *   node tests/run.js --only decode         # only scanner case files whose name contains "decode"
 *   node tests/run.js --no-gs               # skip the Apps Script mock tests
 *
 * The scanner is loaded headless with a scripted fake server, the camera and the station-name prompt stubbed
 * out, and internals exposed as window.__t. Nothing here is shipped or referenced by scanner.html.
 * Browser: set BROWSER=<path> to override auto-detection.
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

// ---- 1. Apps Script mock tests ----------------------------------------------------------------
let failed = false;
if (!flag('no-gs')) {
  console.log('== Apps Script (mocked globals) ==');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'code-gs.test.js')], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.status !== 0) { failed = true; process.stderr.write(r.stderr); }
}

// ---- 2. Scanner page tests ---------------------------------------------------------------------
console.log('\n== scanner.html (headless browser, scripted fake server) ==');
const scannerPath = path.resolve(opt('scanner') || path.join(root, 'scanner.html'));
let src = fs.readFileSync(scannerPath, 'utf8');

const promptRe = /prompt\('Usher station \/ device name[^']*'\)/;
if (!promptRe.test(src)) throw new Error('station prompt not found — update tests/run.js');
src = src.replace(promptRe, "'Entrance-1'");
if (!/\n {2}startCamera\(\);\n/.test(src)) throw new Error('startCamera() call not found — update tests/run.js');
src = src.replace(/\n {2}startCamera\(\);\n/, '\n  /* startCamera() disabled for tests */\n');

const expose = `
  // ---- test hooks (tests/run.js) ----
  const __opt = (fn) => { try { return fn(); } catch (e) { return null; } };
  window.__t = {
    onScanSuccess, submitCheckin, readQueue, writeQueue, queueOffline, trySyncOfflineQueue, readDiag, closeModal, settings, CONFIG,
    onDecode: __opt(function () { return onDecode; }),
    parsePassCode: __opt(function () { return parsePassCode; }),
    get deviceId() { return deviceId; },
    resetScanState: function () {
      __opt(function () { scanLocked = false; inFlight = false; recentCodes.clear(); });
      __opt(function () { cand = { text: null, n: 0, t: 0 }; });
      __opt(function () { lastRejected = { text: null, t: 0 }; });
    }
  };
`;
const marker = '})();\n</script>';
const at = src.lastIndexOf(marker);
if (at < 0) throw new Error('script end marker not found');
src = src.slice(0, at) + expose + src.slice(at);

const casesDir = path.join(__dirname, 'scanner', 'cases');
const only = opt('only');
const caseFiles = fs.readdirSync(casesDir).filter((f) => f.endsWith('.js') && (!only || f.includes(only))).sort();
const inject = '<pre id="out"></pre>\n<script>\n' + fs.readFileSync(path.join(__dirname, 'scanner', 'harness.js'), 'utf8') + '\n</script>\n' +
  caseFiles.map((f) => '<script>\n' + fs.readFileSync(path.join(casesDir, f), 'utf8') + '\n;(window.__loaded = window.__loaded || []).push(' + JSON.stringify(f) + ');\n</script>\n').join('') +
  '<script>window.addEventListener("load", function () { setTimeout(function () { window.__runAll(); }, 300); });</script>\n';
src = src.replace('</body>', inject + '</body>');

const browser = findBrowser();
if (!browser) { console.error('No Edge/Chrome found — set BROWSER=<path>.'); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-scanner-test-'));
const page = path.join(tmp, 'page.html');
fs.writeFileSync(page, src);
const r = cp.spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + path.join(tmp, 'profile'),
  '--window-size=400,800', '--virtual-time-budget=900000', '--dump-dom', 'file:///' + page.replace(/\\/g, '/')],
  { encoding: 'utf8', timeout: 280000, maxBuffer: 64 * 1024 * 1024 });
const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
if (!m) { console.error('No test output from the browser (crashed or timed out).'); console.error((r.stderr || '').slice(0, 500)); failed = true; }
else {
  const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  console.log('cases: ' + caseFiles.join(', ') + '\nscanner: ' + path.relative(process.cwd(), scannerPath) + '\n');
  console.log(text);
  if (/FAILED/.test(text) || !/ALL PASS/.test(text)) failed = true;
  // A case file that fails to parse or throws on load must not pass silently.
  const loaded = ((/^LOADED ([^|]*)\|/m.exec(text) || [])[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const missing = caseFiles.filter((f) => !loaded.includes(f));
  if (missing.length) { console.error('\nCASE FILE(S) DID NOT LOAD: ' + missing.join(', ')); failed = true; }
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ }
process.exit(failed ? 1 : 0);
