// Browser acceptance: measurement events + admin SEO → public HTML, in a real Chromium.
// Run against an ISOLATED server whose CMS_DATA_DIR copy has settings.analytics =
// {mode:'gtag', ga4:'G-TEST12345', googleAds:'AW-123456789', googleAdsLeadLabel:'TestLabel01', consentRequired:true}:
//   CMS_BUILD_DIR=.next-seo-test CMS_DATA_DIR=/tmp/copy ADMIN_TOKEN=seo-browser-test-token ANALYTICS_ENABLED=true ANALYTICS_DEBUG=true npx next start -p 3231
//   CMS_TEST_URL=http://localhost:3231 CMS_TEST_TOKEN=seo-browser-test-token PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node seo-analytics.browser.cjs
// Vendor hosts (Google, Meta, LinkedIn) are intercepted with empty stubs: no data leaves the machine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CMS_TEST_URL || 'http://localhost:3231';
const token = process.env.CMS_TEST_TOKEN || 'seo-browser-test-token';
const shots = process.env.SHOT_DIR || path.join(require('node:os').tmpdir(), 'hydro-seo-shots');
fs.mkdirSync(shots, {recursive: true});
const pass = name => console.log('PASS ' + name);
const VENDOR = /https:\/\/(www\.googletagmanager\.com|connect\.facebook\.net|snap\.licdn\.com|www\.google-analytics\.com)\//;

async function publicContext(browser, viewport = {width: 1280, height: 900}) {
  const context = await browser.newContext({viewport});
  const vendorRequests = [];
  await context.route(VENDOR, route => { vendorRequests.push(route.request().url()); return route.fulfill({status: 200, contentType: 'text/javascript', body: ''}); });
  return {context, vendorRequests};
}
const layer = page => page.evaluate(() => (window.dataLayer || []).map(item => Object.prototype.toString.call(item) === '[object Arguments]' ? Array.from(item) : item));
const gtagEvents = async (page, name) => (await layer(page)).filter(item => Array.isArray(item) && item[0] === 'event' && item[1] === name);
// Keep clicks on the page: our listener runs in the capture phase, this one cancels navigation afterwards.
const stayOnPage = page => page.evaluate(() => document.addEventListener('click', event => event.preventDefault()));

