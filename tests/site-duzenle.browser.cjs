// Browser acceptance test for the structural page editor ("Sitede düzenle").
// Run against an isolated server whose CMS_DATA_DIR is a disposable copy:
//   CMS_TEST_URL=http://localhost:3217 CMS_TEST_TOKEN=<ADMIN_TOKEN> node site-duzenle.browser.cjs
// Optional: PLAYWRIGHT_MODULE (playwright or playwright-core path), CHROMIUM_PATH, SHOT_DIR.
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CMS_TEST_URL||'http://localhost:3217';
const token=process.env.CMS_TEST_TOKEN||'local-prototype-session-rotate-before-deploy';
const shots=process.env.SHOT_DIR||os.tmpdir();

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addCookies([{name:'hp-admin',value:token,url:base}]);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  page.setDefaultTimeout(30000);
  const frame=page.frameLocator('iframe[name="cms-preview-frame"]');
  const panel=page.locator('.visual-editor-right');
  const tree=page.locator('.structure-tree');
  let step=0;const pass=name=>console.log(`PASS ${++step}. ${name}`);
  const itemRows=()=>panel.locator('.structure-item .structure-item-label > span');
  const itemLabels=async()=>(await itemRows().allTextContents()).map(text=>text.trim());
  const waitPreview=async locator=>{await locator.first().waitFor({state:'attached'});};
  const publicHtml=async()=>{const response=await page.request.get(base+'/tr/index.html',{headers:{cookie:''}});assert.equal(response.status(),200);return response.text();};
  const openEditor=async()=>{
    await page.goto(base+'/admin#admin-sayfalar');
    await page.locator('.visual-page-editor').waitFor();
    await tree.locator('.structure-row.is-section').first().waitFor();
    await waitPreview(frame.locator('[data-cms-node="s:features-7"]'));
  };
  const selectFeatures=async()=>{await tree.locator('.structure-row.is-section',{hasText:'Size Sunduklarımız'}).click();await panel.locator('.structure-collection',{hasText:'Kartlar'}).waitFor();};
  const action=name=>panel.locator('.structure-actions button',{hasText:new RegExp('^'+name+'$')});
  try{
    await openEditor();
    const beforePublic=await publicHtml();
    // Tree shows real hierarchy (sections → collections → items → fields).
    await selectFeatures();
    assert.deepEqual(await itemLabels(),['Mühendislik','Rekabetçi Fiyat','Uzun Vadeli Ortaklık']);
    assert.equal(await frame.locator('[data-cms-node="s:features-7"][data-cms-admin-selected="true"]').count(),1,'tree selection must highlight the section in the preview');
    await frame.locator('.cms-node-toolbar',{hasText:'+ Kart'}).waitFor();
    await tree.locator('.structure-row.is-collection',{hasText:'Kartlar'}).waitFor();
    await tree.locator('.structure-row.is-item',{hasText:'Rekabetçi Fiyat'}).waitFor();
    await page.screenshot({path:path.join(shots,'site-duzenle-1-section.png')});
    pass('tree hierarchy + section selection → preview highlight + schema quick actions (+ Kart)');

    // 1. Add card
    await panel.locator('.structure-add-item',{hasText:'Kart ekle'}).click();
    await waitPreview(frame.locator('[data-field="title"]',{hasText:'Yeni kart'}));
    const newKey=await frame.locator('[data-field="title"]',{hasText:'Yeni kart'}).getAttribute('data-section');
    assert.ok(/^n[0-9a-f]+$/.test(newKey),newKey);
    assert.equal(await frame.locator(`[data-cms-node="i:${newKey}"]`).getAttribute('class'),await frame.locator('[data-cms-node="i:content-9"]').getAttribute('class'),'new card must reuse the existing card component classes');
    await panel.locator('.structure-back').waitFor();
    pass('add card: rendered by the site renderer with the same component classes; new card selected');
    // 2-3. Edit title + description (live preview)
    await panel.getByLabel('Başlık',{exact:true}).fill('Hızlı Prototipleme');
    await panel.getByLabel('Açıklama',{exact:true}).fill('Numuneden seri üretime kısa sürede geçiyoruz.');
    await frame.locator(`[data-section="${newKey}"][data-field="title"]`,{hasText:'Hızlı Prototipleme'}).waitFor();
    await frame.locator(`[data-section="${newKey}"][data-field="content"]`,{hasText:'Numuneden seri üretime'}).waitFor();
    await tree.locator('.structure-row.is-item',{hasText:'Hızlı Prototipleme'}).waitFor();
    pass('edit title + description: live in preview and tree');
    // 4. Hide
    await action('Gizle').click();
    await frame.locator(`[data-cms-node="i:${newKey}"]`).waitFor({state:'detached'});
    await tree.locator('.structure-row.is-item',{hasText:'Hızlı Prototipleme'}).locator('.structure-badge.is-hidden').waitFor();
    pass('hide: removed from preview, stays in tree with hidden badge');
    // 5. Show
    await action('Göster').click();
    await waitPreview(frame.locator(`[data-cms-node="i:${newKey}"]`));
    pass('show: back in preview');
    // 6. Reorder (buttons + keyboard + drag & drop)
    await action('↑').click();await action('↑').click();
    await panel.locator('.visual-properties-heading small',{hasText:'Kart 2 / 4'}).waitFor();
    await panel.locator('.structure-back').click();
    await panel.locator('.structure-item-label',{hasText:'Hızlı Prototipleme'}).focus();await page.keyboard.press('Alt+ArrowUp');
    await page.waitForFunction(()=>document.querySelector('.visual-editor-right .structure-item .structure-item-label > span')?.textContent.trim()==='Hızlı Prototipleme');
    await panel.locator('.structure-item',{hasText:'Uzun Vadeli Ortaklık'}).dragTo(panel.locator('.structure-item',{hasText:'Mühendislik'}));
    assert.deepEqual(await itemLabels(),['Hızlı Prototipleme','Uzun Vadeli Ortaklık','Mühendislik','Rekabetçi Fiyat']);
    await page.waitForFunction(key=>{const doc=document.querySelector('iframe[name="cms-preview-frame"]').contentDocument;const nodes=[...doc.querySelectorAll('[data-cms-node="s:features-7"] [data-cms-node^="i:"]')].map(node=>node.dataset.cmsNode);return nodes.indexOf('i:'+key)===0&&nodes.indexOf('i:content-10')===1;},newKey);
    pass('reorder: ↑ button, Alt+↑ keyboard and drag & drop; preview order follows');
    // 7. Duplicate
    await panel.locator('.structure-item',{hasText:'Hızlı Prototipleme'}).locator('button[title="Çoğalt"]').click();
    await waitPreview(frame.locator('[data-field="title"]',{hasText:'Hızlı Prototipleme (kopya)'}));
    const copyKey=await frame.locator('[data-field="title"]',{hasText:'Hızlı Prototipleme (kopya)'}).getAttribute('data-section');
    pass('duplicate: copy inserted after the source');
    // 8. Edit duplicate
    await panel.getByLabel('Başlık',{exact:true}).fill('Mühendislik Danışmanlığı');
    await frame.locator(`[data-section="${copyKey}"][data-field="title"]`,{hasText:'Mühendislik Danışmanlığı'}).waitFor();
    pass('edit duplicate independently');
    // Preview → tree/properties selection sync
    await frame.locator('[data-section="content-9"][data-field="title"]').click();
    await panel.locator('h4',{hasText:'Rekabetçi Fiyat'}).waitFor();
    assert.equal(await tree.locator('.structure-row.is-item.is-selected').innerText().then(text=>text.includes('Rekabetçi Fiyat')),true);
    assert.equal(await panel.getByLabel('Başlık',{exact:true}).evaluate(node=>document.activeElement===node),true,'clicked field must be focused in the properties panel');
    pass('preview click → tree item selected → properties of that card (field focused)');
    // 9. Delete
    await tree.locator('.structure-row.is-item',{hasText:'Uzun Vadeli Ortaklık'}).click();
    assert.equal(await frame.locator('[data-cms-node="i:content-10"][data-cms-admin-selected="true"]').count(),1,'tree → preview highlight');
    await action('Sil').click();
    await frame.locator('[data-cms-node="i:content-10"]').waitFor({state:'detached'});
    await selectFeatures();
    const expected=['Hızlı Prototipleme','Mühendislik Danışmanlığı','Mühendislik','Rekabetçi Fiyat'];
    assert.deepEqual(await itemLabels(),expected);
    pass('delete (confirmed) removes the card');
    // Undo / redo is part of the history
    await page.locator('.visual-tool-button',{hasText:'Geri al'}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.visual-editor-right .structure-item')].length===5);
    await page.locator('.visual-tool-button',{hasText:'Yinele'}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.visual-editor-right .structure-item')].length===4);
    await frame.locator('[data-cms-node="i:content-10"]').waitFor({state:'detached'});
    pass('undo restores the deleted card, redo deletes it again (preview re-rendered)');
    await page.screenshot({path:path.join(shots,'site-duzenle-2-edited.png')});

    // CTA buttons: collection with + Düğme ekle
    await tree.locator('.structure-row.is-section',{hasText:'Özel Teklif Almaya Hazır mısınız?'}).click();
    await panel.locator('.structure-add-item',{hasText:'Düğme ekle'}).click();
    await panel.getByLabel('Düğme yazısı',{exact:true}).fill('Kataloğu İncele');
    await panel.getByLabel('Bağlantı adresi',{exact:true}).fill('kataloglar.html');
    await panel.getByLabel('Düğme stili',{exact:true}).selectOption('secondary');
    await frame.locator('a[data-field="label"]',{hasText:'Kataloğu İncele'}).waitFor();
    assert.ok((await frame.locator('a[data-field="label"]',{hasText:'Kataloğu İncele'}).getAttribute('class')).includes('border-white/20'));
    pass('CTA: + Düğme ekle, label/href/style from button schema');

    // 10. Save draft
    const draftResponse=page.waitForResponse(response=>response.url().endsWith('/api/page-draft'));
    await page.locator('.visual-save-button').click();
    assert.equal((await draftResponse).status(),200);
    await page.locator('.visual-draft-badge.is-draft').waitFor();
    pass('save draft (revision-checked API)');
    // 11-12. Refresh and verify
    await page.reload();await openEditor();await selectFeatures();
    assert.deepEqual(await itemLabels(),expected);
    await frame.locator('[data-field="title"]',{hasText:'Mühendislik Danışmanlığı'}).waitFor();
    assert.equal(await frame.locator('[data-cms-node="i:content-10"]').count(),0);
    pass('refresh: tree + preview restored from the saved draft');
    // 13. Public site unchanged before publish
    const draftPublic=await publicHtml();
    assert.ok(!draftPublic.includes('Hızlı Prototipleme')&&draftPublic.includes('>Uzun Vadeli Ortaklık<'));
    assert.equal(draftPublic.length,beforePublic.length,'public HTML must be unchanged by a draft');
    pass('public site unchanged before publish');
    // 14. Publish
    const publishResponse=page.waitForResponse(response=>response.url().endsWith('/api/page-publish'));
    await page.locator('.visual-publish-button').click();
    assert.equal((await publishResponse).status(),200);
    await page.locator('.visual-draft-badge:not(.is-draft)').waitFor();
    pass('publish');
    // 15. Public site shows the new structure
    const live=await publicHtml();
    const positions=['>Hızlı Prototipleme<','>Mühendislik Danışmanlığı<','>Mühendislik<','>Rekabetçi Fiyat<'].map(text=>live.indexOf(text));
    assert.ok(positions.every(value=>value>0)&&positions.every((value,index)=>!index||value>positions[index-1]),JSON.stringify(positions));
    assert.ok(!live.includes('>Uzun Vadeli Ortaklık<')&&!live.includes('data-cms-node'));
    assert.ok(/<a [^>]*href="kataloglar\.html"[^>]*>Kataloğu İncele<\/a>/.test(live));
    const publicPage=await context.newPage();await publicPage.goto(base+'/tr/index.html');
    await publicPage.locator('#features-7 h3',{hasText:'Hızlı Prototipleme'}).waitFor();
    await publicPage.locator('#features-7').screenshot({path:path.join(shots,'site-duzenle-3-public-features.png')});
    await publicPage.close();
    pass('public site after publish: new + duplicated cards in order, deleted card gone, new CTA button');

    // Section add from schema palette + contextual preview action
    await openEditor();
    await tree.locator('.structure-row.is-section',{hasText:'Size Sunduklarımız'}).click();
    await frame.locator('.cms-node-toolbar .cms-node-action',{hasText:'+ Bölüm'}).click();
    await page.locator('.structure-palette').waitFor();
    await page.locator('.structure-palette .visual-add-section',{hasText:'Kart ızgarası'}).click();
    await panel.locator('.structure-collection',{hasText:'Kartlar'}).waitFor();
    assert.equal(await panel.locator('.structure-item').count(),3);
    await frame.locator('main > [data-cms-node^="s:s"] h2',{hasText:'Yeni kart bölümü'}).waitFor();
    const sectionOrder=await frame.locator('main > [data-cms-node^="s:"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.cmsNode));
    assert.equal(sectionOrder[sectionOrder.indexOf('s:features-7')+1].startsWith('s:s'),true,'new section inserted after the selected one');
    for(let index=0;index<3;index++)await panel.locator('.structure-item').first().locator('button[title="Sil"]').click();
    await panel.locator('.structure-empty-state',{hasText:'Henüz kart yok.'}).waitFor();
    await frame.locator('.cms-empty-collection').waitFor();
    pass('+ Bölüm from preview quick action → schema palette → Kart ızgarası; empty state after deleting all cards');
    await page.locator('.visual-tool-button',{hasText:'Geri al'}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.visual-editor-right .structure-item').length===1);

    // Min rule on existing card grids: the last required card cannot be deleted.
    await tree.locator('.structure-row.is-section',{hasText:'Strength badges'}).click();
    const badgeDelete=panel.locator('.structure-item').locator('button[title="Sil"], button[title^="En az"]');
    assert.equal(await badgeDelete.count(),3);
    for(let index=0;index<2;index++)await panel.locator('.structure-item').first().locator('button[title="Sil"]').click();
    assert.equal(await panel.locator('.structure-item button.is-danger').first().isDisabled(),true,'last required card must not be deletable');
    pass('minItems: last required card delete disabled');

    // Responsive admin + preview
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no horizontal overflow at 390px');
    await page.screenshot({path:path.join(shots,'site-duzenle-4-mobile.png'),fullPage:false});
    await page.setViewportSize({width:1600,height:1000});
    pass('admin editor at 390px: no horizontal overflow');

    assert.deepEqual(errors,[],'no JavaScript errors');
    console.log(`\n${step} browser acceptance checks passed.`);
  }catch(error){
    await page.screenshot({path:path.join(shots,'site-duzenle-failure.png')}).catch(()=>{});
    throw error;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
