/* Page-side runtime for display.html tests (injected by tests/run.js — never shipped).
 * A scripted fake Apps Script serves `recent` / `roster` from window.__people; helpers inspect the rendered wall.
 * Virtual time: sleep() and the wall's 4 s poll advance together and instantly.
 */
(function () {
  'use strict';
  if (window.parent !== window) return; // reload-test iframes load this same page — they must not run the suite
  const D = window.__d;
  const tests = [], results = [];
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = (name, cond, note) => results.push({ ok: !!cond, line: (cond ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : '') });

  let people = [];          // what the fake server considers "checked in"
  let pendingRows = 1;      // roster rows still Pending
  let netDown = false;
  let calls = [];
  const person = (name, club, ts, over) => Object.assign({ full_name: name, club_name: club || 'CESA', designation: 'Delegate', ticket_type: 'Regular Attendee', table_allocation: 'Table 1', photo_url: '', checkin_timestamp: ts }, over || {});
  const resp = (o) => ({ ok: true, status: 200, redirected: false, url: 'https://x/', json: () => Promise.resolve(o), text: () => Promise.resolve(JSON.stringify(o)) });

  window.fetch = function (url) {
    const u = String(url);
    const action = (u.match(/action=([a-z]+)/) || [])[1];
    const limit = +((u.match(/limit=(\d+)/) || [])[1] || 12);
    calls.push({ action, limit });
    if (netDown) return Promise.reject(new TypeError('network down'));
    if (action === 'recent') {
      const list = people.slice().sort((a, b) => Date.parse(b.checkin_timestamp) - Date.parse(a.checkin_timestamp));
      return Promise.resolve(resp({ status: 'SUCCESS', count: Math.min(limit, list.length), attendees: list.slice(0, limit) }));
    }
    if (action === 'roster') {
      const rows = people.map((p) => ({ full_name: p.full_name, checkin_status: 'Checked-In' }));
      for (let i = 0; i < pendingRows; i++) rows.push({ full_name: 'Pending ' + i, checkin_status: 'Pending' });
      return Promise.resolve(resp({ status: 'SUCCESS', count: rows.length, attendees: rows }));
    }
    return Promise.resolve(resp({ status: 'ERROR', message: 'Unknown action.' }));
  };

  const cards = () => Array.from(document.querySelectorAll('#hero .card, #grid .card'));
  const names = () => cards().map((c) => c.querySelector('.name').textContent);
  const reset = () => {
    people = []; pendingRows = 1; netDown = false; calls = [];
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    try { D.reset(); } catch (e) { /* older builds have no reset hook */ }
  };

  window.h = {
    D, check, sleep, cards, names, person, calls: () => calls,
    setPeople(list) { people = list; },
    getPeople() { return people; },
    setNetDown(v) { netDown = v; },
    // Wait long enough for a normal poll (4 s) — or a periodic full refresh (> 60 s) when `full` is true.
    async poll(full) { await sleep(full ? 66000 : 4500); },
    emptyText() { return $('empty').hidden ? '' : $('empty').textContent.replace(/\s+/g, ' '); },
    count() { return $('countNum').textContent; }
  };
  window.test = (name, fn) => tests.push({ name, fn });

  window.__runAll = async function () {
    for (const t of tests) {
      reset();
      await sleep(200);
      try { await t.fn(); } catch (e) { check(t.name + ' — threw', false, String(e && e.stack || e).slice(0, 220)); }
    }
    const failed = results.filter((r) => !r.ok).length;
    $('out').textContent = 'LOADED ' + (window.__loaded || []).join(',') + ' | ' + tests.length + ' tests\n' + results.map((r) => r.line).join('\n') + '\n' + (failed ? failed + ' FAILED' : 'ALL PASS') + ' (' + results.length + ' checks)';
    document.title = 'DONE';
  };
})();
