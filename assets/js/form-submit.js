/*
  HydroPascal — Ortak form gönderim modülü
  =========================================
  GÖREV 10.1 / 10.2 / 10.3 / 10.4

  NEDEN VAR:
  Denetimde üç formun da gerçekte hiçbir yere veri göndermediği tespit edildi:
    - contact.html    → action="#", submit handler YOK. Tıklayınca sayfa
                        yenileniyor, veri kayboluyor, geri bildirim yok.
    - hizmetler.html  → console.log yapıp 600ms sonra ekrana
                        "Talebiniz alındı" yazıyordu. SAHTE BAŞARI MESAJI.
                        Fason üretim talebi gönderen müşteri haftalarca
                        cevap bekliyordu. Denetimin en ciddi bulgusu.
    - teklif-al.html  → EmailJS ile gönderiyordu ama EmailJS sendForm()
                        DOSYA EKİ GÖNDERMEZ; seçilen dosyalar yalnızca
                        console.log'lanıyordu. Müşteri teknik çizimini
                        yüklediğini sanıyordu.

  Ayrıca dosya seçim/listeleme kodu hizmetler.html ve teklif-al.html içinde
  BİREBİR aynı şekilde iki kez yazılmıştı (bkz. .claude/rules/components.md
  kural 2: aynı işi yapan ikinci bir bileşen yaratma). Burada tek kopya var.

  ⚠️ YAPILANDIRMA GEREKLİ — GÖREV 10.1
  Aşağıdaki CONFIG.endpoint boş olduğu sürece modül HİÇBİR KOŞULDA başarı
  mesajı göstermez. Bunun yerine dürüst bir uyarı + doğrudan iletişim
  kanalları gösterir ve kullanıcının girdiğini SİLMEZ. Bu bilinçli bir
  tercihtir: yanlış "gönderildi" mesajı vermektense hiç vermemek yeğdir.

  Endpoint seçildiğinde (Web3Forms / Formspree / kendi backend'iniz),
  yalnızca CONFIG bloğunu doldurmanız yeterlidir; başka hiçbir dosyaya
  dokunmanız gerekmez.
*/
(function () {
  'use strict';

  /* ==================================================================== */
  /*  YAPILANDIRMA — GÖREV 10.1 (tek değiştirilecek yer)                  */
  /* ==================================================================== */
  var CONFIG = {
    // Formun POST edileceği adres. Örnekler:
    //   Web3Forms : 'https://api.web3forms.com/submit'
    //   Formspree : 'https://formspree.io/f/XXXXXXXX'
    //   Kendi API : '/api/form'
    endpoint: '',

    // Yalnızca Web3Forms için gerekli (access key). Diğerlerinde boş bırakın.
    accessKey: '',

    // Gönderim yapılandırılana kadar gösterilecek doğrudan iletişim kanalları
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
      notConfigured: 'Çevrimiçi form gönderimi henüz etkinleştirilmedi. Talebinizi kaybetmemek için lütfen doğrudan bize ulaşın:',
      whatsappLabel: 'WhatsApp',
      tooManyFiles: 'En fazla ' + CONFIG.maxFiles + ' dosya ekleyebilirsiniz.',
      tooLarge: "Toplam dosya boyutu 10 MB'ı aşıyor. Lütfen bazı dosyaları kaldırın.",
      removeFile: 'Dosyayı kaldır: ',
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
      notConfigured: 'Online form submission is not enabled yet. So that your request is not lost, please contact us directly:',
      whatsappLabel: 'WhatsApp',
      tooManyFiles: 'You can attach at most ' + CONFIG.maxFiles + ' files.',
      tooLarge: 'Total file size exceeds 10 MB. Please remove some files.',
      removeFile: 'Remove file: ',
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
      files: function () { return selected; },
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

    if (!status || !btn) { return; }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Bot koruması: gizli alan doluysa sessizce yut.
      // NOT: eski kod form.botcheck (adlandırılmış özellik erişimi) kullanıyordu.
      // Tarayıcıda çalışır ama kırılgan bir kalıptır ve test ortamlarında
      // (jsdom) undefined döner — yani koruma sessizce devre dışı kalabilir.
      // Açık querySelector her yerde aynı davranır.
      var honeypot = form.querySelector('[name="botcheck"]');
      if (honeypot && honeypot.value) { return; }

      // Dosya limiti aşıldıysa gönderme
      if (files && !files.valid()) {
        status.className = STATUS_WARN;
        status.textContent = files.files().length > CONFIG.maxFiles ? T.tooManyFiles : T.tooLarge;
        return;
      }

      // GÖREV 10.1 yapılandırılmadıysa: ASLA başarı gösterme, veriyi de silme
      if (!CONFIG.endpoint) {
        renderNotConfigured(status);
        return;
      }

      var data = new FormData(form);
      data.delete('botcheck');
      data.set('_subject', T.subject[kind] + ' — HydroPascal (' + LANG.toUpperCase() + ')');
      data.set('_page', window.location.href);
      if (CONFIG.accessKey) { data.set('access_key', CONFIG.accessKey); }
      if (files) {
        files.files().forEach(function (f, i) { data.append('attachment_' + (i + 1), f, f.name); });
      }

      var originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = T.sending;
      status.className = STATUS_BASE + 'text-slate-400';
      status.textContent = T.sending;

      fetch(CONFIG.endpoint, { method: 'POST', body: data })
        .then(function (res) {
          if (!res.ok) { throw new Error('HTTP ' + res.status); }
          status.className = STATUS_OK;
          status.textContent = T.success;
          form.reset();
          if (files) { files.clear(); }
        })
        .catch(function () {
          status.className = STATUS_WARN;
          status.textContent = T.error;
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = originalLabel;
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var forms = document.querySelectorAll('form[data-hpl-form]');
    Array.prototype.forEach.call(forms, bind);
  });
})();
