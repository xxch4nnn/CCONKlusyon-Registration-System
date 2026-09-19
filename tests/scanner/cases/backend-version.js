/* Backend version check — a stale deployment must be visible in the scanner, not discovered through "Unknown action." errors.
 * Editing Code.gs in the editor changes nothing for the phones until the *deployment* is moved to a new version; `ping` reports
 * the running version so the scanner can say so.
 */
(function () {
  const { T, check, sleep } = h;
  const $ = (id) => document.getElementById(id);
  const pong = (v) => h.json({ status: 'SUCCESS', message: 'pong', version: v, ts: new Date().toISOString() });

  test('B1 a current backend: no warning, version shown in Settings', async () => {
    check('B1 checkBackend hook exists', typeof T.checkBackend === 'function');
    if (typeof T.checkBackend !== 'function') return;
    h.setPing(() => Promise.resolve(pong('2026-09-20.1')));
    const state = await T.checkBackend();
    check('B1 state ok', state === 'ok', state);
    check('B1 no dot on the gear', !$('menuBtn').classList.contains('attn'));
    check('B1 warning box hidden', $('backendWarn').hidden);
    check('B1 version listed', /2026-09-20\.1/.test($('apiNote').textContent), $('apiNote').textContent);
  });

  test('B2 an outdated backend (does not know ping) raises a visible warning', async () => {
    if (typeof T.checkBackend !== 'function') { check('B2 hook exists', false); return; }
    h.setPing(() => Promise.resolve(h.unk()));
    const state = await T.checkBackend();
    check('B2 state outdated', state === 'outdated', state);
    check('B2 red dot on the gear', $('menuBtn').classList.contains('attn'));
    check('B2 warning box visible and says how to fix it', !$('backendWarn').hidden && /New version/i.test($('backendWarn').textContent) && /out of date/i.test($('backendWarn').textContent), $('backendWarn').textContent.slice(0, 80));
    check('B2 note says OUTDATED', /OUTDATED/.test($('apiNote').textContent), $('apiNote').textContent);
    check('B2 the check is in the Connection log', T.readDiag().some((e) => e.label === 'ping GET'));
  });

  test('B6 a pong with no version (a script older than the version marker) is also outdated', async () => {
    if (typeof T.checkBackend !== 'function') { check('B6 hook exists', false); return; }
    T.resetBackendState();
    h.setPing(() => Promise.resolve(h.json({ status: 'SUCCESS', message: 'pong', ts: new Date().toISOString() })));
    const state = await T.checkBackend();
    check('B6 state outdated', state === 'outdated', state);
    check('B6 red dot and warning shown', $('menuBtn').classList.contains('attn') && !$('backendWarn').hidden);
    check('B6 note says OUTDATED, not "backend ?"', /OUTDATED/.test($('apiNote').textContent) && !/backend \?/.test($('apiNote').textContent), $('apiNote').textContent);
  });

  test('B3 being offline / a timeout says nothing about the deployment (no false alarm, no change)', async () => {
    if (typeof T.checkBackend !== 'function') { check('B3 hook exists', false); return; }
    h.setPing(() => Promise.resolve(pong('2026-09-20.1'))); await T.checkBackend();
    h.setPing(() => Promise.reject(new TypeError('offline')));
    const s1 = await T.checkBackend();
    check('B3 network failure keeps the last known state (ok)', s1 === 'ok' && !$('menuBtn').classList.contains('attn'), s1);
    h.setPing(() => Promise.resolve(h.html()));
    const s2 = await T.checkBackend();
    check('B3 a non-JSON reply keeps the last known state', s2 === 'ok' && !$('menuBtn').classList.contains('attn'), s2);
  });

  test('B4 a first check that is offline stays "not checked" (never "outdated")', async () => {
    if (typeof T.checkBackend !== 'function') { check('B4 hook exists', false); return; }
    T.resetBackendState();
    h.setPing(() => Promise.reject(new TypeError('offline')));
    const s = await T.checkBackend();
    check('B4 unknown, no dot', s === 'unknown' && !$('menuBtn').classList.contains('attn') && /not checked/.test($('apiNote').textContent), s + ' | ' + $('apiNote').textContent);
  });

  test('B5 after a redeploy the warning clears on the next check', async () => {
    if (typeof T.checkBackend !== 'function') { check('B5 hook exists', false); return; }
    h.setPing(() => Promise.resolve(h.unk())); await T.checkBackend();
    check('B5 warning up', !$('backendWarn').hidden);
    h.setPing(() => Promise.resolve(pong('2026-09-20.1'))); await T.checkBackend();
    check('B5 warning cleared', $('backendWarn').hidden && !$('menuBtn').classList.contains('attn'));
  });
})();
