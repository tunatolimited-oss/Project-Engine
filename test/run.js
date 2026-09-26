/* Runs every test file in test/ whose name ends in .test.js, in order.
   node test/run.js            all
   node test/run.js tax        only files whose name contains "tax"      */
var fs = require('fs');
var path = require('path');
var H = require('./harness.js');

var filter = process.argv[2] || '';
var files = fs.readdirSync(__dirname)
  .filter(function (f) { return /\.test\.js$/.test(f) && f.indexOf(filter) >= 0; })
  .sort();

var t0 = Date.now();
files.forEach(function (f) {
  console.log('\n##### ' + f);
  require(path.join(__dirname, f));
});
var r = H.report();
console.log('(' + files.length + ' files, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
process.exit(r.fail ? 1 : 0);
