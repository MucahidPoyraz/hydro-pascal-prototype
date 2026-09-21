# FormSubmit Prototip Formları

> **PROTOTİP.** Bu klasör ileride React/Next.js veya ASP.NET backend'e taşınacaktır.
> FormSubmit geçici çözümdür. Canlıya çıkmadan önce **bu klasör siteden kaldırılmalıdır**
> (tüm sayfalar `noindex, nofollow` işaretli).

Backend yok, PHP yok, sunucu tarafı kod yok. Sadece statik dosyalar + FormSubmit.co.

---

## 1. Dosya Yapısı

```
prototip-formlar/
├── assets/
│   ├── forms.css                 ← ortak stil (tek kaynak)
│   └── forms.js                  ← ortak form motoru (tek kaynak)
├── form-1-iletisim.html          ← ayrıştırılmış sürüm (harici css/js)
├── form-2-teklif.html
├── form-3-numune.html
├── form-4-hizli-iletisim.html
├── tek-dosya/
│   ├── form-1-iletisim-tek-dosya.html   ← inline css+js, tek dosyada çalışır
│   ├── form-2-teklif-tek-dosya.html
│   ├── form-3-numune-tek-dosya.html
│   └── form-4-hizli-iletisim-tek-dosya.html
├── demo.html                     ← dört form tek sayfada (hızlı önizleme)
├── tesekkurler.html              ← _next hedefi
├── kvkk.html                     ← KVKK linki hedefi (YER TUTUCU)
├── _kaynak-fragmanlar.html       ← derleme kaynağı, doğrudan açılmaz
└── build.py                      ← iki sürümü tek kaynaktan üretir
```

**Neden iki sürüm var ve hangisini kullanmalıyım?**

`tek-dosya/` sürümleri **kopyala-yapıştır/deneme** içindir. CSS ve JS dört dosyada
birebir tekrarlandığı için gerçek sitede kullanılırsa bir düzeltmeyi dört yerde
yapmanız gerekir. **Gerçek entegrasyonda ayrıştırılmış sürümü kullanın.**

İki sürümün birbirinden sapmaması için tek-dosya sürümleri `build.py` tarafından
ayrıştırılmış sürümden **üretilir**. Formda değişiklik yapacaksanız
`_kaynak-fragmanlar.html` / `assets/forms.css` / `assets/forms.js` dosyalarını
düzenleyip şunu çalıştırın:

```bash
cd prototip-formlar
python build.py
```

---

## 2. Kurulum Adımları

1. **E-posta adresini ayarlayın.** Üç yerde geçiyor:
   - `assets/forms.js` → `CONFIG.email`
   - Her formun `action` özniteliği (`_kaynak-fragmanlar.html` içinde)
   - `_cc` gizli alanı ve KVKK metnindeki adres

   Hepsi şu an `info@sitename.com.tr`. Gerçek adresle değiştirip `python build.py` çalıştırın.

2. **`_next` adresini ayarlayın.** Şu an `https://sitename.com.tr/tesekkurler.html`.
   Bu alan **yalnızca dosya ekli gönderimlerde** kullanılır (bkz. bölüm 4).
   Domain bağlanana kadar: alanı silin — FormSubmit kendi teşekkür sayfasını gösterir.
   **`_next` mutlak URL olmalıdır**; göreli yol (`/tesekkurler.html`) çalışmaz.

3. **Dosyaları hostinge yükleyin.** Klasörü olduğu gibi kopyalayın. Derleme,
   çalışma zamanı, `node_modules` gerekmez — saf statik.

4. **FormSubmit'i aktive edin.** İlk gönderimde etkinleşir; bkz. bölüm 3.

5. **KVKK sayfasını gerçekle değiştirin.** `kvkk.html` şu an yer tutucu.
   Bu, yayına çıkış için **zorunludur** (`GÖREV 10.8`).

6. **E-postayı gizlemeyi değerlendirin (önerilir).** Şu anki kurulumda kurumsal
   e-posta adresiniz HTML kaynağında açıkta ve spam botları tarafından toplanabilir.
   FormSubmit aktivasyon e-postasında size `https://formsubmit.co/el/xxxxxxx`
   biçiminde **hash'li bir uç nokta** verir. `CONFIG.email` yerine bu hash'i
   kullanırsanız adres kaynak kodda görünmez:

   ```js
   ajaxBase: 'https://formsubmit.co/ajax/',
   email:    'el/xxxxxxx'   // hash'li uç nokta
   ```
   Aynı değişikliği formların `action` özniteliğinde de yapın.

---

## 3. FormSubmit İlk Onay (Aktivasyon) Maili Nasıl Doğrulanır?

FormSubmit, bir adrese ilk gönderim yapılana kadar **hiçbir e-posta iletmez**.
Akış şudur:

