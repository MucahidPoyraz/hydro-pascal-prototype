# HydroPascal Web Sitesi — Profesyonel Denetim Raporu

Kaynak: `hydro_tema_1/` proje klasörü (gerçek dosyalar üzerinden, `tr/` 19 sayfa + kök dosyalar incelendi) ve canlı site `https://mucahidpoyraz.github.io/hydro-pascal-prototype/tr/index.html`. Aşağıdaki her bulgu ya doğrudan kod/dosya incelemesiyle ya da canlı sayfa görüntüsüyle doğrulanmıştır; doğrulanamayan konular ayrıca işaretlenmiştir (bkz. Bölüm E).

---

## 1. Yönetici Özeti

Site, statik HTML + Tailwind CSS + Alpine.js ile kurulmuş, tek bir merkezi `theme.css` üzerinden yürütülen kapsamlı bir "mühendislik/teknik kağıt" tasarım diline sahip, açık/koyu tema destekli, çok dilli (tr/en) bir kurumsal + ürün katalog sitesi. Temel SEO altyapısı (title/description/OG/Twitter/canonical/hreflang/schema/sitemap/robots) şaşırtıcı derecede olgun ve büyük ölçüde doğru kurulmuş — bu, çoğu KOBİ sitesinde eksik olan bir seviye. Buna karşılık üç kritik boşluk var: **(1) hiçbir analitik/ölçüm aracı (GA4, GTM, Meta Pixel, Clarity) kurulu değil** — site kör uçuyor; **(2) tüm formlar (`iletişim`, `teklif al`, `numune formu`) `action="#" method="POST"`** yani gerçekte hiçbir yere veri göndermiyor, kullanıcı "gönder"e bastığında hiçbir şey olmuyor; **(3) çerez onay (cookie consent) mekanizması yok**, Gizlilik Politikası/Kullanım Koşulları sayfaları var ama site KVKK/çerez bildirimini fiilen uygulamıyor. Bunların üçü de "tasarım güzel ama iş sonucu üretmiyor" riski taşıyor ve öncelikli olarak ele alınmalı.

---

## 2. Proje ve Teknoloji Analizi

- **Frontend:** Saf statik HTML5 + Tailwind CSS (CDN: `cdn.tailwindcss.com` — üretim için derlenmemiş, JIT runtime kullanılıyor) + Alpine.js (`x-data`, `x-show`, `x-model`, `x-for`) etkileşim için.
- **Backend / veritabanı / CMS:** Yok. Tamamen statik dosya sitesi; ürün verisi `urun-detay.html` içinde gömülü bir JS `PRODUCTS` nesnesinde tutuluyor. Form gönderimi işleyecek bir backend veya üçüncü parti form servisi (Formspree, Getform vb.) bağlı değil.
- **Klasör yapısı:** Kök dizinde dil seçim sayfası (`index.html`), `robots.txt`, `sitemap.xml`, paylaşılan `assets/` (css/js/images/documents/videos/data), ardından `tr/` ve `en/` altında dile özel sayfa kopyaları. Her dil klasörü ayrıca kendi `assets/css/` ve `assets/js/` alt kopyalarını barındırıyor (bkz. Bölüm 12-D, kod tekrarı riski).
- **Responsive yaklaşım:** Tailwind'in `sm:`/`md:`/`lg:` breakpoint sınıflarıyla mobil öncelikli; masaüstünde `scroll-snap` destekli bölüm geçişleri eklenmiş.
- **Harici servisler:** Google Fonts, Tailwind CDN, WhatsApp derin bağlantısı (`wa.me`). Analitik/reklam/CRM entegrasyonu yok.
- **Production uygunluğu:** Tailwind'in CDN/JIT sürümünü canlıda kullanmak resmi olarak "geliştirme amaçlı, prodüksiyonda kullanılmamalı" diye belgelenir (her sayfa yüklemesinde tarayıcıda CSS derleniyor) — performans ve güvenilirlik açısından bir teknik borç.

