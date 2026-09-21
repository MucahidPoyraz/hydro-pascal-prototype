const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '..');
const MODULE = fs.readFileSync(path.join(SITE, 'assets/js/form-submit.js'), 'utf8');

let pass = 0, fail = 0;
function check(n, c, e) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (e !== undefined ? '  -> ' + e : '')); } }
function group(t) { console.log('\n' + t); }

function load(file, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(SITE, file), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.hydropascal.com.tr/' + file });
  const w = dom.window;
  const calls = [];
  w.fetch = opts.fetchImpl || ((url, o) => { calls.push({ url, opts: o }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: 'true' }) }); });
  w.__calls = calls;
  const submitted = [];
  w.HTMLFormElement.prototype.submit = function () { submitted.push({ action: this.getAttribute('action'), enctype: this.getAttribute('enctype') }); };
  w.__submitted = submitted;
  let src = MODULE;
  if (opts.target !== undefined) src = src.replace("target: 'info@hydropascal.com.tr',", "target: '" + opts.target + "',");
  w.eval(src);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return dom;
}

function fill(form, vals) {
  for (const [n, v] of Object.entries(vals)) {
    const el = form.querySelector('[name="' + n + '"]');
    if (el) el.value = v;
  }
}
function grant(w, form) { const c = form.querySelector('[data-hpl-consent]'); c.checked = true; c.dispatchEvent(new w.Event('change')); return c; }
function fire(w, form) { form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }
async function tick(n = 8) { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); }
function attach(w, input, name, size) {
  const f = new w.File(['x'], name, {});
  Object.defineProperty(f, 'size', { value: size });
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  input.dispatchEvent(new w.Event('change'));
}

