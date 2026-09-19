/* BUG-005 — "Unknown action." / bad replies: silent GET retry, offline fallback, sync behaviour. */
(function () {
  const { T, check, sleep, json, html, unk, ok, dup } = h;
  const dev = () => T.deviceId;
  const resolve = (r) => Promise.resolve(r);

  test('R1 normal POST success', async () => {
    h.setServer(() => resolve(ok()));
    await T.submitCheckin('11111');
    check('R1 CHECKED IN, one call, queue empty', /CHECKED IN/.test(h.modalText()) && h.calls.length === 1 && T.readQueue().length === 0);
  });

  test('R2 "Unknown action." on POST -> silent GET retry -> success', async () => {
    h.setServer((rec) => resolve(rec.method === 'POST' ? unk() : ok()));
    await T.submitCheckin('11111');
    check('R2 success card, no raw error, POST then GET', /CHECKED IN/.test(h.modalText()) && !/Unknown action/i.test(h.modalText()) && h.calls.map((c) => c.method).join() === 'POST,GET');
  });

  test('R3 lost reply + own earlier write -> shown as success, not duplicate', async () => {
    h.setServer((rec) => resolve(rec.method === 'POST' ? html() : dup(dev(), new Date().toISOString())));
    await T.submitCheckin('11111');
    check('R3 CHECKED IN, not ALREADY', /CHECKED IN/.test(h.modalText()) && !/ALREADY/.test(h.modalText()), h.modalText().slice(0, 50));
  });

  test('R4 HTML reply -> retry -> success', async () => {
    h.setServer((rec) => resolve(rec.method === 'POST' ? html() : ok()));
    await T.submitCheckin('11111');
    check('R4 CHECKED IN after 2 calls', /CHECKED IN/.test(h.modalText()) && h.calls.length === 2);
  });

  test('R5 both attempts fail -> saved offline, raw error never shown', async () => {
    h.setServer(() => resolve(unk()));
    await T.submitCheckin('11111');
    check('R5 queued once, friendly card', T.readQueue().length === 1 && !/Unknown action/i.test(h.modalText()) && /QUEUED|NOT CONFIRMED/.test(h.modalText()), h.modalText().slice(0, 60));
  });

  test('R6 real network failure -> queued, no retry', async () => {
    h.setServer(null);
    await T.submitCheckin('11111');
    check('R6 queued, one attempt', T.readQueue().length === 1 && h.codes().length === 1 && /OFFLINE|QUEUED/.test(h.modalText()));
  });

  test('R7 genuine duplicate is left alone', async () => {
    h.setServer(() => resolve(dup('someone-else', '2026-10-02T12:00:00+08:00')));
    await T.submitCheckin('11111');
    check('R7 amber duplicate, single request', /ALREADY CHECKED IN/.test(h.modalText()) && h.calls.length === 1);
  });

  test('R8 ambiguous first attempt + duplicate written by another device -> stays DUPLICATE', async () => {
    h.setServer((rec) => resolve(rec.method === 'POST' ? html() : dup('other-device', new Date().toISOString())));
    await T.submitCheckin('11111');
    check('R8 ALREADY CHECKED IN', /ALREADY CHECKED IN/.test(h.modalText()));
  });

  test('R9 ambiguous + older server (no checked_in_by) -> stays DUPLICATE (safe default)', async () => {
    h.setServer((rec) => resolve(rec.method === 'POST' ? html() : dup(undefined, new Date().toISOString())));
    await T.submitCheckin('11111');
    check('R9 ALREADY CHECKED IN', /ALREADY CHECKED IN/.test(h.modalText()));
  });

  test('R10 "System busy" -> retried', async () => {
    h.setServer((rec) => resolve(rec.method === 'POST' ? json({ status: 'ERROR', message: 'System busy, retry shortly.' }) : ok()));
    await T.submitCheckin('11111');
    check('R10 CHECKED IN after retry', /CHECKED IN/.test(h.modalText()) && h.calls.length === 2);
  });

  test('R11 sync: bulk POST unusable -> per-item GET fallback keeps only unconfirmed', async () => {
    T.writeQueue([{ attendance_code: 'A', device_id: dev() }, { attendance_code: 'B', device_id: dev() }, { attendance_code: 'C', device_id: dev() }]);
    h.setServer((rec) => {
      if (rec.method === 'POST') return resolve(unk());
      if (rec.code === 'A') return resolve(ok());
      if (rec.code === 'B') return resolve(dup(dev()));
      return resolve(unk());
    });
    const flushed = await T.trySyncOfflineQueue();
    const left = T.readQueue();
    check('R11 A,B confirmed; C kept', flushed === 2 && left.length === 1 && left[0].attendance_code === 'C', 'flushed=' + flushed + ' left=' + JSON.stringify(left.map((x) => x.attendance_code)));
  });

  test('R12 bulk sync keeps items the server errored on', async () => {
    T.writeQueue([{ attendance_code: 'A', device_id: dev() }, { attendance_code: 'B', device_id: dev() }]);
    h.setServer(() => resolve(json({ status: 'SUCCESS', results: [{ status: 'SUCCESS' }, { status: 'ERROR', message: 'System busy, retry shortly.' }] })));
    await T.trySyncOfflineQueue();
    const l = T.readQueue();
    check('R12 only B remains', l.length === 1 && l[0].attendance_code === 'B');
  });

  test('R13 a scan queued while a sync is in flight survives', async () => {
    T.writeQueue([{ attendance_code: 'A', device_id: dev() }]);
    let release;
    h.setServer(() => new Promise((res) => { release = () => res(json({ status: 'SUCCESS', results: [{ status: 'SUCCESS' }] })); }));
    const p = T.trySyncOfflineQueue();
    await sleep(20);
    T.queueOffline({ attendance_code: 'NEW', device_id: dev() });
    release(); await p;
    const l = T.readQueue();
    check('R13 NEW kept', l.length === 1 && l[0].attendance_code === 'NEW', JSON.stringify(l.map((x) => x.attendance_code)));
  });

  test('R14 POST timeout -> GET retry -> success', async () => {
    h.setServer((rec, init) => rec.method === 'POST'
      ? new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
      : resolve(ok()));
    await T.submitCheckin('11111');
    check('R14 CHECKED IN via POST,GET', /CHECKED IN/.test(h.modalText()) && h.calls.map((c) => c.method).join() === 'POST,GET');
  });

  test('R15 connection log records requests, redacts keys, holds no attendee data', async () => {
    h.setServer(() => resolve(ok()));
    await T.submitCheckin('11111');
    const log = JSON.stringify(T.readDiag());
    check('R15 has entries', T.readDiag().length > 0);
    check('R15 no names / secret keys', !/Sample Person/.test(log) && !/SECRET/.test(log));
  });
})();
