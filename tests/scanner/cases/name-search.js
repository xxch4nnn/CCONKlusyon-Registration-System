/* Name search (spec §1.2A / §1.4: a guest with a dead phone gives their name). The usher switches the manual panel from
 * "Code" to "Name", types a surname, picks the person from the cached roster, CONFIRMS, and the normal check-in runs. */
(function () {
  const { T, check, sleep, json, ok, dup } = h;
  const $ = (id) => document.getElementById(id);
  const resolve = (r) => Promise.resolve(r);

  const P = (code, name, club, extra) => Object.assign({ attendance_code: String(code), full_name: name, club_name: club || 'CESA', designation: 'Delegate', ticket_type: 'Regular Attendee', table_allocation: 'Table 1', checkin_status: 'Pending' }, extra || {});
  const seed = (list) => { const byCode = {}; list.forEach((a) => { byCode[a.attendance_code] = a; }); localStorage.setItem('cco_roster_cache', JSON.stringify({ byCode, syncedAt: new Date().toISOString() })); };
  const openName = () => { if ($('manualPanel').hidden) $('manualBtn').click(); if ($('manualCode').type !== 'text') $('modeToggle').click(); };
  const type = (v) => { const i = $('manualCode'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
  const rows = () => Array.from(document.querySelectorAll('#nameResults button.nr'));
  const names = () => rows().map((r) => r.querySelector('.n').textContent.trim());
  const listText = () => ($('nameResults').hidden ? '' : $('nameResults').textContent.replace(/\s+/g, ' ').trim());
  const confirmBox = () => document.getElementById('nameConfirm');

  test('N1 the panel has a Code / Name toggle; Code mode is unchanged', async () => {
    $('manualBtn').click();
    const c = $('manualCode');
    check('N1 default is the numeric code field', c.type === 'tel' && c.inputMode === 'numeric' && c.getAttribute('maxlength') === '5' && !$('manualSubmit').hidden && $('nameResults').hidden);
    $('modeToggle').click();
    check('N1 Name mode: text keyboard, no length limit, name placeholder, no Validate button', c.type === 'text' && c.inputMode === 'text' && !c.hasAttribute('maxlength') && /name/i.test(c.placeholder) && $('manualSubmit').hidden, c.type + '|' + c.placeholder);
    check('N1 toggle reports its state', $('modeToggle').getAttribute('aria-pressed') === 'true');
    type('abc');
    $('modeToggle').click();
    check('N1 back to Code mode: numeric again, cleared, results hidden', c.type === 'tel' && c.getAttribute('maxlength') === '5' && c.value === '' && $('nameResults').hidden && !$('manualSubmit').hidden);
  });

  test('N2 matches by any part of the name, case-insensitively, sorted; needs 2+ letters', async () => {
    seed([P(11111, 'Juan D. Dela Cruz'), P(22222, 'Ana Cruz'), P(33333, 'Ben Reyes'), P(44444, 'Cy Diaz-Cruz')]);
    openName();
    type('c');
    check('N2 one letter asks for more', rows().length === 0 && /keep typing/i.test(listText()), listText());
    type('CRU');
    check('N2 "CRU" finds the three Cruz-es, sorted by name', names().join('|') === 'Ana Cruz|Cy Diaz-Cruz|Juan D. Dela Cruz', names().join('|'));
    type('zzz');
    check('N2 no match says so', rows().length === 0 && /no match/i.test(listText()), listText());
    type('');
    check('N2 empty input shows nothing', $('nameResults').hidden);
  });

  test('N3 word-start matches rank first; multi-word, spacing, punctuation and accents all work', async () => {
    seed([P(11111, 'Abe Barcruz'), P(22222, 'Zed Cruz'), P(33333, 'Juan De La Cruz'), P(44444, 'Niño Reyes')]);
    openName();
    type('cruz');
    check('N3 "Cruz" as a word beats "Barcruz" even though B sorts first', names().slice(0, 2).join('|') === 'Juan De La Cruz|Zed Cruz' || names()[0] !== 'Abe Barcruz', names().join('|'));
    check('N3 ...and Barcruz still appears, last', names()[names().length - 1] === 'Abe Barcruz', names().join('|'));
    type('juan cruz');
    check('N3 two words in either part of the name', names().join('|') === 'Juan De La Cruz', names().join('|'));
    type('dela cruz');
    check('N3 "dela cruz" finds "De La Cruz"', names().join('|') === 'Juan De La Cruz', names().join('|'));
    type('nino');
    check('N3 accents are ignored ("nino" finds "Niño")', names().join('|') === 'Niño Reyes', names().join('|'));
    type('d. reyes');
    check('N3 stray punctuation and 1-letter words are ignored', names().join('|') === 'Niño Reyes', names().join('|'));
  });

  test('N4 tapping a name asks to confirm — nothing is sent yet; Back returns to the list', async () => {
    seed([P(11111, 'Ana Cruz', 'JCI', { designation: 'President', table_allocation: 'Table 7' }), P(22222, 'Ben Cruz')]);
    h.setServer(() => resolve(ok()));
    openName(); type('cruz');
    rows()[0].click();
    const c = confirmBox();
    check('N4 confirmation shows name, role, club and table', !!c && /Ana Cruz/.test(c.textContent) && /President/.test(c.textContent) && /JCI/.test(c.textContent) && /Table 7/.test(c.textContent), c && c.textContent.replace(/\s+/g, ' '));
    check('N4 no request has been made', h.calls.length === 0);
    document.getElementById('nameBack').click();
    check('N4 Back shows the list again, still nothing sent', rows().length === 2 && !confirmBox() && h.calls.length === 0);
  });

  test('N5 confirming runs the normal check-in for exactly that pass, then resets the panel', async () => {
    seed([P(11111, 'Ana Cruz'), P(22222, 'Ben Cruz')]);
    h.setServer(() => resolve(ok('22222')));
    openName(); type('ben');
    rows()[0].click();
    document.getElementById('nameGo').click();
    await sleep(400);
    check('N5 one check-in request, for Ben\'s code', h.codes().join() === '22222' && h.calls.length === 1, h.codes().join());
    check('N5 the usual result card appears', /CHECKED IN/.test(h.modalText()), h.modalText().slice(0, 60));
    check('N5 panel is cleared and ready for the next name', $('manualCode').value === '' && $('nameResults').hidden && !confirmBox());
  });

  test('N6 someone the roster shows as already checked in is flagged, and the server still decides', async () => {
    seed([P(11111, 'Ana Cruz', 'CESA', { checkin_status: 'Checked-In' })]);
    h.setServer(() => resolve(dup('other')));
    openName(); type('ana');
    check('N6 the row carries a "checked in" tag', /checked in/i.test(rows()[0].textContent), rows()[0].textContent);
    rows()[0].click();
    check('N6 the confirmation warns', /already/i.test(confirmBox().textContent), confirmBox().textContent);
    document.getElementById('nameGo').click();
    await sleep(400);
    check('N6 the server\'s duplicate card is shown', /ALREADY CHECKED IN/.test(h.modalText()), h.modalText().slice(0, 60));
  });

  test('N7 VIPs are marked in the list and the confirmation', async () => {
    seed([P(11111, 'Dr Vip', 'CCO', { ticket_type: 'VIP Pass' }), P(22222, 'Dr Regular', 'CCO')]);
    openName(); type('dr ');
    const vipRow = rows().filter((r) => /Dr Vip/.test(r.textContent))[0], regRow = rows().filter((r) => /Dr Regular/.test(r.textContent))[0];
    check('N7 VIP row is tagged, regular row is not', /VIP/.test(vipRow.textContent) && !/VIP/.test(regRow.textContent));
    vipRow.click();
    check('N7 confirmation says VIP', /VIP/.test(confirmBox().textContent));
  });

  test('N8 no roster on the phone yet: says how to get it', async () => {
    openName(); type('cruz');
    check('N8 guidance instead of an empty list', rows().length === 0 && /no roster/i.test(listText()) && /refresh/i.test(listText()), listText());
  });

  test('N9 shows at most 8 names and says how many more', async () => {
    const list = []; for (let i = 0; i < 12; i++) list.push(P(10000 + i, 'Guest ' + String(i).padStart(2, '0') + ' Cruz'));
    seed(list);
    openName(); type('cruz');
    check('N9 8 rows and a "4 more" note', rows().length === 8 && /4 more/i.test(listText()), rows().length + ' | ' + listText().slice(-60));
  });

  test('N10 names are shown as text, never as markup', async () => {
    window.__pwned = 0;
    seed([P(11111, '<img src=x onerror="window.__pwned=1"> Cruz', '<b>Club</b>')]);
    openName(); type('cruz');
    check('N10 nothing executed, nothing injected', window.__pwned === 0 && !document.querySelector('#nameResults img, #nameResults b'));
    check('N10 the literal text is visible', /<img src=x/.test(names()[0] || ''), names()[0]);
  });

  test('N11 offline: the pick still identifies the person and queues the scan', async () => {
    seed([P(11111, 'Ana Cruz', 'CESA', { ticket_type: 'VIP Pass' })]);
    h.setServer(null);
    openName(); type('ana');
    rows()[0].click();
    document.getElementById('nameGo').click();
    await sleep(400);
    check('N11 queued once, card names the person from the cache', T.readQueue().length === 1 && T.readQueue()[0].attendance_code === '11111' && /Ana Cruz/.test(h.modalText()), h.modalText().slice(0, 80));
  });

  test('N12 Code mode still checks in by PIN; Enter picks a single name', async () => {
    h.setServer(() => resolve(ok('11111')));
    $('manualBtn').click();
    $('manualCode').value = '11111'; $('manualSubmit').click();
    await sleep(300);
    check('N12 PIN check-in sent exactly once', h.codes().join() === '11111');
    T.closeModal();
    seed([P(11111, 'Ana Cruz'), P(22222, 'Ben Reyes')]);
    $('modeToggle').click(); type('reyes');
    $('manualCode').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check('N12 Enter with exactly one match opens its confirmation', !!confirmBox() && /Ben Reyes/.test(confirmBox().textContent), 'type=' + $('manualCode').type + ' value=' + $('manualCode').value + ' rows=' + rows().length + ' results=' + $('nameResults').textContent.slice(0, 60));
  });
})();
