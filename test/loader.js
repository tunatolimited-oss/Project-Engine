/* Loads the bundled engine into an isolated context, exactly as the browser
   would see it, and returns the FPE namespace. */
var vm = require('vm');
var bundle = require('../tools/bundle.js');

var cached = null;

function loadEngine(fresh) {
  if (cached && !fresh) return cached;
  var ctx = { console: console };
  vm.createContext(ctx);
  vm.runInContext(bundle.engineSource(), ctx, { filename: 'engine-bundle.js' });
  if (!ctx.FPE) throw new Error('engine bundle did not define FPE');
  cached = ctx.FPE;
  return cached;
}

module.exports = { loadEngine: loadEngine };
