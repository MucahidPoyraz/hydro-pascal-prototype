// TR/EN açık tema tutarlılık testi — 2026-09-21 hatasının regresyon koruması.
//
// Hata: "Custom Manufacturing" bandı EN'de açık temada okunmuyordu. Sebep: TR
// sayfaları eksik token eşlemelerini kendi <style> bloğunda yamalıyor, EN'de o
// yama yok. Bu test, TR'nin yamaladığı her sınıfın ya EN'de de yamalandığını ya
// da theme.css'te <main> kapsamında token'a bağlandığını doğrular.
//
// Not: Bu STATİK bir kontroldür, görsel render DEĞİLDİR. Bir sınıf theme.css'in
// başka bir genel kuralıyla (ör. "section.bg-gradient-to-br" arka planı komple
// değiştirir) dolaylı olarak kapsanıyorsa, o sınıf aşağıdaki DOLAYLI_KAPSANAN
// listesine gerekçesiyle eklenmelidir.
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '..');
const BS = String.fromCharCode(92);
let pass = 0, fail = 0;
function check(n, c, e) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (e !== undefined ? '  -> ' + e : '')); } }

// Doğrudan eşlenmeyen ama başka bir theme.css kuralıyla kapsandığı DOĞRULANMIŞ sınıflar
const DOLAYLI_KAPSANAN = {
  'via-slate-950': 'Yalnızca <section class="bg-gradient-to-br"> üzerinde; theme.css "html.light main section.bg-gradient-to-br" arka planı komple değiştiriyor (2026-09-21 doğrulandı)',
};

const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const inlineStyle = f => (read(f).match(/<style>([\s\S]*?)<\/style>/g) || []).join('\n');
const CLS = new RegExp('\\.((?:[a-zA-Z0-9\\-]|' + BS + BS + '.)+)', 'g');
const clean = c => c.split(BS).join('');

function lightClasses(css) {
  const out = new Set();
  for (const m of css.matchAll(/html\.light\s+([^{]+)\{/g)) {
    for (const c of m[1].matchAll(CLS)) out.add(clean(c[1]));
  }
  out.delete('light');
  return out;
}

function themeMainClasses(css) {
  const out = new Set();
  for (const m of css.matchAll(/(?:^|\n)((?:html\.light\s+)?main[^{]+)\{/g)) {
    for (const c of m[1].matchAll(CLS)) out.add(clean(c[1]));
  }
  out.delete('light');
  return out;
}

const theme = read('assets/css/theme.css');
const tmain = themeMainClasses(theme);

console.log('\n[theme.css sağlık]');
check('CSS blok dengesi', (theme.match(/\{/g) || []).length === (theme.match(/\}/g) || []).length);
check('[x-cloak] kuralı var (GÖREV 10.7)', /\[x-cloak\]\s*\{\s*display:\s*none/.test(theme));
check('scroll-padding-top var (GÖREV 10.16)', /scroll-padding-top/.test(theme));
check('bg-slate-950/90 main içinde eşli (2026-09-21 hatası)', tmain.has('bg-slate-950/90'));
check('text-slate-200 main içinde eşli (form etiketleri)', tmain.has('text-slate-200'));
check('hero-1 istisnası korunuyor', /bg-slate-950\\\/90:not\(#hero-1\)/.test(theme));

console.log('\n[TR/EN sayfa çiftleri]');
const pages = fs.readdirSync(path.join(SITE, 'tr')).filter(f => f.endsWith('.html'));
for (const p of pages) {
  if (!fs.existsSync(path.join(SITE, 'en', p))) continue;
  const tr = lightClasses(inlineStyle('tr/' + p));
  const en = lightClasses(inlineStyle('en/' + p));
  // #hero-1 bölümü bilinçli istisna: theme.css hero içini token'lardan hariç tutuyor
  // (ana sayfada fotoğraf üzerine sabit koyu overlay). Kontrol dışında bırakılır.
  const enMain = (() => {
    const s = read('en/' + p); const i = s.indexOf('<main'); const j = s.indexOf('</main>');
    if (i < 0) return '';
    let body = s.slice(i, j);
    const h = body.indexOf('<section id="hero-1"');
    if (h >= 0) { const e = body.indexOf('</section>', h); body = body.slice(0, h) + body.slice(e + 10); }
    return body;
  })();
  const acik = [...tr].filter(c => !en.has(c) && !tmain.has(c) && !DOLAYLI_KAPSANAN[c])
    .filter(c => new RegExp('class="[^"]*(?:^|[\\s"])' + c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(?=[\\s"])').test(enMain));
  check('en/' + p + ': açıkta kalan sınıf yok', acik.length === 0, acik.join(', '));
}

console.log('\n===== ' + pass + ' geçti, ' + fail + ' kaldı =====');
process.exit(fail ? 1 : 0);
