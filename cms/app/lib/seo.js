// Server-side SEO orchestration for the public renderer.
// Every public page passes through applySeoHead() once, after all content edits:
// it owns <title>, description, robots, canonical, hreflang, Open Graph, X cards,
// search-engine verification and ONE JSON-LD graph, all derived from the CMS
// content model via seo-model.js. Sitemap, robots.txt and redirects use the same
// helpers, so a URL is listed in the sitemap only when its page says it is
// indexable and canonical.
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_ORIGIN, absoluteUrl, findProduct, isPublicProduct, normalizeOrigin, pageMetadata, plainText,
  postBreadcrumb, postMetadata, postUrl, productBreadcrumb, productDetailUrl, productMetadata,
  resolveSeoSettings, xHandle, cleanText
} from './seo-model.js';

const siteRoot = path.resolve(process.cwd(), '..');
const OG_LOCALES = {tr: 'tr_TR', en: 'en_US'};
// Routes that exist as files but are never public landing pages.
const INTERNAL_ROUTE = /(?:^|\/)(?:404\.html|blog\/blog-post-template\.html|urun-detay\.html)$/;
const BLOG_POST_ROUTE = /^(tr|en)\/blog\/(?!index\.html$)([^/]+)\.html$/;
const MANAGED_META = /^(?:description|robots|googlebot|google-site-verification|msvalidate\.01|twitter:.+|og:.+|article:.+)$/i;

export function siteOrigin() {
  return normalizeOrigin(process.env.SITE_URL || DEFAULT_ORIGIN);
}

// Deployment switches win over admin settings: SEARCH_INDEXING=false keeps staging out of search engines.
export function effectiveSettings(settings = {}) {
  const seo = {...(settings.seo && typeof settings.seo === 'object' ? settings.seo : {})};
  if (String(process.env.SEARCH_INDEXING || '').toLowerCase() === 'false') seo.indexing = false;
  if (process.env.GOOGLE_SITE_VERIFICATION) seo.googleVerification = process.env.GOOGLE_SITE_VERIFICATION;
  if (process.env.BING_SITE_VERIFICATION) seo.bingVerification = process.env.BING_SITE_VERIFICATION;
  return {...settings, seo};
}