---

## 3. Tasarım ve UI/UX Denetimi

Bu alanda önceki görev turlarında (GÖREV 4–6.2) zaten kapsamlı bir düzeltme geçmişi var: tema tutarlılığı, tekrar eden başlıklar, sert kart kenarları, gradyan dikişleri gibi sorunlar sırayla giderildi ve gerçek dosyalarla doğrulandı. Şu an tespit edilen ek/açık noktalar:

| Soru | Yanıt |
|---|---|
| Kullanıcı siteye girince ne sunulduğunu anlıyor mu? | Evet — hero başlığı ve alt metinler net ("HPL Hidrolik Silindir Çözümleri"), WhatsApp CTA'sı her sayfada var. |
| Profesyonel/güvenilir marka algısı var mı? | Görsel olarak evet (tutarlı tema, tipografi); ama **formların çalışmaması** ve **analitik/ölçüm izinin olmaması** kurumsal olgunluk algısını arka planda zayıflatır. |
| Doğru sayfaya yönlendiren navigasyon var mı? | Evet, header/footer menüleri ve "Aradığınızı bulamadınız mı?" panelleri mevcut. |
| Tasarım dönüşüm hedefini destekliyor mu? | Kısmen — CTA'lar görsel olarak güçlü ama iletişim formu arka planda çalışmadığı için gerçek dönüşüm kırılıyor. |
| Mobilde kullanılabilirlik sorunu var mı? | Kod incelemesinden kesin ölçüm çıkarılamaz (gerçek cihaz/DevTools testi gerekir), ancak responsive sınıflar tutarlı kullanılmış. |
| Güven kaybettiren unsur var mı? | Formun sessizce başarısız olması (kullanıcı "gönderdim" sanıp mesaj hiç ulaşmıyor) en ciddi güven riski. |

---

## 4. Teknik SEO Denetimi

**Sayfa/HTML yapısı — güçlü yönler (doğrulandı):** `tr/index.html` başta olmak üzere incelenen sayfalarda title, meta description, canonical, `hreflang` (tr/en/x-default), Open Graph (title/description/image/url/type/site_name), Twitter Card, `html lang="tr"`, JSON-LD schema hepsi mevcut ve sayfaya özel dolduruluyor (jenerik/kopyala-yapıştır değil). Görsellerde `alt` etiketi (index.html'de 16/16 img'de mevcut, boş değil).

