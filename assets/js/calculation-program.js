/**
 * HPL Silindir Hesaplayıcı — vanilla JS
 * Eski PHP shortcode'un (hesaplayici-snippet-id26.php) client-side karşılığı.
 * Sunucu tarafı yok: form her şeyi tarayıcıda hesaplar, ürün eşleştirmesini
 * data/urun_katalogu.json üzerinden yapar.
 */
(function () {
  'use strict';

  // ---- Sabitler (eski PHP'deki $rodMap ve $custom_strokes ile birebir) ----
  var rodMap = {
    25: [16],
    30: [25],
    32: [20],
    40: [20, 25, 30],
    50: [25, 30, 40],
    60: [30, 35, 40, 50],
    63: [40],
    70: [35, 40],
    80: [40, 50],
    90: [50],
    100: [50, 60],
    110: [70]
  };

  var customStrokes = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000, 1050, 1100, 1200, 1300, 1400, 1500];

  var JSON_URL = '../assets/data/urun_katalogu.json';
  var IMAGE_BASE = '../assets/images/series/'; // {seri}.jpg bekleniyor
  var PLACEHOLDER_IMG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">' +
      '<rect width="100%" height="100%" fill="#1e293b"/>' +
      '<text x="50%" y="50%" fill="#64748b" font-family="Arial" font-size="20" text-anchor="middle" dominant-baseline="middle">Teknik çizim bulunamadı</text>' +
      '</svg>'
    );

  var catalog = null; // JSON yüklendikten sonra dolar

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    var form = document.getElementById('hpl-calc-form');
    if (!form) return; // bu sayfada hesaplayıcı yoksa çık

    populatePressureSelect();
    populateBoreSelect();
    populateStrokeSelect();

    document.getElementById('c_diam').addEventListener('change', onBoreChange);
    form.addEventListener('submit', onSubmit);

    loadCatalog();
  }

  function loadCatalog() {
    fetch(JSON_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        catalog = data;
      })
      .catch(function (err) {
        console.error('Ürün kataloğu yüklenemedi:', err);
        var box = document.getElementById('hpl-matching-products');
        if (box) {
          box.innerHTML =
            '<div class="hpl-notice hpl-notice-warn">Ürün kataloğu yüklenemedi. Bu sayfayı bir web sunucusu üzerinden (file:// değil, http://) açtığınızdan emin olun.</div>';
        }
      });
  }

  // ---------------------------------------------------------------------
  // Form seçeneklerini doldurma
  // ---------------------------------------------------------------------
  function populatePressureSelect() {
    var sel = document.getElementById('p_press');
    for (var p = 10; p <= 250; p += 5) {
      addOption(sel, p, p);
    }
  }

  function populateBoreSelect() {
    var sel = document.getElementById('c_diam');
    Object.keys(rodMap)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .forEach(function (d) { addOption(sel, d, d); });
  }

  function populateStrokeSelect() {
    var sel = document.getElementById('stroke');
    customStrokes.forEach(function (s) { addOption(sel, s, s); });
  }

  function addOption(select, value, label) {
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }

  function onBoreChange() {
    var boreVal = document.getElementById('c_diam').value;
    var rodSel = document.getElementById('r_diam');
    rodSel.innerHTML = '<option value="">Seçiniz...</option>';

    if (!boreVal || !rodMap[boreVal]) {
      rodSel.disabled = true;
      return;
    }

    rodMap[boreVal].forEach(function (r) { addOption(rodSel, r, r); });
    rodSel.disabled = false;
  }

  // ---------------------------------------------------------------------
  // Hesaplama (eski PHP formülleriyle birebir)
  // ---------------------------------------------------------------------
  function onSubmit(e) {
    e.preventDefault();

    var pPress = parseFloat(document.getElementById('p_press').value);
    var pFlow = parseFloat(document.getElementById('p_flow').value);
    var cDiam = parseInt(document.getElementById('c_diam').value, 10);
    var rDiam = parseInt(document.getElementById('r_diam').value, 10);
    var stroke = parseInt(document.getElementById('stroke').value, 10);
    var forceUnit = document.getElementById('force_unit').value;

    if (!(pPress > 0) || !(pFlow > 0) || !(cDiam > 0) || !(stroke > 0) || !(rDiam > 0)) {
      showFormNotice('Lütfen tüm alanları eksiksiz doldurun.');
      return;
    }
    hideFormNotice();

    var areaExt = Math.PI * Math.pow(cDiam / 20, 2);
    var areaRod = Math.PI * Math.pow(rDiam / 20, 2);
    var areaRet = areaExt - areaRod;

    var fExtTon = (pPress * areaExt) / 1000;
    var fRetTon = (pPress * areaRet) / 1000;

    var extF, retF, unitLabel;
    if (forceUnit === 'kg') {
      extF = fExtTon * 1000;
      retF = fRetTon * 1000;
      unitLabel = 'kg';
    } else {
      extF = fExtTon * 9.80665;
      retF = fRetTon * 9.80665;
      unitLabel = 'kN';
    }

    var vExt = (areaExt * stroke / 10) / 1000;
    var vRet = (areaRet * stroke / 10) / 1000;
    var vTotal = vExt + vRet;

    var tExt = (vExt / pFlow) * 60;
    var tRet = (vRet / pFlow) * 60;
    var tTotal = tExt + tRet;

    var kw = (pPress * pFlow) / (600 * 0.85);
    var hp = kw * 1.341;

    renderResults({
      extF: extF, retF: retF, unitLabel: unitLabel,
      vTotal: vTotal, tTotal: tTotal, kw: kw, hp: hp
    });

    renderMatchingProducts(cDiam, rDiam, stroke);

    document.getElementById('hpl-results-section').classList.remove('hidden');
    document.getElementById('hpl-results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showFormNotice(msg) {
    var el = document.getElementById('hpl-form-notice');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function hideFormNotice() {
    document.getElementById('hpl-form-notice').classList.add('hidden');
  }

  function fmt(n) {
    return n.toFixed(2);
  }

  function renderResults(r) {
    var grid = document.getElementById('hpl-results-grid');
    grid.innerHTML = [
      resItem('İleri Kuvvet (Extension)', fmt(r.extF) + ' ' + r.unitLabel),
      resItem('Geri Kuvvet (Retraction)', fmt(r.retF) + ' ' + r.unitLabel),
      resItem('Yağ Hacmi', fmt(r.vTotal) + ' L'),
      resItem('Çalışma Süresi', fmt(r.tTotal) + ' s'),
      resItem('Tahrik Gücü', fmt(r.kw) + ' kW'),
      resItem('Güç (HP)', fmt(r.hp) + ' HP')
    ].join('');
  }

  function resItem(label, value) {
    return (
      '<div class="hpl-res-item"><span>' + escapeHtml(label) + '</span>' +
      '<div class="hpl-res-val">' + escapeHtml(value) + '</div></div>'
    );
  }

  // ---------------------------------------------------------------------
  // Ürün eşleştirme (accordion)
  // ---------------------------------------------------------------------
  var specLabels = { piston_cap: 'ØA', mil_cap: 'ØB', strok: 'Strok (C)' };
  var specOrder = ['piston_cap', 'mil_cap', 'strok', 'D', 'E', 'F1', 'F2', 'G', 'S', 'J', 'K', 'L', 'DF', 'L1', 'L2', 'Q', 'K2', 'Q1', 'Q2', 'R', 'I', 'M', 'N', 'O', 'LF', 'CH', 'P', 'F', 'S1', 'S2'];

  function renderMatchingProducts(cDiam, rDiam, stroke) {
    var box = document.getElementById('hpl-matching-products');

    if (!catalog) {
      box.innerHTML = '<div class="hpl-notice hpl-notice-warn">Ürün kataloğu henüz yüklenmedi, lütfen birkaç saniye sonra tekrar deneyin.</div>';
      return;
    }

    var found = catalog.filter(function (item) {
      return item.piston_cap_n === cDiam && item.mil_cap_n === rDiam && item.strok_n === stroke;
    });

    if (found.length === 0) {
      box.innerHTML =
        '<div class="hpl-notice hpl-notice-warn">Bu ölçüde (Ø' + cDiam + ' / Ø' + rDiam + ' / ' + stroke + 'mm strok) eşleşen hazır ürün bulunamadı. Özel imalat için lütfen bizimle iletişime geçin.</div>';
      return;
    }

    box.innerHTML = found.map(buildAccordionItem).join('');
  }

  function buildAccordionItem(item, index) {
    var seri = (item.seri || '').trim();
    var code = (item.urun_kodu || 'N/A').trim();

    var specs = [];
    specOrder.forEach(function (key) {
      var val = item[key];
      if (val && val !== '-' && val !== '0') {
        specs.push({ label: specLabels[key] || key.toUpperCase(), value: val });
      }
    });

    var chunks = [];
    for (var i = 0; i < specs.length; i += 10) {
      chunks.push(specs.slice(i, i + 10));
    }

    var tables = chunks.map(function (chunk) {
      var th = chunk.map(function (s) { return '<th>' + escapeHtml(s.label) + '</th>'; }).join('');
      var td = chunk.map(function (s) { return '<td>' + escapeHtml(s.value) + '</td>'; }).join('');
      return '<table class="hpl-clean-table"><tr>' + th + '</tr><tr>' + td + '</tr></table>';
    }).join('');

    var imgSrc = IMAGE_BASE + encodeURIComponent(seri) + '.jpg';

    return (
      '<div class="hpl-accordion closed">' +
        '<button type="button" class="hpl-accordion-header" onclick="this.parentElement.classList.toggle(\'closed\')">' +
          '<span><strong>SERİ:</strong> ' + escapeHtml(seri) + ' &nbsp;|&nbsp; <strong>KOD:</strong> <span class="hpl-accordion-code">' + escapeHtml(code) + '</span></span>' +
          '<span class="hpl-accordion-icon">▲</span>' +
        '</button>' +
        '<div class="hpl-accordion-content">' +
          '<div class="hpl-drawing"><img src="' + imgSrc + '" alt="' + escapeHtml(seri) + ' teknik çizim" loading="lazy" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER_IMG + '\';"></div>' +
          '<div class="hpl-table-container">' + tables + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
