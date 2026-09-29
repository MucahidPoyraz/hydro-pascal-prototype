// Structural page editor ("Sitede düzenle") — schema, operations, validation,
// draft isolation, publish and public rendering against real pages, with an
// isolated CMS_DATA_DIR. Run: node page-structure.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(path.join(root,'cms'));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'hydro-structure-'));
process.env.CMS_DATA_DIR=temporary;
process.env.NODE_ENV='development';

const schema=await import('../cms/app/lib/page-schema.js');
const {structureForRoute,publicStructure,renderStructure,extractStructure}=await import('../cms/app/lib/page-structure.js');
const {scanPages,readContent,contentRevision,getLegacyPage,allHtmlPages}=await import('../cms/app/lib/content.js');
const {POST:saveDraft}=await import('../cms/app/api/page-draft/route.js');
const {POST:publishPage}=await import('../cms/app/api/page-publish/route.js');
const {GET:structureGET}=await import('../cms/app/api/page-structure/route.js');
const {POST:previewPOST}=await import('../cms/app/[...legacy]/route.js');
const {PUT:saveCms}=await import('../cms/app/api/cms/route.js');

const token='local-prototype-session-rotate-before-deploy';
const admin={get:name=>name==='hp-admin'?{value:token}:undefined};
const request=(body,revision=contentRevision(readContent()))=>({cookies:admin,headers:new Headers({'if-match':revision}),json:async()=>body});
async function ok(response){const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
async function status(response){await response.text();return response.status;}
const route='tr/index.html',lang='tr',collection='c:features-7:items';
const base=publicStructure(structureForRoute(route));
const pageContent=()=>JSON.parse(JSON.stringify(scanPages().pages[route]));
const tree=content=>schema.resolvePage(base,content,lang);
const cards=content=>tree(content).sections.find(section=>section.key==='features-7').collections[0].items;
const publicHtml=()=>getLegacyPage(route);
const previewHtml=()=>getLegacyPage(route,'',true);
const count=(text,needle)=>text.split(needle).length-1;
let passed=0;const step=(name)=>{passed++;console.log('PASS',name);};

try{
  // ── Structure extraction on every page ───────────────────────────────
  for(const page of allHtmlPages()){
    const structure=extractStructure(fs.readFileSync(path.join(root,page),'utf8'));
    assert.ok(structure,`${page}: <main> must be parsed`);
    const keys=structure.sections.map(section=>section.key);
    assert.equal(new Set(keys).size,keys.length,`${page}: section keys must be unique`);
    const unchanged=renderStructure(fs.readFileSync(path.join(root,page),'utf8'),{},{});
    for(const section of structure.sections)assert.ok(unchanged.includes(`data-cms-key="${section.key}"`),`${page}: ${section.key} must survive a no-op render`);
  }
  step(`structure extraction + no-op render on ${allHtmlPages().length} pages`);

  const features=base.sections.find(section=>section.key==='features-7');
  assert.deepEqual(features.collections[0].items.map(item=>item.key),['content-8','content-9','content-10']);
  assert.equal(features.collections[0].itemType,'feature-card');
  assert.deepEqual(schema.resolvePage(base,{},lang).sections.map(section=>section.key),base.sections.map(section=>section.key));
  step('home page tree: Features → 3 feature cards; CTA → button collection');

  const unauthorized=await structureGET({cookies:{get:()=>undefined},url:'http://x/api/page-structure?page='+route});
  assert.equal(unauthorized.status,401);
  const apiStructure=await ok(await structureGET({cookies:admin,url:'http://x/api/page-structure?page='+route}));
  assert.equal(apiStructure.editable,true);assert.equal(apiStructure.structure.sections.length,base.sections.length);
  const blogStructure=await ok(await structureGET({cookies:admin,url:'http://x/api/page-structure?page=tr/blog/kisin-hidrolik-ekipman-bakimi.html'}));
  assert.equal(blogStructure.editable,false);
  step('page-structure API: auth required; blog posts read-only');

  // ── Acceptance scenario (task §25) on the "Size Sunduklarımız" cards ──
  let content=pageContent();
  const publishedBefore=publicHtml();
  // 1. add card
  let result=schema.addItem(base,content,lang,collection);content=result.content;const added=result.id.slice(2);
  assert.equal(cards(content).length,4);assert.equal(cards(content)[3].key,added);assert.equal(cards(content)[3].type,'feature-card');
  // 2-3. edit title + description (same field contract as existing cards)
  content[added].title='Hızlı Prototipleme';content[added].content='Numuneden seri üretime kısa sürede geçiyoruz.';
  assert.deepEqual(cards(content)[3].fields.map(field=>field.field),cards(content)[0].fields.map(field=>field.field));
  // 4-5. hide + show
  content=schema.setItemHidden(base,content,lang,'i:'+added,true).content;assert.equal(cards(content)[3].hidden,true);
  assert.ok(!renderStructure(fs.readFileSync(path.join(root,route),'utf8'),content,{preview:true}).includes(`data-cms-node="i:${added}"`),'hidden item must not render in preview');
  content=schema.setItemHidden(base,content,lang,'i:'+added,false).content;assert.equal(cards(content)[3].hidden,false);
  // 6. reorder: move to first position
  content=schema.moveItem(base,content,lang,'i:'+added,0).content;assert.equal(cards(content)[0].key,added);
  // 7-8. duplicate + edit the duplicate
  result=schema.duplicateItem(base,content,lang,'i:'+added);content=result.content;const copy=result.id.slice(2);
  assert.equal(cards(content)[1].key,copy);assert.equal(content[copy].title,'Hızlı Prototipleme (kopya)');
  content[copy].title='Mühendislik Danışmanlığı';content[copy].content='Tasarım aşamasında teknik destek veriyoruz.';
  // 9. delete an existing card
  content=schema.removeItem(base,content,lang,'i:content-10').content;
  assert.deepEqual(cards(content).map(item=>item.key),[added,copy,'content-8','content-9']);
  step('ops: add → edit → hide → show → reorder → duplicate → edit duplicate → delete');

  // 10. save draft (real API, revision-checked)
  const saved=await ok(await saveDraft(request({page:route,content})));
  assert.equal(saved.hasChanges,true);assert.ok(saved.draft.__layout);assert.equal(saved.draft[added].title,'Hızlı Prototipleme');
  // 11-12. refresh: reload from storage and compare
  const reloaded=pageContent();
  assert.deepEqual(cards(reloaded).map(item=>[item.key,item.label,item.hidden]),cards(content).map(item=>[item.key,item.label,item.hidden]));
  step('save draft + refresh: identical tree restored from storage');
  // 13. public site unchanged before publish
  const publicDraft=publicHtml();
  assert.equal(publicDraft,publishedBefore,'public page must not change before publish');
  assert.ok(!publicDraft.includes('Hızlı Prototipleme'));
  const preview=previewHtml();
  assert.ok(preview.includes('Hızlı Prototipleme')&&preview.includes('Mühendislik Danışmanlığı'),'draft preview must show new cards');
  assert.ok(preview.indexOf('Hızlı Prototipleme')<preview.indexOf('Mühendislik Danışmanlığı')&&preview.indexOf('Mühendislik Danışmanlığı')<preview.indexOf('>Rekabetçi Fiyat<'));
  assert.ok(!preview.includes('>Uzun Vadeli Ortaklık<'),'deleted card must disappear from the draft preview');
  step('draft isolation: public unchanged, preview shows draft');
  // 14-15. publish → public shows the new structure
  await ok(await publishPage(request({page:route})));
  const live=publicHtml();
  assert.ok(live.includes('>Hızlı Prototipleme<')&&live.includes('>Mühendislik Danışmanlığı<'));
  assert.ok(live.indexOf('>Hızlı Prototipleme<')<live.indexOf('>Mühendislik Danışmanlığı<')&&live.indexOf('>Mühendislik Danışmanlığı<')<live.indexOf('>Mühendislik<')&&live.indexOf('>Mühendislik<')<live.indexOf('>Rekabetçi Fiyat<'));
  assert.ok(!live.includes('>Uzun Vadeli Ortaklık<'));
  assert.equal(count(live,'data-section="'+added+'" data-field="title"'),1);
  assert.ok(live.includes(`id="${added}"`)&&live.includes('hover:shadow-[#fb923c]/20'),'new card must reuse the existing card markup/classes');
  assert.ok(!live.includes('data-cms-node'),'public HTML must not contain editor annotations');
  assert.equal(scanPages().pageDrafts[route],undefined,'draft must be cleared after publish');
  step('publish: public renders new/duplicated cards in order, deleted card gone, no editor markup');

  // ── Buttons (CTA) ────────────────────────────────────────────────────
  content=pageContent();
  const buttons='c:quote-cta:buttons';
  result=schema.addItem(base,content,lang,buttons);content=result.content;const button=result.id.slice(2);
  Object.assign(content[button],{label:'Kataloğu İncele',href:'kataloglar.html',target:'_blank',variant:'secondary'});
  content['quote-cta_btn-1']={...(content['quote-cta_btn-1']||{}),label:'Hemen Teklif Alın'};
  await ok(await saveDraft(request({page:route,content})));
  await ok(await publishPage(request({page:route})));
  const withButtons=publicHtml();
  const cta=withButtons.slice(withButtons.indexOf('data-cms-key="quote-cta"'),withButtons.indexOf('data-cms-key="content-18"'));
  assert.ok(cta.includes('class="flex flex-wrap gap-4 justify-center relative"'),'two buttons must share a flex wrapper');
  assert.ok(/href="kataloglar\.html"[^>]*target="_blank" rel="noopener noreferrer"/.test(cta.match(/<a [^>]*data-section="[^"]+" data-field="label"[^>]*>Kataloğu İncele<\/a>/)?.[0]||''),'new button keeps href/target');
  assert.ok(cta.includes('border border-white/20 bg-white/5 backdrop-blur px-8 py-4')&&cta.includes('>Hemen Teklif Alın</a>'));
  step('buttons: add + label/href/target/variant + edit existing button label, published');

  // ── Sections: add, duplicate, hide, move, restore ────────────────────
  content=pageContent();
  result=schema.addSection(base,content,lang,'cta-section',{afterId:'s:features-7'});content=result.content;const ctaKey=result.id.slice(2);
  result=schema.duplicateSection(base,content,lang,'s:content-11');content=result.content;const dup=result.id.slice(2);
  content[`${dup}_content-11`].title='İkinci Teknoloji Bölümü';
  content=schema.setSectionHidden(base,content,lang,'s:strength-badges',true).content;
  const order=tree(content).sections.map(section=>section.key);
  content=schema.moveSection(base,content,lang,'s:'+ctaKey,1).content;
  assert.equal(tree(content).sections[1].key,ctaKey);
  assert.throws(()=>schema.removeSection(base,content,lang,'s:hero-1'),/silinemez/);
  assert.throws(()=>schema.duplicateSection(base,content,lang,'s:faq-preview'),/çoğaltılamaz/);
  content=schema.removeSection(base,content,lang,'s:gallery-preview').content;
  assert.ok(schema.resolvePage(base,content,lang).removed.some(section=>section.key==='gallery-preview'));
  await ok(await saveDraft(request({page:route,content})));
  await ok(await publishPage(request({page:route})));
  const sectioned=publicHtml();
  assert.ok(sectioned.indexOf(`data-cms-key="${ctaKey}"`)<sectioned.indexOf('data-cms-key="products-2"'),'moved section must render at its new position');
  assert.ok(sectioned.includes('>İkinci Teknoloji Bölümü<')&&sectioned.includes(`id="${dup}_content-11"`));
  assert.ok(!sectioned.includes('data-cms-key="strength-badges"')&&!sectioned.includes('data-cms-key="gallery-preview"'));
  assert.ok(sectioned.includes('>Projenizi konuşalım<')&&sectioned.includes('>Teklif Al</a>'));
  content=schema.restoreSection(base,pageContent(),lang,'gallery-preview').content;
  assert.ok(tree(content).sections.some(section=>section.key==='gallery-preview'));
  assert.ok(order.length>0);
  step('sections: add CTA with default button, duplicate, hide, move, delete, restore; published');

  // ── Rules: min/max, invalid children, security, conflicts ───────────
  let broken=pageContent();
  for(const item of cards(broken).slice(1))broken=schema.removeItem(base,broken,lang,item.id).content;
  assert.throws(()=>schema.removeItem(base,broken,lang,cards(broken)[0].id),/en az 1/);
  broken=JSON.parse(JSON.stringify(broken));broken.__layout.collections['features-7:items'].items=[];
  assert.equal(await status(await saveDraft(request({page:route,content:broken}))),400,'server must enforce minItems');
  let invalid=pageContent();invalid=schema.addItem(base,invalid,lang,collection).content;
  invalid.__layout.collections['features-7:items'].items.at(-1).type='nav-item';
  assert.equal(await status(await saveDraft(request({page:route,content:invalid}))),400,'invalid child type must be rejected');
  assert.throws(()=>schema.addItem(base,pageContent(),lang,collection,{type:'button'}),/eklenemez/);
  let moved=pageContent();moved=schema.addItem(base,moved,lang,collection).content;
  moved.__layout.collections['features-7:items'].items.push({key:'content-3'});
  assert.equal(await status(await saveDraft(request({page:route,content:moved}))),400,'items of another collection cannot be moved in');
  let unsafe=pageContent();const unsafeResult=schema.addItem(base,unsafe,lang,buttons);unsafe=unsafeResult.content;unsafe[unsafeResult.id.slice(2)].href='javascript:alert(1)';
  assert.equal(await status(await saveDraft(request({page:route,content:unsafe}))),400,'unsafe href must be rejected');
  let full=pageContent();for(let index=cards(full).length;index<12;index++)full=schema.addItem(base,full,lang,collection).content;
  assert.throws(()=>schema.addItem(base,full,lang,collection),/en fazla 12/);
  const stale=contentRevision(readContent());
  await ok(await saveDraft(request({page:route,content:schema.addItem(base,pageContent(),lang,collection).content},stale)));
  assert.equal(await status(await saveDraft(request({page:route,content:pageContent()},stale))),409,'stale revision must not overwrite');
  const db=scanPages();db.pages[route]=invalid;
  assert.equal(await status(await saveCms(request(db))),400,'global save must validate structure too');
  step('rules: min/max, invalid child, cross-collection move, unsafe URL, stale revision, global save');

  // ── Preview of unsaved state (POST) ───────────────────────────────────
  const unsaved=schema.addItem(base,pageContent(),lang,collection);
  unsaved.content[unsaved.id.slice(2)].title='Kaydedilmemiş Kart';
  const form=new FormData();form.set('cmsState',JSON.stringify(unsaved.content));
  const previewResponse=await previewPOST(Object.assign(new Request('http://x/'+route+'?cmsPreview=1',{method:'POST',body:form}),{cookies:admin}),{params:Promise.resolve({legacy:route.split('/')})});
  const previewText=await previewResponse.text();
  assert.equal(previewResponse.status,200,previewText.slice(0,200));
  assert.ok(previewText.includes('>Kaydedilmemiş Kart<')&&previewText.includes(`data-cms-node="${unsaved.id}"`)&&previewText.includes('/api/admin-preview'));
  assert.ok(!publicHtml().includes('Kaydedilmemiş Kart'));
  const anonymous=await previewPOST(Object.assign(new Request('http://x/'+route,{method:'POST',body:new FormData()}),{cookies:{get:()=>undefined}}),{params:Promise.resolve({legacy:route.split('/')})});
  assert.equal(anonymous.status,404);
  step('unsaved preview POST renders editor state with node annotations; admin only');

  // ── English page uses English defaults ───────────────────────────────
  const enBase=publicStructure(structureForRoute('en/index.html'));
  const en=schema.addItem(enBase,scanPages().pages['en/index.html'],'en','c:features-7:items');
  assert.equal(en.content[en.id.slice(2)].title,'New card');
  step('language-aware defaults (EN)');

  console.log(`\n${passed} page-structure checks passed.`);
}finally{
  fs.rmSync(temporary,{recursive:true,force:true});
}
