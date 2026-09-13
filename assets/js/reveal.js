/*
  HydroPascal — Section reveal-on-scroll (GÖREV 5.0 Bölüm 3)
  ============================================================
  Her <main> > section, viewport'a girdiğinde hafif bir "tak" hissiyle
  belirir (opacity 0→1 + translateY 16px→0). Ağır bir kütüphane yok,
  sade IntersectionObserver + CSS transition (bkz. theme.css'teki
  .hp-reveal / .hp-reveal-in kuralları).

  - prefers-reduced-motion: reduce → script hiçbir şeye dokunmaz, tüm
    section'lar CSS'teki media query sayesinde zaten normal (opacity:1)
    render olur.
  - IntersectionObserver desteklenmiyorsa (çok eski tarayıcı) → script
    hiçbir class eklemez, CSS varsayılanı yine opacity:1 olduğu için
    içerik görünür kalır (bkz. theme.css: .hp-reveal sınıfı SADECE JS
    tarafından eklenir, başlangıç state'i her zaman görünür).
*/
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  if (!('IntersectionObserver' in window)) {
    return;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var sections = document.querySelectorAll('main > section');
    if (!sections.length) return;

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('hp-reveal-in');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    sections.forEach(function (section, i) {
      // İlk section (genelde hero) sayfa açılır açılmaz zaten görünür
      // alanda olduğu için animasyona gerek yok — flash of invisible
      // content'i önler.
      if (i === 0) return;
      section.classList.add('hp-reveal');
      observer.observe(section);
    });
  });
})();

/*
  HydroPascal — Üst navigasyonda aktif sayfa vurgusu (GÖREV 9.4)
  ================================================================
  Header markup'ı 42 sayfada birebir aynı (statik HTML, ortak include
  yok) olduğu için "hangi sayfadaysam onun linki hep vurgulu olsun"
  isteği HTML'e değil, buraya (tek noktadan tüm sayfaları kapsayan
  paylaşılan script) yazıldı. O an açık olan sayfanın dosya adını
  bulur, üst nav'daki <a>'lardan/dropdown panellerindeki linklerden
  hangisi eşleşiyorsa ona ".nav-active" class'ı ekler — görsel stil
  (accent alt çizgi) theme.css'te tanımlı.
*/
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('header nav');
    if (!nav) return;

    // DÜZELTME: sadece dosya adına (basename) bakmak yanlış eşleşme
    // yaratıyordu — ör. "/tr/index.html" (Ana Sayfa) ile
    // "/tr/blog/index.html" (Blog) aynı basename'i ("index.html")
    // paylaştığı için ikisi de aynı anda aktif görünüyordu. Tam,
    // normalize edilmiş path karşılaştırması kullanılıyor.
    function normalizedPath(href) {
      if (!href) return '';
      try {
        var u = new URL(href, window.location.href);
        var p = u.pathname.toLowerCase();
        if (p.endsWith('/')) p += 'index.html';
        return p;
      } catch (e) {
        return '';
      }
    }

    var currentPath = normalizedPath(window.location.pathname);

    Array.prototype.forEach.call(nav.children, function (child) {
      if (child.tagName === 'A') {
        // CTA ("Teklif Al") gibi dolgun butonlar theme.css'te zaten hariç
        // tutuluyor (.bg-[#fb923c]) — burada class eklense de görsel
        // etkisi olmuyor, o yüzden ekstra kontrol gerekmiyor.
        if (normalizedPath(child.getAttribute('href')) === currentPath) {
          child.classList.add('nav-active');
        }
      } else if (child.tagName === 'DIV') {
        // Ayarlar (dil/tema) kutusu — wrapper'ı .ml-3, içinde sayfa
        // linki değil dil/tema kontrolleri var; atla.
        if (child.classList.contains('ml-3')) return;
        var toggleBtn = child.querySelector(':scope > button');
        var links = child.querySelectorAll('a[href]');
        if (!toggleBtn || !links.length) return;
        var hasActiveChild = Array.prototype.some.call(links, function (a) {
          return normalizedPath(a.getAttribute('href')) === currentPath;
        });
        if (hasActiveChild) toggleBtn.classList.add('nav-active');
      }
    });
  });
})();