**Kırık bağlantı / URL yapısı:** Kapsamlı bir link-crawl bu oturumda yapılmadı (Bölüm E'ye taşındı) — ama `contact.html` dosya adının Türkçe menüde "İletişim" olarak göründüğü halde dosya adının İngilizce (`contact.html`) kalması, `tr/` içinde dosya adlandırma tutarsızlığı yaratıyor (bazı dosyalar Türkçe — `hizmetler.html`, `iletisim` değil `contact.html`, `urun-detay.html`, `kataloglar.html` — bazıları İngilizce). SEO açısından zararı yok ama proje bakımını zorlaştırıyor.

**Tarama/indeksleme:** `robots.txt` sade ve doğru (`Allow: /` + sitemap referansı). `sitemap.xml` hreflang alternatifleriyle birlikte kurulmuş, kök `index.html` bilinçli olarak `noindex, follow` ile işaretlenmiş (dil seçim sayfası olduğu için doğru bir karar). 404 sayfası kontrolü ve gerçek tarama testi GSC/canlı ortam gerektirir (Bölüm E).

**Performans (sadece koddan doğrulanabilir bulgular):**
- Tailwind CDN/JIT kullanımı — her sayfa yüklemesinde render-blocking bir JS ile CSS üretimi anlamına gelir; bu, gerçek üretimde önerilmez ve LCP/CLS'yi olumsuz etkileme potansiyeli taşır (kesin ölçüm için Lighthouse/PSI gerekir).
- `loading="lazy"` bazı sayfalarda yaygın (index.html'de 14, oem-parts.html'de 10) ama bazı sayfalarda sadece 1 kez kullanılmış (about-us, calculation-program, faq, hpl-cylinders, kataloglar, privacy-policy, teklif-al, terms-of-service, disclaimer, referanslar) — muhtemelen bu sayfalarda az görsel olduğu için normal olabilir, ama teyit edilmedi.
- WebP/AVIF kullanımı, görsel boyutları, gzip/Brotli, cache header'ları — bunlar sunucu/hosting katmanına ait olduğundan statik dosya incelemesiyle doğrulanamaz (Bölüm E).

**Yapısal veri (schema):** Sayfa bazında kontrol edildi — her sayfa amacına uygun ayrı schema taşıyor: `index.html`→Organization+WebSite, `about-us`→AboutPage+Organization, `contact.html`→ContactPage+LocalBusiness, `faq.html`→FAQPage, `hpl-cylinders/hpl-products`→Product/ItemList/Brand, `hizmetler/pascalforge/pascalcast/oem-parts`→Service, `kataloglar/referanslar`→CollectionPage, `teklif-al`→ContactPage, legal sayfalar→WebPage+WebSite. Bu iyi kurgulanmış bir schema mimarisi. **Eksik:** `urun-detay.html` (ürün detay sayfası) hiç JSON-LD taşımıyor — bu sayfa `Product` şeması için en uygun aday olduğu halde boş.

---

## 5. SEO İçerik Denetimi

Zorunlu/beklenen sayfaların varlık kontrolü (gerçek dosya listesinden):

| Sayfa türü | Durum |
|---|---|
| Ana sayfa | ✅ `index.html` |
| Hakkımızda | ✅ `about-us.html` |
| Hizmetler/Ürünler | ✅ `hizmetler.html`, `hpl-products.html`, `hpl-cylinders.html`, `oem-parts.html`, `pascalforge.html`, `pascalcast.html` |
| İletişim | ✅ `contact.html` |
| Blog/İçerik merkezi | ❌ Yok — daha önce sizinle konuşulan uzun-kuyruklu arama stratejisi (ör. "8-9 dişli" gibi aramalar) bu eksik nedeniyle hayata geçemiyor. |
| SSS | ✅ `faq.html` (FAQPage şemalı) |
| Referanslar | ✅ `referanslar.html` |
| Proje/Portföy | Kısmen — `kataloglar.html`, `referanslar.html` bu işlevi kısmen karşılıyor, ayrı bir "vaka çalışması/proje" formatı yok. |
| KVKK/Gizlilik | ✅ `privacy-policy.html` |
| Çerez Politikası | ❌ Ayrı bir çerez politikası sayfası yok, çerez onay banner'ı da yok. |
| Kullanım Koşulları | ✅ `terms-of-service.html` |

**Blog eksikliği** hem SEO hem CRO açısından en büyük "eksik özellik" — daha önce sizin de gündeme getirdiğiniz "8-9 dişli" tarzı çok-özel arama sorgularını yakalayacak içerik altyapısı hiç yok.

---

## 6. Dijital Pazarlama ve Dönüşüm Analizi

1. **Ziyaretçi neden bu siteyi tercih etmeli?** Fason üretim + hazır katalog + silindir seçim yazılımı kombinasyonu güçlü bir değer önerisi, ana sayfada iletilmiş.
2. **Site ne yapması gerektiğini açıkça söylüyor mu?** Evet, CTA metinleri net ("Teklif Al", "PDF İndir", WhatsApp'tan yaz).
3. **Güven problemi yaşanabilir mi?** Formun gerçekte çalışmaması (bkz. Bölüm 4/12) en büyük risk; kullanıcı form doldurup gönderir, hiçbir yere gitmediğini fark etmez, HydroPascal geri dönmez, kullanıcı markayı güvenilmez bulur.
4. **Teklif alma süreci kolay mı?** Arayüz olarak kolay görünüyor ama arka planda işlevsiz olduğu için gerçekte "kolay değil, imkansız" — bu en kritik CRO bulgusu.
5. **Hangi sayfalar dönüşüm açısından zayıf?** `contact.html`, `teklif-al.html`, `hizmetler.html`'deki numune formu — hepsi aynı `action="#"` sorununu taşıyor.
6. **Kaçırılan pazarlama fırsatları:** E-posta toplama/bülten aboneliği yok; retargeting/pixel altyapısı yok (Meta/Google reklam yatırımı yapılırsa veri toplanamayacak); form gönderim/telefon tıklama/WhatsApp tıklama olay takibi yok (GA4 kurulmadığı için).

---

## 7. Güvenlik ve Teknik Kalite (yalnızca koddan doğrulanabilenler)

- Formlarda `action="#"` olması aslında bir güvenlik açığı değil ama **fonksiyonel bir kırıklık**; ileride gerçek bir endpoint bağlanacaksa CSRF/input validasyonu o zaman değerlendirilmeli.
- Sayfalarda kullanıcı girdisi işleyen bir sunucu tarafı kod olmadığından SQLi/XSS/CSRF gibi klasik sunucu güvenlik riskleri bu statik yapıda mevcut değil — risk yüzeyi bu haliyle düşük.
- API anahtarı, hassas bilgi, kimlik bilgisi taraması yapılan dosyalarda görülmedi.
- HTTPS gereksinimi: canlı site GitHub Pages üzerinde (`https://mucahidpoyraz.github.io/...`) yayınlanmış durumda, GitHub Pages otomatik HTTPS sağlıyor; gerçek `hydropascal.com.tr` domainine geçildiğinde SSL sertifikası ayrıca doğrulanmalı.
- Bağımlılık güncelliği: Tailwind CDN ve Google Fonts harici barındırılıyor, versiyon sabitlenmemiş (Tailwind CDN her zaman en güncel sürümü çeker) — bu üretimde öngörülemezlik riski taşır.

---

## 8. Analitik ve Ölçümleme

Site genelinde (19 `tr/` sayfası) `gtag`, `googletagmanager`, `GTM-`, `clarity.ms`, `fbq(`, `connect.facebook.net` desenleri arandı — **hiçbirine rastlanmadı.** Yani:

- ❌ Google Analytics 4 yok
- ❌ Google Tag Manager yok
- ❌ Google Search Console doğrulaması (kod içinden görülemez, ayrıca kontrol edilmeli)
- ❌ Microsoft Clarity yok
- ❌ Meta Pixel yok
- ❌ Form gönderim / telefon tıklama / WhatsApp tıklama olay takibi yok
- ❌ Çerez onay (cookie consent) sistemi yok

Bu, sitenin şu an **hiçbir ziyaretçi/davranış verisi toplamadığı** anlamına geliyor — hangi sayfanın işe yaradığını, kullanıcıların nerede terk ettiğini ölçme imkânı yok.

---

## 9. Hukuki ve Güven Unsurları

- Gizlilik Politikası ve Kullanım Koşulları sayfaları var, içerik olarak gerçek metin taşıyor (jenerik placeholder değil — GÖREV 6.2 doğrulamasında da teyit edilmişti).
- İletişim bilgileri (telefon: +90 555 384 82 29, WhatsApp) her sayfada footer'da mevcut.
- **Eksik:** Ayrı bir çerez politikası metni ve/veya sitede fiilen çalışan bir çerez onay banner'ı yok — Gizlilik Politikası'nda çerez konusuna değiniliyor olsa da (metin doğrulanmadı, sadece dosya varlığı teyit edildi) bu, Türkiye'de KVKK pratiği açısından gözden geçirilmesi gereken bir nokta; kesin hukuki değerlendirme için bir hukuk danışmanına gösterilmesi önerilir.
- Şirket resmi unvanı, vergi no, MERSİS no gibi ticari sicil bilgileri sayfalarda görülmedi (küçük/orta ölçekli B2B sitelerinde her zaman zorunlu değil, ama güven unsuru olarak eklenmesi faydalı olur).

---

## 10. Rakip ve Pazar Pozisyonu

Bu oturumda canlı web erişimiyle rakip sitesi taraması yapılmadı (kapsam dışı bırakıldı, veri uydurulmadı). Anlamlı bir rakip analizi için şu verilerin toplanması gerekir: hidrolik silindir/tarım OEM parça üreten Türkiye merkezli 3-5 rakip firmanın web sitesi adresleri, bu sitelerin sunduğu hizmet kapsamı, içerik/blog stratejileri ve SEO görünürlükleri (Ahrefs/Semrush ile). Bu veriler sağlanırsa ayrı bir rakip analizi raporu hazırlanabilir.

---

## 11. Önceliklendirilmiş Sorun Tablosu

| ID | Kategori | Sorun | Konum | Etki | Öncelik | Çözüm |
|----|----------|-------|-------|------|---------|-------|
| 1 | KRİTİK | Formlar hiçbir yere veri göndermiyor (`action="#" method="POST"`) | `contact.html`, `teklif-al.html`, `hizmetler.html` (numune formu) | Tüm form tabanlı lead'ler kayboluyor, sıfır dönüşüm | KRİTİK | Formspree/Getform gibi bir üçüncü parti form servisine veya kendi backend endpoint'inize bağlayın; gönderim sonrası kullanıcıya görünür başarı/hata mesajı ekleyin |
| 2 | KRİTİK | Hiçbir analitik/ölçüm aracı kurulu değil | Sitewide (tüm `tr/*.html`) | Trafik, davranış, dönüşüm verisi tamamen kayıp; pazarlama kararları körlemesine alınıyor | KRİTİK | GA4 + Google Search Console + (istenirse) Microsoft Clarity kurun, form/telefon/WhatsApp tıklama olaylarını GA4 event olarak işaretleyin |
| 3 | YÜKSEK | Çerez onay mekanizması yok | Sitewide | Analitik/pixel eklendiğinde KVKK/gizlilik uyumu riske girer | YÜKSEK | Basit bir çerez onay banner'ı ekleyin (analitik kurulumuyla birlikte planlanmalı) |
| 4 | YÜKSEK | Tailwind CDN/JIT üretimde kullanılıyor | Tüm sayfaların `<head>`'i (`cdn.tailwindcss.com`) | Render-blocking risk, öngörülemez versiyon davranışı, resmi olarak "prod'da kullanma" uyarısı var | YÜKSEK | Tailwind'i build-time (CLI/PostCSS) ile derleyip statik bir `.css` dosyası olarak servis edin |
| 5 | ORTA | `urun-detay.html`'de Product şeması yok | `tr/urun-detay.html` | Ürün sayfası zengin sonuç (rich result) fırsatını kaçırıyor | ORTA | Sayfadaki `PRODUCTS` JS nesnesinden dinamik `Product` JSON-LD üretimi ekleyin |
| 6 | ORTA | Blog/içerik merkezi yok | Sitewide | Uzun-kuyruklu arama trafiği (ör. "8-9 dişli" gibi spesifik sorgular) yakalanamıyor | ORTA | Blog listeleme + yazı şablonu altyapısı kurup düzenli içerik üretimine başlayın (daha önce konuşulan, ayrı görev) |
| 7 | DÜŞÜK | `tr/` dosya adlandırması karışık (bazıları TR, bazıları EN: `contact.html` vs `hizmetler.html`) | `tr/` klasörü | SEO'ya doğrudan zararı yok, bakım/tutarlılık sorunu | DÜŞÜK | Yeni sayfa eklerken TR klasöründe TR dosya adı konvansiyonu benimseyin (mevcutları değiştirmek 301 yönetimi gerektirir, aceleye getirilmemeli) |
| 8 | DÜŞÜK | Bazı sayfalarda `loading="lazy"` çok az kullanılmış | about-us, faq, calculation-program, kataloglar, vb. (1 adet) | Küçük performans fırsatı | DÜŞÜK | Görsel sayısı arttıkça `loading="lazy"` ekleyin (ilk ekran görseli hariç) |

---

## 12. Tamamlananlar ve Eksikler

**A. Tamamlanmış ve doğru uygulananlar (kanıtlı):**
- Sayfa bazlı title/description/canonical/hreflang/OG/Twitter Card — her sayfada özelleştirilmiş, jenerik değil.
- Sayfa amacına uygun JSON-LD şema mimarisi (Organization, LocalBusiness, FAQPage, Product/ItemList, Service, CollectionPage vb.).
- `robots.txt` ve `sitemap.xml` doğru kurulmuş, hreflang alternatifleri sitemap'te de tekrarlanmış.
- WhatsApp derin bağlantısı sitewide, sayfaya özel önceden doldurulmuş mesaj metniyle.
- Görsellerde `alt` metni kullanımı (en azından index.html'de %100).
- KVKK/Gizlilik/Kullanım Koşulları sayfaları gerçek içerikle mevcut (placeholder değil).

**B. Mevcut ancak iyileştirilmesi gerekenler:**
- Tailwind CDN → build-time derleme.
- `loading="lazy"` kullanımının sayfa genelinde tutarlılaştırılması.
- `urun-detay.html`'ye Product şeması eklenmesi.

**C. Eksik olanlar:**
- Analitik/ölçüm (GA4, GTM, Clarity, Pixel).
- Çerez onay sistemi.
- Blog/içerik merkezi.
- Çalışan form backend'i.

**D. Hatalı veya riskli uygulamalar:**
- Formların `action="#"` ile "sessizce başarısız" olması — kullanıcıya hata da başarı da göstermiyor, bu en riskli bulgu.
- `tr/` ve `en/` klasörlerinin kendi `assets/css`, `assets/js` kopyalarını ayrı ayrı barındırması (kök `assets/` da ayrıca var) — üç farklı yerde benzer varlıkların birikmesi, ileride hangisinin güncel olduğunu karıştırma riski taşıyor.

**E. Dış araçlarla test edilmesi gerekenler (bu oturumda ölçülemez):**
- Gerçek Core Web Vitals (LCP/INP/CLS) → PageSpeed Insights / Lighthouse.
- Google'ın sayfaları fiilen nasıl tarayıp indekslediği, mevcut arama performansı → Google Search Console.
- Gerçek anahtar kelime hacmi/rekabet verisi → Google Keyword Planner, Ahrefs, Semrush.
- Rakip siteler → gerçek URL'ler sağlanırsa canlı inceleme yapılabilir.
- Kapsamlı kırık link taraması (sitewide crawl).
- Mobil cihazda gerçek dokunmatik kullanılabilirlik testi.

**F. Sitenin amacına göre gereksiz olabilecek özellikler:** Bu incelemede gereksiz/aşırı bir özellik tespit edilmedi; mevcut özelliklerin tamamı sitenin B2B/fason üretim + katalog amacına hizmet ediyor.

---

## 13. Uygulama Yol Haritası

**AŞAMA 1 — Acil düzeltmeler**
- Form backend'ini bağlama (Formspree/Getform veya kendi API'niz — zaten FastAPI deneyiminiz var, kendi endpoint'inizi de kurabilirsiniz). Öncelik: KRİTİK. Zorluk: Düşük-Orta. Bağımlılık: Yok. Fayda: Sıfırdan gerçek lead akışı.
- GA4 + Search Console kurulumu. Öncelik: KRİTİK. Zorluk: Düşük. Bağımlılık: Yok. Fayda: İlk gerçek veri, hangi sayfaların çalıştığını görme.

**AŞAMA 2 — SEO ve teknik iyileştirmeler**
- Tailwind'i build-time derlemeye geçirme. Öncelik: Yüksek. Zorluk: Orta. Bağımlılık: Build süreci kurulmalı (npm + Tailwind CLI). Fayda: Performans ve stabilite.
- `urun-detay.html`'ye dinamik Product şeması. Öncelik: Orta. Zorluk: Düşük. Fayda: Zengin sonuç fırsatı.
- Kapsamlı kırık link taraması ve düzeltme. Öncelik: Orta. Zorluk: Düşük.

**AŞAMA 3 — UI/UX iyileştirmeleri**
- Form gönderiminde görünür başarı/hata mesajı UI'ı (backend bağlandıktan sonra). Öncelik: Yüksek. Zorluk: Düşük.
- Devam eden görsel QA sürecinizin (mevcut skill'deki kalite kontrol listesi) kalan sayfalara uygulanması.

**AŞAMA 4 — Dönüşüm ve pazarlama**
- Çerez onay banner'ı (analitikle birlikte). Öncelik: Yüksek. Zorluk: Düşük.
- Form/telefon/WhatsApp tıklama olaylarının GA4'te event olarak işaretlenmesi. Öncelik: Orta. Bağımlılık: GA4 kurulu olmalı.

**AŞAMA 5 — Uzun vadeli geliştirmeler**
- Blog/içerik merkezi altyapısı ve uzun-kuyruklu SEO içerik üretimi (daha önce konuşulan strateji). Öncelik: Orta-Uzun vadeli. Zorluk: Yüksek (sürekli içerik üretimi gerektirir).
- Ürün detay sayfalarına gerçek ürün fotoğrafları (daha önce ertelenmiş, hâlâ geçerli).
- Rakip analizi (gerçek rakip URL'leri sağlandığında).

---

## 14. İlk Yapılması Gereken 10 İşlem

1. `contact.html`, `teklif-al.html`, `hizmetler.html` formlarını gerçek bir backend/form servisine bağlayın.
2. Form gönderiminde kullanıcıya görünür başarı/hata mesajı ekleyin.
3. Google Analytics 4 kurun.
4. Google Search Console'a siteyi (gerçek domain üzerinden) ekleyip sitemap'i gönderin.
5. Basit bir çerez onay banner'ı ekleyin.
6. Tailwind CDN'den build-time derlemeye geçiş planlayın.
7. `urun-detay.html`'ye Product JSON-LD şeması ekleyin.
8. PageSpeed Insights ile gerçek Core Web Vitals ölçümü alın.
9. Sitewide kırık link taraması yapın.
10. Blog altyapısı için ayrı bir görev planlayın (uzun-kuyruklu SEO stratejisi).

---

## Sonuç

**"Bu siteyi profesyonel, SEO açısından güçlü, kullanıcı dostu ve pazarlama açısından etkili bir hâle getirmek için neler tamamlanmalı?"**

Sitenin tasarım ve teknik SEO temeli beklenenden güçlü — bu kısma yeniden yatırım yapmaya gerek yok. Asıl eksik, sitenin "vitrin" kısmı değil, **iş sonucu üreten arka plan** kısmı: formların gerçekten çalışması, ziyaretçi davranışının ölçülmesi ve KVKK/çerez uyumunun tamamlanması. Bu üç kritik/yüksek öncelikli iş tamamlandığında site, zaten sahip olduğu güçlü görsel ve SEO temeliyle birlikte gerçek anlamda "profesyonel ve dönüşüm üreten" bir siteye dönüşür. Bunun ardından blog/içerik stratejisi ve Tailwind build optimizasyonu, sitenin uzun vadeli büyümesini destekleyecek ikinci dalga işler olarak planlanmalı.
