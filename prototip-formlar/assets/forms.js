/* =========================================================================
   PROTOTİP: Bu form ileride React/Next.js veya ASP.NET backend'e taşınacaktır.
   FormSubmit geçici çözümdür.
   =========================================================================
   HydroPascal — FormSubmit prototip form motoru (vanilla JS, bağımlılık yok)

   GÜVENLİK NOTU
   -------------
   Buradaki doğrulamaların tamamı UX içindir, GÜVENLİK DEĞİLDİR. Tarayıcı
   tarafındaki hiçbir kontrol (zorunlu alan, dosya boyutu, uzantı, KVKK
   onayı, honeypot) saldırganı durdurmaz — hepsi devre dışı bırakılabilir.
   Gerçek doğrulama sunucu tarafında yapılmalıdır ve ASP.NET/Next.js
   geçişinde eklenecektir. Dosya yükleme için bu özellikle geçerlidir:
   uzantı ve boyut kontrolü mutlaka sunucuda tekrarlanmalıdır.

   DOSYA EKİ + AJAX
   ----------------
   FormSubmit'in /ajax/ uç noktası dosya eklerini İLETMEZ (yalnızca alan
   değerlerini döndürür). Ekler, standart multipart/form-data POST ile
   https://formsubmit.co/<eposta> adresine gönderildiğinde çalışır.
   Bu yüzden motor şöyle davranır:
     - Dosya seçilmemişse -> AJAX (sayfa yenilenmez, tercih edilen yol)
     - Dosya seçilmişse    -> klasik POST'a düşer (sayfa yenilenir, _next
                              adresine yönlenir)
   Böylece ek kaybı yaşanmaz. Canlı testte AJAX'ın ek desteklediği
   doğrulanırsa CONFIG.ajaxSupportsFiles = true yapmak yeterlidir.
   ========================================================================= */
