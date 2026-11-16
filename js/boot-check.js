// NEXUS — opstartcontrole (klassiek script, geen module). Vangt fouten op die ontstaan vóórdat de
// app zelf iets kan tonen (bijv. een module die niet laadt), zodat je nooit een leeg of grijs scherm
// krijgt maar een duidelijke melding met een uitweg. Bevat geen gegevens van de gebruiker.
(function () {
  var errors = [];
  window.__nexusBootErrors = errors;
  function note(msg) { if (errors.length < 10) errors.push(String(msg || 'onbekende fout').slice(0, 300)); }
  window.addEventListener('error', function (e) { note((e && (e.message || (e.error && e.error.message))) || (e && e.target && e.target.src ? 'kon niet laden: ' + e.target.src.split('/').slice(-2).join('/') : 'fout')); }, true);
  window.addEventListener('unhandledrejection', function (e) { note(e && e.reason && (e.reason.message || e.reason)); });
  function show() {
    var view = document.getElementById('view');
    if (!view || view.children.length || window.__nexusStarted) return;
    var safe = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    view.innerHTML = '<section class="card" style="margin-top:24px"><h2 class="card-title">NEXUS kon niet starten</h2>'
      + '<p class="hint">Je gegevens zijn niet aangetast. Probeer opnieuw te laden. Blijft dit gebeuren, sluit de pagina dan helemaal en open hem opnieuw (dan worden oude bestanden ververst).</p>'
      + (errors.length ? '<pre class="share-preview">' + safe(errors.join('\n')) + '</pre>' : '<p class="hint">Er is geen foutmelding opgevangen (mogelijk duurde het laden te lang).</p>')
      + '<button class="btn block" id="boot-reload">Opnieuw laden</button></section>';
    var rb = document.getElementById('boot-reload');
    if (rb) rb.addEventListener('click', function () { location.reload(); });
    if (window.__nexusOnBootFail) try { window.__nexusOnBootFail(errors.slice()); } catch (_) { /* */ }
  }
  setTimeout(show, 6000);
})();
