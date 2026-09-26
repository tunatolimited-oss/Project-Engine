/* Assembles the engine source once, for both the browser build and the node
   test loader, so the tests always run exactly the bytes the browser runs.

   Order is load-bearing:
     1. the data file (data/property-data.json), injected as FPE.RAW_DATA
     2. src/engine/*.js   in filename order (00-, 01-, ...)
     3. src/analysis/*.js in filename order
   UI files are separate (uiSource) because a Web Worker needs the engine alone. */
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

function listJs(dir) {
  var abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(function (f) { return /\.js$/.test(f); })
    .sort()
    .map(function (f) { return dir + '/' + f; });
}

function engineFiles() { return listJs('src/engine').concat(listJs('src/analysis')); }
function uiFiles() { return listJs('src/ui'); }

function dataChunk() {
  var raw = read('data/property-data.json');
  JSON.parse(raw);                                   // fail loudly on bad JSON
  return 'var FPE = (typeof FPE !== "undefined" && FPE) ? FPE : {};\n' +
         'FPE.RAW_DATA = ' + raw.trim() + ';';
}

function join(files) {
  return files.map(function (f) {
    return '/* ===== ' + f + ' ===== */\n' + read(f).trim();
  }).join('\n\n');
}

function engineSource() { return dataChunk() + '\n\n' + join(engineFiles()); }
function uiSource() { return join(uiFiles()); }

module.exports = { engineSource: engineSource, uiSource: uiSource,
                   engineFiles: engineFiles, uiFiles: uiFiles, ROOT: ROOT, read: read };
