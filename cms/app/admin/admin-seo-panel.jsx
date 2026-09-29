'use client';
// Shared SEO editing block for products, blog posts and pages.
// Previews and checks are computed with lib/seo-model.js — the same functions
// the public renderer uses — so what is shown here is what crawlers receive.
import {useEffect, useState} from 'react';
import {MediaPicker} from './admin-media.jsx';
import {DEFAULT_ORIGIN, pageMetadata, postMetadata, productMetadata, resolveSeoSettings, seoChecks} from '../lib/seo-model.js';

let runtimePromise = null;
export function useSeoRuntime() {
  const [runtime, setRuntime] = useState(null);
  useEffect(() => {
    let alive = true;
    runtimePromise = runtimePromise || fetch('/api/seo?action=status', {cache: 'no-store'}).then(response => response.ok ? response.json() : null).catch(() => null);
    runtimePromise.then(value => { if (alive) setRuntime(value); if (!value) runtimePromise = null; });
    return () => { alive = false; };
  }, []);
  return runtime;
}

function hostOf(url) { try { return new URL(url).host; } catch { return ''; } }
// The meta keeps the absolute production URL; the admin preview loads same-site images from this server.
function previewSrc(url, canonical) {
  try { const image = new URL(url), page = new URL(canonical); return image.origin === page.origin ? image.pathname + image.search : url; } catch { return url; }
}

export function SeoPreview({meta}) {
  const title = meta.title || '—', share = meta.shareTitle || meta.title || '—', description = meta.shareDescription || meta.description || '';
  return <div className="seo-preview-grid wide">
    <div className="seo-search-preview"><span>GOOGLE ARAMA SONUCU</span><b>{title}</b><small>{meta.canonical}</small><p>{meta.description || 'Açıklama yok — Google sayfadan bir parça seçer.'}</p></div>
    <div className="seo-social-preview"><span>FACEBOOK / LINKEDIN PAYLAŞIMI</span>{meta.image?.url ? <img src={previewSrc(meta.image.url, meta.canonical)} alt="" /> : <div className="seo-social-empty">Görsel yok</div>}<small>{hostOf(meta.canonical).toUpperCase()}</small><b>{share}</b><p>{description}</p></div>
    <div className="seo-social-preview is-x"><span>X KARTI · {meta.image?.url ? 'büyük görsel' : 'özet'}</span>{meta.image?.url ? <img src={previewSrc(meta.image.url, meta.canonical)} alt="" /> : <div className="seo-social-empty">Görsel yok</div>}<b>{share}</b><small>{hostOf(meta.canonical)}</small></div>
  </div>;
}

export function SeoChecks({checks}) {
  return <ul className="seo-checks wide" aria-label="SEO kontrolleri">
    {checks.map((check, index) => <li key={index} className={'is-' + check.level}><span aria-hidden="true">{check.level === 'ok' ? '✓' : check.level === 'warn' ? '!' : '✕'}</span>{check.label}</li>)}
  </ul>;
}

// Character guidance only — never blocks saving.
function CountedField({label, value, placeholder, limit, multiline = false, onChange, hint}) {
  const length = String(value || placeholder || '').length;
  const Control = multiline ? 'textarea' : 'input';
  return <label>{label}<Control rows={multiline ? 3 : undefined} maxLength={multiline ? 320 : 200} value={value || ''} placeholder={placeholder || ''} onChange={event => onChange(event.target.value)} />
    <small className={length > limit ? 'seo-count is-over' : 'seo-count'}>{length} karakter{value ? '' : ' (otomatik)'} · Google ~{limit} karakter gösterir{hint ? ' · ' + hint : ''}</small></label>;
}

function IndexToggle({checked, onChange, label, disabled = false}) {
  return <label className="seo-index-field"><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>{label}</span></label>;
}

