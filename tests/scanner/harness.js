/* Page-side test runtime for scanner.html (injected by tests/run.js — never shipped).
 *
 * Provides: a scripted fake Apps Script (window.fetch is replaced), `test(name, fn)`, and the helpers
 * on `h`. Case files in tests/scanner/cases/ call test(...) and use h.*. Everything is deterministic:
 * the browser runs with virtual time, so sleep() and Date.now() advance together and fast.
 */
(function () {
  'use strict';
  const T = window.__t;
  const tests = [];
  const results = [];
  let calls = [];
  let server = null;

  // ---- fake responses ---------------------------------------------------------------------
  const resp = (body, over) => Object.assign({
    ok: true, status: 200, redirected: true, url: 'https://script.googleusercontent.com/macros/echo?user_content_key=SECRET',
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
  }, over || {});
  const json = (o) => resp(o);
  const html = () => resp('<!DOCTYPE html><html><title>Error 411</title><p>POST requests require a Content-length header.', { ok: false, status: 411 });
  const unk = () => json({ status: 'ERROR', message: 'Unknown action.' });
  const SAMPLE = { attendance_code: '11111', full_name: 'Sample Person', club_name: 'CESA', designation: 'President', ticket_type: 'Regular Attendee', table_allocation: 'Table 1' };
  const ok = (code) => json({ status: 'SUCCESS', message: 'ok', data: Object.assign({}, SAMPLE, { attendance_code: code || SAMPLE.attendance_code }) });
  const dup = (by, ts) => json({ status: 'DUPLICATE', message: 'dup', data: { full_name: SAMPLE.full_name, table_allocation: SAMPLE.table_allocation, initial_checkin_timestamp: ts || new Date().toISOString(), checked_in_by: by } });
  const notFound = () => json({ status: 'NOT_FOUND', message: 'Attendance code does not exist in master records.' });
  const later = (ms, r) => new Promise((res) => setTimeout(() => res(r), ms));

  // A tiny in-memory sheet: first check-in of a known code = SUCCESS, repeats = DUPLICATE, unknown = NOT_FOUND.
  function sheetServer(opts) {
    const o = Object.assign({ delay: 0, known: null, by: 'other' }, opts);
    const seen = {};
    return (rec) => {
      const code = rec.code;
      let r;
      if (o.known && o.known.indexOf(code) < 0) r = notFound();
      else if (seen[code]) r = dup(o.by);
      else { seen[code] = 1; r = ok(code); }
      return later(o.delay, r);
    };
  }

  const realFetch = window.fetch;
  window.fetch = function (url, init) {
    init = init || {};
    const u = String(url);
    const method = init.method || 'GET';
    let action, code, body = null;
    if (method === 'POST') { try { body = JSON.parse(init.body); } catch (e) { body = {}; } action = body.action; code = body.attendance_code; }
    else { action = (u.match(/action=([a-z]+)/) || [])[1]; code = decodeURIComponent((u.match(/attendance_code=([^&]*)/) || [])[1] || ''); }
    const rec = { method, action, code, url: u, body };
    // Background traffic the scanner makes on its own is answered but not counted as a "call".
    if (action === 'roster' || action === 'ping') return Promise.resolve(json({ status: 'SUCCESS', attendees: [] }));
    calls.push(rec);
    if (!server) return Promise.reject(new TypeError('no server'));
    return server(rec, init);
  };

  // ---- helpers --------------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const modalOpen = () => !$('resultModal').hidden;
  const modalText = () => (modalOpen() ? $('resultModal').textContent.replace(/\s+/g, ' ') : '');
  const toastText = () => ($('toast').classList.contains('show') ? $('toast').textContent : '');
  const setFast = (v) => { const cb = $('continuousScanCheckbox'); cb.checked = v; cb.dispatchEvent(new Event('change')); };
  const check = (name, cond, note) => results.push({ ok: !!cond, line: (cond ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : '') });
  const reset = () => {
    T.closeModal();
    ['cco_offline_scans', 'cco_diag', 'cco_roster_cache'].forEach((k) => localStorage.removeItem(k));
    T.writeQueue([]);
    T.resetScanState();
    T.settings.autoDismiss = true;
    setFast(false);
    $('toast').classList.remove('show');
    calls = [];
    server = null;
  };

  window.h = {
    T, check, sleep, modalOpen, modalText, toastText, setFast, json, html, unk, ok, dup, notFound, later, sheetServer,
    get calls() { return calls; },
    setServer(fn) { server = fn; },
    codes() { return calls.filter((c) => c.action === 'checkin').map((c) => c.code); },
    // The camera decode callback. Falls back to onScanSuccess on builds that predate the decode guard,
    // which is exactly how the old scanner received raw decodes.
    feed(text) { (T.onDecode || T.onScanSuccess)(text); },
    async frames(text, n, gapMs) { for (let i = 0; i < n; i++) { window.h.feed(text); if (i < n - 1) await sleep(gapMs == null ? 100 : gapMs); } }
  };
  window.test = (name, fn) => tests.push({ name, fn });

  window.__runAll = async function () {
    for (const t of tests) {
      reset();
      try { await t.fn(); } catch (e) { check(t.name + ' — threw', false, String(e && e.stack || e).slice(0, 200)); }
    }
    const failed = results.filter((r) => !r.ok).length;
    $('out').textContent = 'LOADED ' + (window.__loaded || []).join(',') + ' | ' + tests.length + ' tests\n' + results.map((r) => r.line).join('\n') + '\n' + (failed ? failed + ' FAILED' : 'ALL PASS') + ' (' + results.length + ' checks)';
    document.title = 'DONE';
  };
})();
