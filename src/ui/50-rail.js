/* ============================================================================
   THE RAIL — "Your plan": the dozen inputs that move the answer most, and
   the strategies currently switched on. Everything else lives in
   Assumptions and Strategies.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state;

  var SECTIONS = [
    ['Goal', ['plan.objective.kind', 'plan.objective.targetMonth', 'plan.objective.confidence', 'plan.objective.salaryBuffer']],
    ['Money', ['plan.startingCash', 'plan.contributions', 'plan.livingExpenses', 'plan.housingRent']],
    ['Work', ['income.w2.enabled', 'income.w2.schedule', 'life.career.partTime.enabled', 'life.career.partTime.annualIncome',
              'life.career.quit.enabled', 'life.hours.budgetFullTime']],
    ['Where you live', ['life.houseHack.enabled', 'life.houseHack.stayMonths', 'life.houseHack.count', 'life.ownHome.enabled']],
    ['Waiting cash', ['cash.policy']],
    ['Time frame', ['plan.startMonth', 'plan.horizonYears']]
  ];

  function mount() {
    var rail = UI.$('rail');
    UI.clear(rail);
    rail.appendChild(h('p', { class: 'rail-intro' }, 'The inputs that move the answer most. Every change re-runs the plan.'));
    SECTIONS.forEach(function (sec) {
      rail.appendChild(h('h2', null, sec[0]));
      var g = h('div', { class: 'group' });
      sec[1].forEach(function (p) {
        var f = UI.fieldByPath(p, { hideNote: true });
        if (f) g.appendChild(f.el);
      });
      rail.appendChild(g);
    });
    rail.appendChild(h('h2', null, 'Switched on'));
    var chips = h('div', { class: 'onchips', id: 'rail-on' });
    rail.appendChild(chips);
    rail.appendChild(h('div', { style: { marginTop: '18px' } },
      UI.armedButton('Reset everything to defaults', 'Click again to reset', function () {
        var prev = UI.snapshot();
        UI.loadPlan({ id: S.planId, name: S.planName, cfg: FPE.defaultConfig(), wouldDo: UI.defaultsWouldDo() }, { dirty: true });
        UI.toast('Reset to defaults', { label: 'Undo', run: function () { UI.loadPlan(prev, { dirty: true }); } });
      }, 'ghost')));
    renderOn();
  }

  function renderOn() {
    var box = UI.$('rail-on');
    if (!box) return;
    UI.clear(box);
    var on = FPE.catalogue.ENTRIES.filter(function (e) {
      if (!e.on || e.info) return false;
      if (e.id === 'renewalPush' || e.id === 'refresh' || e.id === 'management' || e.id === 'houseHack') return false;   // defaults, shown elsewhere
      return FPE.catalogue.isOn(S.cfg, e);
    });
    if (!on.length) box.appendChild(h('span', { class: 'field-hint' }, 'No optional strategies. Open Strategies to add some, or let "Find better plans" propose them.'));
    on.forEach(function (e) {
      box.appendChild(h('button', { type: 'button', class: 'chip accent', title: e.one, onclick: function () { UI.go('strategies', e.id); } }, e.name));
    });
  }

  UI.on('cfg', renderOn);
  UI.rail = { mount: mount };
})(UI);
