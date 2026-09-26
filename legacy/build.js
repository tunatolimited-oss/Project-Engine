/* Assemble src/* into a single self-contained dist/index.html */
var fs = require('fs'), path = require('path');
var SRC = path.join(__dirname, 'src'), DIST = path.join(__dirname, 'dist');
function read(f) { return fs.readFileSync(path.join(SRC, f), 'utf8'); }

var js = ['engine.js', 'defaults.js', 'ui.js', 'ui2.js', 'ui4.js', 'ui3.js']
  .map(function (f) {
    var body = read(f);
    /* strip the node-only export tail; the browser gets one shared scope */
    body = body.replace(/if \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*?\n\}\n?$/m, '');
    return '/* ===== ' + f + ' ===== */\n' + body.trim();
  }).join('\n\n');

var css = read('styles.css');
/* Replacer FUNCTIONS, not strings: a literal "$'" or "$&" in the replacement
   would otherwise be read as a substitution pattern and eat the file. */
var html = read('page.html')
  .replace('/*__CSS__*/', function () { return css; })
  .replace('/*__JS__*/', function () { return js; });

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), html);

var kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('Built dist/index.html — ' + kb + ' KB');

/* sanity checks on the emitted file */
var problems = [];
if (/<!doctype|<html|<head>|<body>/i.test(html)) problems.push('contains a document skeleton tag');
if (/__CSS__|__JS__/.test(html)) problems.push('a placeholder was not substituted');
if (!/<title>/.test(html)) problems.push('missing <title>');
if (html.length > 16 * 1024 * 1024) problems.push('over the 16MB limit');
var ext = html.match(/(?:src|href)="https?:\/\/([^\/"]+)/g) || [];
ext.forEach(function (u) {
  if (!/fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com/.test(u))
    problems.push('external resource not on the allowlist: ' + u);
});
if (/module\.exports/.test(html)) problems.push('node export tail survived into the bundle');
/* the bundled script must actually parse */
try { new Function(js); } catch (e) { problems.push('bundled JS does not parse: ' + e.message); }
if (problems.length) { console.error('\nPROBLEMS:'); problems.forEach(function (p) { console.error('  x ' + p); }); process.exit(1); }
console.log('Bundle checks passed.');

