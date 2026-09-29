// Browser acceptance for the contextual CMS (Tests A–E + recursive navigation).
// Run against an isolated server whose CMS_DATA_DIR is a throwaway copy, e.g.:
//   ADMIN_TOKEN=... CMS_BUILD_DIR=.next-context-test CMS_DATA_DIR=/tmp/copy npx next start -p 3210
//   CMS_TEST_TOKEN=... PLAYWRIGHT_MODULE=/path/to/playwright-core node contextual-cms.browser.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CMS_TEST_URL||'http://localhost:3210';
const token=process.env.CMS_TEST_TOKEN||'local-prototype-session-rotate-before-deploy';
const shots=process.env.SHOT_DIR||path.join(require('node:os').tmpdir(),'hydro-context-shots');
fs.mkdirSync(shots,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'hp-admin',value:token,url:base}]);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  page.setDefaultTimeout(30000);
  const suffix=Date.now().toString().slice(-6);
  const shot=name=>page.screenshot({path:path.join(shots,name+'.png'),fullPage:false});
  const relation=()=>page.locator('.relation-select').first();
  const selectedLabel=()=>relation().locator('select').evaluate(select=>select.selectedOptions[0]?.textContent||'');
  async function tab(id){await page.locator('#admin-tab-'+id).click();}
  async function save(){const response=page.waitForResponse(res=>res.url().endsWith('/api/cms')&&res.request().method()==='PUT');await page.locator('.top-actions .save').click();assert.equal((await response).status(),200);await page.locator('.save-state.clean').waitFor();}
  async function publish(){const response=page.waitForResponse(res=>res.url().endsWith('/api/content-publish'));await page.locator('.editor-actions').getByRole('button',{name:'Yayınla',exact:true}).click();assert.equal((await response).status(),200);await page.locator('.save-state.clean').waitFor();}
  async function createCategory(name,{screenshot}={}){
    await relation().getByRole('button',{name:'Yeni kategori oluştur'}).click();
    const dialog=page.locator('dialog[open]');
    await dialog.getByLabel('Ad',{exact:true}).fill(name);await dialog.getByLabel('English name').fill(name+' EN');
    if(screenshot)await shot(screenshot);
    await dialog.getByRole('button',{name:'Oluştur',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.ok((await selectedLabel()).startsWith(name),'new category is selected automatically');
  }
  async function noOverflow(label){
    for(const width of [320,390,768,1024,1440]){
      await page.setViewportSize({width,height:900});await page.waitForTimeout(120);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      assert.ok(overflow<=2,`${label}: horizontal overflow ${overflow}px at ${width}px`);
    }
    await page.setViewportSize({width:1440,height:1000});
  }
  const treeRow=label=>page.locator('.cms-tree-row').filter({has:page.locator('.cms-tree-summary > b').getByText(label,{exact:true})});
  const treeChildren=label=>treeRow(label).locator('xpath=..').locator(':scope > ul > li > .cms-tree-row .cms-tree-summary > b').allTextContents();
  try{
    // Test A + E — product: unsaved parent fields survive create, cancel, failure and edit.
    await page.goto(base+'/admin#admin-urunler');await page.getByRole('button',{name:/Hidrolik ekle/}).click();
    const productName='Tarayici Pompa '+suffix,productCategory='Endustriyel Pompalar '+suffix;
    await page.getByLabel('Türkçe ürün adı',{exact:true}).fill(productName);await page.locator('label',{hasText:'Kısa açıklama'}).locator('textarea').fill('Kaydedilmemiş açıklama korunmalı');
    await createCategory(productCategory,{screenshot:'01-product-quick-create'});
    assert.equal(await page.getByLabel('Türkçe ürün adı',{exact:true}).inputValue(),productName);
    assert.equal(await page.locator('label',{hasText:'Kısa açıklama'}).locator('textarea').inputValue(),'Kaydedilmemiş açıklama korunmalı');
    await relation().getByRole('button',{name:'Yeni kategori oluştur'}).click();await page.locator('dialog[open]').getByLabel('Ad',{exact:true}).fill('Vazgeçilen');await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({state:'hidden'});assert.ok((await selectedLabel()).startsWith(productCategory),'cancel keeps selection');
    await page.route('**/api/categories',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Test hatası'})}));
    await relation().getByRole('button',{name:'Yeni kategori oluştur'}).click();await page.locator('dialog[open]').getByLabel('Ad',{exact:true}).fill('Hata');await page.locator('dialog[open]').getByRole('button',{name:'Oluştur',exact:true}).click();
    assert.match(await page.locator('dialog[open] [role=alert]').textContent(),/Formunuzdaki değişiklikler korunuyor/);
    await shot('02-product-quick-create-error');
    await page.locator('dialog[open]').getByRole('button',{name:'Vazgeç',exact:true}).click();await page.unroute('**/api/categories');
    assert.equal(await page.getByLabel('Türkçe ürün adı',{exact:true}).inputValue(),productName,'parent survives failure');
    await relation().getByRole('button',{name:'Seçili kategoriyi düzenle'}).click();await page.locator('dialog[open]').getByLabel('Ad',{exact:true}).fill(productCategory+' X');await page.locator('dialog[open]').getByRole('button',{name:'Kaydet',exact:true}).click();await page.locator('dialog[open]').waitFor({state:'hidden'});
    assert.ok((await selectedLabel()).startsWith(productCategory+' X'),'quick edit keeps selection');
    await page.locator('label',{hasText:/^Yayın durumu/}).locator('select').selectOption('active');
    // Switching modules keeps the open editor (selection lives in the admin shell).
    await tab('kategoriler');await page.getByRole('searchbox',{name:'Kategori ara'}).fill(productCategory+' X');await page.locator('tr',{hasText:'1 ürün'}).first().waitFor();
    await shot('03-category-manager');
    await tab('urunler');assert.equal(await page.getByLabel('Türkçe ürün adı',{exact:true}).inputValue(),productName,'editor restored after module switch');
    await save();await page.reload();
    await page.getByRole('searchbox',{name:'Ürün ara',exact:true}).fill(productName);await page.locator('tr').filter({hasText:productName}).getByRole('button',{name:'Düzenle',exact:true}).click();
    assert.ok((await selectedLabel()).startsWith(productCategory+' X'),'category persisted after refresh');
    await publish();
    await page.goto(base+'/tr/hpl-products.html');await page.locator('.catalog-search input').fill(productName);
    const card=page.locator('.catalog-card',{hasText:productName});await card.waitFor();assert.equal((await card.locator('.catalog-category').textContent()).trim(),productCategory+' X');
    console.log('PASS A/E product → quick create/cancel/error/edit → module switch → save → refresh → publish → public category');

    // Test C — blog.
    await page.goto(base+'/admin#admin-blog');await page.getByRole('button',{name:/Yeni yazı/}).click();
    const blogTitle='Tarayici Blog '+suffix,blogCategory='Teknik Notlar '+suffix;
    await page.getByLabel('Yazı başlığı',{exact:true}).fill(blogTitle);await page.getByLabel('Sayfa kısa adı').fill('tarayici-blog-'+suffix);
    await createCategory(blogCategory);assert.equal(await page.getByLabel('Yazı başlığı',{exact:true}).inputValue(),blogTitle);
    await page.locator('label',{hasText:'Dil ve yayın durumu'}).locator('select').nth(1).selectOption('published');
    await save();await publish();
    const article=await page.request.get(base+'/tr/blog/tarayici-blog-'+suffix+'.html');assert.equal(article.status(),200);assert.ok((await article.text()).includes(blogCategory),'public post shows category');
    console.log('PASS C blog → quick category → save → publish → public post');

    // Test D — catalogue, direct URL + refresh keep the module.
    await page.goto(base+'/admin#admin-kataloglar');await page.getByRole('button',{name:/Katalog ekle/}).click();
    const catalogTitle='Tarayici Katalog '+suffix,catalogCategory='Urun Kataloglari '+suffix;
    await page.getByLabel('Türkçe katalog adı',{exact:true}).fill(catalogTitle);await createCategory(catalogCategory);
    await page.locator('label',{hasText:/^PDF dosyası/}).locator('input').first().fill('/assets/test.pdf');await page.locator('label',{hasText:/^Yayın durumu/}).locator('select').selectOption('published');
    await save();await publish();await page.reload();assert.equal(await page.locator('#admin-tab-kataloglar').getAttribute('aria-selected'),'true');
    await page.goto(base+'/tr/kataloglar.html');await page.locator('.catalog-search input').fill(catalogTitle);
    const doc=page.locator('.catalog-document-card',{hasText:catalogTitle});await doc.waitFor();assert.equal((await doc.locator('.catalog-category').textContent()).trim(),catalogCategory);
    console.log('PASS D catalogue → quick category → save → publish → direct URL/refresh → public list');

    // Test B — recursive header tree: add child, reorder, drag to another parent, save, refresh, public header.
    await page.goto(base+'/admin#admin-site');
    await treeRow('Ürünler').getByRole('button',{name:'＋ Alt menü'}).click();
    const castingName='Döküm Test '+suffix;
    const edit=page.locator('.cms-tree-edit');await edit.getByLabel('Görünen ad',{exact:true}).fill(castingName);await edit.locator('label',{hasText:/^URL/}).locator('input').fill('dokum-test-'+suffix+'.html');
    await shot('04-tree-edit-child');await edit.getByRole('button',{name:'Tamam'}).click();
    let order=await treeChildren('Ürünler');assert.equal(order.at(-1),castingName,'new child appears under Ürünler');
    await treeRow(castingName).getByRole('button',{name:`“${castingName}” yukarı taşı`}).click();
    order=await treeChildren('Ürünler');assert.equal(order.at(-2),castingName,'move up reorders siblings');
    await treeRow(castingName).locator('.cms-tree-handle').dragTo(treeRow('Kaynaklar'));
    assert.ok((await treeChildren('Kaynaklar')).includes(castingName),'drag onto Kaynaklar reparents');assert.ok(!(await treeChildren('Ürünler')).includes(castingName));
    await shot('05-tree-after-drag');
    await noOverflow('header/footer tree');
    await save();await page.reload();await treeRow(castingName).waitFor();
    assert.ok((await treeChildren('Kaynaklar')).includes(castingName),'parent persisted after refresh');
    // Menus are staged: the saved tree is a draft until "Menüyü yayınla".
    assert.ok(!(await (await page.request.get(base+'/tr/index.html')).text()).split('<!-- HEADER END -->')[0].includes('dokum-test-'+suffix),'saved menu draft is not public yet');
    await page.locator('.draft-banner').getByRole('button',{name:'Menüyü yayınla'}).click();await page.locator('.draft-banner').waitFor({state:'detached'});
    await page.goto(base+'/tr/index.html');
    const quote=page.locator('header nav > a',{hasText:'Teklif Al'});assert.match(await quote.getAttribute('class'),/bg-\[#fb923c\]/,'CTA keeps button style');
    await page.locator('header nav > div.relative > button',{hasText:'Kaynaklar'}).click();
    await page.locator('header nav a[href="/tr/dokum-test-'+suffix+'.html"]').waitFor({state:'visible'});
    await page.waitForTimeout(250);await shot('06-public-header-dropdown');
    assert.equal(await page.locator('header nav > div.relative',{has:page.locator(':scope > button',{hasText:'Ürünler'})}).locator('a[href="/tr/dokum-test-'+suffix+'.html"]').count(),0);
    await page.setViewportSize({width:390,height:844});await page.reload();
    await page.locator('header div.lg\\:hidden a[href="/tr/dokum-test-'+suffix+'.html"]').waitFor({state:'attached'});
    console.log('PASS B navigation → add child → reorder → drag reparent → save → refresh → public desktop + mobile header');

    await page.setViewportSize({width:1440,height:1000});
    for(const id of ['urunler','blog','kataloglar','kategoriler','site']){await page.goto(base+'/admin#admin-'+id);await page.locator('#admin-content').waitFor();await noOverflow('admin '+id);}
    await page.goto(base+'/admin#admin-urunler');await page.getByRole('button',{name:/Hidrolik ekle/}).click();await noOverflow('product editor');
    await page.setViewportSize({width:390,height:844});await shot('08-product-editor-mobile');
    await page.goto(base+'/admin#admin-site');await page.waitForTimeout(200);await shot('09-tree-mobile');
    await page.setViewportSize({width:768,height:1000});await shot('10-tree-tablet');
    assert.deepEqual(errors,[],'no page JavaScript errors');
    console.log('PASS layout: no horizontal overflow at 320/390/768/1024/1440; no JS errors. Screenshots: '+shots);
  }catch(error){await shot('failure').catch(()=>{});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
