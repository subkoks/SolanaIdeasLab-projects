/* ==========================================================================
   Token Safety Bot — Local Fixture Demo (browser script)
   Local-only. Same-origin. No external requests.
   No wallet, signing, RPC, or live token analysis is performed.
   ========================================================================== */

(function () {
  'use strict';

  // --- Internal allowlist of fixture IDs only. No user-supplied input.
  var FIXTURE_IDS = ['safe-token', 'review-token', 'blocked-token'];

  // Fixed valid synthetic address used for the request path. Not user input.
  var SYNTHETIC_ADDRESS = 'So11111111111111111111111111111111111111112';

  // --- DOM refs ---
  var cards = Array.prototype.slice.call(document.querySelectorAll('.scenario-card'));
  var runBtn = document.getElementById('runBtn');
  var runHint = document.getElementById('run-hint');
  var stateInitial = document.getElementById('state-initial');
  var stateLoading = document.getElementById('state-loading');
  var stateResult = document.getElementById('state-result');
  var stateError = document.getElementById('state-error');
  var resultContent = document.getElementById('result-content');
  var errorMessage = document.getElementById('error-message');
  var retryBtn = document.getElementById('retryBtn');
  var rawJsonToggle = document.getElementById('rawJsonToggle');
  var rawJsonPanel = document.getElementById('rawJsonPanel');
  var rawJsonCode = document.getElementById('rawJsonCode');
  var closeJsonBtn = document.getElementById('closeJsonBtn');

  // --- State ---
  var selectedFixture = null;
  var lastResult = null;
  var inFlight = false;

  // --- Helpers ---
  function isAllowedFixture(id) {
    return FIXTURE_IDS.indexOf(String(id)) !== -1;
  }

  function setHint(text) {
    if (runHint) runHint.textContent = text;
  }

  function selectCard(id) {
    if (!isAllowedFixture(id)) return;
    selectedFixture = id;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var match = c.getAttribute('data-fixture') === id;
      c.setAttribute('aria-checked', match ? 'true' : 'false');
      c.classList.toggle('selected', match);
    }
    runBtn.disabled = false;
    var labels = {
      'safe-token': 'Ready: Safe Token (expected Allow)',
      'review-token': 'Ready: Review Token (expected Review)',
      'blocked-token': 'Ready: Blocked Token (expected Block)',
    };
    setHint(labels[id] || 'Ready');
  }

  function showState(name) {
    stateInitial.classList.add('hidden');
    stateLoading.classList.add('hidden');
    stateResult.classList.add('hidden');
    stateError.classList.add('hidden');
    if (name === 'initial') stateInitial.classList.remove('hidden');
    else if (name === 'loading') stateLoading.classList.remove('hidden');
    else if (name === 'result') stateResult.classList.remove('hidden');
    else if (name === 'error') stateError.classList.remove('hidden');
  }

  // --- Render helpers (textContent only — never innerHTML) ---
  function el(tag, opts) {
    var node = document.createElement(tag);
    if (!opts) return node;
    if (opts.text != null) node.textContent = String(opts.text);
    if (opts.cls) node.className = opts.cls;
    if (opts.attr) {
      for (var k in opts.attr) {
        if (Object.prototype.hasOwnProperty.call(opts.attr, k)) {
          node.setAttribute(k, String(opts.attr[k]));
        }
      }
    }
    if (opts.children && Array.isArray(opts.children)) {
      for (var i = 0; i < opts.children.length; i++) {
        node.appendChild(opts.children[i]);
      }
    }
    return node;
  }

  function severityClass(sev) {
    if (sev === 'positive') return 'positive';
    if (sev === 'warning') return 'warning';
    if (sev === 'critical') return 'critical';
    return '';
  }

  function severityMarkerText(sev) {
    if (sev === 'positive') return '\u2713';
    if (sev === 'warning') return '!';
    if (sev === 'critical') return '\u2715';
    return '?';
  }

  function renderResult(data) {
    resultContent.textContent = '';

    // Summary block
    var score = Number(data.score);
    var rec = String(data.recommendation);
    var safety = String(data.safetyLevel);
    var recClass = rec === 'allow' ? 'allow' : rec === 'review' ? 'review' : 'block';

    var scoreRingFg = el('circle', {
      cls: 'score-ring-fg',
      attr: {
        cx: '70', cy: '70', r: '60', fill: 'none', 'stroke-width': '8',
      },
    });
    if (!isNaN(score)) {
      var max = 100;
      var circumference = 2 * Math.PI * 60;
      var offset = circumference * (1 - Math.max(0, Math.min(score, max)) / max);
      scoreRingFg.setAttribute('stroke-dasharray', String(circumference));
      scoreRingFg.setAttribute('stroke-dashoffset', String(offset));
      var color = rec === 'allow' ? 'var(--accent-safe)'
        : rec === 'review' ? 'var(--accent-warning)'
        : 'var(--accent-critical)';
      scoreRingFg.style.stroke = color;
    }

    var ringSvg = el('svg', {
      cls: 'score-ring',
      attr: { viewBox: '0 0 140 140' },
      children: [
        el('circle', {
          cls: 'score-ring-bg',
          attr: { cx: '70', cy: '70', r: '60', fill: 'none', 'stroke-width': '8' },
        }),
        scoreRingFg,
      ],
    });

    var ringWrap = el('div', {
      cls: 'score-ring-wrap',
      children: [ringSvg, el('div', { cls: 'score-value', text: String(data.score) })],
    });

    var recHeading = el('h2', { cls: 'recommendation', text: capitalize(rec) });
    var safetyBadge = el('span', {
      cls: 'safety-badge ' + recClass,
      text: 'Safety: ' + capitalize(safety),
    });
    var headings = el('div', {
      cls: 'result-headings',
      children: [recHeading, safetyBadge],
    });

    var summary = el('div', {
      cls: 'result-summary',
      children: [ringWrap, headings],
    });
    resultContent.appendChild(summary);

    // Explanation
    var explanation = data.explanation || {};
    var explanationBlock = el('div', {
      cls: 'explanation-block',
      children: [
        el('h3', { text: 'Summary' }),
        el('p', { text: String(explanation.summary || '') }),
        el('h3', { text: 'Recommended Next Action' }),
        el('div', { cls: 'next-action', text: String(explanation.nextAction || '') }),
      ],
    });
    resultContent.appendChild(explanationBlock);

    // Provenance
    var provenance = el('div', {
      cls: 'provenance-block',
      children: [
        el('h3', { text: 'Fixture Provenance' }),
        el('div', {
          cls: 'provenance-grid',
          children: [
            el('div', { cls: 'provenance-item', children: [
              el('span', { cls: 'provenance-key', text: 'Fixture ID' }),
              el('span', { cls: 'provenance-val', text: String(data.fixtureId || '-') }),
            ]}),
            el('div', { cls: 'provenance-item', children: [
              el('span', { cls: 'provenance-key', text: 'Source' }),
              el('span', { cls: 'provenance-val', text: String(data.source || '-') }),
            ]}),
            el('div', { cls: 'provenance-item', children: [
              el('span', { cls: 'provenance-key', text: 'Simulated' }),
              el('span', {
                cls: 'provenance-val is-' + (data.isSimulated === true ? 'true' : 'false'),
                text: data.isSimulated === true ? 'true' : 'false',
              }),
            ]}),
            el('div', { cls: 'provenance-item', children: [
              el('span', { cls: 'provenance-key', text: 'Token Address' }),
              el('span', { cls: 'provenance-val', text: String(data.tokenAddress || '-') }),
            ]}),
            el('div', { cls: 'provenance-item', children: [
              el('span', { cls: 'provenance-key', text: 'Analysis Depth' }),
              el('span', { cls: 'provenance-val', text: String(data.analysisDepth || '-') }),
            ]}),
          ],
        }),
      ],
    });
    resultContent.appendChild(provenance);

    // Signals
    var signals = Array.isArray(explanation.signals) ? explanation.signals : [];
    var signalList = el('div', { cls: 'signal-list' });
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      var sev = String(s.severity);
      var sevClass = severityClass(sev);
      var card = el('div', {
        cls: 'signal-card severity-' + sevClass,
        children: [
          el('div', { cls: 'signal-marker ' + sevClass, text: severityMarkerText(sev) }),
          el('div', {
            cls: 'signal-body',
            children: [
              el('div', {
                cls: 'signal-title-row',
                children: [
                  el('span', { cls: 'signal-title', text: String(s.title || '') }),
                  el('span', { cls: 'signal-severity ' + sevClass, text: sev }),
                  el('span', { cls: 'signal-id', text: String(s.id || '') }),
                ],
              }),
              el('p', { cls: 'signal-detail', text: String(s.detail || '') }),
            ],
          }),
        ],
      });
      signalList.appendChild(card);
    }
    var signalsBlock = el('div', {
      cls: 'signals-block',
      children: [el('h3', { text: 'Risk Signals (' + signals.length + ')' }), signalList],
    });
    resultContent.appendChild(signalsBlock);
  }

  function capitalize(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // --- Network: same-origin relative URL only, fixture param required ---
  function runAnalysis() {
    if (inFlight) return;
    if (!isAllowedFixture(selectedFixture)) {
      showState('error');
      errorMessage.textContent = 'Please select a local scenario first.';
      return;
    }

    inFlight = true;
    runBtn.disabled = true;
    showState('loading');

    // Build same-origin URL using only the allowlist + a fixed synthetic address.
    var url = '/api/v1/risk/'
      + encodeURIComponent(SYNTHETIC_ADDRESS)
      + '?fixture=' + encodeURIComponent(selectedFixture);

    fetch(url, { method: 'GET', credentials: 'same-origin' })
      .then(function (resp) {
        if (!resp.ok) {
          throw new Error('Local fixture API returned ' + resp.status);
        }
        return resp.json();
      })
      .then(function (data) {
        lastResult = data;
        renderResult(data);
        showState('result');
      })
      .catch(function () {
        showState('error');
        errorMessage.textContent = 'Unable to load local fixture data. Please retry.';
      })
      .then(function () {
        inFlight = false;
        // Re-enable button only if a fixture remains selected.
        runBtn.disabled = !isAllowedFixture(selectedFixture);
      });
  }

  function toggleRawJson() {
    if (rawJsonPanel.classList.contains('hidden')) {
      if (lastResult) {
        rawJsonCode.textContent = JSON.stringify(lastResult, null, 2);
      } else {
        rawJsonCode.textContent = 'No analysis has been run yet.';
      }
      rawJsonPanel.classList.remove('hidden');
      rawJsonPanel.setAttribute('aria-hidden', 'false');
      rawJsonToggle.setAttribute('aria-expanded', 'true');
    } else {
      rawJsonPanel.classList.add('hidden');
      rawJsonPanel.setAttribute('aria-hidden', 'true');
      rawJsonToggle.setAttribute('aria-expanded', 'false');
    }
  }

  // --- Wire up events ---
  for (var i = 0; i < cards.length; i++) {
    (function (card) {
      var id = card.getAttribute('data-fixture');
      card.addEventListener('click', function () { selectCard(id); });
      card.addEventListener('keydown', function (e) {
        var key = e.key;
        if (key === 'Enter' || key === ' ') {
          e.preventDefault();
          selectCard(id);
        }
      });
    })(cards[i]);
  }

  runBtn.addEventListener('click', runAnalysis);
  retryBtn.addEventListener('click', function () {
    if (isAllowedFixture(selectedFixture)) runAnalysis();
  });
  rawJsonToggle.addEventListener('click', toggleRawJson);
  closeJsonBtn.addEventListener('click', toggleRawJson);

  // Global keyboard shortcuts: 1/2/3 select, Enter runs. Skip when focus is
  // inside an input/select/textarea to avoid intercepting text entry.
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    var isTyping = tag === 'input' || tag === 'select' || tag === 'textarea' || (t && t.isContentEditable);
    if (isTyping) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '1') { e.preventDefault(); selectCard('safe-token'); }
    else if (e.key === '2') { e.preventDefault(); selectCard('review-token'); }
    else if (e.key === '3') { e.preventDefault(); selectCard('blocked-token'); }
    else if (e.key === 'Enter') {
      if (!runBtn.disabled && !inFlight) {
        e.preventDefault();
        runAnalysis();
      }
    }
  });

  // Initial state
  showState('initial');
  setHint('Select a scenario to begin');
})();
