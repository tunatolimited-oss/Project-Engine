/* ============================================================================
   TIMELINE — the calm run year by year, then month by month: every
   purchase with its numbers, every event, and why buying paused.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state, U = FPE.util;
  var root = null, mode = 'events';
  var TYPES = { acquisition: ['Bought', 'accent'], career: ['Career', 'good'], management: ['Manager', ''], refi: ['Refinance', ''], exchange: ['1031', 'accent'],
                balloon: ['Balloon', 'warn'], forcedSale: ['Forced sale', 'crit'], home: ['Home', 'wheat'], moveout: ['Move', ''], license: ['License', ''],
                heat: ['Heat', ''], rubs: ['RUBS', ''], io: ['Payment', 'warn'], paidoff: ['Paid off', 'good'], reps: ['Tax', 'good'], capex: ['Replacement', 'warn'],
                defer: ['Put off', 'warn'], eviction: ['Eviction', 'crit'], mode: ['Unit mode', ''], ancillary: ['Income', ''], appeal: ['Tax appeal', ''],
                heloc: ['HELOC', 'warn'], fund: ['Dry powder', ''], recast: ['Recast', ''], jobloss: ['Job', 'crit'] };
  var BLOCK = { cash: 'Saving for the next purchase', noDeals: 'Waiting for a building to list', dealFlow: 'Spacing out closings', negativeCashFlow: 'Paused: rentals losing money',
                jobLoss: 'Paused: out of work', goalMet: 'Stopped: income goal met', downturnPause: 'Paused: recession', paydownPause: 'Paying down instead of buying',
                stopDate: 'Stopped buying (your date)', dti: 'Lender: debt-to-income too high', dscr: 'Lender: rent does not cover the payment',
                hurdleYield: 'Below your yield hurdle', hurdleCF: 'Below your cash-flow hurdle', guardCashFlow: 'Portfolio guardrail', guardCoverage: 'Portfolio guardrail',
                guardLtv: 'Portfolio guardrail', noOption: 'No loan fits', financedCap: 'Ten financed properties', noIncomeHistory: 'No income history for an agency loan',
                selfSufficiency: 'FHA self-sufficiency fails', oneFha: 'One FHA loan at a time' };

  function mount(r) { root = r; update(); }

  function update() {
    if (!root) return;
    UI.clear(root);
    var base = S.base;
    if (!base) { root.appendChild(h('div', { class: 'empty' }, 'Running…')); return; }
    root.appendChild(h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Year by year'), h('p', { class: 'panel-sub' }, 'The calm run, in the dollars of each year. Partial first and last years.')),
      h('div', { class: 'panel-body flush' }, yearTable(base))));
    var toggle = h('div', { class: 'btnrow' },
      h('button', { type: 'button', class: 'chip' + (mode === 'events' ? ' accent' : ''), onclick: function () { mode = 'events'; update(); } }, 'Months with events'),
      h('button', { type: 'button', class: 'chip' + (mode === 'all' ? ' accent' : ''), onclick: function () { mode = 'all'; update(); } }, 'Every month'));
    root.appendChild(h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Month by month'), toggle),
      h('div', { class: 'panel-body' }, monthLog(base))));
  }

  function yearTable(base) {
    var cols = ['Year', 'Units', 'Rent collected', 'Net operating income', 'Debt service', 'Cash flow', 'Replacements', 'Income tax paid', 'After-tax income, a month', 'Cash at year end', 'Worth, held'];
    return h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c); }))),
      h('tbody', null, base.years.map(function (y) {
        var months = base.rows.filter(function (r) { return r.year === y.year; }).length || 12;
        return h('tr', null, h('td', null, String(y.year)), h('td', null, y.endUnits),
          h('td', null, UI.money(y.collected)), h('td', null, UI.money(y.noi)), h('td', null, UI.money(y.debtService)),
          h('td', { class: y.cashFlow < 0 ? 'neg' : '' }, UI.money(y.cashFlow)), h('td', null, UI.money(y.capital)),
          h('td', { class: y.taxPaid < 0 ? 'pos' : '' }, UI.money(y.taxPaid)), h('td', { class: y.income < 0 ? 'neg' : '' }, UI.money(y.income / months)),
          h('td', null, UI.money(y.endCash)), h('td', null, UI.money(y.endNW, { compact: true })));
      }))));
  }

  function monthLog(base) {
    var out = h('div');
    var lastBlock = null;
    base.rows.forEach(function (r) {
      var evs = r.events.filter(function (e) { return e.type !== 'acquisition'; });
      var blk = r.blocked ? r.blocked.blocked : null;
      var blockChanged = blk !== lastBlock;
      lastBlock = blk;
      if (mode === 'events' && !evs.length && !r.acquisition && !blockChanged) return;
      var items = [];
      if (r.acquisition) items.push(acqCard(r.acquisition));
      evs.forEach(function (e) {
        var ty = TYPES[e.type] || [e.type, ''];
        items.push(h('div', { class: 'ev' }, h('span', { class: 'chip ' + ty[1] }, ty[0]), h('span', null, e.text)));
      });
      if (blk && (blockChanged || mode === 'all') && !r.acquisition) {
        var need = r.blocked.detail && r.blocked.detail.need ? ' — about ' + UI.money(r.blocked.detail.need) + ' needed, ' + UI.money(r.cash) + ' in hand' : '';
        items.push(h('div', { class: 'ev', style: { color: 'var(--muted)' } }, h('span', { class: 'chip' }, 'Buying'), h('span', null, (BLOCK[blk] || blk) + (blk === 'cash' ? need : ''))));
      }
      if (mode === 'all') items.push(h('div', { class: 'field-hint' }, 'Cash ' + UI.money(r.cash) + ' · cash flow ' + UI.perMonth(r.cashFlow) + ' · ' + UI.plural(r.units, 'unit') + (r.vacancyPct ? ' · vacancy ' + UI.pct(r.vacancyPct, 1) : '')));
      if (!items.length) return;
      out.appendChild(h('div', { class: 'month' }, h('div', { class: 'month-when' }, r.label), h('div', { class: 'month-ev' }, items)));
    });
    return out;
  }

  function acqCard(a) {
    var PN = FPE.actionPlan.PRODUCT;
    function cell(k, v, cls) { return h('div', null, h('div', { class: 'kv-k' }, k), h('div', { class: 'kv-v', style: cls ? { color: 'var(--' + cls + ')' } : null }, v)); }
    return h('div', { class: 'acq' },
      h('div', { class: 'acq-head' }, h('span', null, 'Bought ' + a.nickname + (a.ownerOcc ? ' — you move in' : '')), h('span', { style: { fontWeight: '500', color: 'var(--muted)' } }, PN[a.product] || a.product)),
      h('div', { class: 'acq-grid' },
        cell('Price', UI.money(a.price)), cell('Units', a.units), cell('Rate', UI.pct(a.uw.rate, 2)), cell('Cash to close', UI.money(a.uw.cashToClose)),
        cell('Payment', UI.perMonth(a.uw.payment + a.uw.miMonthly)), cell('Day one', UI.perMonth(a.st.dayOneCF), a.st.dayOneCF < 0 ? 'crit' : 'good'),
        cell('Stabilized', UI.perMonth(a.st.cf), a.st.cf < 0 ? 'crit' : 'good'), cell('Yield', UI.pct(a.st.yield, 1)),
        a.heloc ? cell('HELOC draw', UI.money(a.heloc)) : null));
  }

  UI.on('base', function () { if (S.view === 'timeline') update(); });
  UI.views = UI.views || {};
  UI.views.timeline = { title: 'Timeline', mount: mount, update: update };
})(UI);
