// SEO + measurement acceptance (server side), against a throwaway copy of the real CMS data.
// Checks the HTML the public route actually returns: head metadata, JSON-LD, hreflang,
// sitemap, robots, redirects, 404s, admin SEO fields → public output, analytics injection.
// Run: node --test seo-analytics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cms = path.resolve(here, '../cms');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-seo-'));
const realData = path.join(cms, 'data/content.json');
fs.copyFileSync(fs.existsSync(realData) ? realData : path.join(cms, 'data/content.json'), path.join(temp, 'content.json'));
process.env.CMS_DATA_DIR = temp;
process.chdir(cms);
const ENV_KEYS = ['SITE_URL', 'ANALYTICS_ENABLED', 'ANALYTICS_DEBUG', 'SEARCH_INDEXING', 'GA4_MEASUREMENT_ID', 'GTM_CONTAINER_ID', 'META_PIXEL_ID', 'GOOGLE_SITE_VERIFICATION'];
for (const key of ENV_KEYS) delete process.env[key];

const load = file => import(pathToFileURL(path.join(cms, file)).href);
const {getLegacyPage, readContent, writeContent, allHtmlPages} = await load('app/lib/content.js');
const {GET: publicGet} = await load('app/[...legacy]/route.js');
const {GET: sitemapGet} = await load('app/sitemap.xml/route.js');
const {GET: robotsGet} = await load('app/robots.txt/route.js');
const {inspectHtml, auditSite} = await load('app/lib/seo-audit.js');
const {validateSeoSettings, validatePageSeo, validateRecordSeo} = await load('app/lib/seo-validation.js');
const ORIGIN = 'https://www.hydropascal.com.tr';

const base = readContent();
const reset = () => writeContent(JSON.parse(JSON.stringify(base)));
const mutate = fn => { const data = readContent(); fn(data); writeContent(data); };
const request = url => publicGet(new Request(ORIGIN + url), {params: Promise.resolve({legacy: new URL(ORIGIN + url).pathname.split('/').filter(Boolean)})});
const graphOf = html => {
  const block = html.match(/<script type="application\/ld\+json" data-hp-seo="graph">([\s\S]*?)<\/script>/);
  return block ? JSON.parse(block[1])['@graph'] : [];
};
const meta = (html, key) => (html.match(new RegExp(`<meta (?:name|property)="${key.replace(/[.:]/g, m => '\\' + m)}" content="([^"]*)"`)) || [])[1];
const product = () => base.products.find(item => item.type === 'hydraulic' && item.active !== false && item.slug);

test.after(() => { for (const key of ENV_KEYS) delete process.env[key]; fs.rmSync(temp, {recursive: true, force: true}); });

test('every public page: one title/description/robots/canonical, valid JSON-LD, correct lang, no tracking by default', () => {
  reset();
  for (const route of allHtmlPages().filter(item => !/(404|blog-post-template|urun-detay)\.html$/.test(item))) {
    const html = getLegacyPage(route, '', false, {});
    if (!html) continue; // unpublished legacy posts
    const page = inspectHtml(html);
    assert.equal(page.counts.title, 1, route + ' title');
    assert.equal(page.counts.description, 1, route + ' description');
    assert.equal(page.counts.robots, 1, route + ' robots');
    assert.ok(page.counts.canonical <= 1, route + ' canonical');
    assert.equal(page.jsonLdErrors, 0, route + ' json-ld parse');
    for (const type of ['Organization', 'WebSite', 'Article', 'BreadcrumbList', 'Product']) assert.ok(page.jsonLd.filter(item => item === type).length <= 1, `${route} duplicate ${type}`);
    assert.equal(page.lang, route.slice(0, 2), route + ' html lang');
    if (!page.noindex) { assert.equal(page.canonical, `${ORIGIN}/${route}`, route + ' canonical'); assert.equal(meta(html, 'og:url'), page.canonical, route + ' og:url'); }
    assert.equal(page.counts.analyticsScript, 0, route + ' no analytics without configuration');
  }
});

