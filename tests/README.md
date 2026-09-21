# Testler

> Bu klasör siteyle birlikte **deploy edilmez**. Hosting'e yüklerken `tests/` klasörünü dışarıda bırakın.

```bash
cd tests
npm install        # yalnızca ilk sefer (jsdom)
npm test           # tüm paket (~2 dk; jsdom ilk yüklemede yavaş)
npm run test:hizli # jsdom gerektirmeyen 4 paket (~2 sn)
```

| Dosya | Ne korur |
|---|---|
| `site-butunlugu.test.js` | Tüm sayfalar: kırık link/görsel, görünür placeholder metni, inline JS ve JSON-LD söz dizimi, tek h1 / main / header / footer |
| `tr-en-parite.test.js` | Her TR/EN sayfa çiftinin YAPISI aynı mı (bölümler, görseller, başlıklar, formlar, CMS kancaları, linkler, düzen). Bilinçli farklar dosyanın başında gerekçesiyle listelidir |
| `tema-tutarliligi.test.js` | Açık temada TR'nin sayfa-içi yamaladığı her sınıf EN'de de karşılanıyor mu (2026-09-21 "Custom Manufacturing okunmuyor" hatasının koruması) |
| `hesaplayici-teklif.test.js` | Hesaplayıcı / ürün sayfası → teklif formu ön-doldurma (GÖREV 10.5), TR/EN hesaplayıcı JS paritesi |
| `canli-formlar.test.js` | Canlı 3 formun FormSubmit entegrasyonu: rıza kapısı, AJAX, dosya ekinde klasik POST, honeypot, hata durumunda veri korunması (jsdom) |
| `prototip-formlar.test.js` | `prototip-formlar/` klasöründeki 4 form (jsdom) |

**Kural:** TR veya EN'de bir sayfayı değiştirdiyseniz `npm run test:hizli` çalıştırın. Parite testi
kırılıyorsa ya diğer dili de güncelleyin ya da farkı gerekçesiyle `BILINEN_FARKLAR`'a ekleyin.

Ağ isteği yapılmaz: tüm testlerde `fetch` ve `form.submit()` stub'lanmıştır.
