'use client';
// Site-wide SEO, social profiles, measurement integrations, search-engine
// verification, redirects and the real-HTML SEO check. Settings are saved with
// the global "Kaydet" (applied on save, like the company/contact settings).
import {useState} from 'react';
import DataTable from './data-table.jsx';
import {AdminButton, PageHeader} from './admin-controls.jsx';
import {MediaPicker} from './admin-media.jsx';
import {handleTabKeyDown} from './tab-keyboard.js';
import {useSeoRuntime} from './admin-seo-panel.jsx';
import {DEFAULT_OG_IMAGE, DEFAULT_ORGANIZATION_LOGO, SOCIAL_PLATFORMS, resolveSeoSettings, validSocialUrl} from '../lib/seo-model.js';
import {ANALYTICS_IDS, EVENT_TAXONOMY, validAnalyticsId} from '../lib/analytics-model.js';

const tabs = [
  {id: 'genel', label: 'Genel SEO'},
  {id: 'kurum', label: 'Kurum ve sosyal'},
  {id: 'olcum', label: 'Ölçüm ve reklam'},
  {id: 'arama', label: 'Arama motorları'},
  {id: 'yonlendirme', label: 'Yönlendirmeler'},
  {id: 'kontrol', label: 'SEO kontrolü'}
];
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function Status({level = 'ok', children}) {
  return <li className={'is-' + level}><span aria-hidden="true">{level === 'ok' ? '✓' : level === 'warn' ? '!' : '✕'}</span>{children}</li>;
}

function IdField({field, value, locked, envValue, onChange, disabled = false}) {
  const spec = ANALYTICS_IDS[field];
  const valid = validAnalyticsId(field, value);
  return <label>{spec.label}
    <input value={locked ? envValue || 'ortam değişkeninden' : value || ''} readOnly={locked} disabled={disabled && !locked} placeholder={spec.example} aria-invalid={!valid} onChange={event => onChange(field, event.target.value.trim())} />
    <small className={valid ? 'seo-count' : 'seo-count is-over'}>{locked ? `${spec.env} ortam değişkeni ile kilitli` : valid ? `Biçim: ${spec.example}` : `Geçersiz biçim — örnek: ${spec.example}`}</small>
  </label>;
}

