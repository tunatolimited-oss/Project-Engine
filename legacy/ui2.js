/* ============================================================================
   CHARTS — hand-drawn SVG, theme-token text, crosshair tooltips
   ========================================================================== */
var SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, kids) {
  var el = document.createElementNS(SVGNS, tag);
  if (attrs) for (var k in attrs) { if (attrs[k] != null && attrs[k] !== false) el.setAttribute(k, attrs[k]); }
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
    if (c == null || c === false) return;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return el;
}
function niceTicks(min, max, count) {
  if (max === min) { max = min + 1; }
  var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / count)));
  var err = (span / count) / step;
  if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
  var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
  for (var v = lo; v <= hi + step / 2; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return out;
}
function kFmt(v) {
  var a = Math.abs(v);
  if (a >= 1e6) return (v < 0 ? '-' : '') + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return (v < 0 ? '-' : '') + '$' + Math.round(a / 1e3) + 'K';
  return (v < 0 ? '-' : '') + '$' + Math.round(a);
}

/* A line / stacked-area chart with a crosshair tooltip and direct end labels. */
function chart(opts) {
  var W = 1000, H = opts.height || 250;
  var padL = 66, padR = opts.endLabels === false ? 16 : 106, padT = 12, padB = 28;
  var series = opts.series, n = (series[0] ? series[0].values.length : 0);
  if (!n) return h('div', { class: 'empty' }, 'Nothing to plot yet.');

  var stacked = !!opts.stacked;
  var tops = [];
  if (stacked) {
    for (var i = 0; i < n; i++) {
      var acc = 0, col = [];
      for (var j = 0; j < series.length; j++) { acc += series[j].values[i]; col.push(acc); }
      tops.push(col);
    }
  }
  var lo = 0, hi = 0;
  if (stacked) {
    for (var i2 = 0; i2 < n; i2++) { hi = Math.max(hi, tops[i2][series.length - 1]); lo = Math.min(lo, 0); }
  } else {
    lo = Infinity; hi = -Infinity;
    series.forEach(function (se) { se.values.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; }); });
    (opts.refLines || []).forEach(function (r) { if (r.y < lo) lo = r.y; if (r.y > hi) hi = r.y; });
    if (lo > 0) lo = 0;
    if (lo === hi) hi = lo + 1;
  }
  var ticks = niceTicks(lo, hi, 4);
  var yMin = ticks[0], yMax = ticks[ticks.length - 1];
  var X = function (i) { return padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR)); };
  var Y = function (v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB); };

  var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H,
                       role: 'img', 'aria-label': opts.label || 'chart' });

  /* gridlines + y labels */
  ticks.forEach(function (t) {
    svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t),
      stroke: t === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': t === 0 ? 1.5 : 1 }));
    svg.appendChild(s('text', { x: padL - 9, y: Y(t) + 4, 'text-anchor': 'end',
      'font-size': 11, fill: 'var(--muted)' }, opts.yFmt ? opts.yFmt(t) : kFmt(t)));
  });

  /* x labels — the first and last anchor inward so they never run off the edge */
  var xEvery = Math.max(1, Math.round(n / 6));
  var xIdx = [];
  for (var xi = 0; xi < n; xi += xEvery) xIdx.push(xi);
  if (n > 1 && xIdx[xIdx.length - 1] !== n - 1) {
    if (n - 1 - xIdx[xIdx.length - 1] < xEvery * 0.55) xIdx.pop();
    xIdx.push(n - 1);
  }
  xIdx.forEach(function (ix) {
    var anchor = ix === 0 ? 'start' : (ix === n - 1 ? 'end' : 'middle');
    svg.appendChild(s('text', { x: X(ix), y: H - 8, 'text-anchor': anchor, 'font-size': 11,
      fill: 'var(--muted)' }, opts.xLabels[ix]));
  });

  /* reference lines */
  (opts.refLines || []).forEach(function (r) {
    svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: Y(r.y), y2: Y(r.y),
      stroke: r.color || 'var(--faint)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    svg.appendChild(s('text', { x: W - padR - 4, y: Y(r.y) - 5, 'text-anchor': 'end', 'font-size': 10.5,
      fill: 'var(--muted)' }, r.label));
  });

  /* marks */
  if (stacked) {
    for (var k = series.length - 1; k >= 0; k--) {
      var d = 'M ' + X(0) + ' ' + Y(tops[0][k]);
      for (var p = 1; p < n; p++) d += ' L ' + X(p) + ' ' + Y(tops[p][k]);
      d += ' L ' + X(n - 1) + ' ' + Y(0) + ' L ' + X(0) + ' ' + Y(0) + ' Z';
      svg.appendChild(s('path', { d: d, fill: series[k].color, 'fill-opacity': 0.9 }));
      /* 2px surface gap along each band's top edge */
      var dt = 'M ' + X(0) + ' ' + Y(tops[0][k]);
      for (var p2 = 1; p2 < n; p2++) dt += ' L ' + X(p2) + ' ' + Y(tops[p2][k]);
      svg.appendChild(s('path', { d: dt, fill: 'none', stroke: 'var(--surface)', 'stroke-width': 2 }));
    }
  } else {
    series.forEach(function (se) {
      var d = 'M ' + X(0) + ' ' + Y(se.values[0]);
      for (var p = 1; p < n; p++) d += ' L ' + X(p) + ' ' + Y(se.values[p]);
      svg.appendChild(s('path', { d: d, fill: 'none', stroke: se.color, 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });
  }

  /* acquisition markers */
  (opts.markers || []).forEach(function (m) {
    svg.appendChild(s('line', { x1: X(m.i), x2: X(m.i), y1: padT, y2: H - padB,
      stroke: 'var(--accent)', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'stroke-opacity': .5 }));
    svg.appendChild(s('circle', { cx: X(m.i), cy: H - padB, r: 4, fill: 'var(--accent)',
      stroke: 'var(--surface)', 'stroke-width': 2 }));
  });

  /* direct end labels — also the light-mode relief for low-contrast hues */
  if (opts.endLabels !== false) {
    var placed = [];
    series.forEach(function (se, si) {
      var v = stacked ? tops[n - 1][si] : se.values[n - 1];
      var mid = stacked ? (tops[n - 1][si] + (si ? tops[n - 1][si - 1] : 0)) / 2 : v;
      var y = Y(mid);
      while (placed.some(function (q) { return Math.abs(q - y) < 13; })) y += 13;
      placed.push(y);
      svg.appendChild(s('text', { x: W - padR + 7, y: y + 4, 'font-size': 11, 'font-weight': 600,
        fill: 'var(--text-2)' }, se.name));
      svg.appendChild(s('rect', { x: W - padR - 1, y: y - 4, width: 4, height: 8, rx: 1, fill: se.color }));
    });
  }

  /* crosshair */
  var cross = s('g', { opacity: 0 });
  var cline = s('line', { y1: padT, y2: H - padB, stroke: 'var(--text-2)', 'stroke-width': 1 });
  cross.appendChild(cline);
  var dots = series.map(function (se) {
    return s('circle', { r: 4.5, fill: se.color, stroke: 'var(--surface)', 'stroke-width': 2 });
  });
  dots.forEach(function (d) { cross.appendChild(d); });
  svg.appendChild(cross);

  var box = h('div', { style: 'position:relative' });
  var tip = h('div', { style: 'position:absolute;pointer-events:none;opacity:0;background:var(--surface);' +
    'border:1px solid var(--border-firm);border-radius:8px;padding:7px 10px;font-size:12px;' +
    'box-shadow:var(--shadow-lift);z-index:5;min-width:130px;transition:opacity .08s' });
  box.appendChild(svg); box.appendChild(tip);

  function move(ev) {
    var r = svg.getBoundingClientRect();
    var px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
    var i = Math.round(((px - padL) / (W - padL - padR)) * (n - 1));
    if (i < 0) i = 0; if (i > n - 1) i = n - 1;
    cross.setAttribute('opacity', 1);
    cline.setAttribute('x1', X(i)); cline.setAttribute('x2', X(i));
    series.forEach(function (se, si) {
      var v = stacked ? tops[i][si] : se.values[i];
      dots[si].setAttribute('cx', X(i)); dots[si].setAttribute('cy', Y(v));
    });
    clear(tip);
    tip.appendChild(h('div', { style: 'font-weight:700;margin-bottom:3px' }, opts.xLabels[i]));
    series.forEach(function (se, si) {
      tip.appendChild(h('div', { style: 'display:flex;gap:7px;align-items:center;justify-content:space-between' }, [
        h('span', {}, [h('i', { style: 'display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;background:' + se.color }), se.name]),
        h('b', { class: 'num' }, (opts.tipFmt || kFmt)(se.values[i]))
      ]));
    });
    if (opts.tipExtra) { var ex = opts.tipExtra(i); if (ex) tip.appendChild(ex); }
    tip.style.opacity = 1;
    var leftPx = (X(i) / W) * r.width;
    tip.style.left = Math.max(0, Math.min(r.width - 165, leftPx + 12)) + 'px';
    tip.style.top = '6px';
  }
  svg.addEventListener('mousemove', move);
  svg.addEventListener('touchmove', function (e) { move(e); e.preventDefault(); }, { passive: false });
  svg.addEventListener('mouseleave', function () { cross.setAttribute('opacity', 0); tip.style.opacity = 0; });
  return box;
}

function legend(series) {
  return h('div', { class: 'legend' }, series.map(function (se) {
    return h('span', {}, [h('i', { style: 'background:' + se.color }), se.name]);
  }));
}

function barChart(opts) {
  var W = 1000, H = opts.height || 210, padL = 66, padR = 16, padT = 12, padB = 34;
  var vals = opts.values, n = vals.length;
  if (!n) return h('div', { class: 'empty' }, 'Nothing to plot.');
  var hi = Math.max.apply(null, vals), lo = Math.min(0, Math.min.apply(null, vals));
  var ticks = niceTicks(lo, hi, 4), yMin = ticks[0], yMax = ticks[ticks.length - 1];
  var Y = function (v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB); };
  var bw = (W - padL - padR) / n;
  var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, });
  ticks.forEach(function (t) {
    svg.appendChild(s('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t),
      stroke: t === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': t === 0 ? 1.5 : 1 }));
    svg.appendChild(s('text', { x: padL - 9, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': 11,
      fill: 'var(--muted)' }, opts.yFmt ? opts.yFmt(t) : kFmt(t)));
  });
  vals.forEach(function (v, i) {
    var x = padL + i * bw + bw * 0.16, w = bw * 0.68;
    var y = Y(Math.max(0, v)), hgt = Math.abs(Y(v) - Y(0));
    svg.appendChild(s('rect', { x: x, y: y, width: w, height: Math.max(1, hgt), rx: 4,
      fill: opts.colors ? opts.colors[i] : 'var(--s1)' }));
    svg.appendChild(s('text', { x: x + w / 2, y: H - 20, 'text-anchor': 'middle', 'font-size': 11,
      fill: 'var(--muted)' }, opts.labels[i]));
    if (opts.valueLabels) {
      svg.appendChild(s('text', { x: x + w / 2, y: y - 5, 'text-anchor': 'middle', 'font-size': 10.5,
        'font-weight': 600, fill: 'var(--text-2)' }, opts.valueLabels[i]));
    }
    if (opts.subLabels) {
      svg.appendChild(s('text', { x: x + w / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 10,
        fill: 'var(--faint)' }, opts.subLabels[i]));
    }
  });
  return h('div', {}, svg);
}

/* ============================================================================
   TIMELINE TAB
   ========================================================================== */
function renderTimeline() {
  var root = clear($('tab-timeline'));
  if (!RES) return;

  var rows = RES.rows;
  var caps = rows.map(function (r) { return r.cash; });
  var deploy = rows.map(function (r) { return r.deployable; });
  var labels = rows.map(function (r) { return fmtMonthShort(r.date); });
  var markers = RES.acquisitions.map(function (a) { return { i: a.monthIndex }; });

  root.appendChild(panel('Capital on hand', 'The sawtooth is the plan working: you save up, you buy, you start again. The lower line is what you can actually spend — the rest is locked in reserves.', [
    chart({
      series: [
        { name: 'Total cash', color: 'var(--s1)', values: caps },
        { name: 'Deployable', color: 'var(--s3)', values: deploy }
      ],
      xLabels: labels, height: 215, markers: markers
    }),
    legend([{ name: 'Total cash', color: 'var(--s1)' }, { name: 'Deployable after reserves', color: 'var(--s3)' }]),
    h('div', { class: 'chart-note' }, 'Dotted verticals mark acquisitions.')
  ]));

  var filterBtns = h('div', { class: 'btn-row' }, [
    ['key', 'Key months'], ['acq', 'Acquisitions only'], ['all', 'Every month']
  ].map(function (o) {
    return h('button', { class: 'btn sm' + (TL_FILTER === o[0] ? ' primary' : ''), type: 'button',
      onclick: function () { TL_FILTER = o[0]; renderTimeline(); } }, o[1]);
  }));

  var shown = rows.filter(function (r, i) {
    if (TL_FILTER === 'all') return true;
    if (TL_FILTER === 'acq') return !!r.acquisition;
    return !!r.acquisition || r.events.length > 0 || r.date.m === 0 || i === 0 || i === rows.length - 1 ||
           RES.milestones.some(function (m) { return m.monthIndex === i; });
  });

  var list = h('div', { class: 'tl' });
  if (!shown.length) list.appendChild(h('div', { class: 'empty' }, 'No months match this filter.'));

  var lastBlockedKey = null;
  shown.forEach(function (r) {
    var ms = RES.milestones.filter(function (m) { return m.monthIndex === r.i; });
    var cls = 'tl-row q';
    if (r.acquisition) cls += ' has-acq';
    else if (r.events.some(function (e) { return e.type === 'capex' || e.type === 'eviction' || e.type === 'balloon'; })) cls += ' has-event';
    if (r.cash < 0) cls += ' has-crit';

    var main = h('div', { class: 'tl-main' });
    main.appendChild(h('div', { class: 'tl-stats' }, [
      stat('Cash', fmtDollars(r.cash), r.cash < 0),
      r.properties ? stat('Cash flow/mo', fmtDollars(r.cashFlow), r.cashFlow < 0) : null,
      r.properties ? stat('Equity', fmtMoney(r.equity)) : null,
      r.properties ? stat('Units', String(r.units)) : null,
      r.properties ? stat('Net worth', fmtMoney(r.netWorth)) : null,
      r.recession ? h('span', { class: 'chip warn' }, 'recession') : null,
      r.managementActive ? h('span', { class: 'chip' }, 'managed') : null
    ]));

    ms.forEach(function (m) {
      var c = m.kind === 'shortfall' ? 'crit' : (m.kind === 'freedom' || m.kind === 'profitGoal' || m.kind === 'equityGoal' ? 'good' : 'accent');
      main.appendChild(h('div', { style: 'margin-top:5px' }, h('span', { class: 'chip ' + c }, [h('i', { class: 'dot' }), m.text])));
    });

    r.events.forEach(function (e) {
      if (e.type === 'acquisition') return;
      var good = (e.type === 'refi' || e.type === 'exchange' || e.type === 'reps' || e.type === 'rentramp');
      main.appendChild(h('div', {
        class: 'tl-note' + (e.type === 'capex' || e.type === 'eviction' ? ' bad' : '') },
        [good ? h('span', { class: 'chip accent', style: 'margin-right:6px' },
          { refi: 'refinance', exchange: '1031', reps: 'tax status', rentramp: 'rents' }[e.type] || e.type) : null,
         e.text]));
    });

    if (r.acquisition) main.appendChild(dealCard(r.acquisition));

    if (r.blocked && !r.acquisition) {
      var b = r.blocked, txt;
      if (b.reason === 'cash') {
        txt = 'Waiting on ' + b.nickname + ' (' + fmtMoney(b.price) + '). All-in you need ' +
              fmtDollars(b.totalNeeded) + ' — ' + fmtDollars(b.cashNeeded) + ' to close, ' +
              fmtDollars(b.reserveRequired) + ' held as lender reserve, ' + fmtDollars(b.emergencyFund) +
              ' emergency fund. You have ' + fmtDollars(r.cash) + ', so you are ' +
              fmtDollars(b.shortfall) + ' short.';
      } else if (b.reason === 'dscr') {
        txt = b.nickname + ' fails the DSCR test at ' + b.dscr.toFixed(2) + ' (you require ' +
              CFG.rules.minDSCR.toFixed(2) + '). No lender funds this deal.';
      } else if (b.reason === 'guardCashFlow') {
        txt = 'Guardrail: buying ' + b.nickname + ' would push total portfolio cash flow to ' +
              fmtDollars(b.value) + '/mo, below your floor of ' +
              fmtDollars(CFG.rules.guardrails.minMonthlyCashFlow) + '. The deal underwrites; ' +
              'the portfolio does not.';
      } else if (b.reason === 'guardDSCR') {
        txt = 'Guardrail: buying ' + b.nickname + ' would take portfolio coverage to ' +
              b.value.toFixed(2) + ', below your floor of ' +
              CFG.rules.guardrails.minPortfolioDSCR.toFixed(2) + '. Every property in a ' +
              'failing portfolio passed its own underwriting on the day it was bought.';
      } else if (b.reason === 'guardLTV') {
        txt = 'Guardrail: buying ' + b.nickname + ' would take portfolio leverage to ' +
              (b.value * 100).toFixed(1) + '%, above your ceiling of ' +
              (CFG.rules.guardrails.maxPortfolioLTV * 100).toFixed(0) + '%.';
      } else if (b.reason === 'guardCash') {
        txt = 'Guardrail: buying ' + b.nickname + ' would leave under ' +
              CFG.rules.guardrails.minMonthsExpensesInCash + ' months of living expenses in cash.';
      } else if (b.reason === 'hurdleCoC') {
        txt = b.nickname + ' clears the bank but not you — cash-on-cash of ' +
              (b.value * 100).toFixed(1) + '% against your ' +
              (CFG.rules.hurdle.minCoC * 100).toFixed(1) + '% hurdle.';
      } else if (b.reason === 'hurdleCap') {
        txt = b.nickname + ' returns a ' + (b.value * 100).toFixed(2) + '% cap rate, under your ' +
              (CFG.rules.hurdle.minCapRate * 100).toFixed(2) + '% hurdle.';
      } else if (b.reason === 'hurdleCFU') {
        txt = b.nickname + ' would earn ' + fmtDollars(b.value) + '/unit/mo, under your ' +
              fmtDollars(CFG.rules.hurdle.minCashFlowPerUnit) + ' hurdle.';
      } else {
        txt = b.nickname + ' would not cash flow on day one.';
      }
      var key = b.reason + '|' + b.nickname;
      if (TL_FILTER === 'all' || key !== lastBlockedKey || r.date.m === 0) {
        main.appendChild(h('div', { class: 'tl-note blocked' }, txt));
      }
      lastBlockedKey = key;
    }

    list.appendChild(h('div', { class: cls }, [h('div', { class: 'tl-when' }, fmtMonth(r.date)), main]));
  });

  root.appendChild(h('section', { class: 'panel' }, [
    h('div', { class: 'panel-head' }, [
      h('div', {}, [h('h2', { class: 'panel-title' }, 'Month by month'),
        h('div', { class: 'panel-note' }, shown.length + ' of ' + rows.length + ' months shown')]),
      filterBtns
    ]),
    h('div', { class: 'panel-body tight' }, list)
  ]));
}
function stat(k, v, bad) {
  return h('span', { class: 'tl-stat' }, [h('span', {}, k), h('b', { style: bad ? 'color:var(--crit-ink)' : '' }, v)]);
}

function dealCard(a) {
  var uw = a.uw, p = a.property;
  var productName = { investment: 'Conventional investment', fha: 'FHA owner-occupied',
                      dscr: 'DSCR', commercial: 'Portfolio / commercial' }[uw.product] || uw.product;
  var cells = [
    ['Price', fmtDollars(p.purchasePrice)],
    ['Down ' + fmtPct(uw.downPct, 1), fmtDollars(p.purchasePrice * uw.downPct)],
    ['Closing', fmtDollars(uw.closing)],
    [p.units + ' units · rent', fmtDollars(uw.grossRent) + '/mo'],
    ['Loan', fmtDollars(uw.loanAmount)],
    ['Rate', fmtPct(uw.rate, 2)],
    ['P&I', fmtDollars(uw.payment) + '/mo'],
    ['Property tax', fmtDollars(p.annualTax) + '/yr'],
    ['Insurance', fmtDollars(p.annualInsurance) + '/yr'],
    ['NOI', fmtDollars(uw.noiMonthly) + '/mo'],
    ['Cash flow', fmtDollars(uw.cashFlowMonthly) + '/mo'],
    [uw.usedMarketRent ? 'DSCR (market rent)' : 'DSCR', uw.dscr.toFixed(2)],
    ['Cash-on-cash', fmtPct(uw.coc)],
    ['Cap rate', fmtPct(uw.capRate)],
    ['Cash out of pocket', fmtDollars(uw.cashNeeded)],
    ['Cash left after', fmtDollars(a.cashAfter)]
  ];
  if (uw.usedMarketRent) cells.push(['DSCR on rent today', uw.dscrInPlace.toFixed(2)]);
  if (p.ownerUtilitiesMonthly > 0) cells.push(['Utilities you pay', fmtDollars(p.ownerUtilitiesMonthly) + '/mo']);
  if (p.targetRents && p.rentRampLeft > 0) {
    var nowG = p.unitRents.reduce(function (a, b) { return a + b; }, 0);
    var tgtG = p.targetRents.reduce(function (a, b) { return a + b; }, 0);
    if (tgtG > nowG) cells.push(['Rent once at market', fmtDollars(tgtG) + '/mo']);
  }
  if (uw.mipMonthly > 0) cells.splice(7, 0, ['FHA MIP', fmtDollars(uw.mipMonthly) + '/mo']);
  if (uw.balloonMonths) cells.push(['Balloon', (uw.balloonMonths / 12) + ' yrs']);
  if (p.units >= CFG.market.commercialUnitThreshold) cells.push(['Tax class', 'Commercial']);

  return h('div', { class: 'deal' }, [
    h('div', { class: 'deal-head' }, [
      h('span', { class: 't' }, 'Property #' + p.seq + ' — ' + p.nickname),
      h('span', { class: 's' }, productName + ' · ' + (p.origin === 'archetype' ? 'archetype' : 'from your library'))
    ]),
    h('div', { class: 'deal-grid' }, cells.map(function (c) {
      return h('div', { class: 'deal-cell' }, [h('div', { class: 'k' }, c[0]), h('div', { class: 'v' }, c[1])]);
    }))
  ]);
}

/* ============================================================================
   PORTFOLIO TAB
   ========================================================================== */
function renderPortfolio() {
  var root = clear($('tab-portfolio'));
  if (!RES) return;
  var rows = RES.rows, labels = rows.map(function (r) { return fmtMonthShort(r.date); });
  var markers = RES.acquisitions.map(function (a) { return { i: a.monthIndex }; });
  var s0 = RES.summary;

  /* --- headline --- */
  root.appendChild(panel('Where this ends up', 'After ' + CFG.setup.horizonYears + ' years, on ' +
    fmtMoney(s0.totalContributed) + ' of your own money.', [
    h('div', { class: 'readout', style: 'grid-template-columns:repeat(auto-fit,minmax(118px,1fr))' }, [
      ro('Properties', String(s0.finalProperties)), ro('Units', String(s0.finalUnits)),
      ro('Portfolio value', fmtMoney(s0.finalValue)), ro('Debt', fmtMoney(s0.finalDebt)),
      ro('Equity', fmtMoney(s0.finalEquity)), ro('Cash', fmtMoney(s0.finalCash)),
      ro('Net worth', fmtMoney(s0.finalNetWorth)),
      ro('Cash flow/mo', fmtDollars(s0.finalMonthlyCashFlow), s0.finalMonthlyCashFlow > 0 ? 'good' : 'bad')
    ]),
    (s0.helocBalance > 0 || s0.suspendedLosses > 1000 || s0.exchanges > 0 || s0.totalRefiProceeds > 0)
      ? h('div', { class: 'readout', style: 'grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-top:9px' }, [
          s0.totalRefiProceeds > 0 ? ro('Pulled out by refinancing', fmtMoney(s0.totalRefiProceeds)) : null,
          s0.helocBalance > 0 ? ro('HELOC still owed', fmtMoney(s0.helocBalance), 'bad') : null,
          s0.helocInterestPaid > 0 ? ro('HELOC interest paid', fmtMoney(s0.helocInterestPaid), 'bad') : null,
          s0.exchanges > 0 ? ro('1031 exchanges', String(s0.exchanges)) : null,
          s0.deferredGain > 0 ? ro('Gain deferred', fmtMoney(s0.deferredGain)) : null,
          s0.suspendedLosses > 1000 ? ro('Suspended losses', fmtMoney(s0.suspendedLosses), 'bad') : null,
          s0.ownerOccupancies > 1 ? ro('Times you moved in', String(s0.ownerOccupancies)) : null
        ].filter(Boolean))
      : null,
    h('div', { class: 'callout' + (s0.finalNetWorth > s0.totalContributed * 2 ? ' good' : '') },
      'You contribute ' + fmtMoney(s0.totalContributed) + ' and end with ' + fmtMoney(s0.finalNetWorth) +
      ' — a multiple of ' + (s0.finalNetWorth / Math.max(1, s0.totalContributed)).toFixed(2) + 'x. ' +
      (s0.freedomDate ? 'Cash flow covers your living expenses from ' + fmtMonth(s0.freedomDate.date) + '.'
                      : 'Cash flow never reaches your living expenses within this horizon.'))
  ]));

  /* --- net worth build --- */
  var nwSeries = [
    { name: 'Equity', color: 'var(--s1)', values: rows.map(function (r) { return r.equity; }) },
    { name: 'Cash', color: 'var(--s2)', values: rows.map(function (r) { return Math.max(0, r.cash); }) },
    { name: 'CapEx', color: 'var(--s3)', values: rows.map(function (r) { return r.capexPool; }) }
  ];
  root.appendChild(panel('Net worth, and what it is made of', 'Equity is property value minus debt. It compounds from three places at once: your contributions, the tenants paying down principal, and appreciation.', [
    chart({ series: nwSeries, xLabels: labels, height: 260, stacked: true, markers: markers }),
    legend(nwSeries)
  ]));

  /* --- cash flow --- */
  var cfVals = rows.map(function (r) { return r.cashFlow; });
  root.appendChild(panel('Monthly cash flow', 'Every step up is an acquisition. Every dip is a big-ticket repair, a management fee kicking in, or a vacancy.', [
    chart({
      series: [{ name: 'Cash flow', color: 'var(--s1)', values: cfVals }],
      xLabels: labels, height: 230, markers: markers,
      refLines: CFG.setup.personalMonthlyExpenses > 0
        ? [{ y: CFG.setup.personalMonthlyExpenses, label: 'your living expenses', color: 'var(--s3)' }] : [],
      tipFmt: fmtDollars, endLabels: false
    }),
    h('div', { class: 'chart-note' }, 'Cash flow is after every operating expense, debt service, the CapEx accrual, management, and estimated tax.')
  ]));

  /* --- yearly table --- */
  root.appendChild(panel('Year by year', null, [
    h('div', { class: 'tablewrap' }, yearTable())
  ]));

  /* --- roster --- */
  if (RES.properties.length) {
    root.appendChild(panel('What you own at the end', null, [
      h('div', { class: 'tablewrap' }, rosterTable())
    ]));
  }

  /* --- expense anatomy --- */
  root.appendChild(panel('Where the rent actually goes', 'Final-year monthly averages. The gap between gross rent and what you keep is the whole game.', [
    expenseBreakdown()
  ]));

  /* --- projections --- */
  var pr = RES.projection;
  root.appendChild(panel('If you stopped buying today', 'Acquisition paused at the end of the horizon; existing loans keep amortizing.', [
    h('div', { class: 'readout', style: 'grid-template-columns:repeat(auto-fit,minmax(150px,1fr))' }, [
      ro('Everything paid off in', pr.payoffYears ? pr.payoffYears.toFixed(1) + ' yrs' : '—'),
      ro('Cash flow once debt-free', fmtDollars(pr.cashFlowAfterPayoff) + '/mo', 'good'),
      ro('Portfolio value in 10 yrs', fmtMoney(pr.valueIn10)),
      ro('Portfolio value in 20 yrs', fmtMoney(pr.valueIn20))
    ]),
    h('div', { class: 'callout' }, 'Once the mortgages are gone the debt service stops but the rent does not. That is where the ' +
      fmtDollars(pr.cashFlowAfterPayoff) + '/mo figure comes from — in today’s rent, not inflated dollars.')
  ]));
}

function ro(k, v, cls) {
  return h('div', {}, [h('div', { class: 'k' }, k), h('div', { class: 'v ' + (cls || '') }, v)]);
}

function yearTable() {
  var cols = ['Year', 'Buys', 'Props', 'Units', 'Gross rent', 'NOI', 'Debt svc', 'CapEx spent', 'Tax', 'Cash flow', 'Cash', 'Equity', 'Net worth'];
  return h('table', {}, [
    h('thead', {}, h('tr', {}, cols.map(function (c) { return h('th', {}, c); }))),
    h('tbody', {}, RES.years.map(function (y) {
      return h('tr', {}, [
        h('td', {}, String(y.year)),
        h('td', { class: 'n' }, y.acquisitions ? String(y.acquisitions) : '·'),
        h('td', { class: 'n' }, String(y.endProperties)),
        h('td', { class: 'n' }, String(y.endUnits)),
        h('td', { class: 'n' }, fmtMoney(y.grossRent)),
        h('td', { class: 'n' }, fmtMoney(y.noi)),
        h('td', { class: 'n' }, fmtMoney(y.debtService)),
        h('td', { class: 'n' }, y.capexSpent ? fmtMoney(y.capexSpent) : '·'),
        h('td', { class: 'n' }, y.taxPaid ? fmtMoney(y.taxPaid) : '·'),
        h('td', { class: 'n', style: y.cashFlow < 0 ? 'color:var(--crit-ink)' : '' }, fmtMoney(y.cashFlow)),
        h('td', { class: 'n' }, fmtMoney(y.endCash)),
        h('td', { class: 'n' }, fmtMoney(y.endEquity)),
        h('td', { class: 'n' }, fmtMoney(y.endNetWorth))
      ]);
    }))
  ]);
}

function rosterTable() {
  var last = RES.rows[RES.rows.length - 1];
  return h('table', {}, [
    h('thead', {}, h('tr', {}, ['Property', 'Bought', 'Units', 'Paid', 'Value now', 'Loan balance', 'Equity', 'Loan type', 'Cash invested', 'Cash flow to date']
      .map(function (c) { return h('th', {}, c); }))),
    h('tbody', {}, RES.properties.map(function (p) {
      return h('tr', {}, [
        h('td', {}, p.nickname),
        h('td', { class: 'n' }, fmtMonth(p.purchaseDate)),
        h('td', { class: 'n' }, String(p.units)),
        h('td', { class: 'n' }, fmtMoney(p.purchasePrice)),
        h('td', { class: 'n' }, fmtMoney(p.currentValue)),
        h('td', { class: 'n' }, fmtMoney(p.loan.balance)),
        h('td', { class: 'n' }, fmtMoney(p.currentValue - p.loan.balance)),
        h('td', {}, p.product),
        h('td', { class: 'n' }, fmtMoney(p.totalCashInvested)),
        h('td', { class: 'n' }, fmtMoney(p.cumCashFlow))
      ]);
    }))
  ]);
}

function expenseBreakdown() {
  var rows = RES.rows.slice(-12);
  if (!rows.length || !rows[rows.length - 1].properties) return h('div', { class: 'empty' }, 'Nothing owned yet.');
  var avg = function (k) { return rows.reduce(function (a, r) { return a + r[k]; }, 0) / rows.length; };
  var gross = avg('grossRent');
  if (gross <= 0) return h('div', { class: 'empty' }, 'No rent yet.');
  var parts = [
    ['Vacancy', avg('vacancyLoss'), 'var(--s5)'],
    ['Property tax', avg('opTax'), 'var(--s2)'],
    ['Insurance', avg('opInsurance'), 'var(--s4)'],
    ['Utilities you pay', avg('opUtilities'), 'var(--s2)'],
    ['Maintenance', avg('opMaint'), 'var(--s3)'],
    ['CapEx reserve', avg('opCapex'), 'var(--s6)'],
    ['Management', avg('opMgmt'), 'var(--s5)'],
    ['Debt service', avg('debtService'), 'var(--s1)']
  ].filter(function (p) { return p[1] > 0.5; });
  var kept = gross - parts.reduce(function (a, p) { return a + p[1]; }, 0);

  var bar = h('div', { style: 'display:flex;height:34px;border-radius:6px;overflow:hidden;gap:2px;margin-bottom:10px' });
  parts.concat([['You keep', Math.max(0, kept), 'var(--good)']]).forEach(function (p) {
    if (p[1] <= 0) return;
    bar.appendChild(h('div', { style: 'flex:' + p[1] + ';background:' + p[2] + ';min-width:2px', title: p[0] }));
  });

  return h('div', {}, [
    bar,
    h('div', { class: 'tablewrap' }, h('table', {}, [
      h('thead', {}, h('tr', {}, ['Line', 'Per month', 'Share of gross rent'].map(function (c) { return h('th', {}, c); }))),
      h('tbody', {}, parts.concat([['You keep', kept, 'var(--good)']]).map(function (p) {
        return h('tr', {}, [
          h('td', {}, [h('i', { style: 'display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;background:' + p[2] }), p[0]]),
          h('td', { class: 'n' }, fmtDollars(p[1])),
          h('td', { class: 'n' }, fmtPct(p[1] / gross))
        ]);
      })),
      h('tfoot', {}, h('tr', {}, [h('td', {}, 'Gross scheduled rent'), h('td', { class: 'n' }, fmtDollars(gross)), h('td', { class: 'n' }, '100%')]))
    ]))
  ]);
}

