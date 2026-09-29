// Browser acceptance for the unified admin system (DataTable, bulk actions, contextual create,
// draft → publish → public, navigation tree publish, dialogs, responsive, consistency).
// Run against an ISOLATED server with a throwaway CMS_DATA_DIR copy, e.g.:
//   CMS_BUILD_DIR=.next-master-test CMS_DATA_DIR=/tmp/copy ADMIN_TOKEN=... npx next start -p 3210
//   CMS_TEST_TOKEN=... PLAYWRIGHT_MODULE=/path/playwright-core CHROMIUM_PATH=/path/chrome node admin-system.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {chromium} = playwright;
const base = process.env.CMS_TEST_URL || 'http://localhost:3210';
const token = process.env.CMS_TEST_TOKEN || 'local-prototype-session-rotate-before-deploy';
const shots = process.env.SHOT_DIR || path.join(require('node:os').tmpdir(), 'hydro-admin-system-shots');
fs.mkdirSync(shots, {recursive: true});
const results = [];
const pass = name => {results.push(name); console.log('PASS ' + name);};
const collator = new Intl.Collator('tr', {numeric: true, sensitivity: 'base'});

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || undefined});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  await context.addCookies([{name: 'hp-admin', value: token, url: base}]);
  const publicSite = await playwright.request.newContext({baseURL: base}); // no admin cookie
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(30000);
  const suffix = Date.now().toString().slice(-6);
  const shot = name => page.screenshot({path: path.join(shots, name + '.png'), fullPage: false});
  const rows = () => page.locator('.data-table tbody tr:not(.dt-empty-row)');
  const count = async () => (await page.locator('.table-count').first().textContent()).trim();
  async function open(tab) {await page.goto(base + '/admin#admin-' + tab); await page.locator('#admin-tab-' + tab).waitFor(); await page.locator('#admin-content').waitFor();}
  async function save() {const response = page.waitForResponse(res => res.url().endsWith('/api/cms') && res.request().method() === 'PUT'); await page.locator('.top-actions .save').click(); assert.equal((await response).status(), 200); await page.locator('.save-state.clean').waitFor();}
  async function publishInEditor() {const response = page.waitForResponse(res => res.url().endsWith('/api/content-publish')); await page.locator('.editor-actions').getByRole('button', {name: 'Yayınla', exact: true}).click(); assert.equal((await response).status(), 200); await idle();}
  // Publishing reloads server data; the workspace is inert until then.
  const idle = () => page.locator('#admin-content[aria-busy=false]').waitFor();
  const publicHtml = async url => {const response = await publicSite.get(url); return {status: response.status(), html: response.status() === 200 ? await response.text() : ''};};
  const adminData = async () => (await (await page.request.get(base + '/api/cms')).json());

  try {
    // ---------- DataTable: search, sort asc/desc, filter, page size, pagination, URL state, clear ----------
    await open('blog');
    await rows().first().waitFor();
    const total = Number((await count()).match(/\d+/)[0]);
    assert.ok(total >= 100, 'blog list shows imported legacy posts (' + total + ')');
    const titleSort = page.locator('th', {has: page.locator('button.sort-button', {hasText: 'Yazı'})});
    await titleSort.locator('button').click();
    assert.equal(await titleSort.getAttribute('aria-sort'), 'ascending');
    const readTitles = () => page.locator('td[data-label="Yazı"] b').allTextContents();
    let titles = await readTitles();
    assert.deepEqual(titles, [...titles].sort(collator.compare), 'ascending sort orders the real data');
    await titleSort.locator('button').click();
    assert.equal(await titleSort.getAttribute('aria-sort'), 'descending');
    titles = await readTitles();
    assert.deepEqual(titles, [...titles].sort((a, b) => collator.compare(b, a)), 'descending sort orders the real data');
    await page.getByLabel('Dil', {exact: true}).selectOption('en');
    const enCount = Number((await count()).match(/^\d+/)[0]);
    assert.ok(enCount > 0 && enCount < total, 'language filter changes the dataset');
    assert.ok((await page.locator('td[data-label="Dil"]').allTextContents()).every(text => text === 'English'));
    await page.getByPlaceholder('Yazı ara').fill('cylinder');
    const combined = Number((await count()).match(/^\d+/)[0]);
    assert.ok(combined > 0 && combined <= enCount, 'search + filter + sort combine');
    await page.getByLabel('Sayfa başına gösterilecek kayıt').selectOption('25');
    assert.ok(page.url().includes('blog.q=cylinder') && page.url().includes('blog.f.lang=en') && page.url().includes('blog.sort=title%3Adesc') && page.url().includes('blog.size=25'), 'table state is in the URL: ' + page.url());
    await page.reload(); await rows().first().waitFor();
    assert.equal(await page.getByPlaceholder('Yazı ara').inputValue(), 'cylinder', 'search survives refresh');
    assert.equal(await page.getByLabel('Dil', {exact: true}).inputValue(), 'en', 'filter survives refresh');
    assert.equal(await titleSort.getAttribute('aria-sort'), 'descending', 'sort survives refresh');
    await page.getByRole('button', {name: /Filtreleri temizle/}).first().click();
    assert.equal(Number((await count()).match(/^\d+/)[0]), total, 'clear filters restores the full list');
    const dateSort = page.locator('th', {has: page.locator('button.sort-button', {hasText: 'Yayın tarihi'})});
    await dateSort.locator('button').focus();
    await page.keyboard.press('Enter');
    assert.equal(await dateSort.getAttribute('aria-sort'), 'ascending', 'sortable header works from the keyboard');
    await page.getByLabel('Sayfa başına gösterilecek kayıt').selectOption('10');
    assert.equal(await rows().count(), 10);
    await page.getByRole('button', {name: 'Sonraki', exact: true}).click();
    assert.match(await page.locator('.table-pagination').textContent(), /Sayfa 2 \//);
    await page.getByPlaceholder('Yazı ara').fill('zzzz-yok-' + suffix);
    await page.getByText('Bu filtrelerle sonuç bulunamadı.').waitFor();
    assert.match(await page.locator('.table-pagination').textContent(), /Sayfa 1 \/ 1/, 'filter change resets pagination');
    await page.locator('.dt-state').getByRole('button', {name: 'Filtreleri temizle'}).click();
    pass('DataTable: real sort asc/desc, filter, search+filter+sort, page size, pagination, URL state across refresh, filtered-empty state, clear filters');

    // ---------- Selection + bulk hide/show with public verification ----------
    await open('urunler');
    await rows().first().waitFor();
    const productRows = rows();
    const firstName = await productRows.nth(0).locator('td[data-label="Ürün"] b').textContent();
    const data = await adminData();
    const target = data.products.find(item => item.name === firstName && (item.type || 'hydraulic') === 'hydraulic');
    assert.ok(target, 'selected product exists in API data');
    const detailUrl = '/tr/urun-detay.html?id=' + encodeURIComponent(target.slug);
    assert.equal((await publicHtml(detailUrl)).status, 200, 'product is public before bulk hide');
    await productRows.nth(0).locator('td.dt-select input').check();
    await productRows.nth(1).locator('td.dt-select input').check();
    await page.locator('.dt-bulkbar').getByText('2 kayıt seçildi').waitFor();
    await shot('01-bulk-selection');
    let response = page.waitForResponse(res => res.url().endsWith('/api/content-publish'));
    await page.locator('.dt-bulkbar').getByRole('button', {name: 'Yayından kaldır'}).click();
    assert.equal((await response).status(), 200);
    await page.locator('.dt-bulkbar').waitFor({state: 'detached'});
    assert.equal((await publicHtml(detailUrl)).status, 404, 'bulk hide removes the public detail page');
    await page.reload(); await rows().first().waitFor();
    await page.getByLabel('Yayın durumu', {exact: true}).selectOption('false');
    assert.ok((await page.locator('td[data-label="Ürün"] b').allTextContents()).includes(firstName), 'hidden state persisted after refresh');
    await rows().filter({hasText: firstName}).first().locator('td.dt-select input').check();
    response = page.waitForResponse(res => res.url().endsWith('/api/content-publish'));
    await page.locator('.dt-bulkbar').getByRole('button', {name: 'Yayına al'}).click();
    assert.equal((await response).status(), 200);
    assert.equal((await publicHtml(detailUrl)).status, 200, 'bulk show restores the public detail page');
    await idle();
    await page.getByRole('button', {name: /Filtreleri temizle/}).first().click();
    pass('Selection + bulk actions: 2 selected → hide → public 404 → refresh persisted → show → public 200');

    // ---------- Row action overflow menu (keyboard) ----------
    const trigger = rows().first().locator('.row-menu-trigger');
    await trigger.click();
    const menu = page.locator('.row-menu[role=menu]');
    await menu.waitFor();
    assert.ok(await menu.getByRole('menuitem', {name: 'Kopyala'}).isVisible());
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'menuitem', 'arrow keys keep focus inside the menu');
    await page.keyboard.press('Escape');
    await menu.waitFor({state: 'detached'});
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('row-menu-trigger')), true, 'Escape returns focus to the ••• trigger');
    pass('RowActions ••• menu: opens, arrow keys, Escape closes and restores focus');

    // ---------- Contextual category create inside product editor (parent draft kept) ----------
    await rows().first().getByRole('button', {name: 'Düzenle'}).click();
    const nameInput = page.getByLabel('Türkçe ürün adı');
    const originalName = await nameInput.inputValue();
    const draftName = originalName + ' QA-' + suffix;
    await nameInput.fill(draftName);
    const categoryName = 'QA Kategori ' + suffix;
    await page.locator('.relation-select').first().getByRole('button', {name: 'Yeni kategori oluştur'}).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByLabel('Ad', {exact: true}).fill(categoryName);
    await dialog.getByLabel('English name').fill('QA Category ' + suffix);
    await dialog.getByRole('button', {name: 'Oluştur'}).click();
    await dialog.waitFor({state: 'hidden'});
    assert.equal(await page.locator('.relation-select select').first().evaluate(select => select.selectedOptions[0]?.textContent || ''), categoryName + ' · QA Category ' + suffix, 'new category auto-selected');
    assert.equal(await nameInput.inputValue(), draftName, 'unsaved parent field kept after contextual create');
    await save();
    assert.equal((await publicHtml('/tr/urun-detay.html?id=' + encodeURIComponent(target.slug))).html.includes(categoryName), false, 'saved draft not public yet');
    await publishInEditor();
    assert.equal((await publicHtml('/tr/urun-detay.html?id=' + encodeURIComponent(target.slug))).status, 200);
    const listing = await publicHtml('/tr/hpl-products.html');
    const listingData = Buffer.from(listing.html.match(/catalogListing\(JSON\.parse\(new TextDecoder\(\)\.decode\(Uint8Array\.from\(atob\('([^']+)'\)/)?.[1] || '', 'base64').toString('utf8');
    assert.ok(listingData.includes(draftName) && listingData.includes(categoryName), 'published name + category reach the public catalogue data');
    await page.getByRole('button', {name: '← Listeye dön'}).click();
    pass('Contextual create: product edit → ＋ Yeni kategori → auto-selected, unsaved name kept → save (public unchanged) → publish → public page + catalogue');

    // ---------- Blog: edit → save → preview shows draft, public old → publish → public new + SEO ----------
    await open('blog');
    const post = (await adminData()).posts.find(item => item.legacy && item.published !== false && item.lang === 'tr');
    await page.getByPlaceholder('Yazı ara').fill(post.slug);
    await rows().first().getByRole('button', {name: 'Düzenle'}).click();
    const newTitle = post.title + ' (QA ' + suffix + ')';
    await page.getByLabel('Yazı başlığı').fill(newTitle);
    await page.locator('.blog-seo-fields summary').click();
    await page.getByLabel('Arama sonucu başlığı').fill('QA SEO ' + suffix);
    await save();
    const url = '/' + post.legacyPath;
    assert.ok(!(await publicHtml(url)).html.includes('QA ' + suffix), 'saved blog draft does not leak publicly');
    const preview = await page.request.get(base + url + '?cmsPreview=view');
    const previewHtml = await preview.text();
    assert.ok(previewHtml.includes('QA ' + suffix) && !previewHtml.includes('/api/admin-preview'), 'read-only preview shows the draft without editor script');
    await publishInEditor();
    const blogPublic = await publicHtml(url);
    assert.ok(blogPublic.html.includes('(QA ' + suffix + ')'), 'published title on public post');
    assert.match(blogPublic.html, new RegExp('<title>QA SEO ' + suffix + ' \\| HydroPascal Blog</title>'));
    pass('Blog: edit title + SEO → save → public unchanged, preview=view shows draft → publish → public title + <title> updated');

    // ---------- Catalog: create → contextual category → PDF → save → publish → public; reorder persisted ----------
    await open('kataloglar');
    await page.getByRole('button', {name: '＋ Katalog ekle'}).click();
    const catalogTitle = 'QA Katalog ' + suffix;
    await page.getByLabel('Türkçe katalog adı').fill(catalogTitle);
    await page.locator('.relation-select').first().getByRole('button', {name: 'Yeni kategori oluştur'}).click();
    await page.locator('dialog[open]').getByLabel('Ad', {exact: true}).fill('QA Doküman ' + suffix);
    await page.locator('dialog[open]').getByRole('button', {name: 'Oluştur'}).click();
    await page.locator('dialog[open]').waitFor({state: 'hidden'});
    const existingPdf = (await adminData()).catalogues.find(item => item.file)?.file;
    await page.getByLabel('PDF dosyası').first().fill(existingPdf);
    await page.getByLabel('Yayın durumu').selectOption('published');
    await save();
    await publishInEditor();
    const catalogPublic = await publicHtml('/tr/kataloglar.html');
    const catalogPayload = Buffer.from(catalogPublic.html.match(/documentListing\(JSON\.parse\(new TextDecoder\(\)\.decode\(Uint8Array\.from\(atob\('([^']+)'\)/)?.[1] || '', 'base64').toString('utf8');
    assert.ok(catalogPayload.includes(catalogTitle) && catalogPayload.includes('QA Doküman ' + suffix), 'published catalogue + category on public page');
    await page.getByRole('button', {name: '← Listeye dön'}).click();
    await page.getByLabel('Sayfa başına gösterilecek kayıt').selectOption('25');
    const catalogRow = rows().filter({hasText: catalogTitle});
    const before = (await adminData()).catalogues.find(item => item.title === catalogTitle).sortOrder;
    await catalogRow.getByRole('button', {name: /Yukarı taşı/}).click();
    await save();
    await page.reload(); await rows().first().waitFor();
    const after = (await adminData()).catalogues.find(item => item.title === catalogTitle).sortOrder;
    assert.ok(after < before, `reorder persisted (${before} → ${after})`);
    await page.locator('th', {has: page.locator('button.sort-button', {hasText: 'Katalog'})}).locator('button').click();
    assert.equal(await rows().first().getByRole('button', {name: /Yukarı taşı|Sıralamak için/}).first().isDisabled(), true, 'manual reorder is disabled while a column sort is active');
    pass('Catalog: create → ＋ Yeni kategori → PDF → save → publish → public listing; reorder → save → refresh persisted; reorder locked while sorted');

    // ---------- Navigation tree: add child under group → save → public unchanged → publish → public ----------
    await open('site');
    const group = page.locator('.cms-tree-row').filter({has: page.locator('.cms-tree-summary b', {hasText: /^Ürünler$/})}).first();
    await group.getByRole('button', {name: '＋ Alt menü'}).click();
    const childLabel = 'QA Alt ' + suffix;
    await page.locator('.cms-tree-edit').getByLabel('Görünen ad').fill(childLabel);
    await page.locator('.cms-tree-edit').getByLabel('URL').fill('qa-alt-' + suffix + '.html');
    await page.locator('.cms-tree-edit').getByRole('button', {name: 'Tamam'}).click();
    const childRow = page.locator('.cms-tree-row', {has: page.locator('.cms-tree-summary b', {hasText: childLabel})});
    const underParent = () => page.evaluate(label => [...document.querySelectorAll('.cms-tree-item')].some(item => item.querySelector(':scope > .cms-tree-row .cms-tree-summary b')?.textContent === 'Ürünler' && [...item.querySelectorAll(':scope > .cms-tree .cms-tree-summary b')].some(b => b.textContent === label)), childLabel);
    assert.ok(await underParent(), 'child renders under its parent');
    await childRow.getByRole('button', {name: /yukarı taşı/}).click();
    assert.ok(await underParent(), 'child stays under parent after reorder');
    await save();
    await page.locator('.draft-banner').getByText('Yayınlanmamış menü değişiklikleri var').waitFor();
    const header = html => html.split('<!-- HEADER END -->')[0];
    assert.ok(!header((await publicHtml('/tr/index.html')).html).includes(childLabel), 'saved menu draft not public');
    await shot('02-navigation-draft');
    response = page.waitForResponse(res => res.url().endsWith('/api/content-publish'));
    await page.locator('.draft-banner').getByRole('button', {name: 'Menüyü yayınla'}).click();
    assert.equal((await response).status(), 200);
    await page.locator('.draft-banner').waitFor({state: 'detached'});
    const publicHeader = header((await publicHtml('/tr/index.html')).html);
    assert.ok(publicHeader.includes(childLabel) && publicHeader.includes('/tr/qa-alt-' + suffix + '.html'), 'published child in public header');
    await page.reload();
    await page.locator('.cms-tree-row').first().waitFor();
    assert.equal(await page.locator('.cms-tree-summary b', {hasText: childLabel}).count(), 1, 'tree persisted after refresh');
    assert.ok(await underParent(), 'child still under its parent after refresh');
    // hide → publish → gone; delete → publish
    await childRow.getByRole('button', {name: 'Gizle'}).click();
    await save();
    await page.locator('.draft-banner').getByRole('button', {name: 'Menüyü yayınla'}).click();
    await page.locator('.draft-banner').waitFor({state: 'detached'});
    assert.ok(!header((await publicHtml('/tr/index.html')).html).includes(childLabel), 'hidden child removed from public header');
    pass('Navigation: add child under parent → reorder → save (draft banner, public unchanged) → publish → public header → refresh → hide → publish → hidden');

    // ---------- Unsaved-changes dialog (Save / Discard / Cancel) ----------
    await open('kategoriler');
    await page.locator('td[data-label="Kategori adı"] input').first().fill('QA geçici ' + suffix);
    await page.locator('td[data-label="Kategori adı"] input').first().press('Enter');
    await page.locator('.save-state.unsaved').waitFor();
    await page.locator('.sidebottom').getByRole('button', {name: 'Çıkış yap'}).click();
    const leave = page.locator('dialog.confirm-dialog[open]');
    await leave.waitFor();
    assert.deepEqual(await leave.locator('.relation-dialog-actions button').allTextContents(), ['Vazgeç', 'Değişiklikleri at', 'Kaydet ve çık']);
    await shot('03-unsaved-dialog');
    await page.keyboard.press('Escape');
    await leave.waitFor({state: 'detached'});
    assert.ok(await page.locator('.save-state.unsaved').isVisible(), 'Escape = cancel, still logged in with changes');
    await page.locator('.top-actions').getByRole('button', {name: 'Değişiklikleri at'}).click();
    await page.locator('dialog.confirm-dialog[open]').getByRole('button', {name: 'Değişiklikleri at'}).click();
    await page.locator('.save-state.clean').waitFor();
    pass('Unsaved changes: logout offers Vazgeç / Değişiklikleri at / Kaydet ve çık; Escape cancels; discard reloads saved state');

    // ---------- Consistency + responsive across all list screens ----------
    const screens = ['genel', 'site', 'urunler', 'kataloglar', 'vitrin', 'medya', 'blog', 'kategoriler', 'talepler', 'isAtamalari'];
    const listScreens = ['urunler', 'kataloglar', 'vitrin', 'blog', 'kategoriler', 'talepler', 'isAtamalari'];
    for (const tab of listScreens) {
      await open(tab);
      await page.locator('.admin-page-header').first().waitFor();
      assert.equal(await page.locator('.data-table').count(), 1, tab + ' uses the shared DataTable');
      for (const part of ['.table-search input', '.table-page-size select', '.table-pagination', 'th.dt-select input']) assert.ok(await page.locator(part).count() > 0, `${tab} has ${part}`);
      const sortable = await page.locator('th[aria-sort] button.sort-button').count();
      assert.ok(sortable >= 2, tab + ' has sortable columns');
    }
    pass('Consistency: all 7 list screens use PageHeader + one shared DataTable (search, page size, selection, pagination, sortable headers)');

    const widths = [360, 390, 414, 768, 1024, 1280, 1440], problems = [];
    for (const width of widths) {
      await page.setViewportSize({width, height: 900});
      for (const tab of screens) {
        await page.goto(base + '/admin#admin-' + tab);
        await page.locator('#admin-content').waitFor();
        await page.waitForTimeout(150);
        const report = await page.evaluate(() => {
          const out = [];
          if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('page overflow ' + document.documentElement.scrollWidth);
          for (const button of document.querySelectorAll('#admin-content .admin-button, .topbar .admin-button')) {
            const box = button.getBoundingClientRect();
            if (!box.width) continue;
            if (box.right > window.innerWidth + 1 || box.left < -1) out.push('button off-screen: ' + button.textContent.trim().slice(0, 30));
          }
          const heights = new Map();
          for (const button of document.querySelectorAll('#admin-content .admin-page-header .admin-button')) {const h = Math.round(button.getBoundingClientRect().height); if (h) heights.set(h, (heights.get(h) || 0) + 1);}
          if (heights.size > 1 && window.innerWidth > 620) out.push('header buttons differ in height: ' + [...heights.keys()].join('/'));
          return out;
        });
        if (report.length) problems.push(`${width}px ${tab}: ${report.join('; ')}`);
        if ([360, 768, 1440].includes(width) && ['urunler', 'blog', 'site'].includes(tab)) await shot(`r-${width}-${tab}`);
      }
    }
    assert.deepEqual(problems, [], 'responsive problems:\n' + problems.join('\n'));
    pass('Responsive: 10 screens × 360/390/414/768/1024/1280/1440 — no page overflow, no off-screen buttons, header buttons equal height');

    assert.deepEqual(errors, [], 'browser JS errors: ' + errors.join(' | '));
    pass('No browser JavaScript errors');
    console.log(`\n${results.length} browser checks passed. Screenshots: ${shots}`);
  } catch (error) {
    await shot('failure').catch(() => {});
    console.error('FAIL after ' + results.length + ' passes:', error.message);
    if (errors.length) console.error('JS errors:', errors.join(' | '));
    process.exitCode = 1;
  } finally {
    await publicSite.dispose();
    await browser.close();
  }
})();