export function ProductSeoFields({product, language, settings, onUpdate}) {
  const runtime = useSeoRuntime();
  const origin = runtime?.origin || DEFAULT_ORIGIN;
  const english = language === 'en';
  const key = name => name + (english ? 'En' : '');
  const meta = productMetadata(product, language, {origin, settings});
  const missingAlt = (Array.isArray(product.gallery) ? product.gallery : []).filter(photo => !String(english ? photo.altEn || photo.alt : photo.alt || '').trim()).length;
  const name = (english ? product.detailTitleEn || product.nameEn : product.detailTitle || product.name) || product.name || '';
  return <div className="formgrid product-seo-fields">
    <SeoPreview meta={meta} />
    <SeoChecks checks={seoChecks(meta, {origin, missingAlt})} />
    <CountedField label={english ? 'Search result title' : 'Arama sonucu başlığı'} value={product[key('seoTitle')]} placeholder={name} limit={60} hint={`“| ${resolveSeoSettings(settings).siteName}” otomatik eklenir`} onChange={value => onUpdate(key('seoTitle'), value)} />
    <CountedField multiline label={english ? 'Search result description' : 'Arama sonucu açıklaması'} value={product[key('seoDescription')]} placeholder={meta.descriptionIsCustom ? '' : meta.description} limit={155} onChange={value => onUpdate(key('seoDescription'), value)} />
    <label>{english ? 'Social sharing image' : 'Sosyal paylaşım görseli'}<input value={product.seoImage || ''} onChange={event => onUpdate('seoImage', event.target.value)} placeholder={product.image || '/assets/images/urun.webp'} /><MediaPicker filter="image" value={product.seoImage || ''} label="Medya kütüphanesinden seç" onSelect={asset => onUpdate('seoImage', asset.url)} /><small className="seo-count">Boşsa ana ürün görseli, o da yoksa sitenin varsayılan paylaşım görseli kullanılır.</small></label>
    <label>Canonical<input value={meta.canonical} readOnly /><small className="seo-count">Dil ve sayfa kısa adından otomatik oluşur; adres değişirse eski adres 301 ile yeni adrese yönlenir.</small></label>
    <IndexToggle checked={product.seoIndex !== false && product.noIndex !== true} onChange={value => onUpdate('seoIndex', value)} label="Arama motorları bu ürünü listeleyebilir (site haritası ve hreflang buna göre güncellenir)" />
    <p className="hint wide">Yapılandırılmış veri (Product + BreadcrumbList) ürün adı, kodu, kategorisi, görselleri, ölçü tablosu ve uyumlu markalardan üretilir. Fiyat/stok modelde olmadığı için eklenmez; bu nedenle Google ürün zengin sonucu (fiyatlı) gösteremez.</p>
  </div>;
}

export function PostSeoFields({post, posts = [], settings, category = '', onUpdate}) {
  const runtime = useSeoRuntime();
  const origin = runtime?.origin || DEFAULT_ORIGIN;
  const meta = postMetadata(post, {origin, settings, category});
  const otherLang = (post.lang || 'tr') === 'en' ? 'tr' : 'en';
  const reverse = posts.find(item => item.translationId === post.id);
  const candidates = posts.filter(item => (item.lang || 'tr') === otherLang).sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'tr'));
  return <div className="formgrid blog-seo-fields-grid">
    <SeoPreview meta={meta} />
    <SeoChecks checks={seoChecks(meta, {origin})} />
    <CountedField label="Arama sonucu başlığı" value={post.seoTitle} placeholder={post.title} limit={60} hint={`“| ${resolveSeoSettings(settings).siteName} Blog” otomatik eklenir`} onChange={value => onUpdate('seoTitle', value)} />
    <CountedField multiline label="Arama sonucu açıklaması" value={post.seoDescription} placeholder={meta.descriptionIsCustom ? '' : meta.description} limit={155} onChange={value => onUpdate('seoDescription', value)} />
    <label>Sosyal paylaşım görseli<input value={post.ogImage || ''} placeholder={post.image || ''} onChange={event => onUpdate('ogImage', event.target.value)} /><MediaPicker filter="image" value={post.ogImage || ''} label="Medya kütüphanesinden seç" onSelect={asset => onUpdate('ogImage', asset.url)} /></label>
    <label>{otherLang === 'en' ? 'İngilizce karşılığı (hreflang)' : 'Türkçe karşılığı (hreflang)'}
      <select value={post.translationId || ''} disabled={Boolean(!post.translationId && reverse)} onChange={event => onUpdate('translationId', event.target.value)}>
        <option value="">{reverse && !post.translationId ? `Karşı yazıdan bağlı: ${reverse.title}` : post.legacy ? 'Eski sitedeki eşleşme kullanılır' : 'Karşılığı yok'}</option>
        {candidates.map(item => <option key={item.id} value={item.id}>{item.title || item.slug}</option>)}
      </select>
      <small className="seo-count">Her iki yazı da yayında ve indekslenebilirse sayfalar birbirini hreflang ile gösterir.</small></label>
    <label>Canonical<input value={meta.canonical} readOnly /><small className="seo-count">Sayfa adresinden otomatik oluşur.</small></label>
    <IndexToggle checked={post.seoIndex !== false} onChange={value => onUpdate('seoIndex', value)} label="Arama motorları bu yazıyı listeleyebilir" />
  </div>;
}

