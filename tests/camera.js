#!/usr/bin/env node
/* Real-decoding camera test (BUG-008): does scanner.html scan ONLY inside its on-screen frame?
 *
 *   node tests/camera.js                       # against ../scanner.html
 *   node tests/camera.js --scanner old.html    # against another copy (e.g. `git show <rev>:scanner.html > old.html`)
 *
 * Headless Edge/Chrome is started with a *fake camera* that loops an MJPEG clip (tests/camera/clips) and is driven
 * over the DevTools protocol in real time. The server is faked, so we just count the check-in requests the scanner
 * decides to make for each clip. Slow (~10 s per case) and separate from tests/run.js because it uses a real
 * video pipeline instead of virtual time. Needs Node 22+ (global WebSocket/fetch) and Edge or Chrome.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const scannerPath = path.resolve(opt('scanner') || path.join(__dirname, '..', 'scanner.html'));
const clipsDir = path.join(__dirname, 'camera', 'clips');
const WAIT_MS = 7000;

const browser = [process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find((p) => fs.existsSync(p));
if (!browser) { console.error('No Edge/Chrome found — set BROWSER=<path>.'); process.exit(2); }
if (typeof WebSocket === 'undefined') { console.error('Node 22+ is required (global WebSocket).'); process.exit(2); }

// Expected outcome per clip. Sizes: a near-square window and a tall phone-like one (different crop of the picture).
const SIZES = [
  { name: 'square 520x600', w: 520, h: 600, cases: { centered: true, small_center: true, inside_a: true, inside_b: true, outside_below: false, outside_corner: false, empty: false } },
  { name: 'portrait 520x900', w: 520, h: 900, cases: { small_center: true, outside_below: false, outside_corner: false, empty: false } }
];

let src = fs.readFileSync(scannerPath, 'utf8');
src = src.replace(/prompt\('Usher station \/ device name[^']*'\)/, "'Entrance-1'");
src = src.replace('<head>', '<head><script>try{localStorage.setItem("cco_device_id","Entrance-1")}catch(e){}</script>');
const probe = `<script>
window.__reqs = [];
window.fetch = function (u, i) {
  i = i || {}; u = String(u);
  let code = null, action = null;
  if (i.method === 'POST') { try { const b = JSON.parse(i.body); action = b.action; code = b.attendance_code; } catch (e) {} }
  else { action = (u.match(/action=([a-z]+)/) || [])[1]; code = (u.match(/attendance_code=([^&]*)/) || [])[1]; }
  const reply = (o) => Promise.resolve({ ok: true, status: 200, redirected: false, url: 'x', json: () => Promise.resolve(o), text: () => Promise.resolve(JSON.stringify(o)) });
  if (action === 'roster' || action === 'ping') return reply({ status: 'SUCCESS', attendees: [] });
  window.__reqs.push(action + ':' + code);
  return reply({ status: 'SUCCESS', message: 'ok', data: { attendance_code: code, full_name: 'X', ticket_type: 'Regular Attendee' } });
};
window.__probe = function () {
  const v = document.querySelector('#reader video');
  return JSON.stringify({ reqs: window.__reqs, playing: !!(v && !v.paused && v.videoWidth) });
};
</script>`;
src = src.replace('</body>', probe + '</body>');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-cam-'));
const page = path.join(tmp, 'cam_page.html');
fs.writeFileSync(page, src);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let port = 9500 + Math.floor(Math.random() * 300);

async function scanOnce(clip, size) {
  const p = port++;
  const proc = cp.spawn(browser, ['--headless=new', '--no-first-run', '--user-data-dir=' + path.join(tmp, 'prof' + p), '--remote-debugging-port=' + p,
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + path.join(clipsDir, clip + '.mjpeg'),
    '--window-size=' + size.w + ',' + size.h, 'file:///' + page.replace(/\\/g, '/')], { stdio: 'ignore' });
  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(500);
      try { const list = await (await fetch('http://127.0.0.1:' + p + '/json')).json(); target = list.find((t) => t.type === 'page' && /cam_page/.test(t.url)); } catch (e) { /* not up yet */ }
    }
    if (!target) return { error: 'no DevTools target' };
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = {};
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
    const call = (method, params) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
    await sleep(WAIT_MS);
    const r = await call('Runtime.evaluate', { expression: 'window.__probe()', returnByValue: true });
    ws.close();
    return JSON.parse(r.result.result.value);
  } finally { proc.kill(); }
}

(async () => {
  let failed = false;
  console.log('scanner: ' + path.relative(process.cwd(), scannerPath) + '\n');
  for (const size of SIZES) {
    console.log('-- ' + size.name);
    for (const [clip, shouldScan] of Object.entries(size.cases)) {
      const r = await scanOnce(clip, size);
      const scanned = !r.error && r.reqs.length > 0;
      const ok = !r.error && r.playing && scanned === shouldScan;
      if (!ok) failed = true;
      console.log((ok ? 'PASS ' : 'FAIL ') + clip.padEnd(15) + (shouldScan ? 'must scan     ' : 'must NOT scan ') + '-> ' + (r.error ? r.error : (scanned ? 'scanned (' + r.reqs.length + ' request)' : 'ignored') + (r.playing ? '' : ' [camera not playing!]')));
    }
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  console.log('\n' + (failed ? 'SOME FAILED' : 'ALL PASS'));
  process.exit(failed ? 1 : 0);
})();