export default function AdminSeoSettings({db, setSetting}) {
  const [tab, setTab] = useState('genel');
  const [audit, setAudit] = useState({status: 'idle', data: null, error: ''});
  const runtime = useSeoRuntime();
  const settings = db.settings || {};
  const seo = obj(settings.seo), org = obj(seo.organization), social = obj(settings.social), analytics = obj(settings.analytics);
  const resolved = resolveSeoSettings(settings);
  const redirects = Array.isArray(settings.redirects) ? settings.redirects : [];
  const origin = runtime?.origin || 'https://www.hydropascal.com.tr';
  const setSeo = (key, value) => setSetting('seo', {...seo, [key]: value});
  const setOrg = (key, value) => setSetting('seo', {...seo, organization: {...org, [key]: value}});
  const setSocial = (key, value) => setSetting('social', {...social, [key]: value.trim()});
  const setAnalytics = (key, value) => setSetting('analytics', {...analytics, [key]: value});
  const setRedirects = next => setSetting('redirects', next);
  const locked = runtime?.analytics?.env?.locked || {};
  const mode = analytics.mode || 'none';
  const env = runtime?.analytics?.env;

  const runAudit = async () => {
    setAudit({status: 'loading', data: null, error: ''});
    try {
      const response = await fetch('/api/seo?action=audit', {cache: 'no-store'});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Denetim çalıştırılamadı.');
      setAudit({status: 'done', data: result, error: ''});
    } catch (error) { setAudit({status: 'error', data: null, error: error.message}); }
  };

  const autoRedirects = [
    ...(db.products || []).flatMap(item => (item.previousSlugs || []).map(slug => ({from: `/tr/urun-detay.html?id=${slug}`, to: `/tr/urun-detay.html?id=${item.slug}`}))),
    ...(db.posts || []).flatMap(item => (item.previousSlugs || []).map(slug => ({from: `/${item.lang === 'en' ? 'en' : 'tr'}/blog/${slug}.html`, to: `/${item.lang === 'en' ? 'en' : 'tr'}/blog/${item.slug}.html`})))
  ];

  const auditRows = (audit.data?.rows || []).map(row => {
    const fails = row.checks.filter(item => item.level === 'fail'), warns = row.checks.filter(item => item.level === 'warn');
    return {...row, id: row.url, path: row.url.replace(audit.data.origin, ''), level: fails.length ? 'fail' : warns.length ? 'warn' : 'ok', issues: [...fails, ...warns].map(item => item.label).join(' · ') || 'Sorun yok'};
  });

  return <section className="panel settings-panel seo-settings-panel">
    <PageHeader eyebrow="ARAMA MOTORLARI VE ÖLÇÜM" title="SEO ve ölçüm" description="Bu ayarlar Kaydet ile tüm public sayfaların <head> etiketlerine, yapılandırılmış verisine, site haritasına ve ölçüm betiklerine uygulanır. Ürün, blog ve sayfa bazındaki SEO alanları kendi editörlerindedir." />
    <div className="subtabs settings-tabs" role="tablist" aria-label="SEO ve ölçüm bölümleri">
      {tabs.map(item => <button type="button" key={item.id} role="tab" id={'seo-tab-' + item.id} aria-selected={tab === item.id} aria-controls="seo-panel" tabIndex={tab === item.id ? 0 : -1} onKeyDown={event => handleTabKeyDown(event, tabs, tab, setTab, 'seo-tab-')} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>
    <div role="tabpanel" id="seo-panel" aria-labelledby={'seo-tab-' + tab} className="settings-content">

      {tab === 'genel' && <div className="settings-stack">
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Site kimliği</h4><p>Başlık son eki, varsayılan açıklama ve paylaşım görseli; sayfanın kendi değeri yoksa kullanılır.</p></div></div>
          <div className="formgrid">
            <label>Site adı (başlık son eki)<input maxLength="80" value={seo.siteName || ''} placeholder={settings.companyName || 'HydroPascal'} onChange={event => setSeo('siteName', event.target.value)} /><small className="seo-count">Ör. “Ürün adı | {resolved.siteName}”. Boşsa şirket adı.</small></label>
            <label>Site adresi (canonical kökü)<input value={origin} readOnly /><small className="seo-count">{runtime?.siteUrlFromEnv ? 'SITE_URL ortam değişkeninden.' : 'SITE_URL tanımlı değil; varsayılan üretim adresi kullanılıyor.'}</small></label>
            <label>Varsayılan açıklama (TR)<textarea rows="3" maxLength="320" value={seo.defaultDescription || ''} onChange={event => setSeo('defaultDescription', event.target.value)} /></label>
            <label>Varsayılan açıklama (EN)<textarea rows="3" maxLength="320" value={seo.defaultDescriptionEn || ''} onChange={event => setSeo('defaultDescriptionEn', event.target.value)} /></label>
            <label className="wide">Varsayılan paylaşım görseli<input value={seo.defaultOgImage || ''} placeholder={DEFAULT_OG_IMAGE} onChange={event => setSeo('defaultOgImage', event.target.value)} /><MediaPicker filter="image" value={seo.defaultOgImage || ''} label="Medya kütüphanesinden seç" onSelect={asset => setSeo('defaultOgImage', asset.url)} /><small className="seo-count">Önerilen 1200×630 piksel. Sayfa, ürün veya yazının kendi görseli yoksa kullanılır.</small></label>
          </div>
        </section>
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Arama motoru görünürlüğü</h4><p>Kapalıyken robots.txt tüm siteyi engeller ve her sayfa noindex olur. Yalnızca bakım/test ortamı için.</p></div></div>
          <label className="seo-index-field"><input type="checkbox" checked={seo.indexing !== false} disabled={runtime?.indexingLockedByEnv} onChange={event => setSeo('indexing', event.target.checked)} /><span>{runtime?.indexingLockedByEnv ? 'SEARCH_INDEXING=false ortam değişkeni siteyi arama motorlarına kapatıyor' : 'Site arama motorlarına açık'}</span></label>
          <p className="hint"><a href="/sitemap.xml" target="_blank" rel="noreferrer">/sitemap.xml ↗</a> · <a href="/robots.txt" target="_blank" rel="noreferrer">/robots.txt ↗</a> — ikisi de canlı içerikten anlık üretilir; taslak ve noindex içerik site haritasına girmez.</p>
        </section>
      </div>}

      {tab === 'kurum' && <div className="settings-stack">
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Kurum bilgisi (Organization yapılandırılmış verisi)</h4><p>Telefon ve e-posta “Header ve footer → İletişim bilgileri”nden gelir: {settings.phone || '—'} · {settings.email || '—'}.</p></div></div>
          <div className="formgrid">
            <label>Kurum adı<input maxLength="160" value={org.name || ''} placeholder={settings.companyName || 'HydroPascal'} onChange={event => setOrg('name', event.target.value)} /></label>
            <label>Resmî unvan (varsa)<input maxLength="160" value={org.legalName || ''} onChange={event => setOrg('legalName', event.target.value)} /></label>
            <label className="wide">Logo (arama sonuçları için PNG/JPG)<input value={org.logo || ''} placeholder={DEFAULT_ORGANIZATION_LOGO} onChange={event => setOrg('logo', event.target.value)} /><MediaPicker filter="image" value={org.logo || ''} label="Medya kütüphanesinden seç" onSelect={asset => setOrg('logo', asset.url)} /></label>
            <label className="wide">Sokak / mahalle<input maxLength="160" value={org.streetAddress ?? resolved.organization.address.streetAddress} onChange={event => setOrg('streetAddress', event.target.value)} /><small className="seo-count">Footer adresi: {settings.address || '—'}</small></label>
            <label>Posta kodu<input maxLength="20" value={org.postalCode ?? resolved.organization.address.postalCode} onChange={event => setOrg('postalCode', event.target.value)} /></label>
            <label>İlçe<input maxLength="80" value={org.addressLocality ?? resolved.organization.address.addressLocality} onChange={event => setOrg('addressLocality', event.target.value)} /></label>
            <label>İl<input maxLength="80" value={org.addressRegion ?? resolved.organization.address.addressRegion} onChange={event => setOrg('addressRegion', event.target.value)} /></label>
            <label>Ülke kodu<input maxLength="2" value={org.addressCountry ?? resolved.organization.address.addressCountry} onChange={event => setOrg('addressCountry', event.target.value.toUpperCase())} /></label>
          </div>
        </section>
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Sosyal profiller</h4><p>Yalnızca gerçekten kullanılan hesapları girin. Girilenler footer’da, Organization “sameAs” alanında ve X kartında (twitter:site) kullanılır; boş olanlar hiçbir yerde görünmez.</p></div></div>
          <div className="formgrid">
            {SOCIAL_PLATFORMS.map(platform => {const valid = validSocialUrl(platform.id, social[platform.id]); return <label key={platform.id}>{platform.label}<input type="url" value={social[platform.id] || ''} placeholder={`https://${platform.hosts[0]}/…`} aria-invalid={!valid} onChange={event => setSocial(platform.id, event.target.value)} />{!valid && <small className="seo-count is-over">https:// ile başlayan bir {platform.label} profil adresi girin.</small>}</label>;})}
          </div>
        </section>
      </div>}

      {tab === 'olcum' && <div className="settings-stack">
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Bu ortamda gerçekte ne yükleniyor?</h4><p>Sunucu yapılandırmasından okunur; panelden değiştirilemez.</p></div></div>
          {!runtime ? <p className="hint">Durum yükleniyor…</p> : <ul className="seo-checks">
            <Status level={env?.enabled ? 'ok' : 'warn'}>{env?.enabled ? `Ölçüm bu ortamda açık (${env.production ? 'production' : 'ANALYTICS_ENABLED=true'})` : 'Ölçüm bu ortamda kapalı — geliştirme/test trafiği canlı hesaplara gitmez (açmak için ANALYTICS_ENABLED=true)'}</Status>
            <Status level={runtime.analytics.active ? 'ok' : 'warn'}>{runtime.analytics.active ? `Aktif: ${runtime.analytics.google ? (runtime.analytics.google.type === 'gtm' ? 'Google Tag Manager' : 'Google tag (gtag.js)') : ''}${runtime.analytics.meta ? ' + Meta Pixel' : ''}${runtime.analytics.linkedin ? ' + LinkedIn Insight' : ''}` : runtime.analytics.configured ? 'Kimlikler girili ama bu ortamda yüklenmiyor' : 'Hiçbir ölçüm entegrasyonu yapılandırılmadı — sitede ölçüm betiği yok'}</Status>
            <Status level={runtime.analytics.consentRequired ? 'ok' : 'warn'}>{runtime.analytics.consentRequired ? 'Çerez onayı gerekli: ziyaretçi kabul edene kadar hiçbir üçüncü taraf betik yüklenmez' : 'Çerez onayı istenmiyor — betikler sayfa açılışında yüklenir'}</Status>
            {env?.debug && <Status level="warn">ANALYTICS_DEBUG açık: olaylar tarayıcı konsoluna yazılır, GA4 DebugView etkin</Status>}
          </ul>}
        </section>
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Google ölçüm yöntemi</h4><p>Tek yöntem seçilir; aynı sayfa görüntülemesinin iki kez sayılmaması için gtag ve GTM asla birlikte yüklenmez.</p></div></div>
          <div className="seo-mode-options" role="radiogroup" aria-label="Google ölçüm yöntemi">
            {[['none', 'Kapalı', 'Google etiketi yüklenmez.'], ['gtag', 'Google tag (gtag.js)', 'GA4 ve Google Ads doğrudan; Meta/LinkedIn de buradan yönetilir. Önerilen, en az hareketli parça.'], ['gtm', 'Google Tag Manager', 'Tüm etiketler GTM kapsayıcısında yönetilir; site yalnızca dataLayer olayları gönderir. Meta/LinkedIn doğrudan yüklenmez.']].map(([value, label, hint]) => <label key={value} className={'seo-index-field' + (mode === value ? ' is-selected' : '')}><input type="radio" name="analytics-mode" value={value} checked={mode === value} disabled={Boolean(locked.gtm || locked.ga4)} onChange={() => setAnalytics('mode', value)} /><span><b>{label}</b> — {hint}</span></label>)}
          </div>
          <div className="formgrid">
            {mode === 'gtm' && <IdField field="gtm" value={analytics.gtm} locked={locked.gtm} envValue={runtime?.analytics?.google?.id} onChange={setAnalytics} />}
            {mode === 'gtag' && <>
              <IdField field="ga4" value={analytics.ga4} locked={locked.ga4} envValue={runtime?.analytics?.google?.ga4} onChange={setAnalytics} />
              <IdField field="googleAds" value={analytics.googleAds} locked={locked.googleAds} envValue={runtime?.analytics?.google?.ads} onChange={setAnalytics} />
              <IdField field="googleAdsLeadLabel" value={analytics.googleAdsLeadLabel} locked={locked.googleAdsLeadLabel} onChange={setAnalytics} disabled={!analytics.googleAds && !locked.googleAds} />
            </>}
          </div>
        </section>
        {mode !== 'gtm' && <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Reklam pikselleri</h4><p>Yalnızca kimlik girilip etkinse yüklenir ve yalnızca “Pazarlama” onayı verilen ziyaretçide çalışır.</p></div></div>
          <div className="formgrid seo-pixel-grid">
            <label className="seo-index-field wide"><input type="checkbox" checked={analytics.metaEnabled !== false} onChange={event => setAnalytics('metaEnabled', event.target.checked)} /><span>Meta Pixel etkin (PageView, ürün detayında ViewContent, form başarısında Lead)</span></label>
            <IdField field="metaPixel" value={analytics.metaPixel} locked={locked.metaPixel} onChange={setAnalytics} disabled={analytics.metaEnabled === false} />
            <label className="seo-index-field wide"><input type="checkbox" checked={analytics.linkedinEnabled !== false} onChange={event => setAnalytics('linkedinEnabled', event.target.checked)} /><span>LinkedIn Insight Tag etkin (form başarısında dönüşüm)</span></label>
            <IdField field="linkedinPartner" value={analytics.linkedinPartner} locked={locked.linkedinPartner} onChange={setAnalytics} disabled={analytics.linkedinEnabled === false} />
            <IdField field="linkedinLeadConversion" value={analytics.linkedinLeadConversion} locked={locked.linkedinLeadConversion} onChange={setAnalytics} disabled={analytics.linkedinEnabled === false} />
          </div>
        </section>}
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Çerez onayı</h4><p>Açıkken ziyaretçi “Tümünü kabul et / Reddet / Tercihler” seçene kadar ölçüm betikleri yüklenmez; seçim footer’daki “Çerez tercihleri” ile değiştirilebilir. KVKK/gizlilik metnine çerez bölümü eklenmelidir (hukuki metin bu panelin kapsamı dışında).</p></div></div>
          <label className="seo-index-field"><input type="checkbox" checked={analytics.consentRequired !== false} onChange={event => setAnalytics('consentRequired', event.target.checked)} /><span>Ölçüm ve reklam betikleri için ziyaretçi onayı iste (önerilen)</span></label>
        </section>
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Gönderilen olaylar</h4><p>Olaylar tek bir betikten (assets/js/hp-analytics.js) gönderilir; kişisel veri (ad, e-posta, telefon, mesaj) hiçbir olayda yoktur. “Dönüşüm” işaretlileri GA4’te anahtar etkinlik olarak işaretleyin.</p></div></div>
          <div className="seo-event-list">{EVENT_TAXONOMY.map(item => <div key={item.name}><code>{item.name}</code>{item.conversion ? <b>dönüşüm</b> : <i aria-hidden="true" />}<span>{item.trigger}</span><small>{item.params}</small></div>)}</div>
        </section>
      </div>}

      {tab === 'arama' && <div className="settings-stack">
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Doğrulama kodları</h4><p>Önerilen yöntem Search Console’da “Alan adı” mülkü + DNS TXT kaydıdır (http/https ve www’nin tamamını kapsar, kod gerektirmez). HTML etiketi yöntemini seçerseniz yalnızca content="…" içindeki değeri yapıştırın; etiket tüm sayfaların &lt;head&gt; bölümüne eklenir.</p></div></div>
          <div className="formgrid">
            <label>Google Search Console<input value={seo.googleVerification || ''} readOnly={runtime?.verificationFromEnv?.google} placeholder="aBcD1234…" onChange={event => setSeo('googleVerification', event.target.value.trim())} />{runtime?.verificationFromEnv?.google && <small className="seo-count">GOOGLE_SITE_VERIFICATION ortam değişkeninden</small>}</label>
            <label>Bing Webmaster Tools<input value={seo.bingVerification || ''} readOnly={runtime?.verificationFromEnv?.bing} placeholder="0123456789ABCDEF…" onChange={event => setSeo('bingVerification', event.target.value.trim())} /></label>
          </div>
        </section>
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Yayın sonrası yapılacaklar (Google hesabı gerektirir)</h4><p>Bu adımlar panelden yapılamaz; hesap sahibinin tamamlaması gerekir.</p></div></div>
          <ol className="seo-steps">
            <li>Search Console’da mülkü doğrulayın ve site haritasını gönderin: <code>{origin}/sitemap.xml</code></li>
            <li>URL Denetimi ile bir ürün, bir blog yazısı ve ana sayfayı “Canlı URL’yi test et” ile kontrol edin.</li>
            <li>Zengin Sonuç Testi (search.google.com/test/rich-results) ile bir ürün (Product + BreadcrumbList) ve bir blog yazısını (Article + BreadcrumbList) test edin.</li>
            <li>GA4’te “Gerçek zamanlı” raporunda kendi ziyaretinizi ve form_success olayını görün; dönüşüm olaylarını anahtar etkinlik yapın.</li>
          </ol>
        </section>
      </div>}

      {tab === 'yonlendirme' && <div className="settings-stack">
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Kalıcı yönlendirmeler (301)</h4><p>Eski site adresleri veya kaldırılan sayfalar için. Kaynak “/” ile başlayan yol (ör. /hidrolik-silindir/), hedef site içi yol veya tam adres. Zincir ve kendine yönlendirme kaydedilmez.</p></div><AdminButton size="compact" onClick={() => setRedirects([...redirects, {id: crypto.randomUUID(), from: '', to: '', status: 301, active: true}])}>＋ Yönlendirme ekle</AdminButton></div>
          {redirects.length === 0 ? <p className="hint">Henüz yönlendirme yok.</p> : <div className="redirect-list">
            {redirects.map((rule, index) => {const patch = value => setRedirects(redirects.map((item, i) => i === index ? {...item, ...value} : item)); return <div className="redirect-row" key={rule.id || index}>
              <label>Eski adres<input value={rule.from} placeholder="/eski-sayfa/" onChange={event => patch({from: event.target.value.trim()})} /></label>
              <label>Yeni adres<input value={rule.to} placeholder="/tr/hpl-products.html" onChange={event => patch({to: event.target.value.trim()})} /></label>
              <label>Tür<select value={rule.status || 301} onChange={event => patch({status: Number(event.target.value)})}><option value={301}>301 kalıcı</option><option value={302}>302 geçici</option></select></label>
              <label className="seo-index-field"><input type="checkbox" checked={rule.active !== false} onChange={event => patch({active: event.target.checked})} /><span>Etkin</span></label>
              <AdminButton size="compact" variant="danger" onClick={() => setRedirects(redirects.filter((_, i) => i !== index))}>Sil</AdminButton>
            </div>;})}
          </div>}
        </section>
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Otomatik adres geçmişi</h4><p>Yayındaki bir ürünün veya yazının sayfa adresi değiştiğinde eski adres kendiliğinden yeni adrese 301 ile yönlenir.</p></div></div>
          {autoRedirects.length === 0 ? <p className="hint">Adresi değiştirilmiş kayıt yok.</p> : <ul className="seo-steps">{autoRedirects.map(item => <li key={item.from}><code>{item.from}</code> → <code>{item.to}</code></li>)}</ul>}
        </section>
      </div>}

      {tab === 'kontrol' && <div className="settings-stack">
        <section className="settings-block">
          <div className="settings-block-heading"><div><h4>Canlı HTML üzerinde SEO kontrolü</h4><p>Her public sayfa, ürün ve blog yazısı, sitenin gerçek sunucu çıktısı üzerinden kontrol edilir: başlık, açıklama, canonical, robots, hreflang karşılıklılığı, paylaşım görseli, JSON-LD geçerliliği ve tekrarları, alt metinler, site haritası tutarlılığı. Puan verilmez; somut sorun listelenir. Kaydedilmemiş/yayımlanmamış değişiklikler burada görünmez.</p></div><AdminButton variant="primary" size="compact" disabled={audit.status === 'loading'} onClick={runAudit}>{audit.status === 'loading' ? 'Kontrol ediliyor…' : 'Kontrolü çalıştır'}</AdminButton></div>
          {audit.data && <ul className="seo-checks">
            <Status level={audit.data.summary.fail ? 'fail' : 'ok'}>{audit.data.summary.pages} adres kontrol edildi · {audit.data.summary.fail} adreste hata · {audit.data.summary.warn} adreste uyarı · site haritasında {audit.data.summary.sitemap} adres</Status>
          </ul>}
          {(audit.status !== 'idle') && <DataTable stateKey="seoaudit" rows={auditRows} loading={audit.status === 'loading'} error={audit.error} onRetry={runAudit}
            columns={[
              {key: 'path', label: 'Adres', render: row => <span className="table-primary-text"><b>{row.title || row.path}</b><small><a href={row.path} target="_blank" rel="noreferrer">{row.path} ↗</a></small></span>},
              {key: 'kind', label: 'Tür', secondary: true, render: row => ({page: 'Sayfa', post: 'Blog', product: 'Ürün'})[row.kind] || row.kind},
              {key: 'level', label: 'Durum', sortValue: row => ({fail: 0, warn: 1, ok: 2})[row.level], render: row => <span className={'seo-level is-' + row.level}>{row.level === 'fail' ? 'Hata' : row.level === 'warn' ? 'Uyarı' : 'Tamam'}</span>},
              {key: 'issues', label: 'Bulgular', render: row => <small>{row.issues}</small>},
              {key: 'schema', label: 'Şema', secondary: true, render: row => <small>{(row.schema || []).join(', ') || '—'}</small>}
            ]}
            searchKeys={['path', 'title', 'issues']} searchLabel="Adres ara"
            filters={[{key: 'level', label: 'Durum', allLabel: 'Tüm durumlar', options: [{value: 'fail', label: 'Hata'}, {value: 'warn', label: 'Uyarı'}, {value: 'ok', label: 'Tamam'}]}, {key: 'kind', label: 'Tür', allLabel: 'Tüm türler', options: [{value: 'page', label: 'Sayfa'}, {value: 'post', label: 'Blog'}, {value: 'product', label: 'Ürün'}]}]}
            defaultSort={{key: 'level', direction: 'asc'}} emptyMessage="Kontrol sonucu yok." />}
        </section>
      </div>}
    </div>
  </section>;
}
