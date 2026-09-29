// Site bütünlüğü: kırık link/görsel, görünür placeholder metni, inline JS söz dizimi,
// her sayfada tek h1/main, header/footer varlığı. jsdom gerektirmez.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', '.next', 'node_modules', 'tests', 'prototip-formlar', 'Claude outputs']);
let pass = 0, fail = 0;
function check(n, c, e) { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + n + (e ? '  -> ' + e : '')); } }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    // .next* covers isolated Next.js builds (CMS_BUILD_DIR) such as .next-context-test.
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.next')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = walk(SITE);
const rel = p => path.relative(SITE, p).split(path.sep).join('/');
// Bilinçli olarak placeholder taşıyan şablon: yayın sayfası değil, üretecin kaynağı
const TEMPLATES = new Set(['tr/blog/blog-post-template.html', 'en/blog/blog-post-template.html']);
const PLACEHOLDER = /\[(?:YAZI [A-ZÇĞİÖŞÜ ]+|TARİH|POST [A-Z ]+|DATE)[^\]]*(?:BURAYA|HERE)[^\]]*\]|yer tutucudur|is a placeholder|Lorem ipsum|placehold\.co/i;

console.log('\n[' + pages.length + ' sayfa taranıyor]');
for (const p of pages) {
  const r = rel(p);
  const s = fs.readFileSync(p, 'utf8');
  const dir = path.dirname(p);

  // 1) kırık iç referans (src/href). Alpine bağlamaları (:src, :href) ve JS ifadeleri hariç.
  const refs = [...s.matchAll(/(?<![:\w-])(?:src|href)="([^"]+)"/g)].map(m => m[1])
    .filter(u => !/^(https?:|mailto:|tel:|#|data:|javascript:)/.test(u) && !/['+{}]/.test(u));
  const broken = [...new Set(refs)].filter(u => {
    const clean = u.split('#')[0].split('?')[0];
    return clean && !fs.existsSync(path.join(dir, clean));
  });
  check(r + ': kırık referans yok', broken.length === 0, broken.slice(0, 4).join(', '));

  // 2) görünür placeholder metni (şablonlar ve bilinen yer tutucu hukuki sayfalar hariç)
  if (!TEMPLATES.has(r)) {
    const body = s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const m = body.match(PLACEHOLDER);
    const legal = /(privacy-policy|terms-of-service|disclaimer)\.html$/.test(r);
    if (legal && m && /yer tutucudur|is a placeholder/i.test(m[0])) {
      console.log('  NOTE  ' + r + ': hukuki metin hâlâ yer tutucu (GÖREV 10.8 — avukat bekleniyor)');
    } else {
      check(r + ': görünür placeholder yok', !m, m && m[0]);
    }
  }

  // 3) inline JS söz dizimi
  const scripts = [...s.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  scripts.forEach((code, i) => {
    let ok = true, err = '';
    try { new vm.Script(code); } catch (e) { ok = false; err = e.message; }
    check(r + ': inline script #' + (i + 1) + ' söz dizimi', ok, err);
  });

  // 4) JSON-LD geçerli JSON
  [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].forEach((m, i) => {
    let ok = true, err = '';
    try { JSON.parse(m[1]); } catch (e) { ok = false; err = e.message; }
    check(r + ': JSON-LD #' + (i + 1) + ' geçerli', ok, err);
  });

  // 5) yapı (kök dil seçim sayfası hariç)
  if (r !== 'index.html') {
    check(r + ': tek <h1>', (s.match(/<h1\b/g) || []).length === 1, (s.match(/<h1\b/g) || []).length);
    check(r + ': <main> var', /<main\b/.test(s));
    check(r + ': header/footer var', /<!-- HEADER START -->/.test(s) && /<footer\b/.test(s));
  }
}

console.log('\n[Harici JS dosyaları]');
for (const f of fs.readdirSync(path.join(SITE, 'assets/js')).filter(x => x.endsWith('.js'))) {
  let ok = true, err = '';
  try { new vm.Script(fs.readFileSync(path.join(SITE, 'assets/js', f), 'utf8')); } catch (e) { ok = false; err = e.message; }
  check('assets/js/' + f + ' söz dizimi', ok, err);
}

console.log('\n===== ' + pass + ' geçti, ' + fail + ' kaldı =====');
process.exit(fail ? 1 : 0);
