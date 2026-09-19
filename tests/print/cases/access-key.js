/* Shared access key on the paper roster page: sent with the roster request, adopted once from a #key= link, and a
 * missing/wrong key is explained instead of looking like an empty or broken roster. */
(function () {
  const { check, row, cellText } = h;
  const $ = (id) => document.getElementById(id);
const pageHtml = () => { const c = document.body.cloneNode(true); c.querySelectorAll('script, #out').forEach((n) => n.remove()); return c.innerHTML; }; // the page as shipped: no test scripts, attributes included

  test('P15 the stored key is sent with the roster request', async () => {
    localStorage.setItem('cco_access_key', 'k-123');
    h.requireKey('k-123');
    h.setRows([row(11111, 'Ana Reyes', 'CESA')]);
    await h.load();
    check('P15 the request carried the key', /[?&]key=k-123(&|$)/.test(h.urls()[h.urls().length - 1]), h.urls().join(' | '));
    check('P15 the roster rendered', h.dataRows().length === 1);
  });

  test('P16 no key on the device: explains how to fix it, prints nothing', async () => {
    h.requireKey('secret');
    h.setRows([row(11111, 'Ana Reyes', 'CESA')]);
    await h.load();
    const st = cellText($('status'));
    check('P16 says the key is missing and how to add it', /access key/i.test(st) && /#key=/.test(st) && h.dataRows().length === 0, st);
    check('P16 does not blame the deployment or the connection', !/deployment|check the connection/i.test(st), st);
  });

  test('P17 a wrong key says rejected; a server with no key says so', async () => {
    localStorage.setItem('cco_access_key', 'wrong');
    h.requireKey('right');
    await h.load();
    check('P17 rejected', /rejected/i.test(cellText($('status'))), cellText($('status')));
    h.requireKey(null); h.setNotSet(true);
    await h.load();
    check('P17 server has no key', /server/i.test(cellText($('status'))) && /key/i.test(cellText($('status'))), cellText($('status')));
  });

  test('P18 a #key=… link is stored and removed from the address bar; the key is never printed', async () => {
    check('P18 hook exists', typeof h.P.adoptKey === 'function');
    if (typeof h.P.adoptKey !== 'function') return;
    history.replaceState(null, '', '#key=LINK-KEY_9');
    check('P18 adopted', h.P.adoptKey() === true && localStorage.getItem('cco_access_key') === 'LINK-KEY_9');
    check('P18 gone from the URL', location.hash === '' && !/key=/.test(location.href), location.href);
    h.requireKey('LINK-KEY_9');
    h.setRows([row(11111, 'Ana Reyes', 'CESA')]);
    await h.load();
    check('P18 works with the adopted key, and the key is not on the page', h.dataRows().length === 1 && !/LINK-KEY/.test(pageHtml()));
  });
})();
