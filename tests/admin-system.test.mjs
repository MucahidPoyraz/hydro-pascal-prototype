// Admin system acceptance (API level, isolated CMS_DATA_DIR):
// bulk visibility/delete, legacy-post delete safety, menu draft → publish/discard, draft preview isolation,
// blog SEO output, authorization, stale revisions, audit trail, backup retention, bulk lead status.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(path.join(root, 'cms'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-admin-system-'));
process.env.CMS_DATA_DIR = temporary;
process.env.NODE_ENV = 'development';
const token = 'local-prototype-session-rotate-before-deploy';
const {scanPages, readContent, contentRevision, getLegacyPage, updateContent, allHtmlPages} = await import('../cms/app/lib/content.js');
const {PUT: saveCms} = await import('../cms/app/api/cms/route.js');
const {POST: publish} = await import('../cms/app/api/content-publish/route.js');
const {PATCH: bulkLeads} = await import('../cms/app/api/leads/route.js');
const {GET: auditGet} = await import('../cms/app/api/audit/route.js');
const {GET: sitemapGet} = await import('../cms/app/sitemap.xml/route.js');

const cookies = {get: () => ({value: token})};
const request = (body, revision = contentRevision(readContent())) => ({cookies, headers: new Headers({'if-match': revision}), json: async () => body, url: 'http://localhost/api/audit?limit=50'});
const anonymous = body => ({cookies: {get: () => undefined}, headers: new Headers(), json: async () => body, url: 'http://localhost/api/audit'});
async function ok(response) {const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;}
const passed = [];
const check = (name, fn) => fn().then(() => passed.push(name));

