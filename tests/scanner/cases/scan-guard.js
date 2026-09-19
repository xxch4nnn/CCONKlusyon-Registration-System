/* BUG-001 / BUG-002 — one scan, one result; nothing new behind an open card.
 * Uses T.onScanSuccess directly (the guarded entry point) so these stay independent of the decode guard.
 */
(function () {
  const { T, check, sleep } = h;

  test('G1 slow reply + QR still in frame -> exactly one request, no duplicate card', async () => {
    h.setServer(h.sheetServer({ delay: 3500 }));
    T.onScanSuccess('11111'); await sleep(2200); T.onScanSuccess('11111'); await sleep(300); T.onScanSuccess('11111');
    await sleep(2500);
    check('G1 one request', h.codes().join() === '11111', h.codes().join());
    check('G1 CHECKED IN, never ALREADY', /CHECKED IN/.test(h.modalText()) && !/ALREADY/.test(h.modalText()), h.modalText().slice(0, 40));
  });

  test('G2 auto-dismissed card + same QR still in frame (inside 6 s cooldown) -> ignored', async () => {
    h.setServer(h.sheetServer({ delay: 300 }));
    T.onScanSuccess('11111'); await sleep(3000); // reply at 0.3 s, card auto-dismisses at ~2.8 s
    check('G2 card auto-dismissed', !h.modalOpen());
    T.onScanSuccess('11111'); await sleep(300);
    check('G2 same code inside cooldown ignored', h.codes().length === 1, h.codes().join());
  });

  test('G3 same code after the cooldown is allowed and the server flags it DUPLICATE', async () => {
    h.setServer(h.sheetServer({ delay: 300 }));
    T.onScanSuccess('11111'); await sleep(7000);
    T.onScanSuccess('11111'); await sleep(1500);
    check('G3 two requests', h.codes().join() === '11111,11111', h.codes().join());
    check('G3 amber duplicate card', /ALREADY CHECKED IN/.test(h.modalText()), h.modalText().slice(0, 40));
  });

  test('G4 different code while a check-in is in flight (normal mode) -> ignored', async () => {
    h.setServer(h.sheetServer({ delay: 3000 }));
    T.onScanSuccess('22222'); await sleep(2100);
    T.onScanSuccess('33333'); await sleep(100);
    check('G4 only the first code sent', h.codes().join() === '22222', h.codes().join());
    await sleep(2500);
  });

  test('G5 fast mode: a different code goes through, a repeat of the same code does not', async () => {
    h.setFast(true);
    h.setServer(h.sheetServer({ delay: 3000 }));
    T.onScanSuccess('44444'); await sleep(2100);
    T.onScanSuccess('55555'); await sleep(100);
    T.onScanSuccess('55555'); await sleep(100);
    check('G5 44444 then 55555 once', h.codes().join() === '44444,55555', h.codes().join());
    await sleep(3500);
  });

  test('G6 fast mode + card open + same code -> no second request', async () => {
    h.setFast(true);
    h.setServer(h.sheetServer({ delay: 300 }));
    T.onScanSuccess('66666'); await sleep(1500);
    T.onScanSuccess('66666'); await sleep(500);
    check('G6 one request', h.codes().join() === '66666', h.codes().join());
  });

  test('G7 fast mode is per-session (never written to storage)', async () => {
    h.setFast(true);
    check('G7 not persisted', !/"continuous":true/.test(localStorage.getItem('cco_scanner_settings') || ''));
  });

  test('G8 card open (normal mode, auto-dismiss off) -> a different code is ignored', async () => {
    T.settings.autoDismiss = false;
    h.setServer(h.sheetServer({ delay: 300 }));
    T.onScanSuccess('77777'); await sleep(3000); // freeze over, card still open
    check('G8 card is open', h.modalOpen());
    T.onScanSuccess('88888'); await sleep(300);
    check('G8 second code ignored', h.codes().join() === '77777', h.codes().join());
  });
})();
