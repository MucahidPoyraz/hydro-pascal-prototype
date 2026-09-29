import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeNavigation,validateTree,moveNode,childrenOf,indentNode,outdentNode} from '../cms/app/lib/navigation-tree.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(path.join(root,'cms'));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'hydro-context-'));
process.env.CMS_DATA_DIR=temporary;
process.env.NODE_ENV='development';
const {scanPages,readContent,contentRevision,getLegacyPage}=await import('../cms/app/lib/content.js');
const {POST:createCategory}=await import('../cms/app/api/categories/route.js');
const {PUT:saveCms}=await import('../cms/app/api/cms/route.js');
const {POST:publish}=await import('../cms/app/api/content-publish/route.js');
const request=(body,revision=contentRevision(readContent()))=>({cookies:{get:()=>({value:'local-prototype-session-rotate-before-deploy'})},headers:new Headers({'if-match':revision}),json:async()=>body});
async function success(response){const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
try{
  const legacy=normalizeNavigation([{label:'A',parent:'products'},{label:'B',parent:'products'},{label:'C',parent:''}],{products:'Catalog'});
  assert.equal(legacy.length,4);assert.equal(validateTree(legacy),'');assert.deepEqual(normalizeNavigation(legacy),legacy);
  const tree=[{id:'a',parentId:'',sortOrder:0,label:'Root A',href:'#'},{id:'b',parentId:'',sortOrder:1,label:'Root B',href:'#'},{id:'c',parentId:'a',sortOrder:0,label:'Casting',href:'casting.html'},{id:'d',parentId:'c',sortOrder:0,label:'Deep child',href:'deep.html'}];
  assert.throws(()=>moveNode(tree,'a','d'));
  const moved=moveNode(tree,'c','b');assert.equal(moved.find(item=>item.id==='c').parentId,'b');
  assert.equal(childrenOf(moveNode(moved,'b','',0))[0].id,'b');
  assert.ok(validateTree([...tree,{id:'a',parentId:'',sortOrder:2}]));
  assert.ok(validateTree([{id:'missing',parentId:'unknown',sortOrder:0}]));
  assert.ok(validateTree(Array.from({length:7},(_,i)=>({id:String(i),parentId:i?String(i-1):'',sortOrder:0}))));
  const indented=indentNode(tree,'b');assert.equal(indented.find(item=>item.id==='b').parentId,'a');
  const outdented=outdentNode(indented,'b');assert.equal(outdented.find(item=>item.id==='b').parentId,'');assert.deepEqual(childrenOf(outdented).map(item=>item.id),['a','b']);
  assert.throws(()=>indentNode(tree,'a'));assert.throws(()=>outdentNode(tree,'a'));

  assert.equal((await createCategory({cookies:{get:()=>null}})).status,401);
  const revision=contentRevision(readContent());
  const created=await success(await createCategory(request({scope:'product',name:'Context Product',nameEn:'Context Product EN'})));
  assert.ok(scanPages().categories.some(item=>item.id===created.category.id));
  assert.equal((await createCategory(request({scope:'product',name:'Stale',nameEn:''},revision))).status,409);
  assert.equal((await createCategory(request({scope:'product',name:'Context Product',nameEn:''}))).status,400);

  let db=scanPages();
  db.products.push({id:'context-product',name:'Unsaved parent name',slug:'context-product',description:'Keep this draft',category:created.category.name,type:'hydraulic',active:false});
  await success(await saveCms(request(db)));
  assert.equal(scanPages().products.find(item=>item.id==='context-product').category,created.category.name);
  assert.ok(!readContent().products.some(item=>item.id==='context-product'));
  const renamed=await success(await createCategory(request({...created.category,name:'Renamed Context'})));
  let product=scanPages().products.find(item=>item.id==='context-product');
  assert.equal(product.category,renamed.category.name);assert.equal(product.description,'Keep this draft');
  await success(await publish(request({type:'products',id:product.id,mode:'publish'})));
  assert.equal(readContent().products.find(item=>item.id===product.id).category,renamed.category.name);
  db=scanPages();db.categories=db.categories.filter(item=>item.id!==renamed.category.id);
  assert.equal((await saveCms(request(db))).status,409);

  for(const [scope,type,title] of [['blog','posts','Context Blog'],['catalog','catalogues','Context Catalog']]){
    const child=await success(await createCategory(request({scope,name:title,nameEn:title+' EN'})));
    db=scanPages();
    const item=scope==='blog'?{id:'context-blog',title,slug:'context-blog',lang:'tr',category:child.category.name,content:'Draft article',published:false}:{id:'context-catalog',title,category:child.category.name,file:'/assets/context.pdf',active:false};
    db[type].push(item);await success(await saveCms(request(db)));
    assert.equal(scanPages()[type].find(row=>row.id===item.id).category,title);
    await success(await publish(request({type,id:item.id,mode:'publish'})));
    assert.equal(readContent()[type].find(row=>row.id===item.id).category,title);
  }
  // Shared English names (legacy product groups) must not make one rename touch another category's records.
  const sharedA=await success(await createCategory(request({scope:'product',name:'Shared A',nameEn:'Shared EN'})));
  const sharedB=await success(await createCategory(request({scope:'product',name:'Shared B',nameEn:'Shared EN'})));
  db=scanPages();db.products.push({id:'shared-a',name:'A',slug:'shared-a',type:'hydraulic',category:'Shared A',categoryEn:'Shared EN',active:false},{id:'shared-b',name:'B',slug:'shared-b',type:'hydraulic',category:'Shared B',categoryEn:'Shared EN',active:false});await success(await saveCms(request(db)));
  await success(await createCategory(request({...sharedA.category,nameEn:'Only A'})));
  assert.equal(scanPages().products.find(item=>item.id==='shared-a').categoryEn,'Only A');
  assert.equal(scanPages().products.find(item=>item.id==='shared-b').categoryEn,'Shared EN');
  assert.equal(sharedB.category.nameEn,'Shared EN');

  const {JSDOM}=await import('jsdom');
  // Default header keeps the static markup: Alpine dropdowns and the filled quote CTA.
  let header=new JSDOM(getLegacyPage('tr/index.html')).window.document;
  assert.ok([...header.querySelectorAll('header nav > a')].some(a=>a.className.includes('bg-[#fb923c]')&&a.getAttribute('href')==='/tr/teklif-al.html'),'quote CTA keeps button styling');
  assert.ok([...header.querySelectorAll('header nav > div.relative > button')].some(button=>button.textContent.trim()==='Ürünler'),'products dropdown rendered');
  db=scanPages();db.settings.navigation=moved;
  db.settings.footerLinks=tree.map(item=>({...item,group:'pages'}));
  await success(await saveCms(request(db)));
  assert.equal(scanPages().settings.navigation.find(item=>item.id==='c').parentId,'b');
  assert.ok(!getLegacyPage('tr/index.html').split('<!-- HEADER END -->')[0].includes('/tr/casting.html'),'saved menu draft stays out of the public header');
  assert.ok(getLegacyPage('tr/index.html','',true).split('<!-- HEADER END -->')[0].includes('/tr/casting.html'),'signed-in preview renders the menu draft');
  await success(await publish(request({type:'navigation',mode:'publish'})));
  const html=getLegacyPage('tr/index.html');
  const document=new JSDOM(html).window.document;
  const desktop=[...document.querySelectorAll('header nav > div.relative')].find(node=>node.querySelector(':scope > button')?.textContent.trim()==='Root B');
  assert.ok(desktop?.querySelector('a[href="/tr/casting.html"]'));
  assert.ok(desktop?.querySelector('a[href="/tr/deep.html"]'));
  const mobileMenu=[...document.querySelectorAll('header div[x-show="open"]')].find(node=>node.className.includes('lg:hidden'));
  assert.ok(mobileMenu?.querySelector('a[href="/tr/deep.html"]'),'mobile menu renders deep descendants');
  assert.ok(document.querySelector('footer .cms-footer-children a[href="/tr/deep.html"]'));
  db=scanPages();db.settings.navigation=db.settings.navigation.map(item=>item.id==='b'?{...item,active:false}:item);await success(await saveCms(request(db)));await success(await publish(request({type:'navigation',mode:'publish'})));
  assert.ok(!getLegacyPage('tr/index.html').split('<!-- HEADER END -->')[0].includes('casting.html'));
  db=scanPages();db.settings.navigation=db.settings.navigation.map(item=>item.id==='b'?{...item,parentId:'d'}:item);
  assert.equal((await saveCms(request(db))).status,400);
  console.log('PASS: contextual category create/edit, authorization/conflicts, draft preservation, product/blog/catalog save + publish, deletion safety, recursive header/footer persistence/render, moves/cycles/depth.');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