1. Formu doldurup **ilk kez** gönderin (canlı/erişilebilir bir URL'den — `file://`
   üzerinden AJAX çalışmaz, bkz. bölüm 5).
2. FormSubmit, `info@sitename.com.tr` adresine **"Confirm your email"** konulu bir
   aktivasyon maili gönderir. İçinde bir bağlantı ve bir aktivasyon kodu bulunur.
3. Maildeki bağlantıya tıklayın. Açılan sayfada **"Your form is now active"**
   benzeri bir onay görürsünüz.
4. Aynı ekranda size ait **hash'li uç nokta** (`formsubmit.co/el/...`) gösterilir —
   bunu not alın (bkz. bölüm 2, madde 6).
5. Formu **ikinci kez** gönderin. Bu gönderim artık gerçekten kutunuza düşer.

**Aktivasyon maili gelmiyorsa:**
- Spam / Gereksiz klasörüne bakın (ilk mail sık sık oraya düşer).
- Kurumsal mail sunucusu ABD kaynaklı otomatik mailleri karantinaya alıyor olabilir;
  IT'den `formsubmit.co` alan adını beyaz listeye aldırın.
- Adresin doğru yazıldığını kontrol edin — yanlış adrese gönderilen aktivasyon
  maili geri gelmez, formunuz sessizce çalışmaz.
- Tarayıcı konsolunda gönderimin gerçekten 200 döndüğünü doğrulayın.

**Önemli:** Aktivasyon **adres başına bir kezdir**. Dört formun tamamı aynı adrese
gittiği için tek aktivasyon yeterlidir.

---

## 4. Dosya Eki: Bilinen Kısıt ve Çözüm

**FormSubmit'in `/ajax/` uç noktası dosya eklerini iletmez.** Ekler yalnızca
klasik `multipart/form-data` POST ile `https://formsubmit.co/<eposta>` adresine
gönderildiğinde çalışır.

Motor bunu otomatik yönetir (`assets/forms.js`):

| Durum | Yol | Kullanıcı deneyimi |
|---|---|---|
| Dosya **seçilmemiş** | `fetch` → `/ajax/...` | Sayfa yenilenmez, inline yeşil kutu |
| Dosya **seçilmiş** | klasik POST → `formsubmit.co/...` | Sayfa `_next` adresine yönlenir |

Böylece ek asla sessizce kaybolmaz.

> **Doğrulanması gereken:** Bu kısıt FormSubmit'in dokümante ettiği davranışa
> dayanır; **canlı testle teyit edilmelidir.** AJAX'ın ek taşıdığı görülürse
> `assets/forms.js` içinde `CONFIG.ajaxSupportsFiles = true` yapmanız yeterli —
> tüm formlar tek yoldan (AJAX) ilerler.

**Boyut sınırı:** İstemci tarafında 10 MB'a sınırladık (mail sunucusu limiti).
FormSubmit'in kendi sınırı bundan **düşük olabilir**; ilk canlı testte 8–10 MB
arası gerçek bir dosyayla deneyin. Limit aşılırsa formda not zaten var:
*"10 MB üzeri teknik çizimler için doğrudan e-posta gönderin."*

---

## 5. Test Senaryoları

> `file://` ile açtığınızda AJAX **çalışmaz** (CORS). Yerel test için:
> `python -m http.server 8000` çalıştırıp `http://localhost:8000/...` adresinden açın.

### A. Doğrulama (gönderim yapmadan)
| # | Senaryo | Beklenen |
|---|---|---|
| A1 | Sayfa açılır | Gönder butonu **disabled** |
| A2 | KVKK işaretlenir | Buton aktifleşir |
| A3 | KVKK kaldırılır | Buton tekrar kilitlenir |
| A4 | Boş formla gönder | İlk hatalı alana odaklanır, kırmızı çerçeve + alt metin |
| A5 | `bozuk-eposta` girilir | "Geçerli bir e-posta adresi girin." |
| A6 | Telefona `123` girilir | "Geçerli bir telefon numarası girin (en az 10 karakter)." |
| A7 | Mesaja 5 karakter | "En az 10 karakter girin." |
| A8 | Form 3'te tür seçilmez | "Lütfen bir seçim yapın." |
| A9 | Alan doldurulup blur | Hata anında kaybolur |

### B. Dosya eki (Form 1 ve 2)
| # | Senaryo | Beklenen |
|---|---|---|
| B1 | 11 MB PDF seçilir | "Dosya boyutu 10 MB sınırını aşıyor (11.00 MB)." + gönderim engellenir |
| B2 | `.exe` seçilir | "Bu dosya türü kabul edilmiyor..." |
| B3 | 2 MB `.dwg` seçilir | Dosya adı + boyut gösterilir, "kaldır" butonu çıkar |
| B4 | "kaldır" tıklanır | Seçim sıfırlanır |
| B5 | Geçerli dosyayla gönder | Sayfa `_next` adresine yönlenir, mail **ek ile** gelir |

