// Measurement configuration for the public site (server side).
// One strategy per site: Google tag (gtag.js) OR Google Tag Manager — never both,
// so a page_view/event can't be counted twice. Meta Pixel / LinkedIn Insight are
// loaded directly only in gtag mode; with GTM they belong inside the container.
// Deployment env vars win over admin settings and lock the matching admin field.
import fs from 'node:fs';
import path from 'node:path';
import {plainText} from './seo-model.js';
import {ANALYTICS_IDS, ANALYTICS_MODES} from './analytics-model.js';
export {ANALYTICS_IDS, ANALYTICS_MODES, validAnalyticsId} from './analytics-model.js';

// Production loads tags by default; any other NODE_ENV needs ANALYTICS_ENABLED=true,
// so local/staging traffic never reaches the production GA4 property by accident.
export function analyticsEnvironment() {
  const production = process.env.NODE_ENV === 'production';
  const flag = String(process.env.ANALYTICS_ENABLED || '').toLowerCase();
  return {
    production,
    enabled: flag === 'true' || (flag !== 'false' && production),
    debug: String(process.env.ANALYTICS_DEBUG || '').toLowerCase() === 'true',
    locked: Object.fromEntries(Object.entries(ANALYTICS_IDS).filter(([, spec]) => process.env[spec.env]).map(([key]) => [key, true]))
  };
}

export function resolveAnalytics(settings = {}) {
  const stored = settings.analytics && typeof settings.analytics === 'object' ? settings.analytics : {};
  const env = analyticsEnvironment();
  const ids = {};
  for (const [key, spec] of Object.entries(ANALYTICS_IDS)) {
    const value = String(process.env[spec.env] || stored[key] || '').trim();
    ids[key] = spec.pattern.test(value) ? value : '';
  }
  let mode = ANALYTICS_MODES.includes(stored.mode) ? stored.mode : 'none';
  if (process.env.GTM_CONTAINER_ID) mode = 'gtm';
  else if (process.env.GA4_MEASUREMENT_ID && mode === 'none') mode = 'gtag';
  let google = null;
  if (mode === 'gtm' && ids.gtm) google = {type: 'gtm', id: ids.gtm};
  if (mode === 'gtag' && (ids.ga4 || ids.googleAds)) google = {type: 'gtag', ga4: ids.ga4, ads: ids.googleAds, adsLeadLabel: ids.googleAds ? ids.googleAdsLeadLabel : ''};
  const direct = mode !== 'gtm';
  const meta = direct && stored.metaEnabled !== false && ids.metaPixel ? ids.metaPixel : '';
  const linkedin = direct && stored.linkedinEnabled !== false && ids.linkedinPartner ? {partner: ids.linkedinPartner, leadConversion: ids.linkedinLeadConversion} : null;
  const configured = Boolean(google || meta || linkedin);
  return {
    mode, ids, google, meta, linkedin, configured,
    active: configured && env.enabled,
    debug: env.debug,
    consentRequired: stored.consentRequired !== false,
    categories: {
      analytics: Boolean(google && (google.type === 'gtm' || google.ga4)),
      marketing: Boolean(meta || linkedin || (google && (google.type === 'gtm' || google.ads)))
    },
    env
  };
}

const PAGE_TYPES = [
  [/(^|\/)index\.html$/, 'home'], [/\/blog\/index\.html$/, 'blog_list'], [/\/blog\/[^/]+\.html$/, 'article'],
  [/\/(hpl-products|oem-parts|pascalcast|pascalforge|hpl-cylinders)\.html$/, 'product_list'], [/\/urun-detay\.html$/, 'product'],
  [/\/kataloglar\.html$/, 'catalogs'], [/\/teklif-al\.html$/, 'quote'], [/\/contact\.html$/, 'contact'], [/\/hizmetler\.html$/, 'services'],
  [/\/calculation-program\.html$/, 'calculator'], [/\/(privacy-policy|terms-of-service|disclaimer)\.html$/, 'legal'],
  [/\/about-us\.html$/, 'about'], [/\/faq\.html$/, 'faq'], [/\/referanslar\.html$/, 'references'], [/\/media\.html$/, 'media'], [/\/404\.html$/, 'not_found']
];
export function pageType(route, kind = 'page') {
  if (kind === 'notFound') return 'not_found';
  if (kind === 'product') return 'product';
  if (kind === 'post') return 'article';
  const blogIndex = /\/blog\/index\.html$/.test(route);
  for (const [pattern, type] of PAGE_TYPES) if (pattern.test(route) && (type !== 'home' || !blogIndex)) return type;
  return 'page';
}

// Page-level view events carry only content metadata (never visitor data).
function pageEvent({kind, product, post, category, lang}) {
  if (kind === 'product' && product) {
    const en = lang === 'en';
    return {name: 'product_view', params: {
      product_id: String(product.slug || product.id), product_name: plainText(en ? product.nameEn || product.name : product.name).slice(0, 100),
      product_type: product.type || 'hydraulic', product_category: plainText(en ? product.categoryEn || product.category : product.category).slice(0, 100)
    }};
  }
  if (kind === 'post' && post) return {name: 'article_view', params: {article_id: String(post.slug), article_category: plainText(category).slice(0, 100), published_date: String(post.date || '')}};
  return null;
}

