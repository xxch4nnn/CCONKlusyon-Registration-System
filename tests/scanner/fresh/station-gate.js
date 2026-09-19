/* BUG-007 — the station name is mandatory, and it must actually appear on a first run.
 * This suite runs on a page load with NOTHING saved (a fresh install / cleared data). Order matters: F1 checks the
 * state straight after load, before anything has been entered.
 */
(function () {
  const { T, check, sleep } = h;
  const $ = (id) => document.getElementById(id);
  const gateOpen = () => !$('stationGate').hidden;
  const submitName = (v) => { $('stationInput').value = v; $('stationForm').requestSubmit(); };
  const tryNames = async (list) => {
    const out = [];
    for (const v of list) { submitName(v); await sleep(50); out.push([v, gateOpen()]); }
    return out;
  };

  test('F1 first run: the station gate is showing and the camera has not started', async () => {
    check('F1 gate visible on a fresh load', gateOpen());
    check('F1 nothing saved', !localStorage.getItem('cco_device_id'));
    check('F1 camera not started while unnamed', !window.__cameraStarted, 'started=' + window.__cameraStarted);
    check('F1 gate has a name field with focus available', !!$('stationInput'));
  });

  test('F2 no check-in can happen while the gate is open (camera decode, guarded path, manual entry)', async () => {
    h.setServer(h.sheetServer());
    await h.frames('48201', 6, 100);
    T.onScanSuccess('48202');
    $('manualCode').value = '48203';
    $('manualSubmit').click();
    await sleep(1500);
    check('F2 no request sent', h.calls.length === 0, h.codes().join());
    check('F2 no result card', !h.modalOpen());
    check('F2 gate still open', gateOpen());
  });

  test('F3 invalid station names are refused with a message and the gate stays', async () => {
    const bad = ['', '   ', 'A', 'x'.repeat(25), 'Unassigned-Station', 'unassigned-station', 'Unknown', 'N/A', '<b>x</b>', 'name;drop', '😀😀'];
    const res = await tryNames(bad);
    res.forEach(([v, open]) => check('F3 refuses ' + JSON.stringify(v.slice(0, 20)), open === true));
    check('F3 error message shown', !$('stationErr').hidden && $('stationErr').textContent.trim().length > 0);
    check('F3 nothing saved', !localStorage.getItem('cco_device_id'), localStorage.getItem('cco_device_id'));
    check('F3 camera still not started', !window.__cameraStarted);
  });

  test('F4 the gate cannot be dismissed without a name (Escape, outside click, Cancel absent)', async () => {
    $('stationGate').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    $('stationInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(100);
    check('F4 still open', gateOpen());
    check('F4 no Cancel offered on first run', $('stationCancel').hidden);
  });

  test('F5 a valid name is trimmed, saved, shown, starts the camera and is used on check-ins', async () => {
    submitName('   Entrance   1  ');
    await sleep(100);
    check('F5 gate closed', !gateOpen());
    check('F5 saved trimmed + single-spaced', localStorage.getItem('cco_device_id') === 'Entrance 1', JSON.stringify(localStorage.getItem('cco_device_id')));
    check('F5 label updated', $('stationLabel').textContent === 'Entrance 1', $('stationLabel').textContent);
    check('F5 camera started exactly once', window.__cameraStarted === 1, 'started=' + window.__cameraStarted);
    check('F5 deviceId set', T.deviceId === 'Entrance 1', T.deviceId);
    h.setServer(h.sheetServer({ delay: 100 }));
    await T.submitCheckin('48201');
    check('F5 check-in carries the station as device_id', h.calls.length === 1 && h.calls[0].body && h.calls[0].body.device_id === 'Entrance 1', JSON.stringify(h.calls[0] && h.calls[0].body));
  });

  test('F6 accepted name shapes', async () => {
    for (const ok of ['Entrance-1', 'Usher Ana', 'Gate_2', 'VIP.Desk', 'A1', 'x'.repeat(24)]) {
      localStorage.removeItem('cco_device_id'); T.resyncStation();
      const p = T.requireStation(); // opens the gate again
      submitName(ok); await p; await sleep(30);
      check('F6 accepts ' + JSON.stringify(ok), !gateOpen() && localStorage.getItem('cco_device_id') === ok);
    }
  });

  test('F7 a legacy "Unassigned-Station" saved by the old prompt is treated as not set', async () => {
    localStorage.setItem('cco_device_id', 'Unassigned-Station');
    T.resyncStation();
    check('F7 deviceId cleared', !T.deviceId, String(T.deviceId));
    const p = T.requireStation();
    check('F7 gate re-opens', gateOpen());
    submitName('Entrance-2'); await p;
    check('F7 now saved properly', localStorage.getItem('cco_device_id') === 'Entrance-2');
  });

  test('F8 "Change station name" re-opens the gate (cancel allowed, keeps the old name; new name replaces it)', async () => {
    localStorage.setItem('cco_device_id', 'Entrance-2'); T.resyncStation();
    $('menuBtn').click(); $('changeStationBtn').click();
    await sleep(50);
    check('F8 gate open', gateOpen());
    check('F8 cancel available when a name already exists', !$('stationCancel').hidden);
    $('stationCancel').click(); await sleep(50);
    check('F8 cancel keeps old name and closes', !gateOpen() && T.deviceId === 'Entrance-2');
    $('changeStationBtn').click(); await sleep(50);
    submitName('Usher-Ben'); await sleep(50);
    check('F8 new name saved and shown', !gateOpen() && T.deviceId === 'Usher-Ben' && $('stationLabel').textContent === 'Usher-Ben');
  });
})();