(async () => {
  const browser = await playwright.chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || undefined});
  const errors = [];
  const watch = page => { page.on('pageerror', error => errors.push(page.url() + ' ' + error.message)); page.on('console', message => { if (message.type() === 'error' && !/cdn\.tailwindcss|Failed to load resource/.test(message.text())) errors.push(page.url() + ' console: ' + message.text()); }); };
  try {
    // ---------- consent gate: nothing loads before the choice ----------
    let {context, vendorRequests} = await publicContext(browser);
    let page = await context.newPage(); watch(page);
    await page.goto(base + '/tr/urun-detay.html?id=cift-etkili', {waitUntil: 'networkidle'});
    await page.locator('#hp-consent').waitFor({state: 'visible'});
    assert.equal(vendorRequests.length, 0, 'no vendor request before consent');
    assert.equal((await gtagEvents(page, 'product_view')).length, 0);
    assert.deepEqual(await page.evaluate(() => window.hpAnalytics.sent.map(item => item.name)), ['product_view'], 'view event waits in the queue');
    await page.screenshot({path: path.join(shots, 'consent-banner-1280.png')});
    pass('consent: banner shown, no vendor script, view event queued');

    await page.getByRole('button', {name: 'Tümünü kabul et'}).click();
    await page.locator('#hp-consent').waitFor({state: 'hidden'});
    await page.waitForTimeout(300);
    assert.equal(vendorRequests.filter(url => url.includes('/gtag/js')).length, 1, 'gtag.js requested exactly once');
    assert.equal(vendorRequests.filter(url => url.includes('gtm.js')).length, 0, 'no GTM next to gtag (no double tagging)');
    const configs = (await layer(page)).filter(item => Array.isArray(item) && item[0] === 'config');
    assert.deepEqual(configs.map(item => item[1]), ['G-TEST12345', 'AW-123456789'], 'GA4 + Ads configured once each (GA4 config sends page_view)');
    assert.equal(configs[0][2].content_group, 'product');
    const views = await gtagEvents(page, 'product_view');
    assert.equal(views.length, 1);
    assert.equal(views[0][2].product_id, 'cift-etkili');
    assert.equal(views[0][2].send_to, 'G-TEST12345');
    pass('accept: one gtag.js, one GA4 config, one product_view with real product data');

    await stayOnPage(page);
    await page.locator('main a[href^="tel:"], footer a[href^="tel:"]').first().click();
    await page.locator('footer a[href^="mailto:"]').first().click();
    await page.locator('header nav a[href="/tr/about-us.html"]').first().click();
    const pdf = page.locator('main a[href$=".pdf"]').first();
    if (await pdf.count()) await pdf.click();
    await page.waitForTimeout(200);
    assert.equal((await gtagEvents(page, 'phone_click')).length, 1, 'one click → one phone_click');
    assert.equal((await gtagEvents(page, 'email_click')).length, 1);
    const nav = await gtagEvents(page, 'navigation_click');
    assert.equal(nav.length, 1);
    assert.equal(nav[0][2].nav_location, 'header');
    assert.equal(nav[0][2].link_url, '/tr/about-us.html');
    if (await pdf.count()) assert.equal((await gtagEvents(page, 'product_document_download')).length, 1);
    const payloads = JSON.stringify(await layer(page));
    assert.doesNotMatch(payloads, /info@hydropascal|555\s?384|5553848229/, 'no e-mail / phone number in analytics payloads');
    pass('clicks: phone, email, navigation, product document — exactly one event each, no PII');

    await page.reload({waitUntil: 'networkidle'});
    assert.equal(await page.locator('#hp-consent').isVisible(), false, 'choice remembered');
    assert.equal((await gtagEvents(page, 'product_view')).length, 1, 'one product_view per page load');
    assert.equal(vendorRequests.filter(url => url.includes('/gtag/js')).length, 2, 'one gtag.js per page load');
    pass('reload: consent remembered, single product_view, single gtag.js');

    // ---------- catalog download ----------
    await page.goto(base + '/tr/kataloglar.html', {waitUntil: 'networkidle'});
    await stayOnPage(page);
    await page.locator('.catalog-document-card a[download]').first().click();
    await page.waitForTimeout(200);
    const downloads = await gtagEvents(page, 'catalog_download');
    assert.equal(downloads.length, 1);
    assert.match(downloads[0][2].file_name, /\.pdf$/);
    assert.ok(downloads[0][2].catalog_name.length > 0);
    pass('catalog_download: one event with catalogue and file name');

    // ---------- site search ----------
    await page.goto(base + '/tr/hpl-products.html', {waitUntil: 'networkidle'});
    await page.locator('main input[type="search"]').first().fill('silindir');
    await page.waitForTimeout(1600);
    const searches = await gtagEvents(page, 'site_search');
    assert.equal(searches.length, 1);
    assert.equal(searches[0][2].search_term, 'silindir');
    assert.equal(typeof searches[0][2].results_count, 'number');
    pass('site_search: debounced, one event with term and result count');

    // ---------- form: success only after the API confirms ----------
    await page.goto(base + '/tr/contact.html', {waitUntil: 'networkidle'});
    await page.fill('#name', 'Test Kullanıcı');
    await page.fill('#email', 'qa-seo@example.com');
    await page.fill('#message', 'Ölçüm testi — lütfen yok sayın.');
    await page.check('#consent-contact');
    const leadResponse = page.waitForResponse(response => response.url().includes('/api/lead'));
    await page.locator('form[data-hpl-form] button[type="submit"]').click();
    assert.equal((await leadResponse).status(), 200);
    await page.waitForTimeout(300);
    for (const [name, expected] of [['form_start', 1], ['form_submit', 1], ['form_success', 1], ['form_error', 0]]) assert.equal((await gtagEvents(page, name)).length, expected, name);
    assert.equal((await gtagEvents(page, 'form_success'))[0][2].form_type, 'contact');
    const conversions = await gtagEvents(page, 'conversion');
    assert.equal(conversions.length, 1);
    assert.equal(conversions[0][2].send_to, 'AW-123456789/TestLabel01');
    assert.doesNotMatch(JSON.stringify(await layer(page)), /qa-seo@example\.com|Test Kullanıcı|Ölçüm testi/, 'form values never reach analytics');
    pass('form: form_start/submit/success once each after API 200 + one Ads conversion, no form values');

    await page.goto(base + '/tr/contact.html', {waitUntil: 'networkidle'});
    await page.route('**/api/lead**', route => route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({success: false, error: 'Sunucu hatası (test)'})}));
    await page.fill('#name', 'Test'); await page.fill('#email', 'qa@example.com'); await page.fill('#message', 'x'); await page.check('#consent-contact');
    await page.locator('form[data-hpl-form] button[type="submit"]').click();
    await page.waitForTimeout(400);
    assert.equal((await gtagEvents(page, 'form_success')).length, 0);
    const formErrors = await gtagEvents(page, 'form_error');
    assert.equal(formErrors.length, 1);
    assert.equal(formErrors[0][2].error_type, 'server');
    assert.equal((await gtagEvents(page, 'conversion')).length, 0);
    pass('form: API failure → one form_error(server), no success, no conversion');

    // ---------- blog article + CTA ----------
    await page.goto(base + '/tr/blog/8-ve-9-disli-ozel-disli-uretimi.html', {waitUntil: 'networkidle'});
    const article = await gtagEvents(page, 'article_view');
    assert.equal(article.length, 1);
    assert.equal(article[0][2].article_id, '8-ve-9-disli-ozel-disli-uretimi');
    await stayOnPage(page);
    const cta = page.locator('main a[href$="teklif-al.html"], main a[href*="teklif-al.html?"]').first();
    if (await cta.count()) { await cta.click(); await page.waitForTimeout(150); assert.equal((await gtagEvents(page, 'cta_click')).length, 1); }
    pass('article_view once; CTA to the quote page → one cta_click');
    await context.close();

    // ---------- reject: nothing is sent ----------
    ({context, vendorRequests} = await publicContext(browser, {width: 390, height: 844}));
    page = await context.newPage(); watch(page);
    await page.goto(base + '/tr/index.html', {waitUntil: 'networkidle'});
    const banner = await page.locator('.hp-consent-panel').boundingBox();
    assert.ok(banner.x >= 0 && banner.x + banner.width <= 390, 'banner fits 390px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll with banner');
    await page.screenshot({path: path.join(shots, 'consent-banner-390.png')});
    await page.getByRole('button', {name: 'Reddet'}).click();
    await stayOnPage(page);
    await page.locator('a[href^="tel:"]').first().click({force: true});
    await page.waitForTimeout(200);
    assert.equal(vendorRequests.length, 0, 'rejected: no vendor request');
    assert.equal((await gtagEvents(page, 'phone_click')).length, 0, 'rejected: nothing in the tag queue');
    await page.locator('footer [data-hp-consent-open]').click();
    await page.locator('#hp-consent').waitFor({state: 'visible'});
    assert.equal(await page.locator('[data-hp-consent-category="analytics"]').isVisible(), true, 'preferences reopen with categories');
    pass('reject: no vendor script, no event; footer link reopens preferences (390px, no overflow)');
    await context.close();

    // ---------- admin → public: settings, product SEO, page SEO, slug rename ----------
    context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    await context.addCookies([{name: 'hp-admin', value: token, url: base}]);
    await context.route(VENDOR, route => route.fulfill({status: 200, contentType: 'text/javascript', body: ''}));
    page = await context.newPage(); watch(page);
    const publicReq = await playwright.request.newContext({baseURL: base});
    const publicHtml = async url => { const response = await publicReq.get(url, {maxRedirects: 0}); return {status: response.status(), location: response.headers().location || '', html: response.status() === 200 ? await response.text() : ''}; };
    const idle = () => page.locator('#admin-content[aria-busy=false]').waitFor();
    const save = async () => { const response = page.waitForResponse(res => res.url().endsWith('/api/cms') && res.request().method() === 'PUT'); await page.locator('.top-actions .save').click(); assert.equal((await response).status(), 200); await page.locator('.save-state.clean').waitFor(); };

    await page.goto(base + '/admin#admin-seo');
    await page.locator('#admin-tab-seo').waitFor();
    await page.getByRole('tab', {name: 'Kurum ve sosyal'}).click();
    await page.getByLabel('LinkedIn').fill('https://www.linkedin.com/company/hydropascal-test');
    await save();
    let result = await publicHtml('/en/index.html');
    assert.match(result.html, /"sameAs":\["https:\/\/www\.linkedin\.com\/company\/hydropascal-test"\]/);
    assert.match(result.html, /aria-label="Social media"><li><a href="https:\/\/www\.linkedin\.com\/company\/hydropascal-test"/);
    await page.getByRole('tab', {name: 'Ölçüm ve reklam'}).click();
    await page.getByText('Aktif: Google tag (gtag.js)').waitFor();
    await page.getByRole('tab', {name: 'SEO kontrolü'}).click();
    await page.getByRole('button', {name: 'Kontrolü çalıştır'}).click();
    await page.locator('.data-table tbody tr').first().waitFor({timeout: 60000});
    await page.getByText(/adres kontrol edildi · 0 adreste hata/).waitFor();
    await page.screenshot({path: path.join(shots, 'admin-seo-audit.png')});
    pass('admin SEO settings: social profile saved → footer + Organization.sameAs; env status; audit on live HTML: 0 errors');

    await page.goto(base + '/admin#admin-urunler');
    await page.locator('.table-search input').first().fill('Çift Etkili');
    await page.locator('.data-table tbody tr').first().getByRole('button', {name: 'Düzenle'}).click();
    await page.getByRole('tab', {name: 'SEO', exact: true}).click();
    await page.getByLabel('Arama sonucu başlığı').fill('Çift Etkili Hidrolik Silindir QA');
    await page.locator('.seo-preview-grid .seo-search-preview b', {hasText: 'Çift Etkili Hidrolik Silindir QA | HydroPascal'}).waitFor();
    await page.getByRole('tab', {name: 'Ürün bilgisi'}).click();
    await page.getByLabel('Sayfa kısa adı').fill('cift-etkili-silindir');
    await save();
    result = await publicHtml('/tr/urun-detay.html?id=cift-etkili');
    assert.equal(result.status, 200, 'saved draft does not change the live product');
    assert.doesNotMatch(result.html, /QA \| HydroPascal/);
    const published = page.waitForResponse(res => res.url().endsWith('/api/content-publish'));
    await page.locator('.editor-actions').getByRole('button', {name: 'Yayınla', exact: true}).click();
    assert.equal((await published).status(), 200); await idle();
    result = await publicHtml('/tr/urun-detay.html?id=cift-etkili-silindir');
    assert.match(result.html, /<title>Çift Etkili Hidrolik Silindir QA \| HydroPascal<\/title>/);
    assert.match(result.html, /<link rel="canonical" href="https:\/\/www\.hydropascal\.com\.tr\/tr\/urun-detay\.html\?id=cift-etkili-silindir">/);
    result = await publicHtml('/tr/urun-detay.html?id=cift-etkili');
    assert.equal(result.status, 301);
    assert.match(result.location, /\/tr\/urun-detay\.html\?id=cift-etkili-silindir$/);
    const sitemap = await (await publicReq.get('/sitemap.xml')).text();
    assert.match(sitemap, /id=cift-etkili-silindir</);
    assert.doesNotMatch(sitemap, /id=cift-etkili</);
    pass('product: SEO title + slug edit → draft (live unchanged) → publish → new title/canonical, old URL 301, sitemap updated');

    await page.goto(base + '/admin#admin-sayfalar');
    await page.getByRole('tab', {name: /SEO ve paylaşım/}).click();
    await page.getByLabel('Arama sonucu başlığı').fill('HydroPascal Ana Sayfa QA');
    await page.getByLabel('Arama sonucu açıklaması').fill('QA açıklaması: hidrolik silindir üreticisi.');
    await page.getByRole('button', {name: 'Taslak kaydet'}).click();
    await page.getByText('Bu sayfada yayımlanmamış taslak var.').waitFor();
    assert.doesNotMatch((await publicHtml('/tr/index.html')).html, /Ana Sayfa QA/);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.page-seo-view').getByRole('button', {name: 'Yayımla'}).click();
    await page.getByText('Değişiklikler önce taslak olarak kaydedilir.').waitFor();
    result = await publicHtml('/tr/index.html');
    assert.match(result.html, /<title>HydroPascal Ana Sayfa QA \| HydroPascal<\/title>/);
    assert.match(result.html, /<meta name="description" content="QA açıklaması: hidrolik silindir üreticisi\.">/);
    await page.screenshot({path: path.join(shots, 'admin-page-seo.png')});
    pass('page SEO: draft does not reach public; publish → <title>/description in public HTML');

    for (const width of [390, 768]) {
      await page.setViewportSize({width, height: 900});
      await page.goto(base + '/admin#admin-seo');
      await page.locator('#seo-panel').waitFor();
      for (const tab of ['Genel SEO', 'Ölçüm ve reklam', 'Yönlendirmeler']) {
        await page.getByRole('tab', {name: tab}).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${tab} fits ${width}px`);
      }
      await page.screenshot({path: path.join(shots, `admin-seo-${width}.png`), fullPage: false});
    }
    pass('admin SEO screens: no horizontal overflow at 390 / 768');
    await publicReq.dispose();

    assert.deepEqual(errors, [], 'no page errors / console errors');
    pass('console: no JavaScript errors on any visited page');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
