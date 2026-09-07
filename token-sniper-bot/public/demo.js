(function () {
  'use strict';
  var ALLOWED = ['watch-launch', 'review-launch', 'suppress-launch'];
  var API_PATH = '/api/v1/demo/alerts';
  var selected = null;

  function $(id) { return document.getElementById(id); }

  function selectFixture(id) {
    if (ALLOWED.indexOf(id) === -1) return;
    selected = id;
    var cards = document.querySelectorAll('.scenario');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.getAttribute('data-id') === id) c.classList.add('selected');
      else c.classList.remove('selected');
    }
    $('loadBtn').disabled = false;
  }

  function show(name) {
    var ids = ['empty', 'loading', 'success', 'error'];
    for (var i = 0; i < ids.length; i++) $(ids[i]).hidden = ids[i] !== name;
  }

  function text(id, value) { var el = $(id); el.textContent = value; }

  function render(alert) {
    text('recBadge', badge(alert.recommendation, 'rec'));
    text('sevBadge', badge(alert.severity, 'sev'));
    text('confBadge', badge('Simulated', 'sim'));
    text('label', alert.tokenLabel);
    text('addr', alert.tokenAddress);
    text('alertId', alert.id);
    text('fixtureId', alert.fixtureId);
    text('generated', alert.generatedAt);
    text('source', alert.source);
    text('conf', Math.round(alert.confidence * 100) + '%');
    text('summary', alert.summary);
    text('nextAction', alert.nextAction);

    var sigs = $('signals');
    while (sigs.firstChild) sigs.removeChild(sigs.firstChild);
    for (var i = 0; i < alert.signals.length; i++) {
      var s = alert.signals[i];
      var card = document.createElement('div');
      card.className = 'signal ' + s.severity;
      var h = document.createElement('h4');
      h.textContent = s.title + ' (' + s.severity + ')';
      var p = document.createElement('p');
      p.textContent = s.detail;
      card.appendChild(h);
      card.appendChild(p);
      sigs.appendChild(card);
    }
    text('raw', JSON.stringify(alert, null, 2));
  }

  function badge(label, kind) {
    var span = document.createElement('span');
    span.className = 'bdg bdg-' + (kind === 'rec' ? label : kind === 'sev' ? label : 'sim');
    span.textContent = label;
    return span;
  }

  function loadAlert() {
    if (!selected) return;
    show('loading');
    var url = API_PATH + '?fixture=' + encodeURIComponent(selected);
    fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('bad-status');
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.alert || data.isSimulated !== true || data.source !== 'local-fixture') {
          throw new Error('unexpected-payload');
        }
        show('success');
        render(data.alert);
      })
      .catch(function () { show('error'); });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === '1') selectFixture('watch-launch');
    else if (e.key === '2') selectFixture('review-launch');
    else if (e.key === '3') selectFixture('suppress-launch');
    else if (e.key === 'Enter') { if (selected) loadAlert(); }
  });
})();
