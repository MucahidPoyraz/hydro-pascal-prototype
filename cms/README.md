# HydroPascal dinamik site prototipi

Mevcut Türkçe/İngilizce statik siteyi tasarımı bozulmadan Next.js üzerinde sunar. `tr/` ve `en/` altındaki tüm mevcut HTML sayfaları ve blog URL'leri dinamik yakalama rotasından açılır; `data-section` / `data-field` ile etiketlenmiş içerik alanları yönetim panelinden düzenlenir.

## Başlatma

```powershell
cd hydro_tema_1
npm install
npm run dev
```

Site: `http://localhost:3000` · Yönetim paneli: `http://localhost:3000/admin`

Geliştirme sunucusunun ilk giriş şifresi: `HydroPascal2026!`

Canlıya veya paylaşılan ortama almadan önce `cms/.env.local` oluşturup `ADMIN_PASSWORD` ve uzun/rastgele `ADMIN_TOKEN` değerlerini belirleyin. Üretim ortamında bu değerler zorunludur; geliştirme şifresi üretimde çalışmaz. `cms/.env.example` örnek değişkenleri içerir.

## Panelde yönetilenler

- Şirket adı, logo, iletişim bilgileri
- Header ve footer menüsü tek ağaçta: alt menüler üst bağlantısının altında görünür (en fazla 6 seviye); ekle, alt menü ekle, kopyala, gizle/göster, yukarı/aşağı, içeri/dışarı al, sürükle-bırak ve sil. Taşıma gerçek `parentId` + `sortOrder` değerlerini değiştirir; public header/footer bu ağaçtan üretilir. “Teklif Al” gibi bir ana bağlantı “Turuncu buton olarak göster” ile CTA olur. Menü değişiklikleri **Kaydet** ile taslak olur (`navigationDraft`), canlı site eski menüyü göstermeye devam eder; sarı bantta **Önizle**, **Taslağı at** ve **Menüyü yayınla** bulunur.
- Tüm liste ekranları (ürün, blog, katalog, kategori, referans/vitrin, talep, görev) tek ortak `DataTable` kullanır: arama, gerçek kolon sıralama (artan → azalan → kapalı), filtreler, 10/25/50/100 sayfa boyutu, sayfalama, satır seçimi ve toplu işlemler (yayınla, yayına al, yayından kaldır, kategori değiştir, sil, durum değiştir). Arama/filtre/sıralama/sayfa adres satırında tutulur; yenilemede korunur. Satır işlemleri “Düzenle” + ••• menüsündedir.
- Toplu ve tekil **Sil** onay penceresi ister ve kaydı canlı siteden de kaldırır; içe aktarılmış eski blog yazıları silinmez, yalnızca yayından kaldırılır (adres korunur). Kullanımdaki kategori silinemez.
- Kaydedilmiş taslaklar `?cmsPreview=view` ile (yalnızca oturum açmış yönetici) salt-okunur önizlenir; editörlerdeki **Önizle ↗** bu adresi açar.
- Çıkışta kaydedilmemiş değişiklik varsa **Vazgeç / Değişiklikleri at / Kaydet ve çık** seçenekleri sunulur; üst çubukta **Değişiklikleri at** son kayda döner. Yayın sırasında çalışma alanı kilitlenir (sunucudan yenileme bitene kadar düzenleme kaybolmaz).
- Yayınlama, silme, görünürlük, menü yayını, kategori ve talep durumu işlemleri `CMS_DATA_DIR/audit.log` denetim kaydına yazılır; **Genel bakış → Son yönetim işlemleri** bu kaydı gösterir.
- Ürün, blog ve katalog editörlerinde kategori alanı bağlamsal: arama, seçme, “＋ Yeni” ile oluşturma ve ✎ ile düzenleme editörden çıkmadan yapılır; yeni kategori anında kaydedilir ve otomatik seçilir, kaydedilmemiş form alanları korunur. Aynı kategoriler **Kategoriler** ekranında (kullanım sayısı, kullanılmayanları toplu silme) yönetilir; kullanımdaki kategori silinemez.
- TR ve EN sitelerindeki 164 mevcut sayfanın etiketli metin, link ve görsel alanları
- Sayfa önizlemesi üzerinde tıklayarak metin, bağlantı, görsel ve ikon düzenleme; yeni metin/görsel/alinti bölümü ekleme
- Hidrolik, OEM, PascalCast ve PascalForge katalogları; ürün detayında teknik tablo, PDF ve çoklu görsel yönetimi
- Referans marka logoları ve medya galerisi için Türkçe/İngilizce alanlar, önizleme ve sıralama
- Mevcut blog sayfalarının alanları ile yeni yazı, taslak/yayın, TR/EN ve görseller
- Blog yazıları için görsel HTML düzenleyici, kaynak görünümü, anlık önizleme ve başlangıç şablonları; yazı kartları ile detay alanları ürün kayıtları gibi yönetilir
- Teklif/iletişim formları, durum takibi, ek dosyalar ve hazır e-posta yanıt şablonları
- İsteğe bağlı SMTP üzerinden şirkete yeni talep bildirimi ve ziyaretçiye otomatik alındı yanıtı

