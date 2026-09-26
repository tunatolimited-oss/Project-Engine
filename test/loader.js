/* Loads the bundled engine exactly as the browser sees it (the same bytes,
   from tools/bundle.js) and returns the FPE namespace.

   The bundle is wrapped in a function and compiled in this realm. A separate
   vm context would isolate it too, but every global lookup (Math, JSON…)
   then crosses the context's global proxy and runs several times slower
   than in a browser, which would make the speed tests meaningless. The
   wrapper keeps the engine's globals out of node's own. */
var vm = require('vm');
var bundle = require('../tools/bundle.js');

var cached = null;

function loadEngine(fresh) {
  if (cached && !fresh) return cached;
  var wrapped = '(function (console) {\n' + bundle.engineSource() + '\nreturn FPE;\n})';
  var fn = vm.runInThisContext(wrapped, { filename: 'engine-bundle.js' });
  var FPE = fn(console);
  if (!FPE || !FPE.runSimulation) throw new Error('engine bundle did not define FPE');
  cached = FPE;
  return cached;
}

module.exports = { loadEngine: loadEngine };