const text = {
  tr: {title: 'Çerez tercihleri', body: 'Siteyi nasıl kullandığınızı anlamak ve reklamlarımızın sonuçlarını ölçmek için isteğe bağlı çerezler kullanmak istiyoruz. Onay vermezseniz bu araçlar yüklenmez; tercihinizi alt bilgideki “Çerez tercihleri” bağlantısından istediğiniz zaman değiştirebilirsiniz.', privacy: 'Gizlilik Politikası', analytics: 'Analitik', analyticsHint: 'ziyaret ve etkileşim istatistikleri', marketing: 'Pazarlama', marketingHint: 'reklam dönüşüm ölçümü', reject: 'Reddet', customize: 'Tercihler', save: 'Seçimi kaydet', accept: 'Tümünü kabul et', open: 'Çerez tercihleri'},
  en: {title: 'Cookie preferences', body: 'We would like to use optional cookies to understand how the site is used and to measure the results of our advertising. Nothing is loaded unless you agree; you can change your choice at any time from “Cookie preferences” in the footer.', privacy: 'Privacy Policy', analytics: 'Analytics', analyticsHint: 'visit and interaction statistics', marketing: 'Marketing', marketingHint: 'advertising conversion measurement', reject: 'Reject', customize: 'Preferences', save: 'Save choice', accept: 'Accept all', open: 'Cookie preferences'}
};

function vendorNames(config, category) {
  const names = [];
  if (category === 'analytics') {
    if (config.google?.type === 'gtm') names.push('Google Tag Manager');
    else if (config.google?.ga4) names.push('Google Analytics');
  } else {
    if (config.google?.type === 'gtm') names.push('Google Tag Manager');
    else if (config.google?.ads) names.push('Google Ads');
    if (config.meta) names.push('Meta');
    if (config.linkedin) names.push('LinkedIn');
  }
  return names.join(', ');
}

function consentMarkup(config, lang) {
  const t = text[lang === 'en' ? 'en' : 'tr'];
  const option = category => config.categories[category]
    ? `<label class="hp-consent-option"><input type="checkbox" data-hp-consent-category="${category}"><span><b>${t[category]}</b> — ${t[category + 'Hint']} (${vendorNames(config, category)})</span></label>` : '';
  return `<div id="hp-consent" class="hp-consent" role="dialog" aria-modal="false" aria-labelledby="hp-consent-title" hidden>
<div class="hp-consent-panel">
<p id="hp-consent-title" class="hp-consent-title">${t.title}</p>
<p class="hp-consent-text">${t.body} <a href="privacy-policy.html">${t.privacy}</a></p>
<div class="hp-consent-options" data-hp-consent-options hidden>${option('analytics')}${option('marketing')}</div>
<div class="hp-consent-actions">
<button type="button" class="hp-consent-button" data-hp-consent="reject">${t.reject}</button>
<button type="button" class="hp-consent-button" data-hp-consent="customize">${t.customize}</button>
<button type="button" class="hp-consent-button" data-hp-consent="save" hidden>${t.save}</button>
<button type="button" class="hp-consent-button is-primary" data-hp-consent="accept">${t.accept}</button>
</div>
</div>
</div>`;
}

let runtimeVersion = '';
function scriptVersion() {
  try { runtimeVersion = String(Math.floor(fs.statSync(path.resolve(process.cwd(), '..', 'assets/js/hp-analytics.js')).mtimeMs)); } catch {}
  return runtimeVersion || '1';
}

/** Adds the measurement config, the runtime script and (if needed) the consent banner to a public page. */
export function applyAnalytics(html, {route, lang, settings = {}, kind = 'page', product = null, post = null, category = ''}) {
  const config = resolveAnalytics(settings);
  if (!config.active && !config.debug) return html;
  const client = {
    v: 1, lang: lang === 'en' ? 'en' : 'tr', pageType: pageType(route, kind), active: config.active, debug: config.debug,
    consentRequired: config.consentRequired, categories: config.categories,
    google: config.active ? config.google : null, meta: config.active ? config.meta : '', linkedin: config.active ? config.linkedin : null,
    pageEvent: pageEvent({kind, product, post, category, lang})
  };
  const json = JSON.stringify(client).replace(/</g, '\\u003c');
  const head = `<script>window.hpAnalyticsConfig=${json};</script>\n<script defer src="/assets/js/hp-analytics.js?v=${scriptVersion()}"></script>\n`;
  let next = html.replace(/<\/head>/i, head + '</head>');
  if (config.active && config.consentRequired) {
    const t = text[client.lang];
    next = next.replace(/(<div\b[^>]*data-field=["']copyright["'][^>]*>)([\s\S]*?)(<\/div>)/i, (all, open, inner, close) => `${open}${inner.trim()} <span aria-hidden="true">·</span> <button type="button" data-hp-consent-open class="hover:text-[#fb923c] transition">${t.open}</button>${close}`);
    next = next.replace(/<\/body>/i, consentMarkup(config, client.lang) + '\n</body>');
  }
  return next;
}