### İçerikleri düzenleme

**Yönetim → Sayfa içerikleri → Sitede düzenle** görünümünde sayfada metne, görsele veya ikona tıklayın. Ürün kataloğundan ürün detayına gidip ürün başlığı, açıklaması, ölçü/marka satırları ve görsellerini aynı yöntemle düzenleyebilirsiniz. Dinamik blog yazıları sayfa seçicisinde görünür; taslak yazılar da yalnızca giriş yapmış yönetici önizlemesinde açılır. Her değişiklik üstteki **Kaydet** düğmesine basılınca saklanır.

#### Bölüm, kart ve düğme yönetimi (yapısal düzenleme)

Soldaki **Yapı** ağacı sayfanın gerçek hiyerarşisini gösterir: bölüm → kart/düğme koleksiyonu → öğe → alan. Bir bölüm seçildiğinde sağ panelde alanları ve koleksiyonları (ör. "Kartlar", "Düğmeler") listelenir; öğeler eklenebilir, çoğaltılabilir, gizlenebilir, silinebilir ve ↑/↓, Alt+↑/↓ ya da sürükle-bırak ile sıralanabilir. **Bölüm ekle** sekmesi yalnızca tasarım sistemine uygun hazır bölüm türlerini sunar. İzin verilen işlemler, en az/en fazla öğe sayısı ve hangi öğenin nereye eklenebileceği `app/lib/page-schema.js` içindeki şemadan gelir; yeni bir bileşen türü eklemek için editörü değil bu dosyayı genişletin. Yapı sayfa içeriğinde `__layout` alanında saklanır, taslak → yayın akışından geçer ve sunucu tarafında (`app/lib/page-structure.js`) canlı siteyle aynı renderer ile çizilir. Testler: `tests/page-structure.test.mjs` (API/renderer) ve `tests/site-duzenle.browser.cjs` (tarayıcı kabul testi).

## SEO, yapılandırılmış veri ve ölçüm

Tek zincir: **CMS verisi → `lib/seo-model.js` (eşleme) → `lib/seo.js` (head + JSON-LD) → public HTML**. Admin önizlemeleri de aynı `seo-model.js` fonksiyonlarını kullanır.

