/* Projector wall — tab 3 "Attendance" (secretariat view): checked in / expected, a progress bar, VIP vs Regular, who has not
 * arrived yet, and a per-club breakdown. Built from the roster feed only (it carries no email, and this view shows no names or PINs).
 */
(function () {
  const { check, sleep } = h;
  const row = (club, ticket, status, over) => Object.assign({ attendance_code: String(10000 + Math.floor(Math.random() * 80000)), full_name: 'Person ' + Math.random().toString(36).slice(2, 7), club_name: club, designation: 'Delegate', ticket_type: ticket, table_allocation: 'Table 1', checkin_status: status }, over || {});
  const IN = 'Checked-In', PEND = 'Pending', VIP = 'VIP Pass', REG = 'Regular Attendee';

  test('T1 headline numbers: checked in / expected, percentage, bar, VIP vs Regular, not yet arrived', async () => {
    const rows = [];
    rows.push(row('CCO', VIP, IN), row('CCO', VIP, PEND));                                   // VIP 1 / 2
    for (let i = 0; i < 3; i++) rows.push(row('CESA', REG, IN));                              // Regular 3 in ...
    for (let i = 0; i < 5; i++) rows.push(row('JCI', REG, PEND));                             // ... of 8
    h.setRoster(rows);
    h.key('3'); await sleep(400);
    const t = h.tele();
    check('T1 4 of 10', t.inn === '4' && t.all === '10', JSON.stringify(t));
    check('T1 40 percent', /40\s?%/.test(t.pct) && t.fill === '40%' && t.now === '40', t.pct + ' | ' + t.fill + ' | ' + t.now);
    check('T1 VIP 1 / 2', /1\s*\/\s*2/.test(t.vip) && /VIP/i.test(t.vip), t.vip);
    check('T1 Regular 3 / 8', /3\s*\/\s*8/.test(t.reg) && /Regular/i.test(t.reg), t.reg);
    check('T1 6 not yet arrived', document.querySelector('#telePending .v').textContent.trim() === '6' && /not yet/i.test(t.pending), t.pending);
  });

  test('T2 per-club breakdown: alphabetical, x / y each, club-less last', async () => {
    h.setRoster([row('jci', REG, IN), row('JCI', REG, PEND), row('CESA', REG, IN), row('CESA', REG, IN), row('ALAS', REG, PEND), row('ZETA', REG, IN), row('', REG, IN), row(null, REG, PEND)]);
    h.key('3'); await sleep(400);
    const c = h.tele().clubs;
    check('T2 order ALAS, CESA, JCI, ZETA, then no club last', c.map((x) => x.name.toLowerCase()).join('|') === 'alas|cesa|jci|zeta|no club listed', c.map((x) => x.name).join('|'));
    check('T2 counts', c.map((x) => x.count.replace(/\s/g, '')).join('|') === '0/1|2/2|1/2|1/1|1/2', c.map((x) => x.count).join('|'));
    check('T2 "jci" and "JCI" are one club', c.length === 5, String(c.length));
  });

  test('T3 an empty roster shows zeros, never NaN', async () => {
    h.setRoster([]);
    h.key('3'); await sleep(400);
    const t = h.tele();
    check('T3 0 of 0, 0%', t.inn === '0' && t.all === '0' && /^0\s?%$/.test(t.pct) && t.fill === '0%', JSON.stringify(t));
    check('T3 no NaN anywhere', !/NaN|undefined|Infinity/.test(t.text), t.text.slice(0, 120));
  });

  test('T4 opening the tab refreshes at once, and the figures follow new check-ins', async () => {
    h.setRoster([row('CESA', REG, IN), row('CESA', REG, PEND)]);
    h.key('3'); await sleep(400);
    check('T4 1 of 2', h.tele().inn === '1' && h.tele().all === '2', JSON.stringify(h.tele()));
    h.setRoster([row('CESA', REG, IN), row('CESA', REG, IN)]);
    h.key('1'); await sleep(100); h.key('3'); await sleep(400);
    check('T4 re-opening shows 2 of 2 without waiting for the timer', h.tele().inn === '2', h.tele().inn);
    h.setRoster([row('CESA', REG, IN), row('CESA', REG, IN), row('CESA', REG, PEND)]);
    await sleep(21000);
    check('T4 and the periodic refresh keeps it current', h.tele().all === '3', h.tele().all);
  });

  test('T5 a failed refresh keeps the last figures and says so; recovery clears it', async () => {
    h.setRoster([row('CESA', REG, IN), row('CESA', REG, PEND)]);
    h.key('3'); await sleep(400);
    h.setNetDown(true);
    h.key('1'); await sleep(100); h.key('3'); await sleep(400);
    const t = h.tele();
    check('T5 last good numbers still shown', t.inn === '1' && t.all === '2', JSON.stringify(t));
    check('T5 says the refresh failed', /could not refresh/i.test(t.status), t.status);
    h.setNetDown(false);
    h.key('1'); await sleep(100); h.key('3'); await sleep(400);
    check('T5 message clears after recovery', h.tele().status === '' || !/could not refresh/i.test(h.tele().status), h.tele().status);
  });

  test('T6 before the first answer it says loading, not zero', async () => {
    h.setNetDown(true);
    h.key('3'); await sleep(400);
    check('T6 no fake zeros', /loading|could not/i.test(h.tele().status) && !/^0$/.test(h.tele().all || ''), JSON.stringify(h.tele()));
  });

  test('T7 no names, PINs or emails on this view; hostile club text stays text', async () => {
    window.__pwned = 0;
    h.setRoster([row('<img src=x onerror="window.__pwned=1">', REG, IN, { full_name: 'Secret Person', attendance_code: '48213', email: 'secret@example.edu' })]);
    h.key('3'); await sleep(400);
    const t = h.tele();
    check('T7 no name / PIN / email', !/Secret Person|48213|secret@example/.test(t.text), t.text.slice(0, 160));
    check('T7 nothing executed, nothing injected', window.__pwned === 0 && !document.querySelector('#teleClubs img'));
    check('T7 the club shows as literal text', /<img src=x/.test(t.clubs[0] && t.clubs[0].name), JSON.stringify(t.clubs[0]));
  });

  test('T8 the audience view never carries any of it', async () => {
    h.setRoster([row('CESA', REG, IN)]);
    h.key('3'); await sleep(400);
    h.key('1');
    check('T8 attendance hidden on Spotlight, no counts in the visible text', !h.viewShown('viewTelemetry') && !/attendance|not yet arrived|by club/i.test(document.body.innerText), JSON.stringify(document.body.innerText.slice(0, 160)));
  });
})();
