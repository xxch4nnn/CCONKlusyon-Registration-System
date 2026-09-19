/* Shared access key on the wall: sent with every request, adopted once from a private #key= link, and a problem with it
 * is shown to the OPERATOR (tabs 2/3) in words, but to the audience (tab 1) only as the small dot. */
(function () {
  const { check, sleep, person, D } = h;
  const $ = (id) => document.getElementById(id);
  const pageHtml = () => { const c = document.body.cloneNode(true); c.querySelectorAll('script, #out').forEach((n) => n.remove()); return c.innerHTML; }; // the page as shipped: no test scripts, attributes included
  const at = (min) => '2026-10-02T12:' + String(min).padStart(2, '0') + ':00+08:00';

  test('D1 the stored key is sent with the arrivals feed and the roster', async () => {
    const before = h.keysSent().length; // requests already made by the fresh polling cycle, before this key existed
    localStorage.setItem('cco_access_key', 'k-123');
    h.requireKey('k-123');
    h.setPeople([person('Ana Reyes', 'CESA', at(0))]);
    await h.poll();
    const keys = h.keysSent().slice(before);
    check('D1 every request carried the key', keys.length > 0 && keys.every((k) => k === 'k-123'), keys.join(','));
    check('D1 data flowed (the server accepted it)', h.cards().length === 1 && h.liveText() === 'Live', h.liveText());
  });

  test('D2 no key on the device: the operator is told in words, the audience sees only a dot', async () => {
    h.requireKey('secret-key');
    h.setPeople([person('Ana Reyes', 'CESA', at(0))]);
    await h.poll(); await h.poll();
    check('D2 the dot is showing on the audience view', !$('stageDot').hidden);
    check('D2 no wording on the audience view', !/key|reconnecting|error|live/i.test(document.body.innerText), JSON.stringify(document.body.innerText.slice(0, 120)));
    check('D2 the status line (shown on tabs 2/3) names the missing key', /no access key/i.test(h.liveText()) && !/reconnecting/i.test(h.liveText()), h.liveText());
    h.key('3'); await sleep(500);
    check('D2 the Attendance tab explains how to fix it', /access key/i.test(h.tele().status) && /#key=/.test(h.tele().status), h.tele().status);
  });

  test('D3 a wrong key says "rejected"', async () => {
    localStorage.setItem('cco_access_key', 'wrong');
    h.requireKey('right');
    await h.poll(); await h.poll();
    check('D3 status says rejected', /rejected/i.test(h.liveText()), h.liveText());
  });

  test('D4 the server has no key configured: says so', async () => {
    localStorage.setItem('cco_access_key', 'whatever');
    h.setKeyNotSet(true);
    await h.poll(); await h.poll();
    check('D4 status points at the server', /server/i.test(h.liveText()) && /key/i.test(h.liveText()), h.liveText());
  });

  test('D5 a private link ending in #key=… is stored and removed from the address bar', async () => {
    check('D5 hook exists', typeof D.adoptKey === 'function');
    if (typeof D.adoptKey !== 'function') return;
    history.replaceState(null, '', '#key=LINK-KEY_9');
    check('D5 adopted', D.adoptKey() === true && localStorage.getItem('cco_access_key') === 'LINK-KEY_9');
    check('D5 gone from the URL', location.hash === '' && !/key=/.test(location.href), location.href);
    check('D5 nothing to adopt the second time', D.adoptKey() === false);
  });

  test('D6 once the right key is on the device the wall recovers by itself', async () => {
    h.requireKey('right');
    h.setPeople([person('Ana Reyes', 'CESA', at(0))]);
    await h.poll(); await h.poll();
    check('D6 problem showing first', /no access key/i.test(h.liveText()), h.liveText());
    localStorage.setItem('cco_access_key', 'right');
    await sleep(20000);
    check('D6 back to Live, dot gone, data shown', h.liveText() === 'Live' && $('stageDot').hidden && h.cards().length === 1, h.liveText());
  });

  test('D8 after recovery, an ordinary network drop is not blamed on the key', async () => {
    localStorage.setItem('cco_access_key', 'right');
    h.requireKey('right');
    h.setPeople([person('Ana Reyes', 'CESA', at(0))]);
    await h.poll();
    h.requireKey('changed'); // the key stops working...
    await h.poll(); await h.poll();
    check('D8 first the key problem shows', /rejected/i.test(h.liveText()), h.liveText());
    h.requireKey('right');   // ...then it works again
    await sleep(20000);
    check('D8 recovered', h.liveText() === 'Live', h.liveText());
    h.setNetDown(true);
    await sleep(30000);
    check('D8 a plain outage says Reconnecting, not a key error', /reconnecting/i.test(h.liveText()) && !/key/i.test(h.liveText()), h.liveText());
  });

  test('D7 the key is never displayed anywhere on the page', async () => {
    localStorage.setItem('cco_access_key', 'SUPER-SECRET-KEY-77');
    h.requireKey('other');
    await h.poll(); await h.poll();
    h.key('3'); await sleep(500);
    check('D7 not in any text or attribute, visible or hidden', !/SUPER-SECRET-KEY/.test(pageHtml()), '');
  });
})();
