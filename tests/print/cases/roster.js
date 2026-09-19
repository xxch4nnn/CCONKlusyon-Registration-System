/* Paper failsafe roster (D-6, task 7.3.2): alphabetical by club, PIN + seat per person, safe to print. */
(function () {
  const { check, row, cellText } = h;

  test('P1 sorted by club (case-insensitive), then by name; one heading per club', async () => {
    h.setRows([
      row(11111, 'Zed Zamora', 'jci'),
      row(22222, 'Ana Reyes', 'CESA'),
      row(33333, 'Ben Cruz', 'CESA'),
      row(44444, 'Cy Diaz', 'ALAS'),
      row(55555, 'Abe Lim', 'JCI')
    ]);
    await h.load();
    check('P1 group order ALAS | CESA | JCI', h.groups().join(' | ').toLowerCase() === 'alas | cesa | jci', h.groups().join(' | '));
    check('P1 names in club then name order', h.names().join(' | ') === 'Cy Diaz | Ana Reyes | Ben Cruz | Abe Lim | Zed Zamora', h.names().join(' | '));
    check('P1 each club heading appears once', new Set(h.groups()).size === h.groups().length && h.groups().length === 3);
  });

  test('P2 every person shows their exact 5-digit PIN', async () => {
    h.setRows([row(48201, 'Ana Reyes', 'CESA'), row(73819, 'Ben Cruz', 'CESA')]);
    await h.load();
    check('P2 PINs verbatim', h.pins().join(',') === '48201,73819', h.pins().join(','));
    check('P2 one row per person', h.dataRows().length === 2);
  });

  test('P3 seat 0 / blank shows a dash, real seats are kept', async () => {
    h.setRows([
      row(10001, 'A One', 'X', { table_allocation: 0 }),
      row(10002, 'B Two', 'X', { table_allocation: '0' }),
      row(10003, 'C Three', 'X', { table_allocation: '' }),
      row(10004, 'D Four', 'X', { table_allocation: 'Table 5' }),
      row(10005, 'E Five', 'X', { table_allocation: 'VIP Table 01' })
    ]);
    await h.load();
    check('P3 seats', h.seats().join('|') === '—|—|—|Table 5|VIP Table 01', h.seats().join('|'));
  });

  test('P4 people with no club are grouped last, under a clear heading', async () => {
    h.setRows([row(10001, 'No Club', ''), row(10002, 'Has Club', 'CESA'), row(10003, 'Null Club', null)]);
    await h.load();
    check('P4 CESA first, no-club last', h.groups().length === 2 && /CESA/i.test(h.groups()[0]) && /no club/i.test(h.groups()[1]), h.groups().join(' | '));
    check('P4 both club-less people are under the last heading', h.names().slice(1).sort().join('|') === 'No Club|Null Club', h.names().join('|'));
  });

  test('P5 hostile text is shown as text, never as markup', async () => {
    window.__pwned = 0;
    h.setRows([row(10001, '<img src=x onerror="window.__pwned=1">', '<b>Bold</b> Club', { designation: '<script>window.__pwned=2<\/script>' })]);
    await h.load();
    check('P5 nothing executed', window.__pwned === 0, 'pwned=' + window.__pwned);
    check('P5 no injected elements in the sheet', !document.querySelector('#sheet img, #sheet b, #sheet script'));
    check('P5 the literal text is visible', /<img src=x/.test(h.names()[0]), h.names()[0]);
  });

  test('P6 a failed load says so, and Retry recovers', async () => {
    h.setRows([row(10001, 'Ana Reyes', 'CESA')]);
    h.setMode('down');
    await h.load();
    check('P6 error shown, no rows', /could not|failed|unable/i.test(h.status()) && h.dataRows().length === 0, h.status());
    h.setMode('ok');
    document.getElementById('retry').click();
    await h.sleep(200);
    check('P6 retry recovered', h.dataRows().length === 1 && h.names()[0] === 'Ana Reyes', h.names().join('|'));
  });

  test('P7 an ERROR reply (e.g. an old deployment) is reported, not printed as empty', async () => {
    h.setMode('error');
    await h.load();
    check('P7 error shown', /could not|failed|unable/i.test(h.status()) && h.dataRows().length === 0, h.status());
  });

  test('P8 an empty roster is called out so a blank page is never printed unknowingly', async () => {
    h.setRows([]);
    await h.load();
    check('P8 says there is nobody to print', /no attendees|empty/i.test(h.status()) && h.dataRows().length === 0, h.status());
  });

  test('P9 summary counts total, VIP and Regular; generated time is shown', async () => {
    h.setRows([row(10001, 'A', 'X', { ticket_type: 'VIP Pass' }), row(10002, 'B', 'X'), row(10003, 'C', 'Y')]);
    await h.load();
    check('P9 summary', /3 attendees/.test(h.summary()) && /1 VIP/.test(h.summary()) && /2 Regular/.test(h.summary()), h.summary());
    check('P9 generated time present', /Printed|Generated/i.test(cellText(document.getElementById('stamp'))) && /\d/.test(cellText(document.getElementById('stamp'))));
  });

  test('P10 VIPs are marked in words (paper is monochrome), not just by colour', async () => {
    h.setRows([row(10001, 'Dr Vip', 'CCO', { ticket_type: 'VIP Pass' }), row(10002, 'Reg Person', 'CCO')]);
    await h.load();
    const rows = h.dataRows();
    check('P10 VIP row carries the word VIP', /VIP/.test(cellText(rows[0].querySelector('.ticket'))), cellText(rows[0].querySelector('.ticket')));
    check('P10 regular row does not say VIP', !/VIP/.test(cellText(rows[1].querySelector('.ticket'))), cellText(rows[1].querySelector('.ticket')));
  });

  test('P11 fields the roster should not carry (email) never reach the page', async () => {
    h.setRows([row(10001, 'Ana Reyes', 'CESA', { email: 'ana.reyes@example.edu', org_classification: 'Secret Org' })]);
    await h.load();
    check('P11 no email in the DOM', !/example\.edu|@/.test(document.getElementById('sheet').textContent));
  });

  test('P12 each person has a blank tick box for the usher', async () => {
    h.setRows([row(10001, 'Ana Reyes', 'CESA'), row(10002, 'Ben Cruz', 'CESA')]);
    await h.load();
    check('P12 a .tick cell per person', h.dataRows().every((r) => r.querySelector('.tick')) && h.dataRows().length === 2);
    check('P12 tick cells start empty', h.dataRows().every((r) => cellText(r.querySelector('.tick')) === ''));
  });

  test('P13 print stylesheet keeps rows whole, repeats the header, and hides the toolbar', async () => {
    h.setRows([row(10001, 'Ana Reyes', 'CESA')]);
    await h.load();
    const thead = document.querySelector('#sheet thead');
    check('P13 header repeats on every page', getComputedStyle(thead).display === 'table-header-group');
    let printCss = '';
    Array.from(document.styleSheets).forEach((s) => { try { Array.from(s.cssRules).forEach((r) => { if (r.type === CSSRule.MEDIA_RULE && /print/.test(r.conditionText || r.media.mediaText)) printCss += r.cssText; }); } catch (e) { /* cross-origin sheet */ } });
    check('P13 has an @media print block', printCss.length > 0);
    check('P13 rows never split across pages', /break-inside:\s*avoid|page-break-inside:\s*avoid/.test(printCss));
    check('P13 toolbar hidden in print', /\.no-print|#toolbar/.test(printCss) && /display:\s*none/.test(printCss));
  });

  test('P14 it asks the server for the roster exactly once per load', async () => {
    h.setRows([row(10001, 'Ana Reyes', 'CESA')]);
    const before = h.calls().length;
    await h.load();
    const made = h.calls().slice(before);
    check('P14 one roster call', made.length === 1 && made[0] === 'roster', made.join(','));
  });
})();
