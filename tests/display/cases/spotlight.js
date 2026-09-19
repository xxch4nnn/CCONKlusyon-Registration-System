/* Projector wall — two tabs: Spotlight (one attendee at a time) and Recent (everyone, newest first).
 * Rules under test (Stage 2 §6.5 / §11.2, trimmed to the two tabs): SHOWCASE_MODE 1|2|3, 5 s per spotlight (speeds up when
 * a queue builds), a card stays until 30 s of quiet, then the ambient welcome; people already checked in are never replayed.
 */
(function () {
  const { check, sleep, cards, person, D } = h;
  const at = (min) => '2026-10-02T12:' + String(min).padStart(2, '0') + ':00+08:00';
  const vip = (name, min, over) => person(name, 'CCO', at(min), Object.assign({ ticket_type: 'VIP Pass', designation: 'Organization Adviser' }, over || {}));

  test('S1 three tabs; Spotlight is the default; click and keys 1/2/3 switch', async () => {
    check('S1 exactly three tab buttons', document.querySelectorAll('.tabs button').length === 3);
    check('S1 Spotlight selected by default', h.selectedTab() === 'tabSpotlight', h.selectedTab());
    check('S1 spotlight visible, recent hidden', h.viewShown('viewSpotlight') && !h.viewShown('viewRecent'));
    document.getElementById('tabRecent').click();
    check('S1 click -> Recent selected and shown', h.selectedTab() === 'tabRecent' && h.viewShown('viewRecent') && !h.viewShown('viewSpotlight'), h.selectedTab());
    h.key('1');
    check('S1 key 1 -> Spotlight', h.selectedTab() === 'tabSpotlight' && h.viewShown('viewSpotlight'));
    h.key('2');
    check('S1 key 2 -> Recent', h.selectedTab() === 'tabRecent' && h.viewShown('viewRecent'));
    h.key('3');
    check('S1 key 3 -> Attendance', h.selectedTab() === 'tabTelemetry' && h.viewShown('viewTelemetry') && !h.viewShown('viewRecent') && !h.viewShown('viewSpotlight'), h.selectedTab());
    h.key('4');
    check('S1 key 4 does nothing', h.selectedTab() === 'tabTelemetry');
    h.key('1');
    check('S1 back to Spotlight hides Attendance', h.selectedTab() === 'tabSpotlight' && !h.viewShown('viewTelemetry'));
  });

  test('S2 people already checked in are never replayed; the stage shows the ambient welcome', async () => {
    D.ingest([person('Ana Reyes', 'CESA', at(0)), person('Ben Cruz', 'JCI', at(1))], false, true); // first load: silent
    check('S2 no spotlight card', h.spot() === null);
    check('S2 ambient shown: a formal welcome, no operator wording', h.ambientShown() && /welcome/i.test(h.ambientText()) && /CCOnklusyon 2026/.test(h.ambientText()) && !/next check-in|spotlight|press/i.test(h.ambientText()), h.ambientText());
    check('S2 both are on the Recent tab', cards().length === 2);
  });

  test('S3 a new arrival is spotlighted alone, with name, role, club and table', async () => {
    h.ingest([person('Ben Cruz', 'JCI', at(1), { designation: 'President', table_allocation: 'Table 5' })]);
    const s = h.spot();
    check('S3 one card, the arrival', s && s.count === 1 && s.name === 'Ben Cruz', JSON.stringify(s));
    check('S3 role, club and table shown', s && s.role === 'President' && s.club === 'JCI' && /Table 5/.test(s.table), JSON.stringify(s));
    check('S3 regular = blue delegate card', s && s.reg && !s.vip && /DELEGATE/.test(s.badge), JSON.stringify(s));
    check('S3 ambient hidden while a card is up', !h.ambientShown());
    await sleep(5200);
    h.ingest([vip('Dr Vip', 2, { table_allocation: 'VIP Table 01' })]);
    const v = h.spot();
    check('S3 VIP = gold card with VIP badge', v && v.name === 'Dr Vip' && v.vip && /VIP/.test(v.badge) && /VIP Table 01/.test(v.table), JSON.stringify(v));
  });

  test('S4 an unassigned table (0 / blank) shows no table line', async () => {
    h.ingest([person('Ana Reyes', 'CESA', at(0), { table_allocation: 0 })]);
    check('S4 no table text for 0', h.spot() && h.spot().table === '', JSON.stringify(h.spot()));
    await sleep(5200);
    h.ingest([person('Ben Cruz', 'JCI', at(1), { table_allocation: '' })]);
    check('S4 no table text for blank', h.spot() && h.spot().name === 'Ben Cruz' && h.spot().table === '', JSON.stringify(h.spot()));
  });

  test('S5 Mode 1 (VIP only): regulars skip the spotlight but still land on Recent', async () => {
    D.CONFIG.SHOWCASE_MODE = 1;
    h.ingest([person('Ana Reyes', 'CESA', at(0))]);
    check('S5 regular not spotlighted', h.spot() === null && h.ambientShown());
    check('S5 regular is on Recent', cards().length === 1);
    h.ingest([vip('Dr Vip', 1)]);
    check('S5 VIP is spotlighted', h.spot() && h.spot().name === 'Dr Vip');
  });

  test('S6 Mode 2: regular = typographic name card (no avatar); VIP without a photo = monogram', async () => {
    D.CONFIG.SHOWCASE_MODE = 2;
    h.ingest([person('Ana Reyes', 'CESA', at(0))]);
    const r = h.spot();
    check('S6 regular is typographic', r && r.typo && !r.svg && !r.img, JSON.stringify(r));
    await sleep(5200);
    h.ingest([vip('Dr Vip', 1)]);
    const v = h.spot();
    check('S6 VIP falls back to a monogram, not a hole', v && v.name === 'Dr Vip' && v.svg && !v.typo, JSON.stringify(v));
  });

  test('S7 Mode 3: regular gets a monogram avatar', async () => {
    D.CONFIG.SHOWCASE_MODE = 3;
    h.ingest([person('Ana Reyes', 'CESA', at(0))]);
    const r = h.spot();
    check('S7 regular has a monogram', r && r.svg && !r.typo, JSON.stringify(r));
  });

  test('S8 one at a time: a second arrival waits for the 5 s hold, then replaces the first', async () => {
    h.ingest([person('Ana Reyes', 'CESA', at(0))]);
    await sleep(1000);
    h.ingest([person('Ben Cruz', 'JCI', at(1))]);
    check('S8 still Ana at 1 s', h.spot().name === 'Ana Reyes');
    await sleep(3800);
    check('S8 still Ana at 4.8 s', h.spot().name === 'Ana Reyes', h.spot().name);
    await sleep(500);
    check('S8 Ben at 5.3 s', h.spot().name === 'Ben Cruz' && h.spot().count === 1, h.spot().name);
  });

  test('S9 a burst is shown oldest-first, none skipped, and speeds up when 3+ are waiting', async () => {
    // The server lists newest first; the wall must still spotlight them in the order they arrived.
    h.ingest([person('D Four', 'X', at(4)), person('C Three', 'X', at(3)), person('B Two', 'X', at(2)), person('A One', 'X', at(1))]);
    const seen = [];
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) { // virtual 25 s
      const s = h.spot(); const n = s ? s.name : '';
      if (n && seen[seen.length - 1] !== n) seen.push(n);
      await sleep(250);
    }
    check('S9 order A, B, C, D', seen.join(',') === 'A One,B Two,C Three,D Four', seen.join(','));
  });

  test('S10 a VIP jumps ahead of regulars that are waiting', async () => {
    h.ingest([person('Ana Reyes', 'CESA', at(0))]);
    await sleep(100);
    h.ingest([person('C Three', 'X', at(3)), person('B Two', 'X', at(2))]);
    h.ingest([vip('Dr Vip', 4)]);
    await sleep(5000);
    check('S10 VIP is next after the current card', h.spot().name === 'Dr Vip', h.spot().name);
  });

  test('S11 the last card stays until 30 s of quiet, then the ambient welcome returns', async () => {
    h.ingest([person('Ana Reyes', 'CESA', at(0))]);
    await sleep(29000);
    check('S11 still showing at 29 s', h.spot() && h.spot().name === 'Ana Reyes' && !h.ambientShown());
    await sleep(2500);
    check('S11 ambient at 31.5 s, no card', h.spot() === null && h.ambientShown());
  });

  test('S12 a flood cannot grow memory: one card in the DOM and a capped queue', async () => {
    const flood = [];
    for (let i = 0; i < 80; i++) flood.push(person('Guest ' + i, 'X', '2026-10-02T13:' + String(i % 60).padStart(2, '0') + ':00+08:00', { full_name: 'Guest ' + i }));
    h.ingest(flood);
    let maxCards = 0, maxQueue = 0;
    for (let i = 0; i < 40; i++) { const s = h.spot(); if (s) maxCards = Math.max(maxCards, s.count); maxQueue = Math.max(maxQueue, h.queueLen()); await sleep(500); }
    check('S12 never more than one spotlight card', maxCards === 1, 'max=' + maxCards);
    check('S12 queue stays within its cap', maxQueue <= D.CONFIG.SPOTLIGHT_QUEUE_MAX, 'max=' + maxQueue + ' cap=' + D.CONFIG.SPOTLIGHT_QUEUE_MAX);
    check('S12 everyone is still on the Recent tab', cards().length === 80, 'cards=' + cards().length);
  });

  test('S13 the audience view (tab 1) has no header, tab bar or operator wording; Recent keeps them', async () => {
    const shown = (el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
    check('S13 header hidden on Spotlight', !shown(document.querySelector('header')));
    check('S13 tab bar hidden on Spotlight', !shown(document.querySelector('.tabs')));
    check('S13 no operator wording with the welcome up', !/reconnecting|checked in|recent|spotlight|\blive\b|next check-in|press/i.test(document.body.innerText), JSON.stringify(document.body.innerText.slice(0, 200)));
    h.ingest([person('Ana Reyes', 'CESA', at(0))]);
    check('S13 no operator wording with a card up', !/reconnecting|checked in|recent|spotlight|\blive\b|next check-in|press/i.test(document.body.innerText), JSON.stringify(document.body.innerText.slice(0, 200)));
    document.getElementById('tabRecent').click();
    check('S13 header and tab bar are back on Recent', shown(document.querySelector('header')) && shown(document.querySelector('.tabs')));
    h.key('1');
    check('S13 gone again after key 1', !shown(document.querySelector('header')) && !shown(document.querySelector('.tabs')));
  });

  test('S14 a dropped connection shows the audience only a small dot (no words); it clears on recovery', async () => {
    await sleep(5000);
    const dot = document.getElementById('stageDot');
    check('S14 the dot exists and is hidden while live', !!dot && dot.hidden);
    if (!dot) return;
    h.setNetDown(true);
    await sleep(30000);
    check('S14 dot appears when polling fails', !dot.hidden);
    check('S14 no wording for the audience', !/reconnecting|offline|error|connection|live/i.test(document.body.innerText), JSON.stringify(document.body.innerText.slice(0, 200)));
    h.setNetDown(false);
    await sleep(30000);
    check('S14 dot clears after recovery', dot.hidden);
  });
})();
