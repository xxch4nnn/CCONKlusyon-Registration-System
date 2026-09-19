/* Projector wall — one card per person, correct after re-check-ins, and never a blank wall after a refresh. */
(function () {
  const { check, sleep, cards, names, person, h: _h } = { ...h, h };
  const T0 = '2026-10-02T12:00:00+08:00';
  const at = (min) => new Date(Date.parse(T0) + min * 60000).toISOString().replace('.000Z', '+00:00'); // always a parseable ISO string

  test('W1 identical polls never create duplicate cards', async () => {
    h.setPeople([person('Ana Reyes', 'CESA', '2026-10-02T12:00:00+08:00'), person('Ben Cruz', 'JCI', '2026-10-02T12:01:00+08:00'), person('Cy Diaz', 'ALAS', '2026-10-02T12:02:00+08:00')]);
    await h.poll();
    check('W1 3 people -> 3 cards', cards().length === 3, names().join(' | '));
    for (let i = 0; i < 8; i++) await h.poll();
    check('W1 still 3 cards after 8 more polls', cards().length === 3 && new Set(names()).size === 3, names().join(' | '));
  });

  test('W2 same instant in a different timestamp format is still one card', async () => {
    h.setPeople([person('Ana Reyes', 'CESA', '2026-10-02T12:00:00+08:00')]);
    await h.poll();
    h.setPeople([person('Ana Reyes', 'CESA', '2026-10-02T04:00:00.000Z')]); // same instant, written as UTC by the sheet
    await h.poll(); await h.poll();
    check('W2 one card for Ana', names().filter((n) => n === 'Ana Reyes').length === 1, names().join(' | '));
  });

  test('W3 a person reset and checked in again shows once, as the newest arrival', async () => {
    h.setPeople([person('Ana Reyes', 'CESA', '2026-10-02T12:00:00+08:00'), person('Ben Cruz', 'JCI', '2026-10-02T12:01:00+08:00')]);
    await h.poll();
    // sheet row reset, then Ana checks in again 10 minutes later
    h.setPeople([person('Ben Cruz', 'JCI', '2026-10-02T12:01:00+08:00'), person('Ana Reyes', 'CESA', '2026-10-02T12:10:00+08:00')]);
    await h.poll(); await h.poll();
    const n = names();
    check('W3 Ana appears exactly once', n.filter((x) => x === 'Ana Reyes').length === 1, n.join(' | '));
    check('W3 total 2 cards', cards().length === 2, n.join(' | '));
    check('W3 Ana is now first (newest)', n[0] === 'Ana Reyes', n.join(' | '));
  });

  test('W4 a row that was reset (no longer checked in) disappears at the next full refresh', async () => {
    h.setPeople([person('Ana Reyes', 'CESA', '2026-10-02T12:00:00+08:00'), person('Ben Cruz', 'JCI', '2026-10-02T12:01:00+08:00')]);
    await h.poll();
    check('W4 both shown first', cards().length === 2);
    h.setPeople([person('Ben Cruz', 'JCI', '2026-10-02T12:01:00+08:00')]); // Ana reset to Pending in the sheet
    await h.poll(true); // > 60 s: a full snapshot is fetched and treated as authoritative
    check('W4 only Ben remains', names().join('|') === 'Ben Cruz', names().join(' | '));
  });

  test('W5 two different people with the same name are two cards', async () => {
    h.setPeople([person('Alex Lim', 'CESA', '2026-10-02T12:00:00+08:00'), person('Alex Lim', 'ALAS', '2026-10-02T12:01:00+08:00')]);
    await h.poll();
    check('W5 both Alex Lims shown', cards().length === 2, names().join(' | '));
  });

  test('W6 an arrival that is new appears once and the counter follows the sheet', async () => {
    h.setPeople([person('Ana Reyes', 'CESA', '2026-10-02T12:00:00+08:00')]);
    await h.poll();
    h.setPeople(h.getPeople().concat([person('Ben Cruz', 'JCI', '2026-10-02T12:05:00+08:00')]));
    await h.poll();
    check('W6 2 cards', cards().length === 2, names().join(' | '));
    await sleep(21000); // roster refresh (20 s)
    check('W6 counter shows 2', h.count() === '2', 'count=' + h.count());
  });

  test('W7 a failed poll keeps the wall; recovery does not duplicate', async () => {
    h.setPeople([person('Ana Reyes', 'CESA', '2026-10-02T12:00:00+08:00'), person('Ben Cruz', 'JCI', '2026-10-02T12:01:00+08:00')]);
    await h.poll();
    h.setNetDown(true);
    await sleep(30000);
    check('W7 cards kept while offline', cards().length === 2, names().join(' | '));
    check('W7 "Reconnecting" shown', /Reconnecting/.test(document.getElementById('liveText').textContent));
    h.setNetDown(false);
    await sleep(30000);
    check('W7 recovered with no duplicates', cards().length === 2 && /Live/.test(document.getElementById('liveText').textContent), names().join(' | '));
  });

  test('W8 refreshing the page restores the wall instantly from this tab\'s memory', async () => {
    h.setPeople([person('Ana Reyes', 'CESA', '2026-10-02T12:00:00+08:00'), person('Ben Cruz', 'JCI', '2026-10-02T12:01:00+08:00'), person('Cy Diaz', 'ALAS', '2026-10-02T12:02:00+08:00')]);
    await h.poll();
    check('W8 wall has 3 before reload', cards().length === 3);
    const f = document.createElement('iframe'); f.style.cssText = 'width:900px;height:600px';
    f.src = location.pathname + '?slow'; // this "reload" gets no server answer for 5 s
    document.body.appendChild(f);
    await new Promise((r) => { f.onload = r; });
    await sleep(500);
    const d = f.contentDocument;
    const n = Array.from(d.querySelectorAll('#hero .card .name, #grid .card .name')).map((x) => x.textContent);
    check('W8 restored 3 cards before the server answered', n.length === 3, n.join(' | ') + ' | empty=' + (d.getElementById('empty').hidden ? 'hidden' : d.getElementById('empty').textContent.trim().slice(0, 30)));
    f.remove();
  });

  test('W9 a reload with nothing saved says "Loading", not "welcome, nobody here"', async () => {
    h.setPeople([person('Ana Reyes', 'CESA', '2026-10-02T12:00:00+08:00')]);
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    const f = document.createElement('iframe'); f.style.cssText = 'width:900px;height:600px';
    f.src = location.pathname + '?slow';
    document.body.appendChild(f);
    await new Promise((r) => { f.onload = r; });
    await sleep(500);
    const d = f.contentDocument;
    const txt = d.getElementById('empty').hidden ? '' : d.getElementById('empty').textContent.replace(/\s+/g, ' ');
    check('W9 shows a loading message while the first answer is pending', /loading/i.test(txt), JSON.stringify(txt.slice(0, 80)));
    f.remove();
  });
})();
