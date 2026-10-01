/* 2026-10-01 — honours on the result card (Lei Garland tokens, special tables, attendee type) and day-of integrity:
 * a pass this phone already checked in is flagged on the next offline scan, so nobody gets a second token.
 * Fictional data only. */
(function () {
  const { T, check, json } = h;
  const $ = (id) => document.getElementById(id);
  const resolve = (r) => Promise.resolve(r);
  const P = (extra) => Object.assign({ attendance_code: '48201', full_name: 'Sample Person', designation: 'Delegate', club_name: 'CESA', ticket_type: 'Regular Attendee', table_allocation: 'Table 4', checkin_status: 'Pending' }, extra || {});
  const seed = (a) => localStorage.setItem('cco_roster_cache', JSON.stringify({ byCode: { [a.attendance_code]: a }, syncedAt: new Date().toISOString() }));
  const cached = (code) => JSON.parse(localStorage.getItem('cco_roster_cache')).byCode[code];
  const success = (data) => () => resolve(json({ status: 'SUCCESS', message: 'ok', data: P(data) }));
  const card = () => $('resultModal').querySelector('.card');

  test('H1 a token holder: card says what to hand over, and waits for the usher', async () => {
    h.setServer(success({ token: 'Gold Lei', attendee_type: 'VVIP', ticket_type: 'VIP Pass', table_allocation: 'VVIP', special_table: true }));
    await T.submitCheckin('48201');
    const t = h.modalText();
    check('H1 CHECKED IN with the token', /CHECKED IN/.test(t) && /Hand over token/i.test(t) && /Gold Lei/.test(t), t.slice(0, 160));
    check('H1 tier bar shows the ticket and the attendee type', /VIP Pass · VVIP/.test(t), t.slice(0, 60));
    check('H1 no auto-dismiss on a token card', !card().querySelector('.dismiss-bar'));
    check('H1 the button confirms the hand-over', /Token handed over/.test(card().querySelector('button.close').textContent));
    check('H1 special table note too', /Special table — escort to VVIP/.test(t));
    check('H1 no emoji on the card', !/[\u{1F300}-\u{1FAFF}⭐⚠]/u.test(card().textContent), card().textContent.slice(0, 80));
  });

  test('H2 a Regular Attendee at a special table: escort note and the honour styling, still auto-dismisses', async () => {
    h.setServer(success({ table_allocation: "SL's", special_table: true, attendee_type: 'Student Leaders' }));
    await T.submitCheckin('48201');
    const t = h.modalText();
    check('H2 escort note', /Special table — escort to SL's/.test(t), t.slice(0, 160));
    check('H2 honour styling', card().classList.contains('honor'));
    check('H2 auto-dismiss kept', !T.settings.autoDismiss || !!card().querySelector('.dismiss-bar'));
    check('H2 no token block', !/Hand over token/i.test(t));
  });

  test('H3 a plain regular attendee: no honours, unchanged flow', async () => {
    h.setServer(success({}));
    await T.submitCheckin('48201');
    const t = h.modalText();
    check('H3 plain card', /CHECKED IN/.test(t) && !/token|Special table/i.test(t) && !card().classList.contains('honor'), t.slice(0, 120));
  });

  test('H4 "none" in the token cell shows no token', async () => {
    h.setServer(success({ token: 'none' }));
    await T.submitCheckin('48201');
    check('H4 no token block', !/Hand over token/i.test(h.modalText()));
  });

  test('H5 a duplicate scan of a token holder says the token is NOT to be given twice', async () => {
    h.setServer(() => resolve(json({ status: 'DUPLICATE', message: 'dup', data: P({ token: 'Ribbon', initial_checkin_timestamp: '2026-10-02T12:10:00+08:00', checked_in_by: 'other' }) })));
    await T.submitCheckin('48201');
    const t = h.modalText();
    check('H5 already checked in, token marked "do not give twice"', /ALREADY CHECKED IN/.test(t) && /do not give twice/i.test(t) && !/Hand over token/i.test(t), t.slice(0, 200));
  });

  test('H6 offline: the token shows from the cached roster, and a second offline scan is flagged', async () => {
    seed(P({ token: 'Blue & Gold Lei', ticket_type: 'VIP Pass', attendee_type: 'Former Adviser', table_allocation: 'VIP', special_table: true }));
    h.setServer(null); // no connection
    await T.submitCheckin('48201');
    let t = h.modalText();
    check('H6 first offline scan: queued, identity + token from the roster', /OFFLINE — QUEUED/.test(t) && /Hand over token/i.test(t) && /Blue & Gold Lei/.test(t) && /VIP Pass · Former Adviser/.test(t), t.slice(0, 200));
    check('H6 the phone marks them checked in right away', cached('48201').checkin_status === 'Checked-In');
    T.closeModal();
    await T.submitCheckin('48201');
    t = h.modalText();
    check('H6 second offline scan: MAY ALREADY BE CHECKED IN, no second token', /MAY ALREADY BE CHECKED IN/.test(t) && !/Hand over token/i.test(t) && /do not give twice/i.test(t), t.slice(0, 200));
    check('H6 both scans kept for sync (the server decides)', T.readQueue().length === 2);
  });

  test('H7 checked in online, then the connection drops: the next scan of that pass is flagged', async () => {
    seed(P({}));
    h.setServer(success({}));
    await T.submitCheckin('48201');
    T.closeModal();
    check('H7 confirmed check-in marks the cached roster', cached('48201').checkin_status === 'Checked-In');
    h.setServer(null);
    await T.submitCheckin('48201');
    check('H7 offline re-scan warns', /MAY ALREADY BE CHECKED IN/.test(h.modalText()), h.modalText().slice(0, 80));
  });

  test('H8 a roster refresh keeps passes still waiting in the queue marked as checked in', async () => {
    T.queueOffline({ action: 'checkin', attendance_code: '48201', device_id: 'X' });
    h.setRoster(() => resolve(json({ status: 'SUCCESS', attendees: [P({}), P({ attendance_code: '48202', full_name: 'Other Person' })] })));
    await T.fetchRoster();
    check('H8 queued pass stays Checked-In after refresh', cached('48201').checkin_status === 'Checked-In');
    check('H8 other passes follow the server', cached('48202').checkin_status === 'Pending');
  });
  test('H9 a voided (withdrawn) pass: red VOIDED card online, and offline from the cached roster, never queued', async () => {
    h.setServer(() => resolve(json({ status: 'NOT_FOUND', voided: true, message: 'This pass was VOIDED (withdrawn).', data: { attendance_code: '48201', full_name: 'Withdrawn Person', club_name: 'CESA' } })));
    await T.submitCheckin('48201');
    let t = h.modalText();
    check('H9 online: VOIDED — WITHDRAWN with the name', /VOIDED — WITHDRAWN/.test(t) && /Withdrawn Person/.test(t) && /Do not admit/.test(t), t.slice(0, 120));
    T.closeModal();
    h.setRoster(() => resolve(json({ status: 'SUCCESS', attendees: [P({ attendance_code: '48202', full_name: 'Other Person' })], voided: [{ attendance_code: '48201', full_name: 'Withdrawn Person', club_name: 'CESA' }] })));
    await T.fetchRoster();
    h.setServer(null);
    await T.submitCheckin('48201');
    t = h.modalText();
    check('H9 offline: still VOIDED, nothing queued', /VOIDED — WITHDRAWN/.test(t) && T.readQueue().length === 0, t.slice(0, 80) + ' q=' + T.readQueue().length);
    check('H9 voided pass is not in the name-search list', !cached('48201'));
  });
})();