(async () => {
  group('[1] Açık rıza kapısı — 6 canlı form');
  for (const f of ['tr/contact.html', 'en/contact.html', 'tr/hizmetler.html', 'en/hizmetler.html', 'tr/teklif-al.html', 'en/teklif-al.html']) {
    const dom = load(f), w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    const btn = form.querySelector('button[type="submit"]');
    check(f + ': başta kilitli', btn.disabled === true);
    grant(w, form);
    check(f + ': onayla aktif', btn.disabled === false);
  }

  group('[2] FormSubmit gizli alanları JS tarafından enjekte ediliyor');
  {
    const dom = load('tr/teklif-al.html'), w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    for (const n of ['_subject', '_template', '_captcha', '_autoresponse']) {
      check('alan var: ' + n, !!form.querySelector('input[name="' + n + '"]'));
    }
    check('_subject TR ve doğru tür', form.querySelector('[name="_subject"]').value.indexOf('Teklif Talebi') === 0, form.querySelector('[name="_subject"]').value);
    check('_template=table', form.querySelector('[name="_template"]').value === 'table');
  }
  {
    const dom = load('en/hizmetler.html'), w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    check('_subject EN', /^Sample \/ Drawing Request/.test(form.querySelector('[name="_subject"]').value), form.querySelector('[name="_subject"]').value);
    check('_autoresponse EN', /Thank you/.test(form.querySelector('[name="_autoresponse"]').value));
  }

  group('[3] Dosyasız gönderim → FormSubmit AJAX');
  {
    const dom = load('tr/contact.html'), w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    grant(w, form);
    fill(form, { name: 'Ahmet', email: 'a@b.com', subject: 'Test', message: 'Merhaba' });
    fire(w, form); await tick();
    check('1 istek', w.__calls.length === 1, w.__calls.length);
    check('uç nokta doğru', w.__calls[0].url === 'https://formsubmit.co/ajax/info@hydropascal.com.tr', w.__calls[0].url);
    const fd = w.__calls[0].opts.body;
    check('honeypot gönderilmiyor', fd.get('_honey') === null);
    check('rıza kaydı taşınıyor', fd.get('KVKK Onayi') === 'Onaylandi', fd.get('KVKK Onayi'));
    check('_subject taşınıyor', !!fd.get('_subject'));
    check('_page taşınıyor', !!fd.get('_page'));
    const st = form.querySelector('[data-hpl-status]');
    check('başarı mesajı', /alındı/.test(st.textContent), st.textContent);
    check('form temizlendi', form.querySelector('[name="name"]').value === '');
    check('buton tekrar kilitli', form.querySelector('button[type="submit"]').disabled === true);
    check('klasik POST yok', w.__submitted.length === 0);
  }

  group('[4] Dosya ekliyken klasik POST fallback (ek kaybolmasın)');
  {
    const dom = load('tr/teklif-al.html'), w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    grant(w, form);
    fill(form, { name: 'Ali', email: 'a@b.com', phone: '05551112233', interest: 'hpl-hydraulic' });
    attach(w, form.querySelector('[data-hpl-file-input]'), 'cizim.dwg', 2 * 1024 * 1024);
    fire(w, form); await tick();
    check('AJAX çağrılmadı', w.__calls.length === 0, w.__calls.length);
    check('klasik POST tetiklendi', w.__submitted.length === 1);
    check('klasik uç nokta', w.__submitted[0] && w.__submitted[0].action === 'https://formsubmit.co/info@hydropascal.com.tr', w.__submitted[0] && w.__submitted[0].action);
    check('enctype multipart', w.__submitted[0] && w.__submitted[0].enctype === 'multipart/form-data');
  }

  group('[5] Dosya limitleri');
  {
    const dom = load('tr/hizmetler.html'), w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    grant(w, form);
    attach(w, form.querySelector('[data-hpl-file-input]'), 'buyuk.pdf', 11 * 1024 * 1024);
    fire(w, form); await tick();
    check('11 MB engellendi', w.__calls.length === 0 && w.__submitted.length === 0);
    check('uyarı metni', /10 MB/.test(form.querySelector('[data-hpl-status]').textContent), form.querySelector('[data-hpl-status]').textContent);
  }

  group('[6] Rıza verilmeden gönderim engelleniyor');
  {
    const dom = load('tr/contact.html'), w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    fill(form, { name: 'X', email: 'a@b.com', message: 'y' });
    fire(w, form); await tick();
    check('istek yok', w.__calls.length === 0);
    check('uyarı gösterildi', /onay/i.test(form.querySelector('[data-hpl-status]').textContent), form.querySelector('[data-hpl-status]').textContent);
  }

  group('[7] Honeypot');
  {
    const dom = load('tr/teklif-al.html'), w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    grant(w, form);
    form.querySelector('[name="_honey"]').value = 'bot';
    fire(w, form); await tick();
    check('istek yok', w.__calls.length === 0);
    check('sahte başarı yok', form.querySelector('[data-hpl-status]').textContent === '');
  }

  group('[8] Sunucu hatası → veri korunur');
  {
    const dom = load('tr/contact.html', { fetchImpl: () => Promise.resolve({ ok: false, json: () => Promise.resolve({ success: 'false' }) }) });
    const w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    grant(w, form);
    fill(form, { name: 'Korunmali', email: 'a@b.com', message: 'test mesaji' });
    fire(w, form); await tick();
    check('hata mesajı', /sorun oluştu/.test(form.querySelector('[data-hpl-status]').textContent));
    check('form TEMİZLENMEDİ', form.querySelector('[name="name"]').value === 'Korunmali');
    check('buton aktif', form.querySelector('button[type="submit"]').disabled === false);
  }

  group('[9] target boşsa hâlâ dürüst uyarı (regresyon)');
  {
    const dom = load('tr/contact.html', { target: '' }), w = dom.window;
    const form = w.document.querySelector('form[data-hpl-form]');
    grant(w, form);
    fill(form, { name: 'X', email: 'a@b.com', message: 'test mesaji' });
    fire(w, form); await tick();
    check('istek yok', w.__calls.length === 0);
    const st = form.querySelector('[data-hpl-status]');
    check('başarı GÖSTERİLMİYOR', !/alındı/.test(st.textContent));
    check('doğrudan iletişim linkleri', st.querySelectorAll('a[href^="mailto:"], a[href^="tel:"]').length >= 2);
  }

  group('[10] Rıza kutusu a11y');
  for (const f of ['tr/contact.html', 'en/teklif-al.html']) {
    const html = fs.readFileSync(path.join(SITE, f), 'utf8');
    const d = new JSDOM(html).window.document;
    const c = d.querySelector('[data-hpl-consent]');
    check(f + ': id var', !!c.id);
    check(f + ': label eşleşiyor', !!d.querySelector('label[for="' + c.id + '"]'));
    check(f + ': required', c.hasAttribute('required'));
    check(f + ': aria-required', c.getAttribute('aria-required') === 'true');
    check(f + ': FormSubmit.co açıkça belirtiliyor', /FormSubmit\.co/.test(d.querySelector('label[for="' + c.id + '"]').textContent));
  }

  console.log('\n===== ' + pass + ' geçti, ' + fail + ' kaldı =====');
  process.exit(fail ? 1 : 0);
})();
