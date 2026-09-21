const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'prototip-formlar');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function group(t) { console.log('\n' + t); }

// tek-dosya surumu kullaniliyor: css+js inline oldugu icin harici yukleme gerekmiyor
function load(file, fetchImpl) {
  const html = fs.readFileSync(path.join(DIR, file), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://test.local/' + file });
  const w = dom.window;
  const calls = [];
  w.fetch = fetchImpl || ((url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: 'true' }) }); });
  if (!fetchImpl) w.__calls = calls;
  // form.submit() jsdom'da navigasyon yapamaz -> stub
  const submitted = [];
  w.HTMLFormElement.prototype.submit = function () { submitted.push({ action: this.getAttribute('action'), enctype: this.getAttribute('enctype') }); };
  w.__submitted = submitted;
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return dom;
}

function set(form, id, val) { const el = form.querySelector('#' + id); el.value = val; return el; }
function fire(w, form) { form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }
async function tick(n = 6) { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); }

function attachFile(w, input, name, size) {
  const f = new w.File(['x'], name, { type: 'application/octet-stream' });
  Object.defineProperty(f, 'size', { value: size });
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  input.dispatchEvent(new w.Event('change'));
  return f;
}

function fillForm1(w, form) {
  set(form, 'c-name', 'Ahmet Yılmaz');
  set(form, 'c-company', 'Örnek Makine A.Ş.');
  set(form, 'c-email', 'ahmet@ornek.com.tr');
  set(form, 'c-phone', '+90 555 111 22 33');
  set(form, 'c-subject', 'Teklif Talebi');
  set(form, 'c-message', 'Ø63 silindir için fiyat teklifi rica ederim.');
}