export function PageSeoFields({route, value = {}, settings, onChange}) {
  const runtime = useSeoRuntime();
  const origin = runtime?.origin || DEFAULT_ORIGIN;
  const [head, setHead] = useState(null);
  useEffect(() => {
    let alive = true;
    setHead(null);
    fetch('/api/seo?action=page&route=' + encodeURIComponent(route), {cache: 'no-store'}).then(response => response.ok ? response.json() : null).then(result => { if (alive) setHead(result?.head || {}); }).catch(() => { if (alive) setHead({}); });
    return () => { alive = false; };
  }, [route]);
  if (!head) return <p className="hint">Sayfanın mevcut SEO bilgileri yükleniyor…</p>;
  const seo = value && typeof value === 'object' ? value : {};
  const meta = pageMetadata(route, seo, head, {origin, settings});
  const internal = /(?:404|blog-post-template|urun-detay)\.html$/.test(route);
  return <div className="formgrid page-seo-fields">
    <SeoPreview meta={meta} />
    <SeoChecks checks={seoChecks(meta, {origin})} />
    {internal && <p className="hint wide">Bu sayfa şablon/hata sayfasıdır; her zaman noindex kalır ve site haritasına girmez.</p>}
    <CountedField label="Arama sonucu başlığı" value={seo.title} placeholder={head.title} limit={60} hint="boşsa sayfanın mevcut başlığı" onChange={next => onChange('title', next)} />
    <CountedField multiline label="Arama sonucu açıklaması" value={seo.description} placeholder={head.description} limit={155} onChange={next => onChange('description', next)} />
    <label>Paylaşım başlığı (OG / X)<input maxLength="200" value={seo.ogTitle || ''} placeholder={meta.shareTitle} onChange={event => onChange('ogTitle', event.target.value)} /></label>
    <label>Paylaşım açıklaması (OG / X)<textarea rows="3" maxLength="320" value={seo.ogDescription || ''} placeholder={meta.shareDescription} onChange={event => onChange('ogDescription', event.target.value)} /></label>
    <label>Paylaşım görseli<input value={seo.ogImage || ''} placeholder={head.image || ''} onChange={event => onChange('ogImage', event.target.value)} /><MediaPicker filter="image" value={seo.ogImage || ''} label="Medya kütüphanesinden seç" onSelect={asset => onChange('ogImage', asset.url)} /></label>
    <label>Paylaşım görseli açıklaması<input maxLength="240" value={seo.ogImageAlt || ''} placeholder={meta.imageAlt} onChange={event => onChange('ogImageAlt', event.target.value)} /></label>
    <label className="wide">Canonical (yalnızca içerik başka bir adreste de yayınlanıyorsa)<input value={seo.canonical || ''} placeholder={`${origin}/${route}`} onChange={event => onChange('canonical', event.target.value)} /><small className="seo-count">Boş bırakın: sayfa kendi adresini canonical gösterir. Başka adrese verilirse sayfa site haritasından çıkar.</small></label>
    <IndexToggle disabled={Boolean(head.noindex || internal)} checked={seo.noindex !== true && !head.noindex && !internal} onChange={next => onChange('noindex', !next)} label={head.noindex ? 'Statik sayfa noindex olarak işaretli (değiştirilemez)' : 'Arama motorları bu sayfayı listeleyebilir'} />
  </div>;
}
