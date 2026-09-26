/* Builds the single self-contained page: dist/fargo-portfolio-engine.html.

   The page is src/ui/page.html with three slots filled:
     /*@CSS@*\/     src/ui/styles.css
     /*@ENGINE@*\/  the engine bundle (data + src/engine + src/analysis), in a
                    <script id="fpe-engine"> so the page can hand the same
                    source to its Web Workers
     /*@UI@*\/      src/ui/*.js in filename order
   Slots are filled with replacer FUNCTIONS: a replacement string would treat
   the "$&" and "$1" sequences inside the code as capture references.
   The output has no doctype/html/head/body: the Artifact skeleton adds them.

   node tools/build.js            build
   node tools/build.js --check    build and report sizes only              */
var fs = require('fs');
var path = require('path');
var bundle = require('./bundle.js');

function fill(template, slot, text) {
  if (template.indexOf(slot) < 0) throw new Error('slot ' + slot + ' missing from page.html');
  return template.replace(slot, function () { return text; });
}
function scriptSafe(name, src) {
  if (/<\/script/i.test(src)) throw new Error(name + ' contains "</script" — it would end the script element early');
  if (/<!--/.test(src)) throw new Error(name + ' contains "<!--" — the HTML parser would treat the script oddly');
  new Function(src);                     // parse check: fail the build, not the page
  return src;
}

function build() {
  var engine = scriptSafe('engine', bundle.engineSource());
  var ui = scriptSafe('ui', bundle.uiSource());
  var css = bundle.read('src/ui/styles.css');
  var page = bundle.read('src/ui/page.html');
  var html = fill(fill(fill(page, '/*@CSS@*/', css), '/*@ENGINE@*/', engine), '/*@UI@*/', ui);
  if (/<!doctype|<html|<head|<body/i.test(html.slice(0, 2000))) throw new Error('page.html must not carry its own document skeleton');
  var titleAt = html.indexOf('<title>');
  if (titleAt < 0 || titleAt > 8000) throw new Error('<title> must sit in the first 8KB');
  var out = path.join(bundle.ROOT, 'dist', 'fargo-portfolio-engine.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return { file: out, bytes: Buffer.byteLength(html), engine: engine.length, ui: ui.length, css: css.length };
}

if (require.main === module) {
  var r = build();
  console.log('built ' + path.relative(process.cwd(), r.file) + ' — ' + (r.bytes / 1024).toFixed(0) + ' KB (engine ' +
    (r.engine / 1024).toFixed(0) + ' KB, interface ' + (r.ui / 1024).toFixed(0) + ' KB, styles ' + (r.css / 1024).toFixed(0) + ' KB)');
}
module.exports = { build: build };