(function () {
  'use strict';

  var CONFIG = {
    // FormSubmit hedef adresi. Not: e-posta adresini HTML'de açıkta
    // bırakmamak için FormSubmit'in hash'li uç noktası tercih edilebilir
    // (bkz. README, "E-postayı gizleme").
    email: 'info@sitename.com.tr',
    ajaxBase: 'https://formsubmit.co/ajax/',
    postBase: 'https://formsubmit.co/',

    ajaxSupportsFiles: false, // canlı testte doğrulanırsa true yapın

    maxBytes: 10 * 1024 * 1024, // 10 MB — mail sunucusu limiti
    allowedExt: ['pdf', 'dwg', 'dxf', 'step', 'stp', 'igs', 'zip', 'rar', 'jpg', 'jpeg', 'png'],

    successHideMs: 5000
  };

  var MSG = {
    required: 'Bu alan zorunludur.',
    email: 'Geçerli bir e-posta adresi girin.',
    phone: 'Geçerli bir telefon numarası girin (en az 10 karakter).',
    minlength: function (n) { return 'En az ' + n + ' karakter girin.'; },
    number: 'Geçerli bir sayı girin.',
    radio: 'Lütfen bir seçim yapın.',
    consent: 'Devam etmek için onay kutusunu işaretlemelisiniz.',
    fileTooBig: function (mb) { return 'Dosya boyutu 10 MB sınırını aşıyor (' + mb + ').'; },
    fileExt: 'Bu dosya türü kabul edilmiyor. İzin verilenler: ' + CONFIG.allowedExt.join(', ') + '.',
    sending: 'Gönderiliyor...',
    ok: 'Mesajınız başarıyla gönderildi. En kısa sürede size dönüş yapacağız.',
    fail: 'Gönderim sırasında bir sorun oluştu. Lütfen tekrar deneyin veya doğrudan ' + CONFIG.email + ' adresine yazın.',
    network: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
  };

  /* --------------------------------------------------------------- yardımcı */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function formatSize(bytes) {
    if (bytes < 1024) { return bytes + ' B'; }
    if (bytes < 1024 * 1024) { return (bytes / 1024).toFixed(1) + ' KB'; }
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // Dosya adı yalnızca EKRANDA gösterilecek; güvenlik amaçlı değil.
  function safeName(name) {
    return String(name).replace(/[\u0000-\u001f<>"'`\\]/g, '').slice(0, 80);
  }

  function extOf(name) {
    var i = String(name).lastIndexOf('.');
    return i < 0 ? '' : String(name).slice(i + 1).toLowerCase();
  }

  function setError(field, message) {
    var box = field.parentNode.querySelector('.fs-error');
    if (message) {
      field.setAttribute('aria-invalid', 'true');
      if (box) { box.textContent = message; box.classList.add('is-visible'); }
    } else {
      field.setAttribute('aria-invalid', 'false');
      if (box) { box.textContent = ''; box.classList.remove('is-visible'); }
    }
  }

  function showAlert(form, kind, text) {
    var box = $('.fs-alert--' + kind, form);
    var other = $('.fs-alert--' + (kind === 'success' ? 'error' : 'success'), form);
    if (other) { other.classList.remove('is-visible'); }
    if (!box) { return null; }
    var slot = box.querySelector('[data-fs-alert-text]');
    if (slot) { slot.textContent = text; }
    box.classList.add('is-visible');
    return box;
  }

  function hideAlerts(form) {
    $$('.fs-alert', form).forEach(function (b) { b.classList.remove('is-visible'); });
  }

  /* ------------------------------------------------------------ doğrulama */

  function validateField(field) {
    var v = (field.value || '').trim();
    var type = field.getAttribute('type');

    if (field.hasAttribute('required') && !v) {
      setError(field, MSG.required); return false;
    }
    if (!v) { setError(field, ''); return true; } // boş + opsiyonel

    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      setError(field, MSG.email); return false;
    }
    if (type === 'tel') {
      var digits = v.replace(/[^\d]/g, '');
      if (!/^[0-9+\s()\-]{10,20}$/.test(v) || digits.length < 10) {
        setError(field, MSG.phone); return false;
      }
    }
    if (type === 'number') {
      if (isNaN(parseFloat(v))) { setError(field, MSG.number); return false; }
      var min = field.getAttribute('min');
      if (min !== null && parseFloat(v) < parseFloat(min)) {
        setError(field, 'En küçük değer ' + min + ' olabilir.'); return false;
      }
    }
    var ml = field.getAttribute('minlength');
    if (ml && v.length < parseInt(ml, 10)) {
      setError(field, MSG.minlength(ml)); return false;
    }

    setError(field, '');
    return true;
  }

  function validateRadioGroup(form, groupName) {
    var radios = $$('input[type="radio"][name="' + groupName + '"]', form);
    if (!radios.length) { return true; }
    var wrap = radios[0].closest('.fs-field');
    var box = wrap ? wrap.querySelector('.fs-error') : null;
    var checked = radios.some(function (r) { return r.checked; });
    var required = radios[0].hasAttribute('required');
    if (required && !checked) {
      if (box) { box.textContent = MSG.radio; box.classList.add('is-visible'); }
      return false;
    }
    if (box) { box.classList.remove('is-visible'); }
    return true;
  }

  function validateForm(form) {
    var ok = true;
    var first = null;

    $$('input, select, textarea', form).forEach(function (el) {
      if (el.type === 'hidden' || el.type === 'file' || el.type === 'radio' ||
          el.type === 'checkbox' || el.classList.contains('fs-honey-input')) { return; }
      if (!validateField(el)) { ok = false; if (!first) { first = el; } }
    });

    var seen = {};
    $$('input[type="radio"]', form).forEach(function (r) {
      if (seen[r.name]) { return; }
      seen[r.name] = true;
      if (!validateRadioGroup(form, r.name)) { ok = false; if (!first) { first = r; } }
    });

    var fileState = form.__fsFile;
    if (fileState && fileState.error) { ok = false; if (!first) { first = fileState.input; } }

    if (!ok && first) {
      first.focus();
      if (first.scrollIntoView) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
    return ok;
  }

  /* --------------------------------------------------------- dosya yönetimi */

  function initFile(form) {
    var input = $('.fs-file-input', form);
    if (!input) { return; }

    var info = $('[data-fs-file-info]', form);
    var errBox = input.closest('.fs-field').querySelector('.fs-error');
    var clearBtn = $('[data-fs-file-clear]', form);
    var state = { input: input, error: null, file: null };
    form.__fsFile = state;

    function reset() {
      input.value = '';
      state.file = null;
      state.error = null;
      if (info) { info.innerHTML = ''; }
      if (errBox) { errBox.classList.remove('is-visible'); errBox.textContent = ''; }
      input.setAttribute('aria-invalid', 'false');
      if (clearBtn) { clearBtn.hidden = true; }
    }

    function fail(msg) {
      state.error = msg;
      state.file = null;
      input.setAttribute('aria-invalid', 'true');
      if (errBox) { errBox.textContent = msg; errBox.classList.add('is-visible'); }
      if (info) { info.innerHTML = ''; }
      if (clearBtn) { clearBtn.hidden = false; }
    }

    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) { reset(); return; }

      state.error = null;
      if (errBox) { errBox.classList.remove('is-visible'); }

      if (CONFIG.allowedExt.indexOf(extOf(f.name)) === -1) { fail(MSG.fileExt); return; }
      if (f.size > CONFIG.maxBytes) { fail(MSG.fileTooBig(formatSize(f.size))); return; }

      state.file = f;
      input.setAttribute('aria-invalid', 'false');
      if (info) {
        info.innerHTML = '<strong></strong> <span></span>';
        info.querySelector('strong').textContent = safeName(f.name);
        info.querySelector('span').textContent = '(' + formatSize(f.size) + ')';
      }
      if (clearBtn) { clearBtn.hidden = false; }
    });

    if (clearBtn) {
      clearBtn.hidden = true;
      clearBtn.addEventListener('click', reset);
    }

    var trigger = $('[data-fs-file-trigger]', form);
    if (trigger) {
      trigger.addEventListener('click', function () { input.click(); });
    }
  }

  /* ------------------------------------------------------------ KVKK kapısı */

  function initConsent(form, submitBtn) {
    var consent = $('.fs-consent input[type="checkbox"]', form);
    if (!consent) { return; }

    function sync() { submitBtn.disabled = !consent.checked; }
    consent.addEventListener('change', sync);
    sync();
  }

  /* --------------------------------------------------------------- gönderim */

  function nativePost(form) {
    // Dosya ekli gönderim: FormSubmit'in klasik uç noktası kullanılır.
    // preventDefault edilmiş olduğu için form.submit() ile elle tetikleniyor.
    form.setAttribute('action', CONFIG.postBase + CONFIG.email);
    form.setAttribute('method', 'POST');
    form.setAttribute('enctype', 'multipart/form-data');
    HTMLFormElement.prototype.submit.call(form);
  }

  function ajaxPost(form, btn, label) {
    var data = new FormData(form);
    // Honeypot'u taşımaya gerek yok; boşsa zaten anlamsız.
    data.delete('_honey');

    return fetch(CONFIG.ajaxBase + CONFIG.email, {
      method: 'POST',
      body: data,
      headers: { 'Accept': 'application/json' }
    })
      .then(function (res) {
        return res.json().catch(function () { return { success: res.ok ? 'true' : 'false' }; });
      })
      .then(function (json) {
        var ok = json && (json.success === true || json.success === 'true');
        if (!ok) { throw new Error(json && json.message ? json.message : 'FormSubmit hata döndürdü'); }

        form.reset();
        if (form.__fsFile) { form.__fsFile.input.value = ''; }
        $$('[data-fs-file-info]', form).forEach(function (i) { i.innerHTML = ''; });
        $$('input, select, textarea', form).forEach(function (el) { el.setAttribute('aria-invalid', 'false'); });
        $$('.fs-error', form).forEach(function (e) { e.classList.remove('is-visible'); });

        var box = showAlert(form, 'success', MSG.ok);
        // KVKK sıfırlandığı için buton yeniden kilitlenir
        var consent = $('.fs-consent input[type="checkbox"]', form);
        btn.disabled = consent ? !consent.checked : false;

        if (box) {
          window.setTimeout(function () { box.classList.remove('is-visible'); }, CONFIG.successHideMs);
        }
      })
      .catch(function (err) {
        var msg = (err && err.name === 'TypeError') ? MSG.network : MSG.fail;
        showAlert(form, 'error', msg);
        btn.disabled = false;
      })
      .then(function () {
        btn.textContent = label;
      });
  }

  /* ------------------------------------------------------------------- init */

  function bind(form) {
    var btn = $('[data-fs-submit]', form) || $('button[type="submit"]', form);
    if (!btn) { return; }
    var label = btn.textContent;

    initFile(form);
    initConsent(form, btn);

    // Alandan çıkınca doğrula (ilk denemede kullanıcıyı boğmamak için blur'da)
    $$('input, select, textarea', form).forEach(function (el) {
      if (el.type === 'hidden' || el.type === 'file' || el.classList.contains('fs-honey-input')) { return; }
      el.addEventListener('blur', function () {
        if (el.type === 'radio' || el.type === 'checkbox') { return; }
        validateField(el);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideAlerts(form);

      // Honeypot doluysa: bot. Sessizce yut, başarı da gösterme.
      var honey = form.querySelector('.fs-honey-input');
      if (honey && honey.value) { return; }

      var consent = $('.fs-consent input[type="checkbox"]', form);
      if (consent && !consent.checked) {
        showAlert(form, 'error', MSG.consent);
        consent.focus();
        return;
      }

      if (!validateForm(form)) { return; }

      btn.disabled = true;
      btn.textContent = MSG.sending;

      var hasFile = form.__fsFile && form.__fsFile.file;
      if (hasFile && !CONFIG.ajaxSupportsFiles) {
        // Ek var -> AJAX ek taşımadığı için klasik POST'a düş.
        nativePost(form);
        return; // sayfa _next adresine yönlenecek
      }

      ajaxPost(form, btn, label);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $$('form[data-fs-form]').forEach(bind);
  });
})();
