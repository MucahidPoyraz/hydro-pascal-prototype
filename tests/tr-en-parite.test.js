// TR ↔ EN yapısal parite testi.
// Her sayfa çiftinin <main> içeriğini dilden bağımsız bir "iskelete" indirger ve karşılaştırır.
// Metin çevirisi karşılaştırılmaz; YAPI karşılaştırılır: bölüm sırası, görseller, başlık
// hiyerarşisi, formlar/alanlar, CMS kancaları (data-section/data-field), iç linkler,
// Tailwind sınıfları (düzen farkını yakalamak için).
//
// Bilinçli farklar BILINEN_FARKLAR listesine GEREKÇESİYLE eklenir; gerisi hata sayılır.
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const detay = process.argv.includes('--detay');
function check(n, c, e) { if (c) { pass++; if (detay) console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (e ? '\n        ' + e : '')); } }

// sayfa -> { ölçüt | '*': gerekçe }
const BILINEN_FARKLAR = {
  'urun-detay.html': { '*': "GÖREV 11.4 — EN ürün detayı TR'nin gerisinde (uyumluluk tabloları, sekmeler). Açık görev." },
  'calculation-program.html': { 'script dosyaları': 'Bilinçli: EN sayfa, metinleri İngilizce olan calculation-program.en.js dosyasını yükler.' },
  // Blog tools/blog/build.js tarafından üretilir; EN çevirileri kademeli yayımlanıyor (TR 60 / EN kısmi).
  // Liste ve yazı sayfaları bu yüzden yazı-yazı eşleşmez; eşleşme kontrolü üretecin kendi sorumluluğundadır.
  'blog/index.html': { '*': 'tools/blog üreteci — EN çevirileri kademeli yayımlanıyor.' },
};
const BLOG_YAZILARI_ATLA = 'Blog yazı sayfaları üreteçle ve dile özgü slug ile oluşur (ör. massey-ferguson-hidrolik-... ↔ massey-ferguson-hydraulic-...); dosya adı eşleşmesi beklenmez.';

const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function main(s) { const i = s.indexOf('<main'); const j = s.indexOf('</main>'); return i >= 0 ? s.slice(i, j) : ''; }
function all(re, s, g = 1) { return [...s.matchAll(re)].map(m => m[g]); }

// Dilden bağımsız iç link: ../tr/x.html ↔ ../en/x.html ve blog yolu normalize
// Blog yazı linkleri dile özgü slug taşır (fiat-traktor-... ↔ fiat-tractor-...) → "blog/YAZI.html"
const normHref = h => h.replace(/\.\.\/(tr|en)\//, '../LANG/').replace(/#.*$/, '').replace(/\?.*$/, '')
  .replace(/(^|\/)blog\/(?!index\.html|blog-post-template\.html)[a-z0-9-]+\.html$/, '$1blog/YAZI.html');

function skeleton(s) {
  const b = main(s);
  return {
    'bölüm sırası (id)': all(/<section[^>]*\bid="([^"]+)"/g, b).join(' > '),
    'bölüm sayısı': String((b.match(/<section\b/g) || []).length),
    'görsel kaynakları': all(/<img[^>]*\bsrc="([^"]+)"/g, b).join(' | '),
    'h1/h2/h3 sayısı': ['h1', 'h2', 'h3'].map(t => (b.match(new RegExp('<' + t + '\\b', 'g')) || []).length).join('/'),
    'form sayısı': String((b.match(/<form\b/g) || []).length),
    'form alan adları': all(/<(?:input|select|textarea)[^>]*\bname="([^"]+)"/g, b)
      .filter(n => !/^(KVKK Onayi|Consent)$/.test(n)).length + ' alan',
    'CMS kancaları': [...new Set(all(/data-section="([^"]+)"[^>]*data-field="([^"]+)"/g, b, 0)
      .map(x => x.replace(/\s+/g, ' ')))].sort().join(' ; '),
    'iç linkler': all(/<a[^>]*\bhref="([^"#:][^"]*)"/g, b).filter(h => !/^https?:/.test(h)).map(normHref).sort().join(' '),
    'düzen sınıfları': all(/class="([^"]*)"/g, b).map(c => c.split(/\s+/)
      .filter(x => /^(grid|md:grid-cols|lg:grid-cols|sm:grid-cols|flex|hidden|max-w-|col-span|md:col-span)/.test(x)).join(' '))
      .filter(Boolean).join(' | '),
    'script dosyaları': all(/<script[^>]*\bsrc="([^"]+)"/g, s).join(' '),
  };
}

function firstDiff(a, b) {
  const A = a.split(/ \| | ; | > | /), B = b.split(/ \| | ; | > | /);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] !== B[i]) return 'ilk fark #' + i + ':  TR=' + (A[i] ?? '—') + '   EN=' + (B[i] ?? '—');
  }
  return '';
}

const pairs = [];
for (const dir of ['', 'blog/']) {
  for (const f of fs.readdirSync(path.join(SITE, 'tr', dir)).filter(x => x.endsWith('.html'))) {
    const rel = dir + f;
    pairs.push(rel);
  }
}

console.log('\n[Sayfa varlığı]');
const isBlogPost = rel => rel.startsWith('blog/') && !/^blog\/(index|blog-post-template)\.html$/.test(rel);
for (const rel of pairs) { if (isBlogPost(rel)) continue; check('en/' + rel + ' mevcut', fs.existsSync(path.join(SITE, 'en', rel))); }
for (const dir of ['', 'blog/']) {
  for (const f of fs.readdirSync(path.join(SITE, 'en', dir)).filter(x => x.endsWith('.html'))) {
    if (isBlogPost(dir + f)) continue;
    check('tr/' + dir + f + ' mevcut', fs.existsSync(path.join(SITE, 'tr', dir + f)));
  }
}

console.log('\n[Yapısal parite]');
for (const rel of pairs) {
  if (isBlogPost(rel) || !fs.existsSync(path.join(SITE, 'en', rel))) continue;
  const known = BILINEN_FARKLAR[rel];
  const tr = skeleton(read('tr/' + rel)), en = skeleton(read('en/' + rel));
  for (const k of Object.keys(tr)) {
    if (known && (known['*'] || known[k])) continue;
    check(rel + ' — ' + k, tr[k] === en[k], firstDiff(tr[k], en[k]));
  }
}

console.log('\n[Bilinen, belgelenmiş farklar]');
for (const [p, m] of Object.entries(BILINEN_FARKLAR)) for (const [k, why] of Object.entries(m)) console.log('  SKIP  ' + p + ' (' + k + '): ' + why);
console.log('  SKIP  blog/<yazı>.html: ' + BLOG_YAZILARI_ATLA);

console.log('\n===== ' + pass + ' geçti, ' + fail + ' kaldı =====');
process.exit(fail ? 1 : 0);