function escapeText(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escAttr(value) { return escapeText(value).replace(/"/g, '&quot;'); }
function decodeEntities(value) { return String(value || '').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function attr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2] ?? '') : null;
}
function routeOf(url, origin) {
  try {
    const parsed = new URL(url, origin + '/');
    return decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  } catch { return ''; }
}
function pathOf(url) {
  try { const parsed = new URL(url); return parsed.pathname + parsed.search; } catch { return url; }
}
function fileExists(route) {
  if (!/^(tr|en)\/[a-zA-Z0-9_./-]+\.html$/.test(route) || route.includes('..')) return false;
  return fs.existsSync(path.join(siteRoot, route));
}

export function readHead(html) {
  const end = html.search(/<\/head>/i);
  const head = end >= 0 ? html.slice(0, end) : html;
  const meta = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, 'name') || attr(tag, 'property') || '').toLowerCase();
    if (key && meta[key] === undefined) meta[key] = decodeEntities(attr(tag, 'content') || '');
  }
  const alternates = {};
  let canonical = '';
  for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    if (rel === 'canonical' && !canonical) canonical = decodeEntities(attr(tag, 'href') || '');
    if (rel === 'alternate' && attr(tag, 'hreflang')) alternates[attr(tag, 'hreflang').toLowerCase()] = decodeEntities(attr(tag, 'href') || '');
  }
  return {
    title: decodeEntities((head.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim(),
    description: meta.description || '', robots: meta.robots || '', noindex: /noindex/i.test(meta.robots || ''),
    ogTitle: meta['og:title'] || '', ogDescription: meta['og:description'] || '',
    image: meta['og:image'] || '', imageAlt: meta['og:image:alt'] || '',
    imageWidth: Number(meta['og:image:width']) || 0, imageHeight: Number(meta['og:image:height']) || 0,
    canonical, alternates
  };
}

// The static files are the page defaults; re-read only when a file changes.
const headCache = new Map();
export function staticHeadForRoute(route) {
  if (!fileExists(route)) return null;
  const file = path.join(siteRoot, route);
  const mtime = fs.statSync(file).mtimeMs;
  const cached = headCache.get(route);
  if (cached && cached.mtime === mtime) return cached.head;
  const head = readHead(fs.readFileSync(file, 'utf8'));
  headCache.set(route, {mtime, head});
  return head;
}

function postIsIndexable(post, settings) {
  return Boolean(post && post.published !== false && post.seoIndex !== false && post.slug && resolveSeoSettings(settings).indexing);
}

export function pageIsIndexable(route, data, settings) {
  if (INTERNAL_ROUTE.test(route)) return false;
  const head = staticHeadForRoute(route);
  if (!head) return false;
  const meta = pageMetadata(route, data.pages?.[route]?.__seo, head, {origin: siteOrigin(), settings});
  return meta.indexable && meta.canonical === `${siteOrigin()}/${route}`;
}

function managedPostForRoute(route, posts = []) {
  const match = route.match(BLOG_POST_ROUTE);
  if (!match) return null;
  return posts.find(post => post.legacy === true && post.legacyPath === route)
    || posts.find(post => post.legacy !== true && (post.lang || 'tr') === match[1] && post.slug === match[2]) || null;
}

// Only returns a pair when both language versions exist and are indexable; otherwise no hreflang.
function withDefault(alternates) {
  if (Object.keys(alternates).length < 2) return {};
  return {...alternates, 'x-default': alternates.en || alternates.tr};
}

export function postAlternates(post, data, settings) {
  const origin = siteOrigin();
  if (!postIsIndexable(post, settings)) return {};
  const lang = post.lang === 'en' ? 'en' : 'tr', other = lang === 'en' ? 'tr' : 'en';
  const posts = data.posts || [];
  let counterpart = post.translationId ? posts.find(item => item.id === post.translationId) : posts.find(item => item.translationId === post.id);
  if (!counterpart && post.legacy === true && post.legacyPath) {
    const href = staticHeadForRoute(post.legacyPath)?.alternates?.[other];
    const route = href ? routeOf(href, origin) : '';
    counterpart = route ? managedPostForRoute(route, posts) : null;
  }
  const result = {[lang]: postUrl(post, origin)};
  if (counterpart && (counterpart.lang || 'tr') === other && postIsIndexable(counterpart, settings)) result[other] = postUrl(counterpart, origin);
  return withDefault(result);
}

export function pageAlternates(route, data, settings) {
  const origin = siteOrigin();
  if (!pageIsIndexable(route, data, settings)) return {};
  const lang = route.startsWith('en/') ? 'en' : 'tr', other = lang === 'en' ? 'tr' : 'en';
  let counterpart = other + route.slice(2);
  if (BLOG_POST_ROUTE.test(route)) {
    const href = staticHeadForRoute(route)?.alternates?.[other];
    counterpart = href ? routeOf(href, origin) : '';
  }
  const result = {[lang]: `${origin}/${route}`};
  if (counterpart && !managedPostForRoute(counterpart, data.posts) && pageIsIndexable(counterpart, data, settings)) result[other] = `${origin}/${counterpart}`;
  return withDefault(result);
}

function productAlternates(product, settings) {
  const meta = productMetadata(product, 'tr', {origin: siteOrigin(), settings});
  return withDefault(meta.alternates || {});
}

// ---------- JSON-LD ----------
const MANAGED_TYPES = new Set(['Organization', 'WebSite', 'BreadcrumbList', 'Article', 'BlogPosting', 'NewsArticle']);
function typesOf(node) { const type = node?.['@type']; return Array.isArray(type) ? type : [type]; }

function organizationNode(settings, origin) {
  const s = resolveSeoSettings(settings);
  const org = s.organization;
  const node = {'@type': 'Organization', '@id': `${origin}/#organization`, name: org.name, url: `${origin}/`};
  if (org.legalName) node.legalName = org.legalName;
  const logo = absoluteUrl(org.logo, origin);
  if (logo) node.logo = {'@type': 'ImageObject', url: logo};
  if (org.email) node.email = org.email;
  if (org.telephone) node.telephone = org.telephone;
  const address = Object.fromEntries(Object.entries(org.address).filter(([, value]) => value));
  if (Object.keys(address).length) node.address = {'@type': 'PostalAddress', ...address};
  if (s.social.length) node.sameAs = s.social.map(item => item.url);
  return node;
}

function websiteNode(settings, origin, lang) {
  const s = resolveSeoSettings(settings);
  return {'@type': 'WebSite', '@id': `${origin}/#website`, name: s.siteName, url: `${origin}/`, inLanguage: lang === 'en' ? 'en-US' : 'tr-TR', publisher: {'@id': `${origin}/#organization`}};
}

function breadcrumbNode(items, canonical) {
  return {'@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`, itemListElement: items.map((item, index) => ({'@type': 'ListItem', position: index + 1, name: item.name, item: item.url}))};
}

function productNode(product, meta, settings, origin) {
  const lang = meta.lang;
  const s = resolveSeoSettings(settings);
  const localized = (row, key) => plainText(lang === 'en' ? row[key + 'En'] || row[key] : row[key]);
  const images = [...new Set([product.seoImage, product.image, ...(Array.isArray(product.gallery) ? product.gallery.map(photo => photo.url) : [])].map(value => absoluteUrl(value, origin, lang)).filter(Boolean))];
  const node = {'@type': 'Product', '@id': `${meta.canonical}#product`, name: meta.shareTitle, url: meta.canonical, brand: {'@type': 'Brand', name: s.siteName}, manufacturer: {'@id': `${origin}/#organization`}};
  if (meta.description) node.description = meta.description;
  if (images.length) node.image = images;
  if (plainText(product.code)) node.sku = plainText(product.code);
  const category = plainText(lang === 'en' ? product.categoryEn || product.category : product.category);
  if (category) node.category = category;
  const properties = [];
  if (plainText(product.oemCode)) properties.push({'@type': 'PropertyValue', name: lang === 'en' ? 'OEM code' : 'OEM kodu', value: plainText(product.oemCode)});
  for (const row of Array.isArray(product.dimensionRows) ? product.dimensionRows : []) {
    const name = localized(row, 'label'), value = localized(row, 'value');
    if (name && value) properties.push({'@type': 'PropertyValue', name, value});
  }
  for (const group of Array.isArray(product.dimensionGroups) ? product.dimensionGroups : []) {
    const title = localized(group, 'title');
    for (const row of Array.isArray(group.rows) ? group.rows : []) {
      const name = localized(row, 'label'), value = localized(row, 'value');
      if (name && value) properties.push({'@type': 'PropertyValue', name: title ? `${title} — ${name}` : name, value});
    }
  }
  if (properties.length) node.additionalProperty = properties.slice(0, 40);
  const compatible = (Array.isArray(product.compatibleBrands) ? product.compatibleBrands : []).map(row => ({brand: localized(row, 'brand'), model: localized(row, 'model')})).filter(row => row.brand);
  if (compatible.length) node.isAccessoryOrSparePartFor = compatible.slice(0, 25).map(row => ({'@type': 'Product', name: [row.brand, row.model].filter(Boolean).join(' '), brand: {'@type': 'Brand', name: row.brand}}));
  return node;
}

function articleNode(post, meta, settings, origin) {
  const s = resolveSeoSettings(settings);
  const node = {
    '@type': 'Article', '@id': `${meta.canonical}#article`, headline: cleanText(post.title).slice(0, 110), description: meta.description,
    mainEntityOfPage: meta.canonical, inLanguage: meta.lang === 'en' ? 'en-US' : 'tr-TR',
    author: {'@type': 'Organization', name: s.organization.name, url: `${origin}/`}, publisher: {'@id': `${origin}/#organization`}
  };
  if (meta.image?.url && !meta.image.isDefault) node.image = [meta.image.url];
  if (meta.article.published) node.datePublished = meta.article.published;
  if (meta.article.modified) node.dateModified = meta.article.modified;
  if (meta.article.section) node.articleSection = meta.article.section;
  return node;
}

function jsonLdScript(graph) {
  const json = JSON.stringify({'@context': 'https://schema.org', '@graph': graph}).replace(/</g, '\\u003c');
  return `<script type="application/ld+json" data-hp-seo="graph">${json}</script>`;
}

function filterStaticJsonLd(block, json, managed, origin) {
  let data;
  try { data = JSON.parse(json); } catch { return block; }
  const graph = Array.isArray(data?.['@graph']) ? data['@graph'] : null;
  const nodes = graph || [data];
  const kept = nodes.filter(node => !typesOf(node).some(type => managed.has(type)));
  if (!kept.length) return '';
  const next = kept.length === nodes.length ? data : graph ? {...data, '@graph': kept} : kept[0];
  let serialized = JSON.stringify(next, null, 2).replace(/</g, '\\u003c');
  if (origin !== DEFAULT_ORIGIN) serialized = serialized.split(DEFAULT_ORIGIN).join(origin);
  return `<script type="application/ld+json">\n${serialized}\n</script>\n`;
}

// ---------- Visible breadcrumb (same markup as the product detail page) ----------
export function renderBreadcrumb(items, className = 'max-w-7xl mx-auto px-6 lg:px-8 pt-6 text-sm text-slate-400') {
  const parts = items.map((item, index) => index === items.length - 1
    ? `<li class="text-slate-200" aria-current="page">${escapeText(item.name)}</li>`
    : `<li><a href="${escAttr(pathOf(item.url))}" class="hover:text-[#fb923c] transition">${escapeText(item.name)}</a></li><li aria-hidden="true">/</li>`);
  return `<nav aria-label="Breadcrumb" class="${className}"><ol class="flex flex-wrap items-center gap-2">${parts.join('')}</ol></nav>`;
}

function placeBreadcrumb(html, kind, items) {
  if (kind === 'product') {
    const nav = '<!-- BREADCRUMB -->\n' + renderBreadcrumb(items);
    const existing = /<!-- BREADCRUMB -->\s*<nav\b[^>]*aria-label="Breadcrumb"[\s\S]*?<\/nav>/i;
    if (existing.test(html)) return html.replace(existing, () => nav);
    return html.replace(/<main\b([^>]*)>/i, match => `${match}\n${nav}`);
  }
  // Blog posts: the "← all posts" link becomes the same breadcrumb trail.
  const legacyBack = /<p class="mb-6 text-sm"><a href="index\.html"[^>]*>←[^<]*<\/a><\/p>/i;
  if (legacyBack.test(html)) return html.replace(legacyBack, () => renderBreadcrumb(items, 'mb-6 text-sm text-slate-400'));
  const managedBack = /<a href="index\.html" class="text-\[#fb923c\]">← Blog<\/a>/i;
  if (managedBack.test(html)) return html.replace(managedBack, () => renderBreadcrumb(items, 'text-sm text-slate-400'));
  return html;
}

// Social profiles from settings (never hard-coded): a text link row under the footer
// introduction, same link style as the other footer links. Nothing is added when none is set.
function placeSocialLinks(html, settings, lang) {
  const profiles = resolveSeoSettings(settings).social;
  if (!profiles.length) return html;
  const label = lang === 'en' ? 'Social media' : 'Sosyal medya';
  const list = `<ul class="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="${label}">${profiles.map(item => `<li><a href="${escAttr(item.url)}" target="_blank" rel="me noopener noreferrer" class="hover:text-[#fb923c] transition">${escapeText(item.label)}</a></li>`).join('')}</ul>`;
  const start = html.indexOf('<!-- FOOTER START -->');
  if (start < 0) return html;
  const pattern = /<p class="text-sm leading-relaxed text-slate-400">[\s\S]*?<\/p>/;
  const tail = html.slice(start).replace(pattern, match => match + list);
  return html.slice(0, start) + tail;
}

// ---------- Head orchestration ----------
function headTags(meta, {alternates, settings, verification}) {
  const s = resolveSeoSettings(settings);
  const tags = [`<title>${escapeText(meta.title)}</title>`];
  const add = (kind, key, value) => { if (value !== undefined && value !== null && String(value) !== '') tags.push(`<meta ${kind}="${key}" content="${escAttr(value)}">`); };
  add('name', 'description', meta.description);
  add('name', 'robots', meta.robots);
  if (verification) {
    add('name', 'google-site-verification', s.verification.google);
    add('name', 'msvalidate.01', s.verification.bing);
  }
  if (meta.canonical) tags.push(`<link rel="canonical" href="${escAttr(meta.canonical)}">`);
  for (const [lang, href] of Object.entries(alternates)) tags.push(`<link rel="alternate" hreflang="${lang}" href="${escAttr(href)}">`);
  add('property', 'og:type', meta.ogType);
  add('property', 'og:site_name', s.siteName);
  add('property', 'og:locale', OG_LOCALES[meta.lang]);
  for (const lang of Object.keys(alternates)) if (lang !== meta.lang && OG_LOCALES[lang]) add('property', 'og:locale:alternate', OG_LOCALES[lang]);
  if (meta.canonical) add('property', 'og:url', meta.canonical);
  add('property', 'og:title', meta.shareTitle || meta.title);
  add('property', 'og:description', meta.shareDescription || meta.description);
  if (meta.image?.url) {
    add('property', 'og:image', meta.image.url);
    if (meta.image.width && meta.image.height) { add('property', 'og:image:width', meta.image.width); add('property', 'og:image:height', meta.image.height); }
    add('property', 'og:image:alt', meta.imageAlt);
  }
  if (meta.article) {
    if (meta.article.published) add('property', 'article:published_time', meta.article.published);
    if (meta.article.modified) add('property', 'article:modified_time', meta.article.modified);
    if (meta.article.section) add('property', 'article:section', meta.article.section);
  }
  add('name', 'twitter:card', meta.image?.url ? 'summary_large_image' : 'summary');
  add('name', 'twitter:site', xHandle(s.social.find(item => item.id === 'x')?.url));
  add('name', 'twitter:title', meta.shareTitle || meta.title);
  add('name', 'twitter:description', meta.shareDescription || meta.description);
  if (meta.image?.url) { add('name', 'twitter:image', meta.image.url); add('name', 'twitter:image:alt', meta.imageAlt); }
  return tags.join('\n');
}

/**
 * context: {route, data, product?, post?, category?, notFound?}
 * data: the same content snapshot the renderer used (published, or drafts in admin preview).
 * Returns {html, meta} — meta is what analytics and the admin checks read.
 */
export function applySeoHead(html, {route, data = {}, product = null, post = null, category = '', notFound = false}) {
  const origin = siteOrigin();
  const settings = effectiveSettings(data.settings || {});
  const staticHead = readHead(html);
  const lang = post ? (post.lang === 'en' ? 'en' : 'tr') : route.startsWith('en/') ? 'en' : 'tr';
  let meta, alternates = {}, breadcrumb = null, entityNode = null, kind = 'page';
  if (product && !notFound) {
    kind = 'product';
    meta = productMetadata(product, lang, {origin, settings});
    alternates = productAlternates(product, settings);
    breadcrumb = productBreadcrumb(product, lang, origin);
    entityNode = productNode(product, meta, settings, origin);
  } else if (post && !notFound) {
    kind = 'post';
    meta = postMetadata(post, {origin, settings, category});
    alternates = postAlternates(post, data, settings);
    breadcrumb = postBreadcrumb(post, origin);
    entityNode = articleNode(post, meta, settings, origin);
  } else {
    meta = pageMetadata(route, notFound ? {} : data.pages?.[route]?.__seo, staticHead, {origin, settings});
    if (notFound || INTERNAL_ROUTE.test(route)) {
      meta = {...meta, robots: 'noindex, follow', indexable: false, ...(notFound || /404\.html$/.test(route) ? {canonical: ''} : {})};
      kind = notFound || /404\.html$/.test(route) ? 'notFound' : 'page';
    } else alternates = meta.indexable && !meta.canonicalIsCustom ? pageAlternates(route, data, settings) : {};
  }
  if (!meta.indexable) alternates = {};

  const managed = new Set(MANAGED_TYPES);
  if (kind === 'product') managed.add('Product');
  const headEnd = html.search(/<\/head>/i);
  if (headEnd < 0) return {html, meta: {...meta, kind}};
  let head = html.slice(0, headEnd), rest = html.slice(headEnd);
  head = head
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta\b[^>]*>\s*/gi, tag => MANAGED_META.test(attr(tag, 'name') || attr(tag, 'property') || '') ? '' : tag)
    .replace(/<link\b[^>]*>\s*/gi, tag => {
      const rel = (attr(tag, 'rel') || '').toLowerCase();
      return rel === 'canonical' || (rel === 'alternate' && attr(tag, 'hreflang')) ? '' : tag;
    })
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>\s*/gi, (block, json) => filterStaticJsonLd(block, json, managed, origin));
  const block = headTags(meta, {alternates, settings, verification: true}) + '\n';
  const viewport = head.match(/<meta\b[^>]*name=["']viewport["'][^>]*>\s*/i);
  if (viewport) head = head.slice(0, viewport.index + viewport[0].length) + block + head.slice(viewport.index + viewport[0].length);
  else head = head.replace(/<head\b[^>]*>(\s*<base\b[^>]*>)?/i, match => match + '\n' + block);
  const graph = [websiteNode(settings, origin, lang), organizationNode(settings, origin)];
  if (breadcrumb && meta.canonical) graph.push(breadcrumbNode(breadcrumb, meta.canonical));
  if (entityNode && meta.canonical) graph.push(entityNode);
  head += jsonLdScript(graph) + '\n';
  let next = (head + rest).replace(/<html\b([^>]*)\blang=["'][^"']*["']/i, `<html$1lang="${lang}"`);
  if (breadcrumb) next = placeBreadcrumb(next, kind, breadcrumb);
  next = placeSocialLinks(next, settings, lang);
  return {html: next, meta: {...meta, kind}};
}

// ---------- Sitemap / robots / redirects ----------
function escapeXml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }

export function sitemapEntries(data, routes) {
  const origin = siteOrigin();
  const settings = effectiveSettings(data.settings || {});
  if (!resolveSeoSettings(settings).indexing) return [];
  const entries = [];
  const posts = data.posts || [];
  for (const route of routes) {
    if (INTERNAL_ROUTE.test(route) || managedPostForRoute(route, posts)) continue;
    if (!pageIsIndexable(route, data, settings)) continue;
    entries.push({loc: `${origin}/${route}`, alternates: pageAlternates(route, data, settings)});
  }
  for (const post of posts) {
    if (!postIsIndexable(post, settings)) continue;
    const route = `${post.lang === 'en' ? 'en' : 'tr'}/blog/${post.slug}.html`;
    if (post.legacy === true ? !fileExists(post.legacyPath || route) : false) continue;
    entries.push({loc: postUrl(post, origin), lastmod: String(post.updatedAt || post.date || '').slice(0, 10), alternates: postAlternates(post, data, settings)});
  }
  for (const product of data.products || []) {
    const meta = isPublicProduct(product) ? productMetadata(product, 'tr', {origin, settings}) : null;
    if (!meta?.indexable) continue;
    const alternates = productAlternates(product, settings);
    for (const lang of ['tr', 'en']) entries.push({loc: productDetailUrl(product, lang, origin), lastmod: String(product.updatedAt || '').slice(0, 10), alternates});
  }
  return entries;
}

export function renderSitemap(entries) {
  const urls = entries.map(entry => {
    const links = Object.entries(entry.alternates || {}).map(([lang, href]) => `\n    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(href)}"/>`).join('');
    const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod || '') ? `\n    <lastmod>${entry.lastmod}</lastmod>` : '';
    return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmod}${links}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

export function renderRobots(settings = {}) {
  const origin = siteOrigin();
  if (!resolveSeoSettings(effectiveSettings(settings)).indexing) return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '# Prototip form denemeleri - canliya cikmadan once klasor kaldirilacak',
    'Disallow: /prototip-formlar/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    ''
  ].join('\n');
}

export function normalizeRedirectPath(value) {
  let pathname = String(value || '').trim();
  try { pathname = decodeURI(new URL(pathname, 'http://local').pathname); } catch { return ''; }
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname;
}

// Manual redirects (admin) first, then old slugs recorded when a post was renamed.
export function resolveRedirect(pathname, data) {
  const current = normalizeRedirectPath(pathname);
  const rules = Array.isArray(data.settings?.redirects) ? data.settings.redirects : [];
  const rule = rules.find(item => item && item.active !== false && normalizeRedirectPath(item.from) === current)
    || rules.find(item => item && item.active !== false && normalizeRedirectPath(item.from).toLowerCase() === current.toLowerCase());
  if (rule) return {location: String(rule.to), status: Number(rule.status) === 302 ? 302 : 301};
  const match = current.match(/^\/(tr|en)\/blog\/([^/]+)\.html$/);
  if (match) {
    const posts = data.posts || [];
    const live = posts.find(post => (post.lang || 'tr') === match[1] && post.slug === match[2]);
    const renamed = !live && posts.find(post => (post.lang || 'tr') === match[1] && post.published !== false && Array.isArray(post.previousSlugs) && post.previousSlugs.includes(match[2]));
    if (renamed) return {location: pathOf(postUrl(renamed, siteOrigin())), status: 301};
  }
  return null;
}

// urun-detay.html?id=<code|id|old-slug> → one canonical ?id=<slug> URL.
export function productRedirect(key, products, lang) {
  if (!key) return null;
  const product = findProduct(products, key) || (products || []).find(item => Array.isArray(item.previousSlugs) && item.previousSlugs.includes(key));
  if (!product || !isPublicProduct(product) || product.slug === key || !product.slug) return null;
  return {location: pathOf(productDetailUrl(product, lang, siteOrigin())), status: 301};
}
