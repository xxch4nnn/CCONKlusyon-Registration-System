/* Shared access key: the scanner sends it on every request, gets it from a private #key= link or Settings, and a
 * rejected key is a loud, explicit state — never a silently growing offline queue. */
(function () {
  const { T, check, sleep, json, html, ok } = h;
  const $ = (id) => document.getElementById(id);
  const resolve = (r) => Promise.resolve(r);
  const KEYERR = () => json({ status: 'ERROR', code: 'UNAUTHORIZED', message: 'Access key missing or wrong.' });
  const NOKEY = () => json({ status: 'ERROR', code: 'KEY_NOT_SET', message: 'The server has no access key set (Script property API_KEY).' });
  const setKey = (k) => localStorage.setItem('cco_access_key', k);
  const bad = () => $('menuBtn').classList.contains('attn');
  const warn = () => ($('keyWarn').hidden ? '' : $('keyWarn').textContent.replace(/\s+/g, ' '));

  test('A1 the stored key rides on every request: POST body, GET retry, ping and roster', async () => {
    setKey('k-123');
    h.setServer((rec) => resolve(rec.method === 'POST' ? html() : ok()));
    await T.submitCheckin('11111');
    check('A1 POST body carries the key', h.calls[0].body && h.calls[0].body.key === 'k-123', JSON.stringify(h.calls[0].body));
    check('A1 the GET retry carries the key in the query', /[?&]key=k-123(&|$)/.test(h.calls[1].url), h.calls[1].url);
    await T.checkBackend();
    check('A1 ping carries it', /[?&]key=k-123(&|$)/.test(h.pings[h.pings.length - 1].url), h.pings.map((p) => p.url).join(' | '));
    await T.fetchRoster();
    check('A1 roster carries it', /[?&]key=k-123(&|$)/.test(h.rosters[h.rosters.length - 1].url));
  });

  test('A2 with no key stored nothing is added to requests', async () => {
    h.setServer((rec) => resolve(rec.method === 'POST' ? html() : ok()));
    await T.submitCheckin('11111');
    check('A2 no key in POST body or GET url', h.calls[0].body && !('key' in h.calls[0].body) && !/key=/.test(h.calls[1].url));
  });

  test('A3 a private link ending in #key=… is stored, then removed from the address bar', async () => {
    check('A3 hook exists', typeof T.adoptKeyFromLink === 'function');
    if (typeof T.adoptKeyFromLink !== 'function') return;
    history.replaceState(null, '', '#key=LINK-KEY_9');
    const adopted = T.adoptKeyFromLink();
    check('A3 stored', adopted === true && localStorage.getItem('cco_access_key') === 'LINK-KEY_9', String(localStorage.getItem('cco_access_key')));
    check('A3 the key is gone from the URL', location.hash === '' && !/key=/.test(location.href), location.href);
    check('A3 a page opened without a key link changes nothing', T.adoptKeyFromLink() === false && localStorage.getItem('cco_access_key') === 'LINK-KEY_9');
  });

  test('A4 a rejected key: one request, an explicit card, the scan is saved, a red dot and a warning', async () => {
    setKey('wrong');
    h.setServer(() => resolve(KEYERR()));
    await T.submitCheckin('11111');
    check('A4 no pointless GET retry', h.calls.length === 1, String(h.calls.length));
    check('A4 card names the problem and says it is not recorded', /ACCESS KEY/i.test(h.modalText()) && /NOT RECORDED/i.test(h.modalText()), h.modalText().slice(0, 120));
    check('A4 raw server wording is not shown', !/UNAUTHORIZED|missing or wrong/i.test(h.modalText()));
    check('A4 the scan is kept for later', T.readQueue().length === 1 && T.readQueue()[0].attendance_code === '11111');
    check('A4 red dot on the gear and a warning in Settings', bad() && /rejected/i.test(warn()), warn());
  });

  test('A5 the server has no key configured: says so', async () => {
    setKey('whatever');
    h.setServer(() => resolve(NOKEY()));
    await T.submitCheckin('11111');
    check('A5 warning points at the server, not the device', bad() && /server has no access key/i.test(warn()), warn());
    check('A5 scan kept', T.readQueue().length === 1);
  });

  test('A6 no key on this device: says so', async () => {
    h.setServer(() => resolve(KEYERR()));
    await T.submitCheckin('11111');
    check('A6 warning says this device has no key', bad() && /no access key on this device/i.test(warn()), warn());
  });

  test('A7 the offline queue is not hammered while the key is rejected', async () => {
    setKey('wrong');
    T.writeQueue([{ action: 'checkin', attendance_code: '11111', device_id: 'X' }, { action: 'checkin', attendance_code: '22222', device_id: 'X' }]);
    h.setServer(() => resolve(KEYERR()));
    const r = await T.trySyncOfflineQueue();
    check('A7 queue untouched', r === null && T.readQueue().length === 2, String(T.readQueue().length));
    check('A7 a single request, no per-item fallback storm', h.calls.length === 1, String(h.calls.length));
  });

  test('A8 saving the right key in Settings clears the warning and the queue syncs', async () => {
    setKey('wrong');
    h.setServer(() => resolve(KEYERR()));
    await T.submitCheckin('11111');
    check('A8 warning is up first', bad());
    h.setServer((rec) => resolve(rec.action === 'sync' ? json({ status: 'SUCCESS', results: [{ status: 'SUCCESS' }] }) : ok()));
    h.setPing(() => resolve(json({ status: 'SUCCESS', message: 'pong', version: 'test', secured: true, authorized: true })));
    $('keyInput').value = '  good-key  ';
    $('keySaveBtn').click();
    await sleep(600);
    check('A8 key stored (trimmed) and the box cleared', localStorage.getItem('cco_access_key') === 'good-key' && $('keyInput').value === '');
    check('A8 warning gone, dot gone', !bad() && $('keyWarn').hidden && T.keyState === 'ok', T.keyState + ' | ' + warn());
    check('A8 the saved scan was sent', T.readQueue().length === 0, String(T.readQueue().length));
  });

  test('A9 ping tells the scanner about the key without touching the sheet', async () => {
    setKey('k');
    h.setPing(() => resolve(json({ status: 'SUCCESS', message: 'pong', version: 'v', secured: true, authorized: false })));
    await T.checkBackend();
    check('A9 rejected key -> warning', bad() && /rejected/i.test(warn()), warn());
    h.setPing(() => resolve(json({ status: 'SUCCESS', message: 'pong', version: 'v', secured: false, authorized: false })));
    await T.checkBackend();
    check('A9 server without a key -> its own warning', /server has no access key/i.test(warn()), warn());
    h.setPing(() => resolve(json({ status: 'SUCCESS', message: 'pong', version: 'v', secured: true, authorized: true })));
    await T.checkBackend();
    check('A9 good key -> all clear', !bad() && $('keyWarn').hidden && T.keyState === 'ok');
    localStorage.removeItem('cco_access_key');
    h.setPing(() => resolve(json({ status: 'SUCCESS', message: 'pong', version: 'v', secured: true, authorized: false })));
    await T.checkBackend();
    check('A9 no key on the device -> says so', /no access key on this device/i.test(warn()), warn());
  });

  test('A10 the key is never shown or logged in full', async () => {
    setKey('SECRET-KEY-VALUE-1234');
    h.setServer(() => resolve(KEYERR()));
    await T.submitCheckin('11111');
    await T.fetchRoster();
    const shown = $('settingsSheet').textContent + ' ' + $('resultModal').textContent + ' ' + (localStorage.getItem('cco_diag') || '');
    check('A10 not in Settings, the card or the Connection log', !/SECRET-KEY-VALUE/.test(shown), shown.slice(0, 80));
    check('A10 Settings shows only the last four characters', /…1234/.test($('keyNote').textContent), $('keyNote').textContent);
  });

  test('A11 a denied roster fetch is a key problem, not "redeploy Code.gs"', async () => {
    setKey('wrong');
    h.setRoster(() => resolve(KEYERR()));
    const r = await T.fetchRoster();
    check('A11 returns "key"', r === 'key', String(r));
    check('A11 badge points at the key, not at a redeploy', /key/i.test($('rosterBadge').textContent) && !/redeploy/i.test($('rosterBadge').textContent), $('rosterBadge').textContent);
    check('A11 warning is up', bad());
  });

  test('A12 the warning clears by itself once the server accepts the key again', async () => {
    setKey('wrong');
    h.setServer(() => resolve(KEYERR()));
    await T.submitCheckin('11111');
    check('A12 warning up', bad());
    setKey('right');
    h.setServer(() => resolve(ok()));
    await T.submitCheckin('22222');
    check('A12 a successful reply clears it', !bad() && $('keyWarn').hidden && T.keyState === 'ok', T.keyState);
  });
})();
