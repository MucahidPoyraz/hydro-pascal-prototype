// Server-side validation for SEO / social / measurement settings and per-record SEO fields.
// Used by /api/cms (full save) and /api/page-draft (page SEO), so the admin UI is never trusted.
import {SOCIAL_PLATFORMS, validSocialUrl} from './seo-model.js';
import {ANALYTICS_IDS, ANALYTICS_MODES, validAnalyticsId} from './analytics-model.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, max) => value === undefined || (typeof value === 'string' && value.length <= max);
const optionalBoolean = value => value === undefined || typeof value === 'boolean';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Site-relative path or http(s) URL; never javascript:/data:, control characters or backslashes.
export function safeLink(value, {absolute = false} = {}) {
  const url = String(value ?? '').trim();
  if (!url) return true;
  if (/[\u0000-\u001f\u007f\\]/.test(url)) return false;
  if (/^https?:\/\//i.test(url)) { try { return Boolean(new URL(url).hostname); } catch { return false; } }
  return !absolute && url.startsWith('/') && !url.startsWith('//');
}
const safeAsset = value => {
  const url = String(value ?? '').trim();
  return !url || (safeLink(url) || (!/^[a-z][a-z\d+.-]*:/i.test(url) && !/[\u0000-\u001f\u007f\\]/.test(url)));
};

export const PAGE_SEO_FIELDS = {title: 200, description: 320, ogTitle: 200, ogDescription: 320, ogImage: 2048, ogImageAlt: 240, canonical: 2048};

export function validatePageSeo(seo) {
  if (seo === undefined) return '';
  if (!isObject(seo)) return 'Sayfa SEO alanları geçersiz.';
  for (const key of Object.keys(seo)) if (!(key in PAGE_SEO_FIELDS) && key !== 'noindex') return 'Sayfa SEO alanlarında tanınmayan bir değer var.';
  for (const [key, max] of Object.entries(PAGE_SEO_FIELDS)) if (!bounded(seo[key], max)) return 'Bir sayfa SEO alanı izin verilen uzunluğu aşıyor.';
  if (!optionalBoolean(seo.noindex)) return 'Sayfa arama görünürlüğü ayarı geçersiz.';
  if (!safeAsset(seo.ogImage)) return 'Sayfa paylaşım görseli bağlantısı geçersiz.';
  if (seo.canonical && !safeLink(seo.canonical, {absolute: true})) return 'Canonical adresi http(s) ile başlayan tam bir adres olmalı.';
  return '';
}

export function validateRecordSeo(kind, record, siblings = []) {
  if (!optionalBoolean(record.seoIndex) || !optionalBoolean(record.noIndex)) return 'Arama görünürlüğü ayarı geçersiz.';
  if (record.previousSlugs !== undefined && (!Array.isArray(record.previousSlugs) || record.previousSlugs.length > 20 || record.previousSlugs.some(slug => typeof slug !== 'string' || !SLUG.test(slug)))) return 'Eski sayfa adresi listesi geçersiz.';
  if (!bounded(record.updatedAt, 40)) return 'Güncelleme tarihi geçersiz.';
  if (kind === 'post' && record.translationId !== undefined && record.translationId !== '') {
    if (typeof record.translationId !== 'string' || record.translationId.length > 120 || record.translationId === record.id) return 'Çeviri bağlantısı geçersiz.';
    const other = siblings.find(item => item.id === record.translationId);
    if (!other) return 'Çeviri olarak seçilen yazı bulunamadı.';
    if ((other.lang || 'tr') === (record.lang || 'tr')) return 'Çeviri olarak başka dildeki bir yazı seçilmeli.';
  }
  return '';
}

export function validateSeoSettings(settings) {
  const seo = settings.seo;
  if (seo !== undefined) {
    if (!isObject(seo)) return 'SEO ayarları geçersiz.';
    for (const [key, max] of Object.entries({siteName: 80, defaultDescription: 320, defaultDescriptionEn: 320, defaultOgImage: 2048, googleVerification: 120, bingVerification: 80})) if (!bounded(seo[key], max)) return 'Bir SEO ayarı izin verilen uzunluğu aşıyor.';
    if (!optionalBoolean(seo.indexing)) return 'Arama motoru görünürlüğü ayarı geçersiz.';
    if (!safeAsset(seo.defaultOgImage)) return 'Varsayılan paylaşım görseli bağlantısı geçersiz.';
    if (seo.googleVerification && !/^[A-Za-z0-9_-]{10,100}$/.test(seo.googleVerification)) return 'Google Search Console doğrulama kodu geçersiz (yalnızca content="…" içindeki değer).';
    if (seo.bingVerification && !/^[A-Fa-f0-9]{16,64}$/.test(seo.bingVerification)) return 'Bing doğrulama kodu geçersiz.';
    if (seo.organization !== undefined) {
      if (!isObject(seo.organization)) return 'Kurum bilgileri geçersiz.';
      for (const key of ['name', 'legalName', 'streetAddress', 'postalCode', 'addressLocality', 'addressRegion', 'addressCountry', 'logo']) if (!bounded(seo.organization[key], key === 'logo' ? 2048 : 160)) return 'Bir kurum bilgisi alanı geçersiz.';
      if (!safeAsset(seo.organization.logo)) return 'Kurum logosu bağlantısı geçersiz.';
      if (seo.organization.addressCountry && !/^[A-Z]{2}$/.test(seo.organization.addressCountry)) return 'Ülke kodu iki büyük harf olmalı (ör. TR).';
    }
  }
  const social = settings.social;
  if (social !== undefined) {
    if (!isObject(social)) return 'Sosyal profil ayarları geçersiz.';
    for (const key of Object.keys(social)) {
      const platform = SOCIAL_PLATFORMS.find(item => item.id === key);
      if (!platform || !bounded(social[key], 300)) return 'Sosyal profil ayarlarında tanınmayan bir alan var.';
      if (!validSocialUrl(key, social[key])) return `${platform.label} adresi https:// ile başlayan geçerli bir ${platform.label} profil adresi olmalı.`;
    }
  }
  const analytics = settings.analytics;
  if (analytics !== undefined) {
    if (!isObject(analytics)) return 'Ölçüm ayarları geçersiz.';
    if (analytics.mode !== undefined && !ANALYTICS_MODES.includes(analytics.mode)) return 'Ölçüm yöntemi geçersiz.';
    for (const key of Object.keys(ANALYTICS_IDS)) if (!bounded(analytics[key], 80) || !validAnalyticsId(key, analytics[key])) return `${key} değeri beklenen biçimde değil (örnek: ${ANALYTICS_IDS[key].example}).`;
    for (const key of ['consentRequired', 'metaEnabled', 'linkedinEnabled']) if (!optionalBoolean(analytics[key])) return 'Ölçüm ayarlarındaki açık/kapalı değeri geçersiz.';
  }
  const redirects = settings.redirects;
  if (redirects !== undefined) {
    if (!Array.isArray(redirects) || redirects.length > 500) return 'Yönlendirme listesi geçersiz veya 500 kayıt sınırını aşıyor.';
    const sources = new Set();
    for (const rule of redirects) {
      if (!isObject(rule) || !bounded(rule.id, 120) || typeof rule.from !== 'string' || typeof rule.to !== 'string' || rule.from.length > 500 || rule.to.length > 2048) return 'Bir yönlendirme kaydı geçersiz.';
      const from = rule.from.trim(), to = rule.to.trim();
      if (!from.startsWith('/') || from.startsWith('//') || /[\u0000-\u001f\u007f\\?#]/.test(from)) return `Yönlendirme kaynağı “/” ile başlayan bir yol olmalı (soru işareti veya # olmadan): ${from || '(boş)'}`;
      if (/^\/(admin|api|assets)(\/|$)/i.test(from)) return 'Yönetim, API ve dosya adresleri yönlendirilemez.';
      if (!to || !safeLink(to)) return `Yönlendirme hedefi geçersiz: ${to || '(boş)'}`;
      if (![301, 302, undefined].includes(rule.status)) return 'Yönlendirme türü 301 veya 302 olmalı.';
      if (!optionalBoolean(rule.active)) return 'Yönlendirme durumu geçersiz.';
      const key = from.replace(/\/+$/, '').toLowerCase() || '/';
      if (sources.has(key)) return `Aynı kaynak için iki yönlendirme var: ${from}`;
      sources.add(key);
      if (to.replace(/\/+$/, '').toLowerCase() === key) return `Yönlendirme kendisine işaret ediyor: ${from}`;
    }
    for (const rule of redirects) {
      const target = rule.to.trim().replace(/\/+$/, '').toLowerCase();
      if (target.startsWith('/') && sources.has(target)) return `Yönlendirme zinciri oluşuyor (${rule.from} → ${rule.to}); hedefi doğrudan son adrese verin.`;
    }
  }
  return '';
}