### C. Gönderim
| # | Senaryo | Beklenen |
|---|---|---|
| C1 | Dosyasız geçerli gönderim | Buton "Gönderiliyor...", sonra yeşil kutu, form temizlenir, kutu 5 sn'de kaybolur |
| C2 | İnternet kapalıyken | Kırmızı kutu: "Sunucuya ulaşılamadı..." |
| C3 | C2 sonrası | **Form temizlenmez**, girilen veri korunur |
| C4 | Başarılı gönderim sonrası | Buton tekrar kilitli (KVKK sıfırlandığı için) |

### D. Spam / güvenlik
| # | Senaryo | Beklenen |
|---|---|---|
| D1 | Konsoldan `_honey` doldurulup gönderilir | Hiçbir istek gitmez, **sahte başarı da gösterilmez** |
| D2 | Sayfa kaynağında honeypot | `display:none`, `tabindex="-1"`, `aria-hidden="true"` |

### E. Erişilebilirlik
| # | Senaryo | Beklenen |
|---|---|---|
| E1 | Sadece klavye ile gezin | Tüm alanlar + "Dosya Seç" + gönder erişilebilir, focus görünür |
| E2 | Ekran okuyucu | Her alan etiketiyle okunur; hata mesajları `role="alert"` ile duyurulur |
| E3 | Zorunlu alanlar | `aria-required="true"`; hatalıysa `aria-invalid="true"` |

### F. Responsive
| # | Senaryo | Beklenen |
|---|---|---|
| F1 | 320 / 375 / 768 / 1280 px | 640px altında tek kolon, yatay kaydırma yok |
| F2 | Mobil klavye | E-posta alanında `@`, telefonda numara tuş takımı |

### G. Uçtan uca (aktivasyondan sonra)
| # | Senaryo | Beklenen |
|---|---|---|
| G1 | Dört formu da gönder | Dört ayrı konu başlığıyla kutuya düşer |
| G2 | Gelen maile bak | `_template=table` sayesinde tablo biçiminde, alan adları Türkçe okunur |
| G3 | Otomatik yanıt | Gönderene `_autoresponse` metni ulaşır |
| G4 | Maili yanıtla | Reply-to gönderenin adresi olmalı (`email` alanı bu yüzden `name="email"`) |

---

## 6. Güvenlik Notları

- **`_captcha=false` kullanılıyor**, yani FormSubmit'in reCAPTCHA adımı kapalı.
  Tek spam koruması honeypot'tur. Spam gelirse ilk yapılacak: `_captcha` alanını
  kaldırın (varsayılan `true`) ya da `_blacklist` ile kelime filtresi ekleyin.
- **İstemci tarafındaki doğrulamaların hiçbiri güvenlik değildir.** Zorunlu alan,
  dosya boyutu, uzantı, KVKK onayı ve honeypot — hepsi tarayıcıda devre dışı
  bırakılabilir. Gerçek doğrulama sunucu tarafında yapılmalıdır ve
  ASP.NET/Next.js geçişinde eklenecektir.
- **Dosya yükleme kontrolü özellikle UX içindir.** Uzantı ve boyut kontrolü
  sunucuda **mutlaka tekrarlanmalıdır**; uzantı dosyanın gerçek türünü göstermez.
- **KVKK:** Formlar kişisel veriyi ABD merkezli bir işleyiciye aktarıyor. Bu,
  yurt dışına veri aktarımıdır ve aydınlatma + açık rıza yükümlülüğü doğurur.
  `kvkk.html` yayına çıkmadan gerçek metinle doldurulmalıdır.
- **E-posta adresi kaynak kodda açıkta.** Hash'li uç noktaya geçmeniz önerilir
  (bölüm 2, madde 6).

---

## 7. Bu Prototipin Canlı Siteyle İlişkisi

Bu klasör **canlı temadan bağımsızdır**:

| | Canlı site (`tr/`, `en/`) | Bu prototip |
|---|---|---|
| CSS | Tailwind CDN + `theme.css` | saf CSS, bağımsız |
| Palet | `#fb923c` / blueprint token'ları | `#1a2b4a` + `#e85d04` (istenen palet) |
| Form motoru | `assets/js/form-submit.js` | `prototip-formlar/assets/forms.js` |

İkisi **çakışmaz** ve prototip canlı sayfaların hiçbirini değiştirmez.

Canlı site de FormSubmit'e bağlandı (`assets/js/form-submit.js`, 2026-09-20) ve bu klasördeki
"ek varsa klasik POST'a düş" mantığı oraya taşındı. İki modül bilinçli olarak ayrı: bu klasör
geçicidir ve canlıya çıkmadan silinecek.
