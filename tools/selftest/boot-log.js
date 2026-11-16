// Alleen in de testverpakking: stuur opstart- en schermfouten (zonder gebruikersgegevens) naar de
// database van het privé test-artifact (selftest/err-…), zodat ze zonder kopiëren te zien zijn.
(function () {
  var sent = {};
  function send(kind, list) {
    var key = kind + list.join('|');
    if (sent[key] || !window.claude || !window.claude.use) return;
    sent[key] = 1;
    window.claude.use('db').then(function (db) {
      if (!db) return;
      return db.doc('selftest/err-' + Date.now().toString(36)).set({ kind: kind, at: new Date().toISOString(), ua: navigator.userAgent.slice(0, 160), hash: location.hash, errors: list.map(function (x) { return String(x).slice(0, 300); }) });
    }).catch(function () { /* */ });
  }
  window.__nexusOnBootFail = function (errs) { send('boot', errs); };
  var n = 0;
  var t = setInterval(function () {
    n++;
    if (window.__nexusRenderError) send('render', [window.__nexusRenderError]);
    var be = window.__nexusBootErrors || [];
    if (be.length && n === 8) send('error', be.slice());
    if (n > 30) clearInterval(t);
  }, 1000);
})();
