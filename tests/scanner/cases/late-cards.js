/* BUG-009 — cards that appear late, with no way to tell which pass they belong to ("popped up while the camera was
 * on a wall"), and misleading "May already be checked in" wording when the server simply never answered.
 */
(function () {
  const { T, check, sleep, json, html, unk, ok, dup } = h;
  const $ = (id) => document.getElementById(id);
  const resolve = (r) => Promise.resolve(r);

  test('L1 every card names the pass it is about', async () => {
    h.setServer(h.sheetServer({ delay: 50 }));
    await T.submitCheckin('48201');
    check('L1 success card shows the code', /48201/.test(h.modalText()), h.modalText().slice(0, 60));
    T.closeModal();
    await T.submitCheckin('48201');
    check('L1 duplicate card shows the code', /ALREADY/.test(h.modalText()) && /48201/.test(h.modalText()), h.modalText().slice(0, 70));
    T.closeModal();
    h.setServer(h.sheetServer({ known: ['11111'] }));
    await T.submitCheckin('48299');
    check('L1 not-found card shows the code', /NOT FOUND/i.test(h.modalText()) && /48299/.test(h.modalText()), h.modalText().slice(0, 70));
    T.closeModal();
    h.setServer(() => resolve(unk()));
    await T.submitCheckin('48205');
    check('L1 unconfirmed card shows the code', /48205/.test(h.modalText()), h.modalText().slice(0, 70));
  });

  test('L2 a "Checking <code>…" indicator is visible while a check-in is in flight and gone afterwards', async () => {
    h.setServer(h.sheetServer({ delay: 3000 }));
    const p = T.submitCheckin('48201');
    await sleep(500);
    const busy = $('busy');
    check('L2 indicator visible mid-flight with the code', busy && !busy.hidden && /48201/.test(busy.textContent), busy && busy.textContent);
    await p;
    check('L2 indicator cleared after the answer', $('busy').hidden);
  });

  test('L3 worst case (server never answers) resolves within ~17 s, not ~25 s', async () => {
    check('L3 request timeout is 8 s', T.CONFIG.REQUEST_TIMEOUT_MS === 8000, 'timeout=' + T.CONFIG.REQUEST_TIMEOUT_MS);
    h.setServer((rec, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    const t0 = Date.now();
    await T.submitCheckin('48201');
    const took = Date.now() - t0;
    check('L3 finished within 17 s', took <= 17000, 'took ' + took + ' ms');
    check('L3 saved for later, indicator cleared', T.readQueue().length === 1 && $('busy').hidden);
  });

  test('L4 unconfirmed + roster says "checked in": say NOT CONFIRMED and that the roster may be stale', async () => {
    localStorage.setItem('cco_roster_cache', JSON.stringify({ byCode: { '48201': { attendance_code: '48201', full_name: 'Sample Person', ticket_type: 'Regular Attendee', checkin_status: 'Checked-In', table_allocation: 'T1' } }, syncedAt: new Date().toISOString() }));
    h.setServer(() => resolve(unk()));
    await T.submitCheckin('48201');
    const t = h.modalText();
    check('L4 says NOT CONFIRMED', /NOT CONFIRMED/.test(t), t.slice(0, 80));
    check('L4 does not claim "may already be checked in" as fact', !/MAY ALREADY BE CHECKED IN/.test(t));
    check('L4 warns the roster copy may be out of date', /out of date|stale/i.test(t), t.slice(0, 200));
  });

  test('L5 a genuine offline (network) scan with the same roster still says MAY ALREADY BE CHECKED IN', async () => {
    localStorage.setItem('cco_roster_cache', JSON.stringify({ byCode: { '48201': { attendance_code: '48201', full_name: 'Sample Person', ticket_type: 'Regular Attendee', checkin_status: 'Checked-In', table_allocation: 'T1' } }, syncedAt: new Date().toISOString() }));
    h.setServer(null);
    await T.submitCheckin('48201');
    check('L5 offline wording unchanged', /MAY ALREADY BE CHECKED IN/.test(h.modalText()), h.modalText().slice(0, 80));
  });
})();
