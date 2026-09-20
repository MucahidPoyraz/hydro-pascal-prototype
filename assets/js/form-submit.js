/*
  HydroPascal — Ortak form gönderim modülü
  =========================================
  GÖREV 10.1 / 10.2 / 10.3 / 10.4  (+ 10.9 kısmî: açık rıza kapısı)

  NEDEN VAR:
  Denetimde üç formun da gerçekte hiçbir yere veri göndermediği tespit edildi:
    - contact.html    → action="#", submit handler YOK. Tıklayınca sayfa
                        yenileniyor, veri kayboluyor, geri bildirim yok.
    - hizmetler.html  → console.log yapıp 600ms sonra ekrana
                        "Talebiniz alındı" yazıyordu. SAHTE BAŞARI MESAJI.
    - teklif-al.html  → EmailJS sendForm() DOSYA EKİ GÖNDERMEZ; seçilen
                        dosyalar yalnızca console.log'lanıyordu.

  Ayrıca dosya seçim/listeleme kodu hizmetler.html ve teklif-al.html içinde
  BİREBİR aynı şekilde iki kez yazılmıştı (bkz. .claude/rules/components.md
  kural 2: aynı işi yapan ikinci bir bileşen yaratma). Burada tek kopya var.

  SAĞLAYICI: FormSubmit.co  (K1 kararı — 2026-09-20)
  ---------------------------------------------------
  Backend yok. FormSubmit iki uç nokta sunar:
    - https://formsubmit.co/ajax/<eposta>  → JSON döner, sayfa yenilenmez,
      ANCAK dosya eklerini İLETMEZ.
    - https://formsubmit.co/<eposta>       → klasik multipart POST, ekleri
      taşır, ama sayfa yenilenir (_next adresine gider).

  Bu yüzden modül şöyle davranır:
    - Dosya seçilmemişse -> AJAX (tercih edilen yol)
    - Dosya seçilmişse   -> klasik POST'a düşer, ek kaybolmaz
  Canlı testte AJAX'ın ek taşıdığı doğrulanırsa CONFIG.ajaxSupportsFiles = true
  yapmak yeterlidir.

  İLK KULLANIM: FormSubmit bir adrese ilk gönderim yapılana kadar hiçbir posta
  iletmez. İlk gönderimden sonra adrese bir aktivasyon maili gelir; oradaki
  bağlantıya tıklanmadan form çalışmaz. Ayrıntı: prototip-formlar/README.md §3.

  GÜVENLİK: Buradaki doğrulamaların tamamı UX içindir, GÜVENLİK DEĞİLDİR.
  Zorunlu alan, dosya boyutu, uzantı, rıza kutusu ve honeypot — hepsi tarayıcıda
  devre dışı bırakılabilir. Gerçek doğrulama sunucu tarafında yapılmalıdır ve
  ASP.NET Core geçişinde eklenecektir.
*/
(function () {
  'use strict';

  /* ==================================================================== */
  /*  YAPILANDIRMA — tek değiştirilecek yer                               */
  /* ==================================================================== */
  var CONFIG = {
    // FormSubmit hedefi. E-postayı kaynak kodda açıkta bırakmamak için
    // aktivasyon sonrası verilen hash'li uç noktaya geçilmesi ÖNERİLİR:
    //   target: 'el/xxxxxxx'
    target: 'info@hydropascal.com.tr',

    ajaxBase: 'https://formsubmit.co/ajax/',
    postBase: 'https://formsubmit.co/',

    // Canlı testte AJAX'ın dosya eki taşıdığı doğrulanırsa true yapın.
    ajaxSupportsFiles: false,

    // Klasik POST (dosya ekli gönderim) sonrası yönlenilecek MUTLAK adres.
    // Boş bırakılırsa FormSubmit kendi teşekkür sayfasını gösterir.
    nextUrl: '',

    // Doğrudan iletişim kanalları (hata durumunda gösterilir)
    email: 'info@hydropascal.com.tr',
    phoneHref: 'tel:+905553848229',
    phoneText: '(+90) 555-384-82-29',
    whatsapp: '905553848229',

    // Dosya eki limitleri (hizmetler.html ve teklif-al.html)
    maxFiles: 5,
    maxTotalBytes: 10 * 1024 * 1024
  };

  /* ==================================================================== */
  /*  Metinler                                                            */
  /* ==================================================================== */
  var TEXT = {
    tr: {
      sending: 'Gönderiliyor...',
      success: 'Talebiniz alındı. En kısa sürede size dönüş yapılacaktır.',
      error: 'Gönderim sırasında bir sorun oluştu. Lütfen tekrar deneyin veya bize doğrudan ulaşın.',
      network: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
      notConfigured: 'Çevrimiçi form gönderimi henüz etkinleştirilmedi. Talebinizi kaybetmemek için lütfen doğrudan bize ulaşın:',
      consent: 'Devam etmek için kişisel verilerin işlenmesine onay vermelisiniz.',
      whatsappLabel: 'WhatsApp',
      tooManyFiles: 'En fazla ' + CONFIG.maxFiles + ' dosya ekleyebilirsiniz.',
      tooLarge: "Toplam dosya boyutu 10 MB'ı aşıyor. Lütfen bazı dosyaları kaldırın.",
      removeFile: 'Dosyayı kaldır: ',
      autoresponse: 'Talebiniz için teşekkür ederiz. HydroPascal ekibi en kısa sürede size dönüş yapacaktır.',
      subject: {
        quote: 'Teklif Talebi',
        sample: 'Numune / Çizim Talebi',
        contact: 'İletişim Formu'
      }
    },
    en: {
      sending: 'Sending...',
      success: 'Your request has been received. We will get back to you shortly.',
      error: 'Something went wrong while sending. Please try again or contact us directly.',
      network: 'Could not reach the server. Please check your connection and try again.',
      notConfigured: 'Online form submission is not enabled yet. So that your request is not lost, please contact us directly:',
      consent: 'You must consent to the processing of your personal data to continue.',
      whatsappLabel: 'WhatsApp',
      tooManyFiles: 'You can attach at most ' + CONFIG.maxFiles + ' files.',
      tooLarge: 'Total file size exceeds 10 MB. Please remove some files.',
      removeFile: 'Remove file: ',
      autoresponse: 'Thank you for your request. The HydroPascal team will get back to you shortly.',
      subject: {
        quote: 'Quote Request',
        sample: 'Sample / Drawing Request',
        contact: 'Contact Form'
      }
    }
  };

  var LANG = (document.documentElement.getAttribute('lang') || 'tr').toLowerCase().indexOf('en') === 0 ? 'en' : 'tr';
  var T = TEXT[LANG];

  /* Durum mesajı renkleri — mevcut sayfalardaki sınıflar birebir korundu   */
  var STATUS_BASE = 'relative text-sm text-center min-h-[1.25rem] ';
  var STATUS_OK = STATUS_BASE + 'text-cyan-400';
  var STATUS_WARN = STATUS_BASE + 'text-[#fb923c]';

  /* ==================================================================== */
  /*  Yardımcılar                                                         */
  /* ==================================================================== */
  function formatSize(bytes) {
    if (bytes < 1024) { return bytes + ' B'; }
    if (bytes < 1024 * 1024) { return (bytes / 1024).toFixed(1) + ' KB'; }
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hiddenInput(form, name, value) {
    if (form.querySelector('input[name="' + name + '"]')) { return; }
    var el = document.createElement('input');
    el.type = 'hidden';
    el.name = name;
    el.value = value;
    form.appendChild(el);
  }

  /* ==================================================================== */
  /*  Dosya eki yönetimi (önceden 2 sayfada tekrarlanıyordu)              */
  /* ==================================================================== */
  function createFileManager(form) {
    var input = form.querySelector('[data-hpl-file-input]');
    if (!input) { return null; }

    var list = form.querySelector('[data-hpl-file-list]');
    var warning = form.querySelector('[data-hpl-file-warning]');
    var selected = [];

    function totalSize() {
      return selected.reduce(function (sum, f) { return sum + f.size; }, 0);
    }

    function showWarning(msg) {
      if (!warning) { return; }
      warning.textContent = msg;
      warning.classList.remove('hidden');
    }

    function hideWarning() {
      if (!warning) { return; }
      warning.classList.add('hidden');
      warning.textContent = '';
    }

    function render() {
      if (!list) { return; }
      list.innerHTML = '';

      selected.forEach(function (file, index) {
        var li = document.createElement('li');
        li.className = 'flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-300';

        var label = document.createElement('span');
        label.className = 'truncate';
        label.textContent = file.name + ' (' + formatSize(file.size) + ')';

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.setAttribute('aria-label', T.removeFile + file.name);
        removeBtn.className = 'shrink-0 text-slate-400 hover:text-[#fb923c] transition';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', function () {
          selected.splice(index, 1);
          render();
        });

        li.appendChild(label);
        li.appendChild(removeBtn);
        list.appendChild(li);
      });

      if (totalSize() > CONFIG.maxTotalBytes) {
        showWarning(T.tooLarge);
      } else if (selected.length > CONFIG.maxFiles) {
        showWarning(T.tooManyFiles);
      } else {
        hideWarning();
      }
    }

    input.addEventListener('change', function () {
      selected = selected.concat(Array.prototype.slice.call(input.files));
      input.value = ''; // aynı dosya tekrar seçilebilsin diye sıfırla
      render();
    });

    return {
      input: input,
      files: function () { return selected; },
      count: function () { return selected.length; },
      valid: function () {
        return selected.length <= CONFIG.maxFiles && totalSize() <= CONFIG.maxTotalBytes;
      },
      clear: function () { selected = []; render(); }
    };
  }

  /* ==================================================================== */
  /*  Gönderim yapılandırılmadığında gösterilen dürüst uyarı              */
  /* ==================================================================== */
  function renderNotConfigured(status) {
    var wa = 'https://wa.me/' + CONFIG.whatsapp;
    var link = 'underline underline-offset-2 hover:text-[#fb923c] transition';

    status.className = STATUS_WARN;
    status.innerHTML =
      '<span class="block mb-2">' + escapeHtml(T.notConfigured) + '</span>' +
      '<span class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">' +
        '<a href="mailto:' + CONFIG.email + '" class="' + link + '">' + CONFIG.email + '</a>' +
        '<a href="' + CONFIG.phoneHref + '" class="' + link + '">' + escapeHtml(CONFIG.phoneText) + '</a>' +
        '<a href="' + wa + '" target="_blank" rel="noopener noreferrer" class="' + link + '">' + T.whatsappLabel + '</a>' +
      '</span>';
  }

  /* ==================================================================== */
  /*  Form bağlama                                                        */
  /* ==================================================================== */
  function bind(form) {
    var kind = form.getAttribute('data-hpl-form') || 'contact';
    var status = form.querySelector('[data-hpl-status]');
    var btn = form.querySelector('button[type="submit"]');
    var files = createFileManager(form);
    var consent = form.querySelector('[data-hpl-consent]');

    if (!status || !btn) { return; }

    // --- FormSubmit yapılandırma alanları (HTML'e elle yazmak yerine burada) ---
    var subject = T.subject[kind] + ' — HydroPascal (' + LANG.toUpperCase() + ')';
    hiddenInput(form, '_subject', subject);
    hiddenInput(form, '_template', 'table');
    hiddenInput(form, '_captcha', 'false');
    hiddenInput(form, '_autoresponse', T.autoresponse);
    if (CONFIG.nextUrl) { hiddenInput(form, '_next', CONFIG.nextUrl); }

    // --- Açık rıza kapısı: onay verilmeden buton aktif olmasın ---
    if (consent) {
      var syncConsent = function () { btn.disabled = !consent.checked; };
      consent.addEventListener('change', syncConsent);
      syncConsent();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Bot koruması: gizli alan doluysa sessizce yut.
      // FormSubmit'in kendi honeypot alanı "_honey"dir; eski "botcheck" adı da
      // geriye dönük destekleniyor.
      var honeypot = form.querySelector('[name="_honey"], [name="botcheck"]');
      if (honeypot && honeypot.value) { return; }

      if (consent && !consent.checked) {
        status.className = STATUS_WARN;
        status.textContent = T.consent;
        consent.focus();
        return;
      }

      // Dosya limiti aşıldıysa gönderme
      if (files && !files.valid()) {
        status.className = STATUS_WARN;
        status.textContent = files.count() > CONFIG.maxFiles ? T.tooManyFiles : T.tooLarge;
        return;
      }

      if (!CONFIG.target) {
        renderNotConfigured(status);
        return;
      }

      var originalLabel = btn.textContent;
      var hasFile = files && files.count() > 0;

      // --- Dosya ekli gönderim: AJAX ek taşımadığı için klasik POST'a düş ---
      if (hasFile && !CONFIG.ajaxSupportsFiles) {
        btn.disabled = true;
        btn.textContent = T.sending;
        form.setAttribute('action', CONFIG.postBase + CONFIG.target);
        form.setAttribute('method', 'POST');
        form.setAttribute('enctype', 'multipart/form-data');
        HTMLFormElement.prototype.submit.call(form);
        return; // sayfa yönlenecek
      }

      // --- Dosyasız: AJAX ---
      var data = new FormData(form);
      data.delete('botcheck');
      data.delete('_honey');
      data.set('_page', window.location.href);
      if (files) {
        files.files().forEach(function (f, i) { data.append('attachment_' + (i + 1), f, f.name); });
      }

      btn.disabled = true;
      btn.textContent = T.sending;
      status.className = STATUS_BASE + 'text-slate-400';
      status.textContent = T.sending;

      fetch(CONFIG.ajaxBase + CONFIG.target, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' }
      })
        .then(function (res) {
          return res.json().catch(function () { return { success: res.ok ? 'true' : 'false' }; });
        })
        .then(function (json) {
          var ok = json && (json.success === true || json.success === 'true');
          if (!ok) { throw new Error('FormSubmit hata döndürdü'); }

          status.className = STATUS_OK;
          status.textContent = T.success;
          form.reset();
          if (files) { files.clear(); }
          // rıza sıfırlandığı için buton yeniden kilitlenir
          btn.disabled = consent ? !consent.checked : false;
        })
        .catch(function (err) {
          status.className = STATUS_WARN;
          status.textContent = (err && err.name === 'TypeError') ? T.network : T.error;
          btn.disabled = false;
        })
        .then(function () {
          btn.textContent = originalLabel;
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var forms = document.querySelectorAll('form[data-hpl-form]');
    Array.prototype.forEach.call(forms, bind);
  });
})();
