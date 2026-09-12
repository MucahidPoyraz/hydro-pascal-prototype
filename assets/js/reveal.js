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
