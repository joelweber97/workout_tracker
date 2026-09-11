/*
 * Copies the Capacitor runtime and the native plugins the app uses into
 * web/js/vendor/, so `web/` stays a plain static tree with no bundler.
 *
 * The plugins' ESM builds import '@capacitor/core' by bare specifier and their
 * own files without extensions ('./definitions'); browsers accept neither. An
 * import map in index.html resolves the bare specifiers, and this script adds
 * the '.js' extensions while copying. Re-run after `npm install` bumps a
 * plugin; the output is committed.
 *
 * Run: node tools/vendor.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'js', 'vendor');

const PACKAGES = [
  { name: '@capacitor/core', files: ['dist/index.js'], rename: { 'dist/index.js': 'index.js' } },
  { name: '@capacitor/haptics', files: ['dist/esm/index.js', 'dist/esm/definitions.js', 'dist/esm/web.js'] },
  { name: '@capacitor/local-notifications', files: ['dist/esm/index.js', 'dist/esm/definitions.js', 'dist/esm/web.js'] },
];

function addExtensions(source) {
  // from './definitions'  ->  from './definitions.js'   (static and dynamic imports)
  return source.replace(/(from\s+|import\()\s*'(\.\/[^'.]+)'/g, "$1'$2.js'");
}

fs.rmSync(OUT, { recursive: true, force: true });

for (const pkg of PACKAGES) {
  const version = require(path.join(ROOT, 'node_modules', pkg.name, 'package.json')).version;
  for (const file of pkg.files) {
    const src = path.join(ROOT, 'node_modules', pkg.name, file);
    const outName = pkg.rename?.[file] ?? path.basename(file);
    const dest = path.join(OUT, pkg.name, outName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, addExtensions(fs.readFileSync(src, 'utf8')));
  }
  console.log(`vendored ${pkg.name}@${version}`);
}