(async () => {
  const F1 = 'tek-dosya/form-1-iletisim-tek-dosya.html';

  // ---------------------------------------------------- 1. KVKK kapisi
  group('[1] KVKK onayı gönderimi kilitliyor');
  {
    const dom = load(F1), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const btn = form.querySelector('[data-fs-submit]');
    check('başlangıçta buton disabled', btn.disabled === true);
    const kv = form.querySelector('#c-kvkk');
    kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    check('onay işaretlenince aktif', btn.disabled === false);
    kv.checked = false; kv.dispatchEvent(new w.Event('change'));
    check('onay kaldırılınca tekrar kilitli', btn.disabled === true);
  }

  // ---------------------------------------------------- 2. Dogrulama
  group('[2] Zorunlu alan doğrulaması — fetch tetiklenmemeli');
  {
    const dom = load(F1), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const kv = form.querySelector('#c-kvkk'); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    fire(w, form); await tick();
    check('fetch çağrılmadı', w.__calls.length === 0, w.__calls.length);
    check('ad soyad aria-invalid', form.querySelector('#c-name').getAttribute('aria-invalid') === 'true');
    check('hata mesajı görünür', form.querySelector('#c-name-err').classList.contains('is-visible'));
    check('hata metni dolu', form.querySelector('#c-name-err').textContent.length > 0);
  }

  group('[3] E-posta ve telefon biçim doğrulaması');
  {
    const dom = load(F1), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const kv = form.querySelector('#c-kvkk'); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    fillForm1(w, form);
    set(form, 'c-email', 'bozuk-eposta');
    set(form, 'c-phone', '123');
    fire(w, form); await tick();
    check('fetch çağrılmadı', w.__calls.length === 0);
    check('e-posta hatalı işaretlendi', form.querySelector('#c-email').getAttribute('aria-invalid') === 'true');
    check('telefon hatalı işaretlendi', form.querySelector('#c-phone').getAttribute('aria-invalid') === 'true');
  }

  group('[4] minlength=10 (mesaj)');
  {
    const dom = load(F1), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const kv = form.querySelector('#c-kvkk'); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    fillForm1(w, form);
    set(form, 'c-message', 'kısa');
    fire(w, form); await tick();
    check('fetch çağrılmadı', w.__calls.length === 0);
    check('mesaj hatası gösterildi', form.querySelector('#c-message-err').classList.contains('is-visible'));
  }

  // ---------------------------------------------------- 5. Basarili AJAX
  group('[5] Geçerli form (dosyasız) → AJAX gönderimi');
  {
    const dom = load(F1), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const btn = form.querySelector('[data-fs-submit]');
    const kv = form.querySelector('#c-kvkk'); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    fillForm1(w, form);
    fire(w, form); await tick(10);
    check('fetch 1 kez çağrıldı', w.__calls.length === 1, w.__calls.length);
    check('AJAX uç noktası doğru', w.__calls[0] && w.__calls[0].url === 'https://formsubmit.co/ajax/info@sitename.com.tr', w.__calls[0] && w.__calls[0].url);
    check('POST metodu', w.__calls[0] && w.__calls[0].opts.method === 'POST');
    const fd = w.__calls[0].opts.body;
    check('FormData gönderildi', typeof fd.get === 'function');
    check('honeypot gönderilmiyor', fd.get('_honey') === null);
    check('alan adları e-postada okunur', fd.get('Ad Soyad') === 'Ahmet Yılmaz', fd.get('Ad Soyad'));
    check('_subject taşınıyor', fd.get('_subject') === 'İletişim Formu - Yeni Mesaj');
    check('_template=table', fd.get('_template') === 'table');
    check('KVKK onayı kayda giriyor', fd.get('KVKK Onayı') === 'Onaylandı');
    const ok = form.querySelector('.fs-alert--success');
    check('başarı kutusu görünür', ok.classList.contains('is-visible'));
    check('başarı metni dolu', ok.querySelector('[data-fs-alert-text]').textContent.length > 10);
    check('form temizlendi', form.querySelector('#c-name').value === '');
    check('buton etiketi geri geldi', btn.textContent === 'Mesajı Gönder', btn.textContent);
    check('form temizlenince buton tekrar kilitli', btn.disabled === true);
    check('klasik POST tetiklenmedi', w.__submitted.length === 0);
  }

  // ---------------------------------------------------- 6. Sunucu hatasi
  group('[6] Sunucu hata döndürünce');
  {
    const dom = load(F1, () => Promise.resolve({ ok: false, json: () => Promise.resolve({ success: 'false', message: 'hata' }) }));
    const w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const btn = form.querySelector('[data-fs-submit]');
    const kv = form.querySelector('#c-kvkk'); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    fillForm1(w, form);
    fire(w, form); await tick(10);
    check('hata kutusu görünür', form.querySelector('.fs-alert--error').classList.contains('is-visible'));
    check('başarı kutusu gizli', !form.querySelector('.fs-alert--success').classList.contains('is-visible'));
    check('form TEMİZLENMEDİ (veri korunuyor)', form.querySelector('#c-name').value === 'Ahmet Yılmaz');
    check('buton tekrar aktif', btn.disabled === false);
  }

  // ---------------------------------------------------- 7. Dosya kontrolleri
  group('[7] Dosya boyutu ve uzantı kontrolü');
  {
    const dom = load(F1), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const input = form.querySelector('#c-file');
    const kv = form.querySelector('#c-kvkk'); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    fillForm1(w, form);

    attachFile(w, input, 'cizim.pdf', 11 * 1024 * 1024);
    check('11 MB reddedildi', form.querySelector('#c-file-err').classList.contains('is-visible'));
    check('hata metni boyut diyor', /10 MB/.test(form.querySelector('#c-file-err').textContent), form.querySelector('#c-file-err').textContent);
    fire(w, form); await tick();
    check('boyut hatalıyken gönderim engellendi', w.__calls.length === 0 && w.__submitted.length === 0);

    attachFile(w, input, 'virus.exe', 1024);
    check('.exe reddedildi', form.querySelector('#c-file-err').classList.contains('is-visible'));
    check('hata metni tür diyor', /kabul edilmiyor/.test(form.querySelector('#c-file-err').textContent));

    attachFile(w, input, 'teknik-cizim.dwg', 2 * 1024 * 1024);
    check('geçerli .dwg kabul edildi', !form.querySelector('#c-file-err').classList.contains('is-visible'));
    const info = form.querySelector('[data-fs-file-info]');
    check('dosya adı gösteriliyor', /teknik-cizim\.dwg/.test(info.textContent), info.textContent);
    check('dosya boyutu gösteriliyor', /2\.00 MB/.test(info.textContent), info.textContent);
  }

  // ---------------------------------------------------- 8. Dosya -> klasik POST
  group('[8] Dosya ekliyken AJAX yerine klasik POST (ek kaybolmasın)');
  {
    const dom = load(F1), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const kv = form.querySelector('#c-kvkk'); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    fillForm1(w, form);
    attachFile(w, form.querySelector('#c-file'), 'proje.step', 3 * 1024 * 1024);
    fire(w, form); await tick();
    check('AJAX çağrılmadı', w.__calls.length === 0, w.__calls.length);
    check('klasik POST tetiklendi', w.__submitted.length === 1);
    check('klasik uç nokta doğru', w.__submitted[0] && w.__submitted[0].action === 'https://formsubmit.co/info@sitename.com.tr', w.__submitted[0] && w.__submitted[0].action);
    check('enctype multipart', w.__submitted[0] && w.__submitted[0].enctype === 'multipart/form-data');
  }

  // ---------------------------------------------------- 9. Honeypot
  group('[9] Honeypot');
  {
    const dom = load(F1), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const kv = form.querySelector('#c-kvkk'); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    fillForm1(w, form);
    form.querySelector('.fs-honey-input').value = 'bot doldurdu';
    fire(w, form); await tick();
    check('fetch çağrılmadı', w.__calls.length === 0);
    check('klasik POST da yok', w.__submitted.length === 0);
    check('sahte başarı gösterilmedi', !form.querySelector('.fs-alert--success').classList.contains('is-visible'));
  }

  // ---------------------------------------------------- 10. Diger formlar
  group('[10] Form 2 / 3 / 4 — yapı ve gönderim');
  for (const [file, id, fill] of [
    ['tek-dosya/form-2-teklif-tek-dosya.html', 'q-kvkk', (w, f) => {
      set(f, 'q-name', 'Ayşe Demir'); set(f, 'q-company', 'Tarım Mak.');
      set(f, 'q-email', 'a@b.com.tr'); set(f, 'q-phone', '05551112233');
      set(f, 'q-type', 'Ø63'); set(f, 'q-qty', '25');
      set(f, 'q-press', '180'); set(f, 'q-stroke', '400');
      set(f, 'q-app', 'Römork damper kaldırma sistemi.');
    }],
    ['tek-dosya/form-3-numune-tek-dosya.html', 's-kvkk', (w, f) => {
      set(f, 's-name', 'Mehmet Kaya'); set(f, 's-company', 'Kaya Hidrolik');
      set(f, 's-email', 'm@k.com'); set(f, 's-phone', '02121112233');
      set(f, 's-address', 'Fevziçakmak Mah. 10757 Sk. No:3/B Karatay/Konya');
      f.querySelector('input[value="Her ikisi"]').checked = true;
    }],
    ['tek-dosya/form-4-hizli-iletisim-tek-dosya.html', 'f-kvkk', (w, f) => {
      set(f, 'f-email', 'x@y.com'); set(f, 'f-message', 'Katalog gönderebilir misiniz?');
    }],
  ]) {
    const dom = load(file), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const btn = form.querySelector('[data-fs-submit]');
    const name = form.getAttribute('data-fs-form');
    check(name + ': buton başta kilitli', btn.disabled === true);
    const kv = form.querySelector('#' + id); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    fill(w, form);
    fire(w, form); await tick(10);
    check(name + ': AJAX gönderildi', w.__calls.length === 1, w.__calls.length);
    check(name + ': başarı kutusu', form.querySelector('.fs-alert--success').classList.contains('is-visible'));
  }

  group('[11] Form 3 — radyo grubu zorunlu');
  {
    const dom = load('tek-dosya/form-3-numune-tek-dosya.html'), w = dom.window;
    const form = w.document.querySelector('form[data-fs-form]');
    const kv = form.querySelector('#s-kvkk'); kv.checked = true; kv.dispatchEvent(new w.Event('change'));
    set(form, 's-name', 'A'); set(form, 's-company', 'B');
    set(form, 's-email', 'a@b.com'); set(form, 's-phone', '05551112233');
    set(form, 's-address', 'Yeterince uzun bir adres metni burada.');
    fire(w, form); await tick();
    check('seçim yapılmadan gönderilmedi', w.__calls.length === 0);
    check('radyo hata mesajı', form.querySelector('#s-type-err').classList.contains('is-visible'));
  }

  // ---------------------------------------------------- 12. a11y
  group('[12] Erişilebilirlik — tüm formlar');
  for (const file of ['form-1-iletisim.html', 'form-2-teklif.html', 'form-3-numune.html', 'form-4-hizli-iletisim.html']) {
    const html = fs.readFileSync(path.join(DIR, file), 'utf8');
    const dom = new JSDOM(html);
    const d = dom.window.document;
    const form = d.querySelector('form[data-fs-form]');
    const fields = Array.from(form.querySelectorAll('input, select, textarea'))
      .filter(e => e.type !== 'hidden' && !e.classList.contains('fs-honey-input'));
    const noLabel = fields.filter(e => {
      if (e.type === 'radio') return !e.closest('label');
      return !d.querySelector('label[for="' + e.id + '"]');
    });
    check(file + ': her alanın label\'ı var', noLabel.length === 0, noLabel.map(e => e.id || e.name).join(','));
    const req = fields.filter(e => e.hasAttribute('required') && e.type !== 'radio');
    check(file + ': required alanlarda aria-required', req.every(e => e.getAttribute('aria-required') === 'true'));
    check(file + ': hata kutularında role=alert', Array.from(form.querySelectorAll('.fs-error')).every(e => e.getAttribute('role') === 'alert'));
    check(file + ': honeypot gizli', !!form.querySelector('.fs-honey-input[style*="display:none"]'));
    const hidden = ['_subject', '_template', '_captcha', '_next', '_cc', '_autoresponse'];
    check(file + ': FormSubmit gizli alanları tam', hidden.every(n => !!form.querySelector('input[name="' + n + '"]')),
      hidden.filter(n => !form.querySelector('input[name="' + n + '"]')).join(','));
  }

  // ---------------------------------------------------- 13. Surum esligi
  group('[13] Ayrıştırılmış ↔ tek-dosya sürüm eşliği');
  {
    const css = fs.readFileSync(path.join(DIR, 'assets/forms.css'), 'utf8');
    const js = fs.readFileSync(path.join(DIR, 'assets/forms.js'), 'utf8');
    const single = fs.readFileSync(path.join(DIR, 'tek-dosya/form-1-iletisim-tek-dosya.html'), 'utf8');
    check('tek-dosya CSS ile birebir', single.includes(css.trim().slice(0, 400)));
    check('tek-dosya JS ile birebir', single.includes(js.trim().slice(0, 400)));
    const split = fs.readFileSync(path.join(DIR, 'form-1-iletisim.html'), 'utf8');
    check('ayrıştırılmış harici css kullanıyor', split.includes('<link rel="stylesheet" href="assets/forms.css">'));
    check('ayrıştırılmış harici js kullanıyor', split.includes('<script src="assets/forms.js"></script>'));
    const body = (s) => s.slice(s.indexOf('<form'), s.indexOf('</form>'));
    check('form işaretlemesi iki sürümde aynı', body(single) === body(split));
  }

  console.log('\n===== ' + pass + ' geçti, ' + fail + ' kaldı =====');
  process.exit(fail ? 1 : 0);
})();
