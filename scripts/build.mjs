// Validates the project and writes the deployable site to dist/.
//   npm run check  -> validation only
//   npm run build  -> validation + dist/
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const checkOnly = process.argv.includes('--check');
const DEPLOY = ['index.html', 'manifest.webmanifest', 'runtime', 'components', 'assets'];
const errors = [];
const fail = (msg) => errors.push(msg);
const exists = (p) => stat(p).then(() => true, () => false);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

// Every local URL referenced by the site (src/href/url()/asset paths in JS strings)
function localRefs(text) {
  const refs = new Set();
  const patterns = [/\b(?:src|href)\s*=\s*"([^"{}]+)"/g, /url\(\s*["']?([^"')]+)["']?\s*\)/g, /['"`](assets\/[^'"`]+)['"`]/g];
  for (const re of patterns) for (const m of text.matchAll(re)) {
    const u = m[1].trim();
    if (!u || /^(?:[a-z]+:|#|\/\/|data:)/i.test(u)) continue;
    refs.add(u.split(/[?#]/)[0]);
  }
  return refs;
}

function balance(text, open, close) {
  let d = 0;
  for (const c of text) { if (c === open) d++; else if (c === close && --d < 0) return false; }
  return d === 0;
}

function checkTags(html, file) {
  const voids = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));
  const stack = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '<$1></$1>');
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const [, closing, rawTag, rest] = m;
    const tag = rawTag.toLowerCase();
    if (voids.has(tag) || rest.trim().endsWith('/') || tag === '!doctype') continue;
    if (!closing) { stack.push(tag); continue; }
    const top = stack.pop();
    if (top !== tag) { fail(`${file}: </${tag}> closes <${top}>`); return; }
  }
  if (stack.length) fail(`${file}: unclosed <${stack.join('>, <')}>`);
}

const referenced = new Set();
const siteFiles = [];
for (const entry of DEPLOY) {
  const p = join(root, entry);
  if (!(await exists(p))) { fail(`missing ${entry}`); continue; }
  siteFiles.push(...((await stat(p)).isDirectory() ? await walk(p) : [p]));
}

const components = new Map();
for (const file of siteFiles.filter((f) => f.endsWith('.dc.html'))) {
  components.set(file.split('/').pop().replace(/\.dc\.html$/, ''), await readFile(file, 'utf8'));
}
if (!components.has('Main')) fail('components/Main.dc.html is missing');

for (const file of siteFiles.filter((f) => /\.(html|js|css)$/.test(f))) {
  const rel = relative(root, file);
  const text = await readFile(file, 'utf8');
  if (text.includes('/_blob/')) fail(`${rel}: still references a canvas /_blob/ URL`);
  // URLs inside components and index.html resolve against the site root (the page URL)
  for (const ref of localRefs(text)) {
    if (/^(?:components|runtime)\//.test(ref) || ref.endsWith('.dc.html')) continue;
    referenced.add(ref);
    if (!(await exists(join(root, ref)))) fail(`${rel}: missing file ${ref}`);
  }
}

for (const [name, src] of components) {
  const file = `components/${name}.dc.html`;
  const open = src.indexOf('<x-dc>'), close = src.lastIndexOf('</x-dc>');
  if (open < 0 || close < open) { fail(`${file}: no <x-dc> block`); continue; }
  checkTags(src.slice(open + 6, close), file);
  for (const css of src.matchAll(/<style>([\s\S]*?)<\/style>/g)) if (!balance(css[1], '{', '}')) fail(`${file}: unbalanced CSS braces`);
  for (const m of src.matchAll(/<dc-import\s+name="([^"]+)"/g)) if (!components.has(m[1])) fail(`${file}: imports missing component ${m[1]}`);
  const props = src.match(/data-props='([^']*)'/);
  if (props) { try { JSON.parse(props[1]); } catch (e) { fail(`${file}: data-props is not valid JSON (${e.message})`); } }
  const script = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (script) {
    try {
      const Component = new vm.Script(`(function(DCLogic){${script[1]}\n;return Component;})`).runInNewContext({})(class DCLogic {});
      if (typeof Component !== 'function' || typeof Component.prototype.renderVals !== 'function') fail(`${file}: logic class has no renderVals()`);
    } catch (e) { fail(`${file}: logic script does not compile — ${e.message}`); }
  }
}

const index = await readFile(join(root, 'index.html'), 'utf8');
for (const s of ['runtime/dc-lite.js', 'react.production.min.js', 'react-dom.production.min.js', "'Main'"]) {
  if (!index.includes(s)) fail(`index.html: expected reference to ${s}`);
}
try { new vm.Script(await readFile(join(root, 'runtime/dc-lite.js'), 'utf8')); } catch (e) { fail(`runtime/dc-lite.js: ${e.message}`); }

const assets = siteFiles.filter((f) => f.startsWith(join(root, 'assets')));
const unused = assets.map((f) => relative(root, f)).filter((f) => !referenced.has(f));
if (unused.length) console.warn(`warning: unreferenced assets: ${unused.join(', ')}`);

if (errors.length) {
  console.error(`\n✗ ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ ${components.size} components, ${referenced.size} referenced assets, ${siteFiles.length} site files — all references resolve`);

if (!checkOnly) {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist);
  for (const entry of DEPLOY) await cp(join(root, entry), join(dist, entry), { recursive: true });
  console.log(`✓ built ${relative(process.cwd(), dist) || 'dist'}/`);
}
