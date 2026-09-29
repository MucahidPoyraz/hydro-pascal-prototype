// Checks the HTML the public renderer really sends (not the admin form state).
// Used by the admin "SEO kontrolü" screen (/api/seo?action=audit) and by the tests.
import {allHtmlPages, getLegacyPage, scanPages} from './content.js';
import {readHead, siteOrigin, sitemapEntries} from './seo.js';
import {isPublicProduct} from './seo-model.js';

const INTERNAL = /(?:^|\/)(?:404\.html|blog\/blog-post-template\.html|urun-detay\.html)$/;

function count(html, pattern) { return (html.match(pattern) || []).length; }

export function inspectHtml(html) {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd >= 0 ? html.slice(0, headEnd) : html;
  const info = readHead(html);
  const jsonLd = [];
  let jsonLdErrors = 0;
  for (const match of head.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      for (const node of Array.isArray(data['@graph']) ? data['@graph'] : [data]) jsonLd.push(...[].concat(node['@type']));
    } catch { jsonLdErrors++; }
  }
  const main = (html.match(/<main\b[\s\S]*?<\/main>/i) || [''])[0];
  const images = main.match(/<img\b[^>]*>/gi) || [];
  const missingAlt = images.filter(tag => !/\salt=["'][^"']+["']/i.test(tag) && !/\s:alt=/i.test(tag)).length;
  return {
    ...info,
    lang: (html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i) || [])[1] || '',
    counts: {
      title: count(head, /<title>/gi), description: count(head, /<meta\s+name=["']description["']/gi),
      robots: count(head, /<meta\s+name=["']robots["']/gi), canonical: count(head, /<link\s+rel=["']canonical["']/gi),
      ogTitle: count(head, /property=["']og:title["']/gi), ogImage: count(head, /property=["']og:image["']/gi),
      analyticsScript: count(html, /\/assets\/js\/hp-analytics\.js/g), gtm: count(html, /googletagmanager\.com\/gtm\.js/g)
    },
    jsonLd, jsonLdErrors, missingAlt, images: images.length
  };
}

function checksFor(url, page, {indexableExpected, inSitemap}) {
  const checks = [];
  const add = (level, label) => checks.push({level, label});
  const {counts} = page;
  if (counts.title !== 1) add('fail', `${counts.title} adet <title>`);
  else if (!page.title) add('fail', 'Başlık boş'); else add('ok', 'Başlık');
  if (counts.description !== 1 || !page.description) add('fail', 'Açıklama eksik veya tekrarlı'); else add('ok', 'Açıklama');
  if (counts.robots !== 1) add('fail', 'robots etiketi eksik veya tekrarlı');
  if (counts.canonical > 1) add('fail', 'Birden fazla canonical');
  const indexable = !page.noindex;
  if (indexable) {
    if (page.canonical !== url) add('fail', `Canonical farklı: ${page.canonical || '(yok)'}`); else add('ok', 'Canonical');
    if (!inSitemap) add('warn', 'İndekslenebilir ama site haritasında değil');
    if (!page.image) add('fail', 'og:image yok'); else add('ok', 'Paylaşım görseli');
  } else {
    add(indexableExpected ? 'warn' : 'ok', 'noindex');
    if (inSitemap) add('fail', 'noindex sayfa site haritasında');
  }
  if (page.jsonLdErrors) add('fail', `${page.jsonLdErrors} JSON-LD bloğu okunamıyor`);
  const dup = ['Organization', 'WebSite', 'Product', 'Article', 'BreadcrumbList'].filter(type => page.jsonLd.filter(item => item === type).length > 1);
  if (dup.length) add('fail', `Tekrarlanan şema: ${dup.join(', ')}`); else add('ok', `Şema: ${[...new Set(page.jsonLd)].join(', ') || '—'}`);
  if (page.missingAlt) add('warn', `${page.missingAlt} görselde alt metin yok`);
  return checks;
}

export function auditSite() {
  const origin = siteOrigin();
  const data = scanPages({includeDrafts: false});
  const sitemap = new Set(sitemapEntries({...data, pages: data.publishedPages || {}}, allHtmlPages()).map(entry => entry.loc));
  const targets = [];
  const managedLegacy = new Set((data.posts || []).filter(post => post.legacy === true).map(post => post.legacyPath));
  for (const route of allHtmlPages()) if (!INTERNAL.test(route)) targets.push({route, id: '', url: `${origin}/${route}`, kind: route.includes('/blog/') && !route.endsWith('index.html') ? 'post' : 'page'});
  for (const post of data.posts || []) if (post.legacy !== true && post.published !== false) targets.push({route: `${post.lang === 'en' ? 'en' : 'tr'}/blog/${post.slug}.html`, id: '', url: `${origin}/${post.lang === 'en' ? 'en' : 'tr'}/blog/${encodeURIComponent(post.slug)}.html`, kind: 'post'});
  for (const product of data.products || []) if (isPublicProduct(product)) for (const lang of ['tr', 'en']) targets.push({route: `${lang}/urun-detay.html`, id: product.slug, url: `${origin}/${lang}/urun-detay.html?id=${encodeURIComponent(product.slug)}`, kind: 'product', name: product.name});
  const rows = [];
  const alternates = new Map();
  for (const target of targets) {
    const html = getLegacyPage(target.route, target.id, false, {});
    if (!html) {
      const unpublishedLegacy = managedLegacy.has(target.route);
      rows.push({...target, status: 404, checks: [{level: unpublishedLegacy ? 'ok' : 'fail', label: unpublishedLegacy ? 'Yayında değil (404)' : 'Sayfa açılmıyor (404)'}]});
      continue;
    }
    const page = inspectHtml(html);
    alternates.set(target.url, page.noindex ? {} : page.alternates);
    rows.push({...target, status: 200, title: page.title, description: page.description, canonical: page.canonical, robots: page.robots, image: page.image, hreflang: Object.keys(page.alternates), schema: [...new Set(page.jsonLd)], inSitemap: sitemap.has(target.url), analytics: page.counts.analyticsScript, checks: checksFor(target.url, page, {indexableExpected: target.kind !== 'page' || sitemap.has(target.url), inSitemap: sitemap.has(target.url)})});
  }
  // hreflang must be reciprocal: every alternate lists the page back.
  for (const row of rows) {
    const own = alternates.get(row.url);
    if (!own) continue;
    for (const [lang, href] of Object.entries(own)) {
      if (lang === 'x-default' || href === row.url) continue;
      const back = alternates.get(href);
      if (!back || !Object.values(back).includes(row.url)) row.checks.push({level: 'fail', label: `hreflang karşılıksız: ${lang} → ${href}`});
    }
  }
  const summary = {pages: rows.length, fail: rows.filter(row => row.checks.some(item => item.level === 'fail')).length, warn: rows.filter(row => row.checks.some(item => item.level === 'warn')).length, sitemap: sitemap.size};
  return {origin, generatedAt: new Date().toISOString(), summary, rows};
}