try {
  await check('authorization: publish/nav/bulk-leads/audit reject anonymous requests', async () => {
    assert.equal((await publish(anonymous({type: 'navigation', mode: 'publish'}))).status, 401);
    assert.equal((await publish(anonymous({type: 'products', ids: ['x'], mode: 'delete'}))).status, 401);
    assert.equal((await bulkLeads(anonymous({ids: ['a'.repeat(20)], status: 'Kapatıldı'}))).status, 401);
    assert.equal((await auditGet(anonymous())).status, 401);
  });

  // Seed: three hydraulic products and one managed post.
  let db = scanPages();
  const seed = [1, 2, 3].map(n => ({id: 'bulk-' + n, type: 'hydraulic', name: 'Bulk Ürün ' + n, slug: 'bulk-urun-' + n, code: 'BULK-' + n, category: 'Hidrolik silindir', active: false}));
  db.products.push(...seed);
  db.posts.push({id: 'seo-post', slug: 'seo-yazisi', lang: 'tr', title: 'SEO & Başlık', excerpt: 'Özet', seoTitle: 'Özel <SEO> Başlığı', seoDescription: 'Arama açıklaması & detay', ogImage: '/assets/images/HPL-1.webp', content: '<p>Gövde</p>', published: false});
  await ok(await saveCms(request(db)));

  await check('draft preview: saved post renders for admins only, with SEO meta', async () => {
    assert.equal(getLegacyPage('tr/blog/seo-yazisi.html'), null, 'unpublished draft must 404 publicly');
    const preview = getLegacyPage('tr/blog/seo-yazisi.html', '', true);
    assert.ok(preview && preview.includes('Gövde'), 'admin preview renders the draft body');
    assert.match(preview, /<title>Özel &lt;SEO&gt; Başlığı \| HydroPascal Blog<\/title>/); // one blog title suffix for new and imported posts
    assert.match(preview, /<meta name="description" content="Arama açıklaması &amp; detay">/);
    assert.match(preview, /<meta property="og:image" content="https:\/\/www\.hydropascal\.com\.tr\/assets\/images\/HPL-1\.webp">/);
    assert.ok(!preview.includes('&amp;amp;'), 'meta values are escaped exactly once');
  });

  await check('bulk publish drafts → public catalogue + sitemap; bulk hide/show; stale revision rejected', async () => {
    const stale = contentRevision(readContent());
    const published = await ok(await publish(request({type: 'products', ids: seed.map(item => item.id), mode: 'publish'})));
    assert.equal(published.changed, 3);
    assert.ok(readContent().products.filter(item => item.id.startsWith('bulk-')).every(item => item.active === true));
    assert.ok(getLegacyPage('tr/urun-detay.html', 'bulk-urun-1'), 'published product detail renders');
    assert.ok((await (await sitemapGet()).text()).includes('id=bulk-urun-2'));
    assert.equal((await publish(request({type: 'products', ids: ['bulk-1'], mode: 'visibility', visible: false}, stale))).status, 409, 'stale revision must not overwrite');
    await ok(await publish(request({type: 'products', ids: ['bulk-1', 'bulk-2'], mode: 'visibility', visible: false})));
    assert.equal(getLegacyPage('tr/urun-detay.html', 'bulk-urun-1'), null, 'hidden product detail is gone');
    assert.ok(!(await (await sitemapGet()).text()).includes('id=bulk-urun-1'), 'hidden product leaves the sitemap');
    await ok(await publish(request({type: 'products', ids: ['bulk-1'], mode: 'visibility', visible: true})));
    assert.ok(getLegacyPage('tr/urun-detay.html', 'bulk-urun-1'));
  });

  await check('hide keeps pending draft edits unpublished', async () => {
    db = scanPages();
    db.products = db.products.map(item => item.id === 'bulk-3' ? {...item, name: 'Taslak Ad'} : item);
    await ok(await saveCms(request(db)));
    await ok(await publish(request({type: 'products', ids: ['bulk-3'], mode: 'visibility', visible: false})));
    assert.equal(readContent().products.find(item => item.id === 'bulk-3').name, 'Bulk Ürün 3', 'live record keeps its published name');
    assert.equal(readContent().contentDrafts.products['bulk-3'].name, 'Taslak Ad', 'draft edit is still pending');
    assert.equal(readContent().contentDrafts.products['bulk-3'].active, false);
    // Showing again must not smuggle the pending draft edit live (audit finding).
    await ok(await publish(request({type: 'products', ids: ['bulk-3'], mode: 'visibility', visible: true})));
    assert.equal(readContent().products.find(item => item.id === 'bulk-3').name, 'Bulk Ürün 3', 'show keeps the published name');
    assert.equal(readContent().products.find(item => item.id === 'bulk-3').active, true);
    assert.equal(readContent().contentDrafts.products['bulk-3'].name, 'Taslak Ad', 'draft edit still pending after show');
  });

  await check('robustness: malformed SEO image URL does not crash a post; lead-only writes keep content backups', async () => {
    db = scanPages();
    db.posts.push({id: 'bad-og', slug: 'bozuk-og', lang: 'tr', title: 'Bozuk OG', ogImage: 'https://exa mple.com/x.jpg', content: '<p>x</p>', published: false});
    await ok(await saveCms(request(db)));
    await ok(await publish(request({type: 'posts', ids: ['bad-og'], mode: 'publish'})));
    assert.ok(getLegacyPage('tr/blog/bozuk-og.html')?.includes('Bozuk OG'), 'post still renders');
    const backups = () => fs.readdirSync(path.join(temporary, 'backups')).length;
    const before = backups();
    await updateContent(current => ({...current, leads: [...(current.leads || []), {id: 'lead-bbbbbbbbbbbbbbbb1', name: 'x', status: 'Yeni'}]}));
    assert.equal(backups(), before, 'lead-only write creates no content backup');
  });

  await check('bulk delete removes live rows and drafts; legacy posts are only unpublished', async () => {
    await ok(await publish(request({type: 'products', ids: ['bulk-2', 'bulk-3'], mode: 'delete'})));
    assert.ok(!readContent().products.some(item => ['bulk-2', 'bulk-3'].includes(item.id)));
    assert.ok(!readContent().contentDrafts.products['bulk-3']);
    // A legacy (imported static) post must never be deleted.
    const legacyRoute = allHtmlPages().find(route => /^tr\/blog\/[^/]+\.html$/.test(route) && !/index|template/.test(route));
    const legacySlug = path.basename(legacyRoute, '.html');
    await updateContent(current => ({...current, posts: [...(current.posts || []), {id: 'legacy-x', legacy: true, legacyPath: legacyRoute, slug: legacySlug, lang: 'tr', title: 'Legacy', published: true, sourceHash: 'a'.repeat(64)}]}));
    const result = await ok(await publish(request({type: 'posts', ids: ['legacy-x'], mode: 'delete'})));
    assert.deepEqual(result.skipped, ['legacy-x']);
    const legacy = readContent().posts.find(item => item.id === 'legacy-x');
    assert.ok(legacy && legacy.published === false, 'legacy post kept and unpublished');
  });

  await check('menu draft: save stages, public unchanged, preview shows, publish applies, discard reverts', async () => {
    db = scanPages();
    const liveFirst = db.settings.navigation[0];
    db.settings.navigation = db.settings.navigation.map((item, index) => index === 0 ? {...item, label: 'Taslak Menü'} : item);
    const saved = await ok(await saveCms(request(db)));
    assert.equal(saved.hasNavigationDraft, true);
    assert.equal(scanPages().settings.navigation[0].label, 'Taslak Menü', 'admin view shows the draft');
    assert.equal(scanPages({includeDrafts: false}).settings.navigation[0].label, liveFirst.label, 'live settings untouched');
    const header = html => html.split('<!-- HEADER END -->')[0];
    assert.ok(!header(getLegacyPage('tr/index.html')).includes('Taslak Menü'), 'public header unchanged before publish');
    assert.ok(header(getLegacyPage('tr/index.html', '', true)).includes('Taslak Menü'), 'preview shows the draft');
    await ok(await publish(request({type: 'navigation', mode: 'publish'})));
    assert.ok(header(getLegacyPage('tr/index.html')).includes('Taslak Menü'), 'public header updated after publish');
    assert.equal(readContent().navigationDraft, undefined);
    assert.equal((await publish(request({type: 'navigation', mode: 'publish'}))).status, 409, 'nothing left to publish');
    db = scanPages();
    db.settings.navigation = db.settings.navigation.map((item, index) => index === 0 ? {...item, label: 'Atılacak'} : item);
    await ok(await saveCms(request(db)));
    await ok(await publish(request({type: 'navigation', mode: 'discard'})));
    assert.equal(scanPages().settings.navigation[0].label, 'Taslak Menü', 'discard reverts admin view to live');
    // Saving menus identical to live clears the draft instead of keeping a no-op draft.
    db = scanPages();
    db.settings.footerLinks = db.settings.footerLinks.map((item, index) => index === 0 ? {...item, label: 'Geçici'} : item);
    await ok(await saveCms(request(db)));
    db = scanPages();
    db.settings.footerLinks = db.settings.footerLinks.map((item, index) => index === 0 ? {...item, label: scanPages({includeDrafts: false}).settings.footerLinks[0].label} : item);
    const reverted = await ok(await saveCms(request(db)));
    assert.equal(reverted.hasNavigationDraft, false);
    // A client cannot smuggle a navigationDraft through the save payload.
    db = scanPages(); db.navigationDraft = {navigation: [{id: 'evil', parentId: '', sortOrder: 0, label: 'X', href: 'javascript:alert(1)'}]};
    await ok(await saveCms(request(db)));
    assert.equal(readContent().navigationDraft, undefined);
  });

  await check('bulk lead status is one atomic write', async () => {
    const ids = ['lead-aaaaaaaaaaaaaaaa1', 'lead-aaaaaaaaaaaaaaaa2'];
    await updateContent(current => ({...current, leads: ids.map(id => ({id, name: id, status: 'Yeni'}))}));
    assert.equal((await ok(await bulkLeads(request({ids, status: 'Kapatıldı'})))).changed, 2);
    assert.ok(readContent().leads.every(lead => lead.status === 'Kapatıldı'));
    assert.equal((await bulkLeads(request({ids, status: 'Silindi'}))).status, 400);
  });

  await check('audit trail records publish/delete/navigation/status actions', async () => {
    const entries = await ok(await auditGet(request({})));
    const actions = new Set(entries.map(entry => entry.entity + ':' + entry.action));
    for (const expected of ['products:publish', 'products:hide', 'products:delete', 'posts:delete', 'navigation:publish', 'navigation:discard', 'lead:status', 'cms:save']) assert.ok(actions.has(expected), 'missing audit entry ' + expected);
    assert.ok(entries.every(entry => entry.at && entry.user === 'admin'));
  });

  await check('security: XSS in blog HTML stripped, javascript: menu URL rejected, upload type bypass + path traversal blocked', async () => {
    db = scanPages();
    db.posts.push({id: 'xss-post', slug: 'xss-yazisi', lang: 'tr', title: '<img src=x onerror=alert(1)>', excerpt: '"><script>alert(2)</script>', content: '<p>ok</p><script>alert(3)</script><img src="x" onerror="alert(4)"><a href="javascript:alert(5)">x</a>', published: false});
    await ok(await saveCms(request(db)));
    await ok(await publish(request({type: 'posts', ids: ['xss-post'], mode: 'publish'})));
    const html = getLegacyPage('tr/blog/xss-yazisi.html');
    const {JSDOM} = await import('jsdom');
    const main = new JSDOM(html).window.document.querySelector('main');
    assert.ok(main.querySelector('article p')?.textContent === 'ok', 'safe HTML kept');
    assert.equal(main.querySelectorAll('script').length, 0, 'no script elements');
    assert.ok(![...main.querySelectorAll('*')].some(node => [...node.attributes].some(attr => /^on/i.test(attr.name))), 'no event-handler attributes');
    assert.ok(![...main.querySelectorAll('a[href]')].some(link => /^\s*javascript:/i.test(link.getAttribute('href'))), 'no javascript: links');
    assert.equal(main.querySelector('h1').textContent, '<img src=x onerror=alert(1)>', 'title rendered as text, not markup');
    db = scanPages();
    db.settings.navigation = [...db.settings.navigation, {id: 'bad-link', parentId: '', sortOrder: 99, label: 'Kötü', href: 'javascript:alert(1)'}];
    assert.equal((await saveCms(request(db))).status, 400, 'javascript: menu URL rejected');
    const {POST: upload} = await import('../cms/app/api/upload/route.js');
    const form = new FormData(); form.set('file', new File(['<script>alert(1)</script>'], 'evil.png', {type: 'image/png'}));
    assert.equal((await upload({cookies, formData: async () => form})).status, 400, 'fake PNG rejected by magic-byte check');
    assert.equal(getLegacyPage('tr/../../cms/package.json'), null, 'path traversal on page route blocked');
    const {GET: mediaFile} = await import('../cms/app/api/media/[id]/route.js');
    assert.equal((await mediaFile({}, {params: Promise.resolve({id: '..%2Fcontent.json'})})).status, 404, 'path traversal on media route blocked');
  });

  await check('backup retention keeps the newest 200 snapshots', async () => {
    const backups = path.join(temporary, 'backups');
    for (let index = 0; index < 230; index++) fs.writeFileSync(path.join(backups, `0000-${String(index).padStart(4, '0')}.json.gz`), '');
    await updateContent(current => ({...current, templates: {...(current.templates || {}), marker: {subject: String(Date.now())}}}));
    assert.ok(fs.readdirSync(backups).filter(name => name.endsWith('.json.gz')).length <= 200);
  });

  console.log(passed.map(name => 'PASS ' + name).join('\n'));
  console.log(`\n${passed.length} admin-system checks passed.`);
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}
