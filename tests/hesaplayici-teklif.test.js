// GÖREV 10.5 regresyon testi: hesaplayıcıdan / ürün sayfasından gelen değerler
// teklif formuna aktarılıyor mu? (Önceden form BOŞ açılıyordu.)
// Ön-doldurma bloğu HTML'den çalışma anında çıkarılır ve stub'lanmış DOM'da çalıştırılır.
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(n, c, e) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (e !== undefined ? '  -> ' + e : '')); } }

function extractPrefill(file) {
  const s = fs.readFileSync(path.join(SITE, file), 'utf8');
  const i = s.indexOf('(function applyIncomingProduct(){');
  if (i < 0) throw new Error(file + ': applyIncomingProduct bulunamadi');
  const j = s.indexOf('})();', i) + '})();'.length;
  return s.slice(i, j);
}

function run(src, search) {
  const options = ['', 'hpl-hydraulic', 'oem-parts', 'pascalforge', 'pascalcast', 'other'];
  const interest = {
    value: '',
    querySelector(sel) { const m = /option\[value="(.*)"\]/.exec(sel); return m && options.includes(m[1]) ? {} : null; }
  };
  const message = { value: '' };
  const document = { getElementById: id => id === 'q-interest' ? interest : id === 'q-message' ? message : null };
  const window = { location: { search } };
  const sessionStorage = { getItem: () => null, setItem: () => {} };
  new Function('document', 'window', 'sessionStorage', 'URLSearchParams', src)(document, window, sessionStorage, URLSearchParams);
  return { interest: interest.value, message: message.value };
}

const tr = extractPrefill('tr/teklif-al.html');
const en = extractPrefill('en/teklif-al.html');

console.log('\n[TR]');
let r = run(tr, '?ic_cap=50&mil_capi=30&strok=400&basinc=180');
check('hesaplayıcıdan: interest otomatik', r.interest === 'hpl-hydraulic', r.interest);
check('hesaplayıcıdan: ölçüler mesajda', /50/.test(r.message) && /30/.test(r.message) && /400/.test(r.message) && /180/.test(r.message), r.message);
r = run(tr, '?urun=oem-parts&urun_adi=Dengeleme%20Kutusu');
check('ürün sayfasından: interest', r.interest === 'oem-parts', r.interest);
check('ürün sayfasından: ürün adı', /Dengeleme Kutusu/.test(r.message), r.message);
r = run(tr, '');
check('parametresiz: boş kalır', r.interest === '' && r.message === '');

console.log('\n[EN]');
r = run(en, '?ic_cap=63&mil_capi=40&strok=250&basinc=200');
check('from calculator: interest', r.interest === 'hpl-hydraulic', r.interest);
check('from calculator: dimensions in message', /63/.test(r.message) && /250/.test(r.message), r.message);
r = run(en, '?urun=pascalcast&urun_adi=Gray%20Iron');
check('from product: interest', r.interest === 'pascalcast', r.interest);
check('from product: name', /Gray Iron/.test(r.message), r.message);

console.log('\n[Hesaplayıcı JS paritesi]');
const fn = f => (fs.readFileSync(path.join(SITE, f), 'utf8').match(/function [a-zA-Z]+/g) || []).sort().join(',');
check('TR ve EN hesaplayıcıda aynı fonksiyonlar', fn('assets/js/calculation-program.js') === fn('assets/js/calculation-program.en.js'));
check('EN hesaplayıcı sayfasında teklif CTA var', /id="hpl-quote-cta"/.test(fs.readFileSync(path.join(SITE, 'en/calculation-program.html'), 'utf8')));

console.log('\n===== ' + pass + ' geçti, ' + fail + ' kaldı =====');
process.exit(fail ? 1 : 0);
