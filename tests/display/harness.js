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
  let rosterRows = null;    // when set, the fake roster serves exactly these rows
  let needKey = null;       // when a string, the fake server refuses any request without exactly this key
  let keyNotSet = false;    // when true, the fake server answers KEY_NOT_SET
  let netDown = false;
  let calls = [];
  const person = (name, club, ts, over) => Object.assign({ full_name: name, club_name: club || 'CESA', designation: 'Delegate', ticket_type: 'Regular Attendee', table_allocation: 'Table 1', photo_url: '', checkin_timestamp: ts }, over || {});
  const resp = (o) => ({ ok: true, status: 200, redirected: false, url: 'https://x/', json: () => Promise.resolve(o), text: () => Promise.resolve(JSON.stringify(o)) });

  window.fetch = function (url) {
    const u = String(url);
    const action = (u.match(/action=([a-z]+)/) || [])[1];
    const limit = +((u.match(/limit=(\d+)/) || [])[1] || 12);
    const key = decodeURIComponent((u.match(/[?&]key=([^&]*)/) || [])[1] || '');
    calls.push({ action, limit, key });
    if (netDown) return Promise.reject(new TypeError('network down'));
    if (keyNotSet) return Promise.resolve(resp({ status: 'ERROR', code: 'KEY_NOT_SET', message: 'The server has no access key set (Script property API_KEY).' }));
    if (needKey !== null && key !== needKey) return Promise.resolve(resp({ status: 'ERROR', code: 'UNAUTHORIZED', message: 'Access key missing or wrong.' }));
    if (action === 'recent') {
      const list = people.slice().sort((a, b) => Date.parse(b.checkin_timestamp) - Date.parse(a.checkin_timestamp));
      return Promise.resolve(resp({ status: 'SUCCESS', count: Math.min(limit, list.length), attendees: list.slice(0, limit) }));
    }
    if (action === 'roster' && rosterRows) return Promise.resolve(resp({ status: 'SUCCESS', count: rosterRows.length, attendees: rosterRows }));
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
    people = []; pendingRows = 1; netDown = false; calls = []; rosterRows = null; needKey = null; keyNotSet = false;
    try { localStorage.removeItem('cco_access_key'); } catch (e) { /* ignore */ }
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    try { D.reset(); } catch (e) { /* older builds have no reset hook */ }
  };

  // ---- Spotlight tab helpers ----
  const spotEl = () => document.querySelector('#spotStage .card.spot');
  const spot = () => {
    const c = spotEl(); if (!c) return null;
    const t = (s) => { const n = c.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; };
    return {
      name: t('.name'), role: t('.role'), club: t('.club'), table: t('.table'), badge: t('.badge'),
      vip: c.classList.contains('vip'), reg: c.classList.contains('reg'), typo: c.classList.contains('typo'),
      svg: !!c.querySelector('svg.avatar'), img: !!c.querySelector('img.avatar'),
      count: document.querySelectorAll('#spotStage .card.spot').length
    };
  };

  window.h = {
    D, check, sleep, cards, names, person, calls: () => calls,
    spot,
    ambientShown: () => !$('ambient').hidden,
    ambientText: () => $('ambient').textContent.replace(/\s+/g, ' ').trim(),
    viewShown: (id) => !$(id).hidden,
    selectedTab: () => Array.from(document.querySelectorAll('.tabs button')).filter((b) => b.getAttribute('aria-selected') === 'true').map((b) => b.id).join(','),
    key: (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })),
    ingest: (list) => D.ingest(list, true, false), // a live arrival (animated), not the silent first load
    queueLen: () => D.spotQueueLength(),
    setPeople(list) { people = list; },
    setRoster(rows) { rosterRows = rows; },
    requireKey(k) { needKey = k; },
    setKeyNotSet(v) { keyNotSet = !!v; },
    keysSent: () => calls.map((c) => c.key),
    liveText: () => document.getElementById('liveText').textContent.replace(/\s+/g, ' ').trim(),
    rosterCalls: () => calls.filter((c) => c.action === 'roster').length,
    tele() {
      const t = (id) => { const n = $(id); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
      return {
        inn: t('teleIn'), all: t('teleAll'), pct: t('telePct'), fill: $('teleFill') ? $('teleFill').style.width : null,
        now: $('teleBar') ? $('teleBar').getAttribute('aria-valuenow') : null,
        vip: $('teleVip') ? t('teleVip') : null, reg: $('teleReg') ? t('teleReg') : null, pending: $('telePending') ? t('telePending') : null,
        clubs: Array.from(document.querySelectorAll('#teleClubs .club-row')).map((r) => ({ name: r.querySelector('.cn').textContent.trim(), count: r.querySelector('.cc').textContent.replace(/\s+/g, ' ').trim() })),
        status: t('teleStatus'), stamp: t('teleStamp'), text: $('viewTelemetry') ? $('viewTelemetry').innerText : ''
      };
    },
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
