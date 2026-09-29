// Single mapping from CMS records/settings to public metadata.
// Pure (no fs, no env) so the admin previews and the public renderer compute
// exactly the same title / description / canonical / image / robots values.

export const DEFAULT_ORIGIN = 'https://www.hydropascal.com.tr';
// Hosts that belong to this site; absolute URLs on them are rebased to the configured origin.
export const SITE_HOSTS = ['www.hydropascal.com.tr', 'hydropascal.com.tr'];
export const DEFAULT_OG_IMAGE = '/assets/images/banner.jpg';
// Real size of banner.jpg, already declared in the static pages' og:image:width/height.
export const DEFAULT_OG_IMAGE_SIZE = {width: 1200, height: 630};
export const DEFAULT_ORGANIZATION_LOGO = '/assets/images/logo/hpl-logo.png';
// Only hydraulic and OEM records have a public detail page; PascalCast/PascalForge cards link to the quote form.
export const DETAIL_PAGE_TYPES = ['hydraulic', 'oem'];
export const SOCIAL_PLATFORMS = [
  {id: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com']},
  {id: 'instagram', label: 'Instagram', hosts: ['instagram.com']},
  {id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com']},
  {id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be']},
  {id: 'x', label: 'X', hosts: ['x.com', 'twitter.com']}
];
// Address already published in the homepage Organization JSON-LD; used until the admin changes it.
const DEFAULT_ADDRESS = {streetAddress: 'Fevziçakmak, 10757 Sk No:3/B', postalCode: '42210', addressLocality: 'Karatay', addressRegion: 'Konya', addressCountry: 'TR'};

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => String(value ?? '').trim();
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// User-typed text (titles, SEO fields): whitespace only — "<SEO>" stays text and is escaped on output.
export function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// Text derived from HTML sources (descriptions, rich content): tags removed.
export function plainText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// Shortens auto-derived text at a word boundary. User-written SEO text is never shortened.
export function summarize(value, max = 160) {
  const clean = plainText(value);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}

export function normalizeOrigin(value) {
  try {
    const url = new URL(text(value) || DEFAULT_ORIGIN);
    return /^https?:$/.test(url.protocol) ? url.origin : DEFAULT_ORIGIN;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

export function absoluteUrl(value, origin = DEFAULT_ORIGIN, lang = 'tr') {
  const raw = text(value);
  if (!raw || /^(?:javascript|data|vbscript|mailto|tel):/i.test(raw)) return '';
  const base = normalizeOrigin(origin);
  try {
    const url = new URL(raw, `${base}/${lang === 'en' ? 'en' : 'tr'}/`);
    if (!/^https?:$/.test(url.protocol)) return '';
    if (SITE_HOSTS.includes(url.hostname) && url.origin !== base) return base + url.pathname + url.search + url.hash;
    return url.href;
  } catch {
    return '';
  }
}

// "Başlık | HydroPascal" — strips an existing trailing "| <suffix…>" so the suffix is never doubled.
export function composeTitle(base, suffix) {
  const title = cleanText(base);
  const tail = cleanText(suffix);
  if (!tail) return title;
  const root = tail.split(' ')[0];
  const stripped = title.replace(new RegExp(`\\s*\\|\\s*${escapeRegExp(root)}\\b.*$`, 'i'), '').trim();
  return stripped ? `${stripped} | ${tail}` : tail;
}

export function robotsValue(indexable) {
  return indexable ? 'index, follow' : 'noindex, follow';
}

export function validSocialUrl(platform, value) {
  const raw = text(value);
  if (!raw) return true;
  const spec = SOCIAL_PLATFORMS.find(item => item.id === platform);
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    return url.protocol === 'https:' && Boolean(spec) && spec.hosts.some(item => host === item || host.endsWith('.' + item)) && url.pathname.length > 1;
  } catch {
    return false;
  }
}

// X/Twitter profile URL → "@handle" for twitter:site.
export function xHandle(value) {
  if (!validSocialUrl('x', value) || !text(value)) return '';
  const segment = new URL(text(value)).pathname.split('/').filter(Boolean)[0] || '';
  return /^[A-Za-z0-9_]{1,15}$/.test(segment) ? '@' + segment : '';
}

export function resolveSeoSettings(settings = {}) {
  const seo = isObject(settings.seo) ? settings.seo : {};
  const org = isObject(seo.organization) ? seo.organization : {};
  const social = isObject(settings.social) ? settings.social : {};
  const companyName = text(settings.companyName) || 'HydroPascal';
  const address = {};
  for (const key of Object.keys(DEFAULT_ADDRESS)) address[key] = org[key] === undefined ? DEFAULT_ADDRESS[key] : text(org[key]);
  return {
    siteName: text(seo.siteName) || companyName,
    defaultDescription: {tr: text(seo.defaultDescription), en: text(seo.defaultDescriptionEn)},
    defaultOgImage: text(seo.defaultOgImage) || DEFAULT_OG_IMAGE,
    indexing: seo.indexing !== false,
    organization: {
      name: text(org.name) || companyName,
      legalName: text(org.legalName),
      logo: text(org.logo) || DEFAULT_ORGANIZATION_LOGO,
      email: text(settings.email),
      telephone: text(settings.phone).replace(/[^\d+]/g, ''),
      address
    },
    social: SOCIAL_PLATFORMS.map(item => ({...item, url: text(social[item.id])})).filter(item => item.url && validSocialUrl(item.id, item.url)),
    verification: {google: text(seo.googleVerification), bing: text(seo.bingVerification)}
  };
}

export function isPublicProduct(product) {
  return Boolean(product && product.active !== false && DETAIL_PAGE_TYPES.includes(product.type || 'hydraulic') && text(product.slug || product.id));
}

export function productDetailUrl(product, language = 'tr', origin = DEFAULT_ORIGIN) {
  const lang = language === 'en' ? 'en' : 'tr';
  return `${normalizeOrigin(origin)}/${lang}/urun-detay.html?id=${encodeURIComponent(String(product.slug || product.id))}`;
}

export function findProduct(products, key) {
  const value = text(key);
  if (!value) return null;
  return (products || []).find(item => item.slug === value || item.id === value || item.code === value) || null;
}

export function postUrl(post, origin = DEFAULT_ORIGIN) {
  return `${normalizeOrigin(origin)}/${post?.lang === 'en' ? 'en' : 'tr'}/blog/${encodeURIComponent(String(post?.slug || ''))}.html`;
}

const labels = {
  tr: {home: 'Ana Sayfa', blog: 'Blog', hydraulic: 'HPL Ürünleri', oem: 'OEM Parça'},
  en: {home: 'Home', blog: 'Blog', hydraulic: 'Hydraulic Products', oem: 'OEM Parts'}
};

// Visible product breadcrumb labels (same values the detail page has always shown).
export function productBreadcrumb(product, lang, origin) {
  const l = labels[lang === 'en' ? 'en' : 'tr'];
  const base = `${normalizeOrigin(origin)}/${lang === 'en' ? 'en' : 'tr'}/`;
  const isOem = product.type === 'oem';
  const name = cleanText(lang === 'en' ? (product.detailTitleEn || product.nameEn || product.detailTitle || product.name) : (product.detailTitle || product.name)) || text(product.slug);
  return [
    {name: l.home, url: base + 'index.html'},
    {name: isOem ? l.oem : l.hydraulic, url: base + (isOem ? 'oem-parts.html' : 'hpl-products.html')},
    {name, url: productDetailUrl(product, lang, origin)}
  ];
}

export function postBreadcrumb(post, origin) {
  const lang = post?.lang === 'en' ? 'en' : 'tr';
  const l = labels[lang];
  const base = `${normalizeOrigin(origin)}/${lang}/`;
  return [
    {name: l.home, url: base + 'index.html'},
    {name: l.blog, url: base + 'blog/index.html'},
    {name: cleanText(post.title) || text(post.slug), url: postUrl(post, origin)}
  ];
}

function withFallbackImage(candidates, settings, origin, lang) {
  for (const value of candidates) {
    const url = absoluteUrl(value, origin, lang);
    if (url) return {url, isDefault: false};
  }
  const url = absoluteUrl(settings.defaultOgImage, origin, lang);
  return {url, isDefault: true, ...(text(settings.defaultOgImage) === DEFAULT_OG_IMAGE ? DEFAULT_OG_IMAGE_SIZE : {})};
}

export function productMetadata(product, language, {origin = DEFAULT_ORIGIN, settings = {}} = {}) {
  const lang = language === 'en' ? 'en' : 'tr';
  const s = resolveSeoSettings(settings);
  const en = lang === 'en';
  const name = cleanText((en ? product.seoTitleEn || product.detailTitleEn || product.nameEn : product.seoTitle || product.detailTitle || product.name) || product.name || product.slug);
  const custom = cleanText(en ? product.seoDescriptionEn : product.seoDescription);
  const description = custom || summarize(en ? product.descriptionEn || product.description : product.description) || s.defaultDescription[lang];
  const indexable = s.indexing && isPublicProduct(product) && product.noIndex !== true && product.seoIndex !== false;
  const image = withFallbackImage([product.seoImage, product.image, product.gallery?.[0]?.url], s, origin, lang);
  const canonical = productDetailUrl(product, lang, origin);
  return {
    kind: 'product', lang, title: composeTitle(name, s.siteName), shareTitle: name, description, descriptionIsCustom: Boolean(custom),
    canonical, robots: robotsValue(indexable), indexable, image, imageAlt: name, ogType: 'product',
    alternates: indexable ? {tr: productDetailUrl(product, 'tr', origin), en: productDetailUrl(product, 'en', origin)} : {}
  };
}

export function postMetadata(post, {origin = DEFAULT_ORIGIN, settings = {}, category = ''} = {}) {
  const lang = post?.lang === 'en' ? 'en' : 'tr';
  const s = resolveSeoSettings(settings);
  const name = cleanText(post.seoTitle || post.title) || 'Blog';
  const custom = cleanText(post.seoDescription);
  const description = custom || summarize(post.excerpt) || summarize(post.content) || s.defaultDescription[lang];
  const indexable = s.indexing && post.published !== false && post.seoIndex !== false;
  const image = withFallbackImage([post.ogImage, post.image], s, origin, lang);
  const title = composeTitle(name, `${s.siteName} Blog`);
  return {
    kind: 'post', lang, title, shareTitle: composeTitle(name, ''), description, descriptionIsCustom: Boolean(custom),
    canonical: postUrl(post, origin), robots: robotsValue(indexable), indexable, image, imageAlt: cleanText(post.title), ogType: 'article',
    article: {published: text(post.date), modified: text(post.updatedAt).slice(0, 10) || text(post.date), section: plainText(category)}
  };
}

// Static page: the page's own head (staticHead) is the default; __seo overrides it field by field.
export function pageMetadata(route, override = {}, staticHead = {}, {origin = DEFAULT_ORIGIN, settings = {}} = {}) {
  const lang = String(route).startsWith('en/') ? 'en' : 'tr';
  const s = resolveSeoSettings(settings);
  const seo = isObject(override) ? override : {};
  const customTitle = cleanText(seo.title);
  const title = customTitle ? composeTitle(customTitle, s.siteName) : cleanText(staticHead.title) || s.siteName;
  const description = cleanText(seo.description) || cleanText(staticHead.description) || s.defaultDescription[lang];
  const canonicalOverride = text(seo.canonical);
  const canonical = canonicalOverride ? absoluteUrl(canonicalOverride, origin, lang) : `${normalizeOrigin(origin)}/${route}`;
  const indexable = s.indexing && seo.noindex !== true && staticHead.noindex !== true;
  const image = withFallbackImage([seo.ogImage, staticHead.image], s, origin, lang);
  if (!seo.ogImage && staticHead.image && staticHead.imageWidth && absoluteUrl(staticHead.image, origin, lang) === image.url) Object.assign(image, {width: staticHead.imageWidth, height: staticHead.imageHeight});
  return {
    kind: 'page', lang, title, shareTitle: cleanText(seo.ogTitle) || (customTitle ? title : cleanText(staticHead.ogTitle) || title),
    description, shareDescription: cleanText(seo.ogDescription) || (cleanText(seo.description) ? description : cleanText(staticHead.ogDescription) || description),
    descriptionIsCustom: Boolean(cleanText(seo.description)), canonical, canonicalIsCustom: Boolean(canonicalOverride),
    robots: robotsValue(indexable), indexable, image, imageAlt: cleanText(seo.ogImageAlt) || (seo.ogImage ? title : cleanText(staticHead.imageAlt) || title), ogType: 'website'
  };
}

// Guidance, not a score: Google shows roughly 50–60 title characters and ~155 description characters.
export function seoChecks(meta, {origin = DEFAULT_ORIGIN, missingAlt = 0} = {}) {
  const checks = [];
  const add = (level, label) => checks.push({level, label});
  const title = cleanText(meta?.title), description = cleanText(meta?.description);
  if (!title) add('fail', 'Başlık yok');
  else if (title.length > 65) add('warn', `Başlık ${title.length} karakter; Google ~60 karakterden sonrasını kısaltabilir`);
  else add('ok', `Başlık var (${title.length} karakter)`);
  if (!description) add('fail', 'Açıklama yok');
  else if (description.length < 50) add('warn', `Açıklama kısa (${description.length} karakter)`);
  else if (description.length > 170) add('warn', `Açıklama ${description.length} karakter; ~155 karakterden sonrası kesilebilir`);
  else add('ok', `Açıklama var (${description.length} karakter)`);
  let canonicalOk = false;
  try { const url = new URL(meta?.canonical || ''); canonicalOk = /^https?:$/.test(url.protocol); if (canonicalOk && url.origin !== normalizeOrigin(origin)) add('warn', 'Canonical başka bir alan adına işaret ediyor'); } catch {}
  add(canonicalOk ? 'ok' : 'fail', canonicalOk ? 'Canonical geçerli' : 'Canonical geçersiz');
  if (!meta?.image?.url) add('fail', 'Paylaşım görseli yok');
  else if (meta.image.isDefault) add('warn', 'Paylaşım görseli yok; varsayılan site görseli kullanılıyor');
  else add('ok', 'Paylaşım görseli var');
  if (meta && meta.indexable === false) add('warn', 'Arama motorlarına kapalı (noindex); site haritasında yer almaz');
  else add('ok', 'Arama motorlarına açık');
  if (missingAlt > 0) add('warn', `${missingAlt} görselin açıklaması (alt metin) boş`);
  return checks;
}