- Her public sayfa `getLegacyPage` sonunda bir kez `applySeoHead` geçer: `<title>`, description, robots, canonical, karşılıklı hreflang (yalnızca iki dil de yayında ve indekslenebilirse), Open Graph, X kartı, Search Console/Bing doğrulaması ve **tek** JSON-LD grafiği (WebSite, Organization, ürün/blogda BreadcrumbList + Product/Article). Statik sayfalardaki FAQPage/Service vb. şemalar korunur; yönetilen türler tekrar etmez. Ürün şemasına modelde olmayan fiyat/stok/puan eklenmez.
- Ürün ve blog SEO alanları kendi editörlerinde; statik sayfa SEO'su **Sayfa içerikleri → SEO ve paylaşım** (`pages[route].__seo`, taslak → yayın). Genel ayarlar **SEO ve ölçüm** ekranında (site adı, varsayılan açıklama/görsel, kurum bilgisi, sosyal profiller, ölçüm, doğrulama kodları, yönlendirmeler, canlı HTML üzerinde SEO kontrolü).
- `/sitemap.xml` ve `/robots.txt` canlı içerikten anlık üretilir; taslak, gizli ve noindex içerik site haritasına girmez. Ürün/yazı adresi değişince eski adres 301 ile yeni adrese gider (`previousSlugs`); manuel yönlendirmeler `settings.redirects`. Bilinmeyen sayfa/ürün temalı 404 sayfasıyla **404** döner.
- Ölçüm: `lib/analytics.js` (sunucu) + `assets/js/hp-analytics.js` (tarayıcı, tek `hpTrack`). Google tag **veya** GTM (asla ikisi). Varsayılan: çerez onayı olmadan hiçbir üçüncü taraf betik yüklenmez; admin önizlemesine ve editör iframe'ine ölçüm eklenmez; `NODE_ENV≠production` iken `ANALYTICS_ENABLED=true` olmadıkça etiket yüklenmez. Olay listesi: `lib/analytics-model.js` (`EVENT_TAXONOMY`). Formlar yalnızca `hp:form` DOM olayı yayar; `form_success` sunucu talebi kaydettikten sonra gönderilir.
- Ortam değişkenleri: `.env.example` (SITE_URL, SEARCH_INDEXING, ANALYTICS_*, GA4/GTM/Ads/Meta/LinkedIn kimlikleri, doğrulama kodları). Hepsi sunucu tarafında istek anında okunur; `NEXT_PUBLIC_*` gerekmez.
- Testler: `tests/seo-analytics.test.mjs` (`npm run test:cms` içinde) ve `tests/seo-analytics.browser.cjs` (izole sunucu + stub'lanmış vendor istekleri; dosya başındaki komuta bakın).

## İçerik ve dosya saklama

İçerik (sayfalar, ürünler, yazılar, kataloglar, kategoriler, menüler, taslaklar, talepler, ayarlar) **MSSQL**'de tutulur (`app/lib/content-db.js`). Bağlantı `cms/.env.local` içindeki `MSSQL_*` değişkenlerinden okunur (git dışı; örnek: `.env.example`).

- Tablolar ilk açılışta otomatik oluşur: `cms_content` (tek satır, JSON gövde + sürüm), `cms_content_backups` (her yazmadan önceki sürüm, gzip, son 50), `cms_audit` (denetim kaydı).
- Sunucu açılırken (`instrumentation.js`) içerik belleğe yüklenir; `readContent()` bellekten okur ve en fazla 2 sn'de bir veritabanı sürümünü arka planda kontrol eder. Her yazma satırı kilitleyen bir transaction'dır, `If-Match` revizyon kontrolü süreçler arasında da geçerlidir (çakışmada 409).
- Mevcut bir `content.json`'ı veritabanına aktarmak: `npm run migrate:mssql` (dolu veritabanının üzerine yazmaz; `-- --force` ile yazar, eski hali yedeklenir). Veritabanı yedeklerini listelemek/geri yüklemek: `npm run restore:content` / `npm run restore:content -- <id>`.
- `CMS_DATA_DIR` verilirse (izole test sunucuları) **dosya deposu** (`content.json`) kullanılır; testler canlı veritabanına yazmaz. `CMS_STORAGE=file|mssql` ile depo zorlanabilir. `MSSQL_*` boşsa CMS eskisi gibi `data/content.json` ile çalışır.
- Yüklenen görseller ve form ekleri veritabanında değil, `CMS_DATA_DIR` (varsayılan `cms/data`) altında dosya olarak tutulur; üretimde bu klasör kalıcı diskte olmalıdır.

SMTP ayarlarını panelde **Site kimliği → Form e-postası bağlantısı** bölümünden girin. E-posta ayarı boşken talepler yine panele kaydedilir; hızlı yanıt düğmesi e-posta istemcisinde düzenlenebilir taslak oluşturur.

## Komutlar

`CMS_DATA_DIR` ortam değişkeni içerik JSON dosyası, yüklenen görseller ve form eklerinin tutulduğu klasörü seçer. Varsayılan `cms/data` klasörüdür; üretimde bu yolu kalıcı disk birimine bağlayın.

- `npm run dev` — geliştirme sunucusu
- `npm run build` — üretim derlemesi (Webpack)
- `npm run repair:categories` — eski içe aktarımdan kalan kategori kayıtlarını onarır (HTML kaçışlı adlar, ayrı kayıt olarak tutulmuş İngilizce blog kategorileri). Varsayılan kuru çalıştırmadır; `-- --apply` ile yazar ve önce yedek alır (MSSQL'de `cms_content_backups`, dosya deposunda `data/backups/`).
- `npm run migrate:mssql` — `data/content.json`'ı MSSQL içerik deposuna aktarır (yukarıya bakın).
- `npm start` — üretim sunucusu

İçerik deposu her yazmadan önce sıkıştırılmış yedek alır (MSSQL: `cms_content_backups`, son 50; dosya deposu: `data/backups/`, son 200). Testler: `cd ../tests && npm run test:cms` (API), tarayıcı kabul testleri `admin-system.browser.cjs`, `contextual-cms.browser.cjs`, `site-duzenle.browser.cjs` (izole sunucuya karşı; dosya başlarındaki komutlara bakın). Ortak ajan/katkı kuralları: `AGENTS.md`.