test('full-site audit on real rendered HTML reports no failures and reciprocal hreflang', () => {
  reset();
  const result = auditSite();
  const failures = result.rows.filter(row => row.checks.some(check => check.level === 'fail')).map(row => row.url + ': ' + row.checks.filter(c => c.level === 'fail').map(c => c.label).join(', '));
  assert.deepEqual(failures, []);
  assert.ok(result.summary.pages > 150);
});

test('product page: server-rendered title/meta/canonical/OG, Product + BreadcrumbList from real data, no invented price', async () => {
  reset();
  const item = product();
  const response = await request(`/en/urun-detay.html?id=${item.slug}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const name = item.detailTitleEn || item.nameEn || item.name;
  assert.match(html, new RegExp(`<title>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| HydroPascal</title>`));
  assert.equal(inspectHtml(html).canonical, `${ORIGIN}/en/urun-detay.html?id=${item.slug}`);
  assert.equal(meta(html, 'og:type'), 'product');
  assert.ok(meta(html, 'og:image').startsWith(ORIGIN + '/'));
  const graph = graphOf(html);
  const node = graph.find(entry => entry['@type'] === 'Product');
  assert.equal(node.sku, item.code);
  assert.equal(node.url, `${ORIGIN}/en/urun-detay.html?id=${item.slug}`);
  assert.equal('offers' in node || 'aggregateRating' in node || 'review' in node, false, 'no fabricated offers/ratings');
  assert.doesNotMatch(JSON.stringify(graph), /"price"/);
  const crumbs = graph.find(entry => entry['@type'] === 'BreadcrumbList').itemListElement.map(entry => entry.name);
  assert.deepEqual(crumbs, ['Home', 'Hydraulic Products', name]);
  assert.match(html, /<nav aria-label="Breadcrumb"[^>]*>[\s\S]*?Hydraulic Products[\s\S]*?<\/nav>/, 'visible breadcrumb matches schema (EN page had none before)');
  assert.match(html, new RegExp(`href="/tr/urun-detay\\.html\\?id=${item.slug}"`), 'language switch keeps the product');
  assert.match(html, new RegExp(`hreflang="tr" href="${ORIGIN}/tr/urun-detay\\.html\\?id=${item.slug}"`));
});

test('product: admin SEO fields reach public HTML; noindex removes it from sitemap and hreflang', async () => {
  reset();
  const item = product();
  mutate(data => { const row = data.products.find(p => p.id === item.id); Object.assign(row, {seoTitle: 'Özel SEO Başlığı', seoDescription: 'Özel açıklama & test', seoImage: '/assets/images/HPL-2.webp'}); });
  let html = await (await request(`/tr/urun-detay.html?id=${item.slug}`)).text();
  assert.match(html, /<title>Özel SEO Başlığı \| HydroPascal<\/title>/);
  assert.equal(meta(html, 'description'), 'Özel açıklama &amp; test');
  assert.equal(meta(html, 'og:image'), `${ORIGIN}/assets/images/HPL-2.webp`);
  assert.equal(meta(html, 'twitter:image'), `${ORIGIN}/assets/images/HPL-2.webp`);
  mutate(data => { data.products.find(p => p.id === item.id).seoTitle = 'Ölçü <Ø110> & Pim'; });
  html = await (await request(`/tr/urun-detay.html?id=${item.slug}`)).text();
  assert.ok(html.includes('<title>Ölçü &lt;Ø110&gt; &amp; Pim | HydroPascal</title>'), 'user text is escaped, never stripped as a tag');
  mutate(data => { data.products.find(p => p.id === item.id).seoIndex = false; });
  html = await (await request(`/tr/urun-detay.html?id=${item.slug}`)).text();
  assert.equal(meta(html, 'robots'), 'noindex, follow');
  assert.doesNotMatch(html, /hreflang=/);
  const sitemap = await (await sitemapGet()).text();
  assert.doesNotMatch(sitemap, new RegExp(`id=${item.slug}<`));
});

test('product URLs: bare template and unknown id are real 404s; id/code/old slug 301 to the canonical slug', async () => {
  reset();
  const item = product();
  let response = await request('/tr/urun-detay.html');
  assert.equal(response.status, 404);
  assert.match(await response.text(), /noindex/);
  assert.equal((await request('/tr/urun-detay.html?id=yok-boyle-urun')).status, 404);
  response = await request(`/tr/urun-detay.html?id=${encodeURIComponent(item.id)}`);
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), `${ORIGIN}/tr/urun-detay.html?id=${item.slug}`);
  mutate(data => { data.products.find(p => p.id === item.id).previousSlugs = ['eski-urun-adresi']; });
  response = await request('/tr/urun-detay.html?id=eski-urun-adresi');
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), `${ORIGIN}/tr/urun-detay.html?id=${item.slug}`);
  mutate(data => { data.products.find(p => p.id === item.id).active = false; });
  assert.equal((await request(`/tr/urun-detay.html?id=${item.slug}`)).status, 404, 'unpublished product is not public');
});

test('legacy blog post: Article from the model, visible breadcrumb, reciprocal hreflang; unpublishing removes it everywhere', async () => {
  reset();
  const post = base.posts.find(item => item.legacy && item.lang === 'tr' && item.published !== false);
  const route = post.legacyPath;
  let html = await (await request('/' + route)).text();
  const article = graphOf(html).find(entry => entry['@type'] === 'Article');
  assert.equal(article.headline, post.title.slice(0, 110));
  assert.equal(article.datePublished, post.date);
  assert.equal(article.mainEntityOfPage, `${ORIGIN}/${route}`);
  assert.equal((html.match(/"@type":\s*"Article"/g) || []).length, 1, 'static Article replaced, not duplicated');
  assert.match(html, /<nav aria-label="Breadcrumb" class="mb-6 text-sm text-slate-400">/);
  const enHref = (html.match(/hreflang="en" href="([^"]+)"/) || [])[1];
  assert.ok(enHref, 'has EN alternate');
  const enHtml = await (await request(new URL(enHref).pathname)).text();
  assert.match(enHtml, new RegExp(`hreflang="tr" href="${ORIGIN}/${route}"`), 'EN points back');
  mutate(data => { const row = data.posts.find(p => p.id === post.id); Object.assign(row, {seoTitle: 'Yeni SEO', seoDescription: 'Yeni açıklama', ogImage: '/assets/images/HPL-3.webp', updatedAt: '2026-09-27T10:00:00.000Z'}); });
  html = await (await request('/' + route)).text();
  assert.match(html, /<title>Yeni SEO \| HydroPascal Blog<\/title>/);
  assert.equal(meta(html, 'og:image'), `${ORIGIN}/assets/images/HPL-3.webp`);
  assert.equal(graphOf(html).find(entry => entry['@type'] === 'Article').dateModified, '2026-09-27');
  mutate(data => { data.posts.find(p => p.id === post.id).published = false; });
  assert.equal((await request('/' + route)).status, 404);
  const sitemap = await (await sitemapGet()).text();
  assert.doesNotMatch(sitemap, new RegExp(route.replace(/[.]/g, '\\.')));
  const enAfter = await (await request(new URL(enHref).pathname)).text();
  assert.doesNotMatch(enAfter, /hreflang="tr"/, 'counterpart drops the hreflang to the unpublished post');
});

test('new blog post: translation link produces hreflang pair; renamed slug 301s', async () => {
  reset();
  mutate(data => {
    data.posts.push({id: 'seo-tr', lang: 'tr', slug: 'seo-test-yazisi', title: 'SEO test yazısı', excerpt: 'Kısa özet', content: '<p>Gövde</p>', category: 'Mühendislik', date: '2026-09-01', published: true, translationId: 'seo-en', previousSlugs: ['eski-seo-yazisi']});
    data.posts.push({id: 'seo-en', lang: 'en', slug: 'seo-test-post', title: 'SEO test post', excerpt: 'Short summary', content: '<p>Body</p>', category: 'Engineering', date: '2026-09-01', published: true});
  });
  const tr = await (await request('/tr/blog/seo-test-yazisi.html')).text();
  assert.match(tr, new RegExp(`hreflang="en" href="${ORIGIN}/en/blog/seo-test-post.html"`));
  const en = await (await request('/en/blog/seo-test-post.html')).text();
  assert.match(en, new RegExp(`hreflang="tr" href="${ORIGIN}/tr/blog/seo-test-yazisi.html"`), 'reverse relation resolved');
  assert.equal(inspectHtml(en).canonical, `${ORIGIN}/en/blog/seo-test-post.html`);
  assert.equal(graphOf(tr).find(entry => entry['@type'] === 'Article').headline, 'SEO test yazısı');
  const moved = await request('/tr/blog/eski-seo-yazisi.html');
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('location'), `${ORIGIN}/tr/blog/seo-test-yazisi.html`);
  mutate(data => { data.posts.find(p => p.id === 'seo-tr').published = false; });
  const sitemap = await (await sitemapGet()).text();
  assert.doesNotMatch(sitemap, /seo-test-yazisi/, 'draft is not in the sitemap');
  assert.match(sitemap, /seo-test-post/);
});

test('static page SEO override (published page content) reaches the public head; noindex drops sitemap + counterpart hreflang', async () => {
  reset();
  mutate(data => { data.pages['tr/about-us.html'] = {...(data.pages['tr/about-us.html'] || {}), __seo: {title: 'Biz Kimiz', description: 'Özel sayfa açıklaması', ogImage: '/assets/images/fabrika.webp'}}; });
  let html = await (await request('/tr/about-us.html')).text();
  assert.match(html, /<title>Biz Kimiz \| HydroPascal<\/title>/);
  assert.equal(meta(html, 'description'), 'Özel sayfa açıklaması');
  assert.equal(meta(html, 'og:image'), `${ORIGIN}/assets/images/fabrika.webp`);
  mutate(data => { data.pages['tr/about-us.html'].__seo.noindex = true; });
  html = await (await request('/tr/about-us.html')).text();
  assert.equal(meta(html, 'robots'), 'noindex, follow');
  const en = await (await request('/en/about-us.html')).text();
  assert.doesNotMatch(en, /hreflang="tr"/);
  const sitemap = await (await sitemapGet()).text();
  assert.doesNotMatch(sitemap, /\/tr\/about-us\.html</);
  assert.match(sitemap, /\/en\/about-us\.html</);
  // a draft override is visible only in the signed-in preview
  mutate(data => { data.pages['tr/about-us.html'].__seo = {}; data.pageDrafts = {'tr/about-us.html': {__seo: {title: 'Taslak başlık'}}}; });
  assert.doesNotMatch(await (await request('/tr/about-us.html')).text(), /Taslak başlık/);
  assert.match(getLegacyPage('tr/about-us.html', '', true, {}), /<title>Taslak başlık \| HydroPascal<\/title>/);
});

test('sitemap: every URL is canonical + indexable, alternates reciprocal, internal/noindex pages excluded', async () => {
  reset();
  const xml = await (await sitemapGet()).text();
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => ({loc: match[1].match(/<loc>([^<]+)<\/loc>/)[1].replace(/&amp;/g, '&'), alternates: Object.fromEntries([...match[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map(m => [m[1], m[2].replace(/&amp;/g, '&')]))}));
  assert.ok(entries.length > 150);
  const locs = new Set(entries.map(entry => entry.loc));
  assert.equal(locs.size, entries.length, 'no duplicate loc');
  for (const bad of ['/tr/404.html', '/tr/urun-detay.html<', 'blog-post-template', '/tr/privacy-policy.html']) assert.doesNotMatch(xml, new RegExp(bad.replace(/[.]/g, '\\.')));
  for (const entry of entries) for (const [lang, href] of Object.entries(entry.alternates)) if (lang !== 'x-default' && href !== entry.loc) assert.ok(locs.has(href), `${entry.loc} alternate ${href} must be in sitemap`);
  for (const entry of entries.filter((_, index) => index % 9 === 0)) {
    const response = await request(entry.loc.replace(ORIGIN, ''));
    assert.equal(response.status, 200, entry.loc);
    const page = inspectHtml(await response.text());
    assert.equal(page.canonical, entry.loc);
    assert.equal(page.noindex, false);
  }
});

test('robots.txt and SITE_URL / SEARCH_INDEXING deployment switches', async () => {
  reset();
  let robots = await (await robotsGet()).text();
  assert.match(robots, /^Disallow: \/admin$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/www\.hydropascal\.com\.tr\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /^Disallow: \/$/m);
  process.env.SITE_URL = 'https://staging.example.com';
  const html = getLegacyPage('tr/kataloglar.html', '', false, {});
  assert.equal(inspectHtml(html).canonical, 'https://staging.example.com/tr/kataloglar.html');
  assert.doesNotMatch(html.slice(0, html.indexOf('</head>')), /www\.hydropascal\.com\.tr/, 'no production host leaks into a staging head');
  process.env.SEARCH_INDEXING = 'false';
  robots = await (await robotsGet()).text();
  assert.match(robots, /^Disallow: \/$/m);
  assert.equal(meta(getLegacyPage('tr/index.html', '', false, {}), 'robots'), 'noindex, follow');
  assert.doesNotMatch(await (await sitemapGet()).text(), /<url>/);
  delete process.env.SITE_URL; delete process.env.SEARCH_INDEXING;
});

test('404s, directory URLs and manual redirects', async () => {
  reset();
  let response = await request('/tr/olmayan-sayfa.html');
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /Sayfa Bulunamadı/);
  assert.equal(meta(html, 'robots'), 'noindex, follow');
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.equal((await request('/en/nothing-here')).status, 404);
  assert.equal((await request('/tr/blog/blog-post-template.html')).status, 404);
  response = await request('/tr');
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), `${ORIGIN}/tr/index.html`);
  mutate(data => { data.settings.redirects = [{id: 'r1', from: '/hidrolik-silindir/', to: '/tr/hpl-products.html', status: 301, active: true}]; });
  response = await request('/hidrolik-silindir');
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), `${ORIGIN}/tr/hpl-products.html`);
});

test('Organization / WebSite schema and social profiles come from settings only', async () => {
  reset();
  let html = getLegacyPage('tr/index.html', '', false, {});
  let org = graphOf(html).find(entry => entry['@type'] === 'Organization');
  assert.equal(org.sameAs, undefined, 'no social profiles are invented');
  assert.doesNotMatch(html, /aria-label="Sosyal medya"/);
  assert.equal(graphOf(html).filter(entry => entry['@type'] === 'Organization').length, 1);
  mutate(data => { data.settings.social = {linkedin: 'https://www.linkedin.com/company/hydropascal', x: 'https://x.com/hydropascal'}; });
  html = getLegacyPage('en/index.html', '', false, {});
  org = graphOf(html).find(entry => entry['@type'] === 'Organization');
  assert.deepEqual(org.sameAs, ['https://www.linkedin.com/company/hydropascal', 'https://x.com/hydropascal']);
  assert.equal(meta(html, 'twitter:site'), '@hydropascal');
  assert.match(html, /aria-label="Social media"><li><a href="https:\/\/www\.linkedin\.com\/company\/hydropascal"/);
  mutate(data => { data.settings.seo = {googleVerification: 'abcDEF1234567890xyz'}; });
  assert.equal(meta(getLegacyPage('tr/index.html', '', false, {}), 'google-site-verification'), 'abcDEF1234567890xyz');
});

test('analytics: dev default off, one strategy only, consent banner, never in preview, env locks', () => {
  reset();
  mutate(data => { data.settings.analytics = {mode: 'gtag', ga4: 'G-TEST12345', metaPixel: '123456789012', consentRequired: true}; });
  assert.doesNotMatch(getLegacyPage('tr/index.html', '', false, {}), /hp-analytics\.js/, 'NODE_ENV is not production → no tags');
  process.env.ANALYTICS_ENABLED = 'true';
  const item = product();
  let html = getLegacyPage('tr/urun-detay.html', item.slug, false, {});
  assert.equal((html.match(/\/assets\/js\/hp-analytics\.js/g) || []).length, 1);
  const config = JSON.parse(html.match(/window\.hpAnalyticsConfig=(\{[\s\S]*?\});<\/script>/)[1]);
  assert.deepEqual(config.google, {type: 'gtag', ga4: 'G-TEST12345', ads: '', adsLeadLabel: ''});
  assert.equal(config.meta, '123456789012');
  assert.equal(config.pageType, 'product');
  assert.equal(config.pageEvent.name, 'product_view');
  assert.equal(config.pageEvent.params.product_id, item.slug);
  assert.match(html, /id="hp-consent"[^>]*hidden/);
  assert.match(html, /data-hp-consent-open/);
  assert.doesNotMatch(html, /googletagmanager\.com|connect\.facebook\.net/, 'vendor scripts are requested by the runtime only after consent');
  assert.doesNotMatch(getLegacyPage('tr/index.html', '', true, {}), /hp-analytics\.js/, 'admin preview never loads tracking');
  assert.doesNotMatch(getLegacyPage('tr/index.html', '', true, {preview: true}), /hp-analytics\.js/, 'editor iframe never loads tracking');
  mutate(data => { data.settings.analytics = {mode: 'gtm', gtm: 'GTM-ABC1234', ga4: 'G-TEST12345', metaPixel: '123456789012'}; });
  html = getLegacyPage('tr/index.html', '', false, {});
  const gtm = JSON.parse(html.match(/window\.hpAnalyticsConfig=(\{[\s\S]*?\});<\/script>/)[1]);
  assert.deepEqual(gtm.google, {type: 'gtm', id: 'GTM-ABC1234'}, 'GTM mode: GA4 is not loaded directly as well');
  assert.equal(gtm.meta, '', 'GTM mode: Meta belongs inside the container');
  process.env.GTM_CONTAINER_ID = 'GTM-ENV9999';
  mutate(data => { data.settings.analytics = {mode: 'gtag', ga4: 'G-TEST12345'}; });
  const locked = JSON.parse(getLegacyPage('tr/index.html', '', false, {}).match(/window\.hpAnalyticsConfig=(\{[\s\S]*?\});<\/script>/)[1]);
  assert.deepEqual(locked.google, {type: 'gtm', id: 'GTM-ENV9999'}, 'env wins over admin');
  delete process.env.GTM_CONTAINER_ID;
  mutate(data => { data.settings.analytics = {mode: 'gtag', ga4: 'G-TEST12345', consentRequired: false}; });
  assert.doesNotMatch(getLegacyPage('tr/index.html', '', false, {}), /id="hp-consent"/);
  mutate(data => { data.settings.analytics = {mode: 'none', ga4: 'G-TEST12345'}; });
  assert.doesNotMatch(getLegacyPage('tr/index.html', '', false, {}), /hp-analytics\.js/, 'mode none loads nothing');
  delete process.env.ANALYTICS_ENABLED;
});

test('server validation rejects invalid SEO/analytics/redirect input', () => {
  assert.equal(validateSeoSettings({analytics: {mode: 'gtag', ga4: 'UA-12345-1'}}).length > 0, true);
  assert.equal(validateSeoSettings({analytics: {mode: 'both'}}).length > 0, true);
  assert.equal(validateSeoSettings({social: {linkedin: 'javascript:alert(1)'}}).length > 0, true);
  assert.equal(validateSeoSettings({social: {facebook: 'https://evil.example/page'}}).length > 0, true);
  assert.equal(validateSeoSettings({seo: {googleVerification: '<meta name="x">'}}).length > 0, true);
  assert.equal(validateSeoSettings({redirects: [{from: '/a', to: '/b'}, {from: '/b', to: '/c'}]}).length > 0, true, 'chains rejected');
  assert.equal(validateSeoSettings({redirects: [{from: '/admin', to: '/tr/index.html'}]}).length > 0, true);
  assert.equal(validateSeoSettings({redirects: [{from: '/a', to: 'javascript:alert(1)'}]}).length > 0, true);
  assert.equal(validateSeoSettings({seo: {siteName: 'HydroPascal', indexing: true}, social: {linkedin: 'https://www.linkedin.com/company/x'}, analytics: {mode: 'gtag', ga4: 'G-ABCDE12345'}, redirects: [{id: '1', from: '/eski/', to: '/tr/index.html', status: 301}]}), '');
  assert.ok(validatePageSeo({title: 'x', script: 'y'}));
  assert.ok(validatePageSeo({canonical: '/relative'}));
  assert.equal(validatePageSeo({title: 'Başlık', noindex: true, canonical: 'https://www.hydropascal.com.tr/tr/x.html'}), '');
  assert.ok(validateRecordSeo('post', {id: 'a', lang: 'tr', translationId: 'b'}, [{id: 'b', lang: 'tr'}]), 'translation must be the other language');
  assert.ok(validateRecordSeo('product', {previousSlugs: ['Bad Slug']}));
});
