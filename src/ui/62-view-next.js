/* ============================================================================
   WHAT DO I DO NEXT? — the next 18 months of the plan you are using: the
   next purchase and the cash behind it, what to ask the lender, the dated
   events ahead, and the triggers that would change the plan.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state, U = FPE.util;
  var root = null;

  function mount(r) { root = r; update(); }

  function update() {
    if (!root) return;
    UI.clear(root);
    var A = S.action, base = S.base;
    if (!A || !base) { root.appendChild(h('div', { class: 'empty' }, 'Running…')); return; }
    var N = A.next;
    var intro = h('p', { class: 'panel-sub', style: { marginBottom: '14px' } },
      'From the plan in the rail, as the calm run plays it. If a real month goes differently — a deal falls through, a tenant leaves — change the inputs and this page follows.');
    root.appendChild(intro);

    if (!N) {
      root.appendChild(h('div', { class: 'panel' }, h('div', { class: 'panel-body' },
        h('h2', { class: 'panel-title' }, 'No purchase in the next ' + Math.round((A.to - A.from) / 12 * 10) / 10 + ' years'),
        h('p', { class: 'sentence', style: { marginTop: '8px' } }, whyNone(base)))));
    } else {
      var cashNow = base.rows[0] ? base.rows[0].cash : S.cfg.plan.startingCash;
      var need = N.cashToClose + (N.cashAfter != null ? N.cashAfter : 0);
      var pct = Math.max(0, Math.min(1, cashNow / Math.max(1, N.cashBefore || need)));
      var left = h('div', null,
        h('div', { class: 'eyebrow' }, 'Next purchase · ' + UI.monthsFrom(A.from, N.t)),
        h('div', { class: 'bignum', style: { fontSize: '52px' } }, UI.monthLabel(N.t)),
        h('p', { class: 'sentence', style: { marginTop: '8px' } },
          'A ' + N.units + '-unit building' + (N.origin === 'library' ? ' (' + N.nickname + ', from your listings)' : ' like the ' + N.nickname.toLowerCase() + ' archetype') +
          ' at about ' + UI.money(N.price) + ', on ' + (N.productName === 'FHA' ? 'an FHA loan' : 'a ' + N.productName) + ' at ' + UI.pct(N.rate, 2) +
          (N.ownerOcc ? ' — and you move in.' : '.')),
        h('div', { class: 'progress', style: { height: '8px', marginTop: '16px' } }, h('i', { style: { width: (pct * 100) + '%' } })),
        h('div', { class: 'progress-label' }, 'Cash today ' + UI.money(cashNow) + ' of about ' + UI.money(N.cashBefore) + ' the plan holds the month before it buys.'),
        h('div', { class: 'trio' },
          h('div', null, h('div', { class: 'kv-k' }, 'Cash flow, day one'), h('div', { class: 'kv-v', style: { color: N.dayOneCF < 0 ? 'var(--crit)' : 'var(--good)' } }, UI.perMonth(N.dayOneCF))),
          h('div', null, h('div', { class: 'kv-k' }, 'Once rents reach market'), h('div', { class: 'kv-v', style: { color: N.stabilizedCF < 0 ? 'var(--crit)' : 'var(--good)' } }, UI.perMonth(N.stabilizedCF))),
          h('div', null, h('div', { class: 'kv-k' }, 'Yield, stabilized'), h('div', { class: 'kv-v' }, UI.pct(N.stabilizedYield, 1)))));
      var ledger = h('div', { class: 'ledger' },
        row('Down payment', UI.money(N.down)),
        row('Closing costs' + (N.closing > N.price * 0.04 ? ' and points' : ''), UI.money(N.closing)),
        N.cashToClose - N.down - N.closing > 1 ? row('Refresh and other costs at closing', UI.money(N.cashToClose - N.down - N.closing)) : null,
        h('div', { class: 'total' }, h('span', null, 'Cash to close'), h('span', null, UI.money(N.cashToClose))),
        row('Reserves the lender wants to see after closing', UI.money(N.reserves)),
        row('Left in your accounts after closing (plan)', UI.money(N.cashAfter)),
        N.heloc > 0 ? row('Drawn on the HELOC', UI.money(N.heloc)) : null,
        row('Payment with mortgage insurance', UI.perMonth(N.payment)),
        row('Payment with tax and insurance', UI.perMonth(N.pitia)));
      root.appendChild(h('div', { class: 'panel' }, h('div', { class: 'panel-body' }, h('div', { class: 'nextcard' }, left, h('div', null, h('h3', { style: { fontSize: '14px', marginBottom: '6px' } }, 'The cash it takes'), ledger)))));
      var blocks = Object.keys(N.blockers || {});
      if (blocks.length) {
        var WHYW = { cash: 'saving the cash', noDeals: 'waiting for the right building to list', dealFlow: 'spacing out closings', negativeCashFlow: 'waiting for cash flow to recover', stopDate: 'past your last-purchase date' };
        root.appendChild(h('p', { class: 'reading', style: { marginBottom: '16px' } }, 'Until then the plan is ' + blocks.map(function (b) { return (WHYW[b] || b) + ' (' + UI.plural(N.blockers[b], 'month') + ')'; }).join(', ') + '.'));
      }
      root.appendChild(h('div', { class: 'cols2' },
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Ask the lender')),
          h('div', { class: 'panel-body' }, h('ol', { class: 'plain' }, N.ask.map(function (q) { return h('li', null, q); })))),
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Before you offer on any building')),
          h('div', { class: 'panel-body' }, h('ul', { class: 'checklist' }, [
            { what: 'Rent roll and leases', why: 'The plan leans on rents rising at turnover; know every lease end date.' },
            { what: 'Two years of utility bills', why: 'Owner-paid heat in Fargo winters swings the cash flow more than most rents.' },
            { what: 'The Cass County tax statement', why: 'Including special assessments, which sit outside the levy.' },
            { what: 'An inspection that dates the roof, boiler or furnaces and water heaters', why: 'The plan assumes they are mid-life.' },
            { what: 'Run it in "Should I buy this one?"', why: 'The verdict is the change to your headline, not the cap rate.' }
          ].map(function (c) { return h('li', null, h('div', null, h('b', null, c.what), h('span', null, c.why))); }))))));
    }

    root.appendChild(h('div', { class: 'cols2', style: { marginTop: '16px' } },
      h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'The next 18 months'),
        h('p', { class: 'panel-sub' }, 'Saving about ' + UI.perMonth(A.savings) + ' on average in this window.')),
        h('div', { class: 'panel-body' }, A.events.length ? h('div', null, A.events.map(function (e) {
          return h('div', { class: 'month' }, h('div', { class: 'month-when' }, e.label), h('div', { class: 'month-ev' }, e.text));
        })) : h('div', { class: 'empty' }, 'Nothing is scheduled: the plan is saving.'))),
      h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Watch for')),
        h('div', { class: 'panel-body' }, A.watch.length ? h('ul', { class: 'plain' }, A.watch.map(function (w) { return h('li', null, w.text); })) : h('div', { class: 'empty' }, 'No triggers set.')))));
  }
  function row(k, v) { return h('div', null, h('span', null, k), h('span', null, v)); }

  function whyNone(base) {
    var counts = {};
    base.rows.slice(0, 18).forEach(function (r) { if (r.blocked) counts[r.blocked.blocked] = (counts[r.blocked.blocked] || 0) + 1; });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    var W = { cash: 'there is not yet enough cash for a down payment, closing costs and the cushion you keep', noDeals: 'no building you would buy lists while you are ready',
              stopDate: 'your plan has stopped buying', negativeCashFlow: 'the rentals\' cash flow is negative, which pauses buying', jobLoss: 'you are out of work' };
    return 'Most months the reason is: ' + (W[top] || top || 'nothing qualifies') + '. See the timeline for each month.';
  }

  UI.on('base', function () { if (S.view === 'next') update(); });
  UI.views = UI.views || {};
  UI.views.next = { title: 'What do I do next?', mount: mount, update: update };
})(UI);
