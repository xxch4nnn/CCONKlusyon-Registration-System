/* Page-side runtime for roster-print.html tests (injected by tests/run.js — never shipped).
 * A scripted fake Apps Script serves `roster` from window.h.setRows(); helpers inspect the rendered sheet.
 */
(function () {
  'use strict';
  if (window.parent !== window) return;
  const P = window.__p;
  const tests = [], results = [];
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = (name, cond, note) => results.push({ ok: !!cond, line: (cond ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : '') });

  let rows = [];
  let mode = 'ok'; // ok | down | error
  let calls = [];
  let urls = [];
  let needKey = null;
  let notSet = false;
  const resp = (o) => ({ ok: true, status: 200, redirected: false, url: 'https://x/', json: () => Promise.resolve(o), text: () => Promise.resolve(JSON.stringify(o)) });

  window.fetch = function (url) {
    const u = String(url);
    const action = (u.match(/action=([a-z]+)/) || [])[1];
    calls.push(action);
    urls.push(u);
    if (notSet) return Promise.resolve(resp({ status: 'ERROR', code: 'KEY_NOT_SET', message: 'The server has no access key set (Script property API_KEY).' }));
    if (needKey !== null && decodeURIComponent((u.match(/[?&]key=([^&]*)/) || [])[1] || '') !== needKey) return Promise.resolve(resp({ status: 'ERROR', code: 'UNAUTHORIZED', message: 'Access key missing or wrong.' }));
    if (mode === 'down') return Promise.reject(new TypeError('network down'));
    if (mode === 'error') return Promise.resolve(resp({ status: 'ERROR', message: 'Unknown action.' }));
    if (action === 'roster') return Promise.resolve(resp({ status: 'SUCCESS', count: rows.length, attendees: rows }));
    return Promise.resolve(resp({ status: 'ERROR', message: 'Unknown action.' }));
  };

  const row = (code, name, club, over) => Object.assign({ attendance_code: String(code), full_name: name, club_name: club, designation: 'Delegate', ticket_type: 'Regular Attendee', table_allocation: 'Table 1', checkin_status: 'Pending' }, over || {});
  const cellText = (el) => el.textContent.replace(/\s+/g, ' ').trim();

  window.h = {
    P, check, sleep, row, cellText, calls: () => calls,
    urls: () => urls,
    requireKey(k) { needKey = k; },
    setNotSet(v) { notSet = !!v; },
    setRows(list) { rows = list; },
    setMode(m) { mode = m; },
    async load() { await P.load(); await sleep(50); },
    dataRows: () => Array.from(document.querySelectorAll('#sheet tbody tr.person')),
    groupRows: () => Array.from(document.querySelectorAll('#sheet tbody tr.group')),
    names: () => Array.from(document.querySelectorAll('#sheet tbody tr.person .name')).map(cellText),
    groups: () => Array.from(document.querySelectorAll('#sheet tbody tr.group')).map((g) => g.querySelector('.club').textContent.trim()),
    pins: () => Array.from(document.querySelectorAll('#sheet tbody tr.person .pin')).map(cellText),
    seats: () => Array.from(document.querySelectorAll('#sheet tbody tr.person .seat')).map(cellText),
    status: () => cellText($('status')),
    summary: () => cellText($('summary'))
  };
  window.test = (name, fn) => tests.push({ name, fn });

  window.__runAll = async function () {
    for (const t of tests) {
      rows = []; mode = 'ok'; calls = []; urls = []; needKey = null; notSet = false;
      try { localStorage.removeItem('cco_access_key'); } catch (e) { /* ignore */ }
      try { await P.load(); } catch (e) { /* the empty-state load is allowed to fail quietly */ }
      await sleep(50);
      try { await t.fn(); } catch (e) { check(t.name + ' — threw', false, String(e && e.stack || e).slice(0, 220)); }
    }
    const failed = results.filter((r) => !r.ok).length;
    $('out').textContent = 'LOADED ' + (window.__loaded || []).join(',') + ' | ' + tests.length + ' tests\n' + results.map((r) => r.line).join('\n') + '\n' + (failed ? failed + ' FAILED' : 'ALL PASS') + ' (' + results.length + ' checks)';
    document.title = 'DONE';
  };
})();
