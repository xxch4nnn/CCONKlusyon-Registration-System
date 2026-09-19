/* BUG-003 / BUG-004 — phantom pop-ups and alerts with no real pass in view.
 * The scanner must only ever check someone in for a stable, well-formed 5-digit pass code
 * (10000-99999, optionally "CCO-" prefixed). Anything else must be ignored without a card, flash or sound.
 * Numbers below are hard-coded on purpose: 2 identical decodes within 1.2 s = "stable".
 */
(function () {
  const { T, check, sleep } = h;
  const $ = (id) => document.getElementById(id);

  test('D0 parsePassCode corpus (hard-coded accept/reject list)', async () => {
    const P = T.parsePassCode;
    check('D0 parsePassCode exists', typeof P === 'function');
    if (typeof P !== 'function') return;
    const accept = [
      ['48201', '48201'], [' 48201 ', '48201'], ['48201\n', '48201'], ['\t48201', '48201'],
      ['CCO-48201', '48201'], ['cco-48201', '48201'], ['10000', '10000'], ['99999', '99999'], ['12345', '12345']
    ];
    accept.forEach(([input, want]) => check('D0 accepts ' + JSON.stringify(input), P(input) === want, 'got ' + JSON.stringify(P(input))));
    const reject = [
      null, undefined, '', ' ', '\n', 'abc', 'hello world', '1234', '123456', '12 345', '12345 67890', '12345\n67890',
      '00000', '09999', '01234', '４８２０１', '48201.0', '+48201', '-48201', '4820l', 'CCO48201', 'CCO-4820', 'CCO-482011',
      'https://example.com/48201', '48201?x=1', '{"code":"48201"}', '\u0000 48201', 'x'.repeat(5000), '48201'.repeat(1000),
      '😀😀😀😀😀', '<script>alert(1)<\/script>', "12345' OR '1'='1", 'WIFI:S:home;T:WPA;P:12345;;', 'BEGIN:VCARD', '0123456789012'
    ];
    reject.forEach((input, i) => check('D0 rejects #' + i + ' ' + JSON.stringify(String(input).slice(0, 24)), P(input) === null, 'got ' + JSON.stringify(P(input))));
  });

  test('D1 a one-off garbage decode does nothing', async () => {
    h.setServer(h.sheetServer());
    h.feed('xk#9!');
    await sleep(2500);
    check('D1 no request', h.calls.length === 0, h.codes().join());
    check('D1 no card', !h.modalOpen());
    check('D1 no toast', h.toastText() === '');
  });

  test('D2 a burst of 60 different noise decodes does nothing', async () => {
    h.setServer(h.sheetServer());
    for (let i = 0; i < 60; i++) { h.feed('noise-' + i); await sleep(50); }
    await sleep(2500);
    check('D2 no request', h.calls.length === 0, h.codes().slice(0, 3).join());
    check('D2 no card', !h.modalOpen());
    check('D2 no toast', h.toastText() === '');
    check('D2 flash not shown', !$('flash').classList.contains('show'));
  });

  test('D3 a stable non-pass QR (e.g. a URL) is ignored with one quiet hint', async () => {
    h.setServer(h.sheetServer());
    await h.frames('https://example.com/menu', 5, 100);
    check('D3 no request', h.calls.length === 0, h.codes().join());
    check('D3 no card', !h.modalOpen());
    check('D3 hint toast shown', /not a CCOnklusyon pass/i.test(h.toastText()), JSON.stringify(h.toastText()));
    await h.frames('https://example.com/menu', 30, 100); // keeps being held in view for ~3 s
    const notes = T.readDiag().filter((e) => e.outcome === 'NOT-A-PASS');
    check('D3 logged once, not once per frame', notes.length === 1, 'entries=' + notes.length);
    check('D3 still no request/card', h.calls.length === 0 && !h.modalOpen());
  });

  test('D4 a single valid-looking frame is not enough', async () => {
    h.setServer(h.sheetServer());
    h.feed('48201');
    await sleep(2500);
    check('D4 no request from one frame', h.calls.length === 0, h.codes().join());
  });

  test('D5 a stable valid pass checks in exactly once', async () => {
    h.setServer(h.sheetServer({ delay: 300 }));
    await h.frames('48201', 8, 100);
    await sleep(1500);
    check('D5 exactly one request for 48201', h.codes().join() === '48201', h.codes().join());
    check('D5 shows CHECKED IN', /CHECKED IN/.test(h.modalText()), h.modalText().slice(0, 40));
  });

  test('D6 valid decodes more than 1.2 s apart never become stable', async () => {
    h.setServer(h.sheetServer());
    h.feed('48201'); await sleep(1500);
    h.feed('48201'); await sleep(1500);
    h.feed('48201'); await sleep(1500);
    check('D6 no request', h.calls.length === 0, h.codes().join());
  });

  test('D7 two passes flickering frame-by-frame never become stable; the steady one then scans', async () => {
    h.setServer(h.sheetServer({ delay: 200 }));
    for (let i = 0; i < 10; i++) { h.feed(i % 2 ? '48201' : '48202'); await sleep(100); }
    check('D7 no request while flickering', h.calls.length === 0, h.codes().join());
    await h.frames('48202', 4, 100);
    await sleep(1000);
    check('D7 steady pass scans once', h.codes().join() === '48202', h.codes().join());
  });

  test('D8 "CCO-" prefixed payload is normalised to the bare code', async () => {
    h.setServer(h.sheetServer({ delay: 100 }));
    await h.frames('CCO-48201', 5, 100);
    await sleep(800);
    check('D8 request carries the bare 5-digit code', h.codes().join() === '48201', h.codes().join());
  });

  test('D9 noise never blocks the next real scan', async () => {
    h.setServer(h.sheetServer({ delay: 100 }));
    for (let i = 0; i < 6; i++) { h.feed('junk' + i); await sleep(60); }
    await h.frames('48201', 4, 100);
    await sleep(800);
    check('D9 real pass scanned right after noise', h.codes().join() === '48201' && /CHECKED IN/.test(h.modalText()), h.codes().join() + ' | ' + h.modalText().slice(0, 30));
  });

  test('D10 manual entry is unaffected (server decides, even for odd PINs)', async () => {
    h.setServer(h.sheetServer({ known: ['48201'] }));
    $('manualCode').value = '04321';
    $('manualSubmit').click();
    await sleep(500);
    check('D10 manual PIN sent to the server', h.codes().join() === '04321', h.codes().join());
    check('D10 server verdict shown', /NOT FOUND/i.test(h.modalText()), h.modalText().slice(0, 40));
  });

  test('D11 idle for 60 s: no request, no card, no toast, no flash', async () => {
    h.setServer(h.sheetServer());
    await sleep(60000);
    check('D11 no requests', h.calls.length === 0, h.calls.map((c) => c.action).join());
    check('D11 no card', !h.modalOpen());
    check('D11 no toast', h.toastText() === '');
    check('D11 no flash', !$('flash').classList.contains('show'));
  });

  test('D12 background sync of queued scans is silent (no card, no toast)', async () => {
    T.writeQueue([{ action: 'checkin', attendance_code: '48201', device_id: T.deviceId }]);
    h.setServer((rec) => h.later(200, rec.action === 'sync'
      ? h.json({ status: 'SUCCESS', results: [{ status: 'SUCCESS' }] })
      : h.json({ status: 'ERROR', message: 'unexpected' })));
    await sleep(20000);
    check('D12 queue flushed', T.readQueue().length === 0, 'left=' + T.readQueue().length);
    check('D12 no card while syncing', !h.modalOpen());
  });
})();
