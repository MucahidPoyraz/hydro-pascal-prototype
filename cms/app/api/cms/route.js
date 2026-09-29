import {normalizeNavigation,validateTree} from '../../lib/navigation-tree.js';
import {allHtmlPages,contentRevision,ContentConflictError,scanPages,updateContent} from '../../lib/content.js';
import {isAdminRequest} from '../../lib/auth.js';
import {iconNames} from '../../lib/icons.js';
import {normalizeCategoryName} from '../../lib/category-utils.js';
import {isLegacyBlogRoute} from '../../lib/legacy-blog-import.js';
import {validatePageStructure} from '../../lib/page-structure.js';
import {audit} from '../../lib/audit.js';
import {validatePageSeo,validateRecordSeo,validateSeoSettings} from '../../lib/seo-validation.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}});}
function fail(message,status=400){return json({error:message},status);}
class CategoryInUseError extends Error {}
function isObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function bounded(value,max){return typeof value==='string'&&value.length<=max;}
function safePublicUrl(value){const url=String(value||'').trim();const scheme=url.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();return !url||((!scheme||['http','https','mailto','tel'].includes(scheme))&&!/[\u0000-\u001f\u007f\\]/.test(url));}
function validPdfReference(value){const url=String(value||'').trim();return !url||(safePublicUrl(url)&&!/^(?:mailto|tel):/i.test(url)&&/\.pdf(?:[?#].*)?$/i.test(url));}
function cleanManagedRecord(record){const clean={...record};for(const key of ['hasDraft','hasPublishedVersion','pendingDelete'])delete clean[key];return clean;}
function stableValue(value){if(Array.isArray(value))return value.map(stableValue);if(!isObject(value))return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));}
function sameRecord(left,right){return JSON.stringify(stableValue(left))===JSON.stringify(stableValue(right));}
function stageRecords(publishedRows,adminRows,incomingRows,storedDrafts={}){
  const published=new Map(publishedRows.map(item=>[String(item.id),cleanManagedRecord(item)]));
  const previous=new Map(adminRows.map(item=>[String(item.id),cleanManagedRecord(item)]));
  const incoming=new Map(incomingRows.map(item=>[String(item.id),cleanManagedRecord(item)]));
  const drafts={...(isObject(storedDrafts)?storedDrafts:{})};
  for(const id of new Set([...published.keys(),...previous.keys(),...incoming.keys()])){
    if(!incoming.has(id)){
      if(published.has(id))drafts[id]={_deleted:true};
      else delete drafts[id];
      continue;
    }
    const value=incoming.get(id),live=published.get(id),was=previous.get(id);
    if(live&&sameRecord(value,live)){delete drafts[id];continue;}
    if(was&&sameRecord(value,was))continue;
    drafts[id]=value;
  }
  return drafts;
}
function validatePayload(value){
  if(!isObject(value)||!isObject(value.settings)||!isObject(value.pages))return 'İçerik verisi geçersiz. Sayfayı yenileyip yeniden deneyin.';
  if(JSON.stringify(value).length>8_000_000)return 'İçerik verisi 8 MB sınırını aşıyor.';
  if(!Array.isArray(value.products)||value.products.length>500)return 'Ürün listesi geçersiz veya 500 kayıt sınırını aşıyor.';
  if(!Array.isArray(value.posts)||value.posts.length>500)return 'Blog listesi geçersiz veya 500 kayıt sınırını aşıyor.';
  if(!Array.isArray(value.catalogues)||value.catalogues.length>300)return 'Katalog listesi geçersiz veya 300 kayıt sınırını aşıyor.';
  if(!Array.isArray(value.references)||value.references.length>300)return 'Referans listesi geçersiz veya 300 kayıt sınırını aşıyor.';
  if(!Array.isArray(value.mediaItems)||value.mediaItems.length>300)return 'Medya listesi geçersiz veya 300 kayıt sınırını aşıyor.';
  if(value.categories!==undefined&&(!Array.isArray(value.categories)||value.categories.length>300))return 'Kategori listesi geçersiz veya 300 kayıt sınırını aşıyor.';
  if(!Array.isArray(value.settings.navigation)||value.settings.navigation.length>40)return 'Menü listesi geçersiz veya 40 bağlantı sınırını aşıyor.';
  if(value.settings.navigationGroups!==undefined&&!isObject(value.settings.navigationGroups))return 'Açılır menü başlıkları geçersiz.';
  for(const key of ['products','productsEn','resources','resourcesEn'])if(value.settings.navigationGroups?.[key]!==undefined&&!bounded(String(value.settings.navigationGroups[key]),120))return 'Bir açılır menü başlığı 120 karakteri aşamaz.';
  if(!Array.isArray(value.settings.footerLinks)||value.settings.footerLinks.length>40)return 'Footer bağlantıları geçersiz veya 40 bağlantı sınırını aşıyor.';
  if(!Array.isArray(value.tasks)||value.tasks.length>300)return 'Görev listesi geçersiz veya 300 kayıt sınırını aşıyor.';
  const routes=allHtmlPages();
  const routeSet=new Set(routes);
  const staticBlogRoutes=new Set(routes.filter(route=>/^(tr|en)\/blog\/[^/]+\.html$/.test(route)));
  const productIds=new Set(),productCodes=new Set(),productSlugs=new Set();
  for(const product of value.products){
    if(!isObject(product)||!String(product.id||'').trim()||!bounded(String(product.id||''),120)||!bounded(String(product.name||''),200)||!bounded(String(product.code||''),120)||!bounded(String(product.category||''),100)||!bounded(String(product.description||''),3000)||!bounded(String(product.image||''),2048)||(product.active!==undefined&&typeof product.active!=='boolean')||(product.sortOrder!==undefined&&(!Number.isFinite(product.sortOrder)||product.sortOrder<0)))return 'Bir ürün alanı boş veya izin verilen uzunluğu aşıyor.';
    if(productIds.has(product.id))return 'Ürün kayıtlarının kimlikleri birbirinden farklı olmalı.';productIds.add(product.id);
    const productCode=String(product.type||'hydraulic').toLocaleLowerCase('en')+':'+String(product.code||'').trim().toLocaleLowerCase('en');
    if(product.code&&productCodes.has(productCode))return 'Aynı ürün grubunda ürün kodları birbirinden farklı olmalı.';if(product.code)productCodes.add(productCode);
    if(product.slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug))return 'Ürün sayfa adında küçük İngilizce harfler, rakamlar ve tek tire kullanın.';
    if(product.type!==undefined&&!['hydraulic','oem','cast','forge'].includes(product.type))return 'Ürün türü geçersiz.';
    if(product.slug&&productSlugs.has(product.slug))return 'Ürün sayfa adresleri birbirinden farklı olmalı.';if(product.slug)productSlugs.add(product.slug);
    if(product.image&&!safePublicUrl(product.image)||product.pdf&&!safePublicUrl(product.pdf))return 'Ürün görseli veya dosya bağlantısı geçersiz.';
    for(const [field,max] of Object.entries({seoTitle:200,seoTitleEn:200,seoDescription:300,seoDescriptionEn:300,seoImage:2048}))if(product[field]!==undefined&&!bounded(String(product[field]||''),max))return 'Ürün SEO alanı geçersiz.';
    if(product.seoImage&&!safePublicUrl(product.seoImage))return 'Ürün sosyal paylaşım görseli bağlantısı geçersiz.';
    if(product.seoIndex!==undefined&&typeof product.seoIndex!=='boolean'||product.noIndex!==undefined&&typeof product.noIndex!=='boolean')return 'Ürün arama görünürlüğü ayarı geçersiz.';
    if(product.active!==false&&(!String(product.name||'').trim()||!String(product.slug||'').trim()))return 'Yayındaki ürünlerde ad ve sayfa adresi bulunmalı.';
    const productSeoError=validateRecordSeo('product',product);if(productSeoError)return productSeoError;
    if(product.gallery!==undefined&&(!Array.isArray(product.gallery)||product.gallery.length>40||product.gallery.some(item=>!isObject(item)||!bounded(String(item.id||''),120)||!bounded(String(item.url||''),2048)||!bounded(String(item.alt||''),240)||!bounded(String(item.altEn||''),240))))return 'Ürün görsel galerisi geçersiz veya 40 görsel sınırını aşıyor.';
    if(Array.isArray(product.gallery)&&product.gallery.some(item=>!safePublicUrl(item.url)))return 'Ürün galerisinde geçersiz görsel bağlantısı var.';
    if(Array.isArray(product.attachments)&&product.attachments.some(item=>!isObject(item)||!bounded(String(item.id||''),120)||!bounded(String(item.name||''),180)||!safePublicUrl(item.url)))return 'Ürün ek dosyalarından biri geçersiz.';
    for(const field of ['dimensionRows','dimensionGroups','compatibleBrands','attachments'])if(product[field]!==undefined&&!Array.isArray(product[field]))return 'Ürünün teknik detay listesi geçersiz.';
    if((product.dimensionRows?.length||0)>150||(product.dimensionGroups?.length||0)>40||(product.compatibleBrands?.length||0)>100||(product.attachments?.length||0)>30)return 'Ürün teknik detay listesi izin verilen kayıt sayısını aşıyor.';
  }
  const postSlugs=new Set(),postIds=new Set();
  for(const post of value.posts){
    if(!isObject(post)||!String(post.id||'').trim()||!['tr','en'].includes(post.lang||'tr')||!bounded(String(post.id||''),120)||!bounded(String(post.slug||''),120)||!bounded(String(post.title||''),200)||!bounded(String(post.category||''),100)||!bounded(String(post.excerpt||''),1000)||!bounded(String(post.content||''),100000)||!bounded(String(post.image||''),2048))return 'Bir blog alanı boş veya izin verilen uzunluğu aşıyor.';
    if(post.image&&!safePublicUrl(post.image))return 'Blog kapak görseli bağlantısı geçersiz.';
    if(post.published!==undefined&&typeof post.published!=='boolean')return 'Blog yazısının yayın durumu geçersiz.';
    if(post.published!==false&&(!post.slug||!String(post.title||'').trim()))return 'Yayındaki yazılarda başlık ve sayfa adresi bulunmalı.';
    if(post.slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug))return 'Sayfa adresinde küçük İngilizce harfler, rakamlar ve tek tire kullanılabilir.';
    for(const [field,max] of Object.entries({date:10,seoTitle:200,seoDescription:300,ogImage:2048,canonical:2048,legacyPath:2048,sourceHash:64,legacySourceContentHash:64}))if(post[field]!==undefined&&!bounded(String(post[field]||''),max))return 'Blog SEO alanı geçersiz.';
    if(post.ogImage&&!safePublicUrl(post.ogImage)||post.canonical&&!safePublicUrl(post.canonical))return 'Blog SEO bağlantısı geçersiz.';
    if(post.date&&!/^\d{4}-\d{2}-\d{2}$/.test(post.date))return 'Blog tarihi geçersiz.';
    if(post.legacy!==undefined&&typeof post.legacy!=='boolean')return 'Eski blog işareti geçersiz.';
    const postSeoError=validateRecordSeo('post',post,value.posts);if(postSeoError)return postSeoError;
    const uniqueKey=(post.lang||'tr')+':'+post.slug;
    if(post.slug&&postSlugs.has(uniqueKey))return 'Aynı dilde iki yazı aynı sayfa adresini kullanamaz.';
    if(post.id&&postIds.has(post.id))return 'Blog yazılarının kimlikleri birbirinden farklı olmalı.';
    const postRoute=`${post.lang||'tr'}/blog/${post.slug}.html`;
    if(post.slug&&staticBlogRoutes.has(postRoute)&&post.legacy!==true)return 'This blog address already exists.';
    if(post.legacy===true&&(!isLegacyBlogRoute(post.legacyPath)||post.legacyPath!==postRoute||!staticBlogRoutes.has(postRoute)||!/^[a-f0-9]{64}$/.test(post.sourceHash||'')))return 'The imported legacy blog source is invalid.';
    if(post.slug)postSlugs.add(uniqueKey);
    if(post.id)postIds.add(post.id);
  }
  const catalogueIds=new Set();
  for(const catalogue of value.catalogues){
    if(!isObject(catalogue)||!String(catalogue.id||'').trim()||!bounded(String(catalogue.id||''),120)||!bounded(String(catalogue.title||''),200)||!bounded(String(catalogue.titleEn||''),200)||!bounded(String(catalogue.category||''),100)||!bounded(String(catalogue.categoryEn||''),100)||!bounded(String(catalogue.description||''),3000)||!bounded(String(catalogue.descriptionEn||''),3000)||!bounded(String(catalogue.file||''),2048)||!bounded(String(catalogue.fileEn||''),2048)||(catalogue.active!==undefined&&typeof catalogue.active!=='boolean')||(catalogue.sortOrder!==undefined&&(!Number.isFinite(catalogue.sortOrder)||catalogue.sortOrder<0)))return 'Bir katalog alanı geçersiz veya izin verilen uzunluğu aşıyor.';
    if(catalogueIds.has(catalogue.id))return 'Katalog kayıtlarının kimlikleri birbirinden farklı olmalı.';catalogueIds.add(catalogue.id);
    if(catalogue.active!==false&&(!String(catalogue.title||'').trim()||!validPdfReference(catalogue.file)))return 'Yayındaki kataloglarda Türkçe ad ve geçerli PDF bağlantısı bulunmalı.';
    if(!validPdfReference(catalogue.file)||!validPdfReference(catalogue.fileEn))return 'Katalog dosyası PDF olmalı ve güvenli bir adres kullanmalı.';
  }
  for(const item of value.settings.navigation){
    if(!isObject(item)||!bounded(String(item.id||''),120)||!bounded(String(item.match||''),2048)||!bounded(String(item.label||''),120)||!bounded(String(item.labelEn||''),120)||!bounded(String(item.href||''),2048)||(item.parentId!==undefined&&typeof item.parentId!=='string')||(item.active!==undefined&&typeof item.active!=='boolean')||(item.newTab!==undefined&&typeof item.newTab!=='boolean')||(item.variant!==undefined&&!['','button'].includes(item.variant))||!safePublicUrl(item.href))return 'Bir menü alanı boş veya izin verilen uzunluğu aşıyor.';
  }
  const treeError=validateTree(normalizeNavigation(value.settings.navigation,value.settings.navigationGroups))||validateTree(normalizeNavigation(value.settings.footerLinks));
  if(treeError)return treeError;
  const footerIds=new Set();
  for(const item of value.settings.footerLinks){
    if(!isObject(item)||!bounded(String(item.id||''),80)||!bounded(String(item.label||''),120)||!bounded(String(item.labelEn||''),120)||!bounded(String(item.href||''),2048)||!['pages','quick'].includes(item.group)||!safePublicUrl(item.href))return 'Bir footer bağlantısı geçersiz veya izin verilen uzunluğu aşıyor.';
    if(footerIds.has(item.id))return 'Footer bağlantılarının kimlikleri birbirinden farklı olmalı.';footerIds.add(item.id);
  }
  const categoryIds=new Set(),categoryNames=new Set();
  for(const category of value.categories||[]){
    if(!isObject(category)||!String(category.id||'').trim()||!bounded(String(category.id||''),120)||!['blog','product','catalog'].includes(category.scope)||!bounded(String(category.name||''),100)||!bounded(String(category.nameEn||''),100)||!String(category.name||'').trim())return 'Bir kategori adı boş veya izin verilen uzunluğu aşıyor.';
    const key=category.scope+':'+normalizeCategoryName(category.name);
    if(categoryIds.has(category.id))return 'Kategori kayıtlarının kimlikleri birbirinden farklı olmalı.';categoryIds.add(category.id);
    if(categoryNames.has(key))return 'Aynı modülde kategori adları birbirinden farklı olmalı.';categoryNames.add(key);
  }
  for(const page of Object.values(value.pages)){
    const slides=page?.['hero-1']?.slides;
    if(slides!==undefined&&(!Array.isArray(slides)||slides.length<1||slides.length>12||slides.some(slide=>!isObject(slide)||!bounded(String(slide.src||''),2048)||!safePublicUrl(slide.src)||!bounded(String(slide.alt||''),240))))return 'Ana sayfa slider alanında 1 ile 12 arasında geçerli görsel bulunmalı.';
    const blocks=page?.__blocks?.items;
    if(blocks!==undefined&&(!Array.isArray(blocks)||blocks.length>30||blocks.some(block=>!isObject(block)||!bounded(String(block.id||''),120)||!['text','image','quote'].includes(block.type)||!bounded(String(block.title||''),240)||!bounded(String(block.content||''),10000)||!bounded(String(block.image||''),2048)||!safePublicUrl(block.image)||!bounded(String(block.alt||''),240)||(block.active!==undefined&&typeof block.active!=='boolean'))))return 'Sayfa bölüm listesi geçersiz veya 30 bölüm sınırını aşıyor.';
    const visual=page?.__visual;
    if(visual!==undefined&&(!isObject(visual)||Object.keys(visual).length>250||Object.entries(visual).some(([key,patch])=>!key||!bounded(key,1200)||!isObject(patch)||Object.keys(patch).some(name=>!['text','src','alt','href','hrefSelector','icon'].includes(name))||Object.entries(patch).some(([name,item])=>!bounded(String(item??''),name==='text'?10000:2048)||(['src','href'].includes(name)&&!safePublicUrl(item)))||patch.icon&&!iconNames.includes(patch.icon))))return 'Sayfa üzeri düzenleme alanları geçersiz veya 250 kayıt sınırını aşıyor.';
  }
  for(const [route,page] of Object.entries(value.pages)){const invalid=validatePageStructure(route,page)||validatePageSeo(page?.__seo);if(invalid)return invalid;}
  const settingsError=validateSeoSettings(value.settings);if(settingsError)return settingsError;
  const validateShowcase=(items,isMedia)=>items.some(item=>!isObject(item)||!bounded(String(item.id||''),120)||!bounded(String(item.name||''),180)||!bounded(String(item.nameEn||''),180)||!bounded(String(item.title||''),180)||!bounded(String(item.titleEn||''),180)||!bounded(String(item.alt||''),240)||!bounded(String(item.altEn||''),240)||!bounded(String(item.image||''),2048)||!bounded(String(item.url||''),2048)||!safePublicUrl(item.image)||!safePublicUrl(item.url)||(item.active!==undefined&&typeof item.active!=='boolean'));
  if(validateShowcase(value.references,false))return 'Bir referans alanı geçersiz veya izin verilen uzunluğu aşıyor.';
  if(validateShowcase(value.mediaItems,true))return 'Bir medya alanı geçersiz veya izin verilen uzunluğu aşıyor.';
  const taskIds=new Set();
  for(const task of value.tasks){
    if(!isObject(task)||!bounded(String(task.id||''),120)||!bounded(String(task.title||''),200)||!bounded(String(task.page||''),2048)||!bounded(String(task.section||''),120)||!bounded(String(task.assignee||''),120)||!bounded(String(task.dueDate||''),10)||!bounded(String(task.note||''),2000)||!['Yeni','Devam ediyor','İncelemede','Tamamlandı'].includes(task.status||'Yeni'))return 'Bir görev alanı boş veya izin verilen uzunluğu aşıyor.';
    if(!routeSet.has(task.page))return 'Görev için geçerli bir site sayfası seçilmeli.';
    if(taskIds.has(task.id))return 'Görev kayıtlarının kimlikleri birbirinden farklı olmalı.';taskIds.add(task.id);
  }
  return '';
}

export async function GET(req){
  if(!isAdminRequest(req))return fail('Oturum gerekli',401);
  const snapshot=scanPages();
  delete snapshot.settings.smtpPass;
  return json(snapshot);
}

export async function PUT(req){
  if(!isAdminRequest(req))return fail('Oturum gerekli',401);
  const contentLength=Number(req.headers.get('content-length')||0);
  if(contentLength>8*1024*1024)return fail('İçerik verisi 8 MB sınırını aşıyor.',413);
  try{
    const next=await req.json();
    const invalid=validatePayload(next);if(invalid)return fail(invalid,/sınırını aşıyor/i.test(invalid)?413:400);
    const expectedRevision=req.headers.get('if-match')?.replace(/^"|"$/g,'');
    if(!/^[a-f0-9]{64}$/.test(expectedRevision||''))return fail('Kayıt sürümü eksik. Sayfayı yenileyip yeniden deneyin.',428);
    let navigationDraftSaved=false;
    const savedContent=await updateContent(current=>{
      const base=scanPages({includeDrafts:false});
      const previous=scanPages();
      for(const category of previous.categories||[]){
        if((next.categories||[]).some(item=>item.id===category.id))continue;
        const type={product:'products',blog:'posts',catalog:'catalogues'}[category.scope];
        const names=[category.name,category.nameEn].filter(Boolean).map(normalizeCategoryName);
        if([...(base[type]||[]),...(next[type]||[])].some(item=>[item.category,item.categoryEn].some(name=>name&&names.includes(normalizeCategoryName(name)))))throw new CategoryInUseError('Kullanımdaki kategori silinemez. Önce bağlı içerikleri başka kategoriye taşıyıp yayımlayın.');
      }
      const contentDrafts={...(current.contentDrafts||{})};
      contentDrafts.products=stageRecords(base.products,previous.products,next.products,contentDrafts.products);
      contentDrafts.posts=stageRecords(base.posts,previous.posts,next.posts,contentDrafts.posts);
      contentDrafts.catalogues=stageRecords(base.catalogues,previous.catalogues,next.catalogues,contentDrafts.catalogues);
      const pageDrafts={...(current.pageDrafts||{})};
      for(const route of new Set([...Object.keys(previous.pages||{}),...Object.keys(next.pages||{})])){
        const incoming=next.pages?.[route];
        if(!incoming||JSON.stringify(incoming)===JSON.stringify(previous.pages?.[route]))continue;
        if(JSON.stringify(incoming)===JSON.stringify(base.pages?.[route]))delete pageDrafts[route];
        else pageDrafts[route]=incoming;
      }
      const {publishedPages:_publishedPages,pageDrafts:_baseDrafts,_revision:_baseRevision,hasNavigationDraft:_baseNavigationDraft,...baseData}=base;
      const {publishedPages:_requestedPublished,pageDrafts:_requestedDrafts,_revision:_requestedRevision,navigationDraft:_requestedNavigationDraft,hasNavigationDraft:_requestedHasNavigationDraft,...nextData}=next;
      // Menus go live only through the navigation publish action; a save stages them.
      const incomingNavigation=normalizeNavigation(next.settings.navigation,next.settings.navigationGroups);
      const incomingFooter=normalizeNavigation(next.settings.footerLinks);
      const menusChanged=!sameRecord(incomingNavigation,base.settings.navigation)||!sameRecord(incomingFooter,base.settings.footerLinks);
      navigationDraftSaved=menusChanged;
      return {
        ...baseData,
        ...nextData,
        settings:{...base.settings,...next.settings,navigation:base.settings.navigation,footerLinks:base.settings.footerLinks,smtpPass:current.settings?.smtpPass||''},
        navigationDraft:menusChanged?{navigation:incomingNavigation,footerLinks:incomingFooter,updatedAt:new Date().toISOString()}:undefined,
        pages:{...(current.pages||{})},
        pageDrafts,
        contentDrafts,
        products:base.products,
        posts:base.posts,
        catalogInitialized:true,
        catalogues:base.catalogues,
        references:next.references,
        mediaItems:next.mediaItems,
        tasks:next.tasks,
        leads:current.leads||[],
        templates:{...base.templates,...(isObject(next.templates)?next.templates:{})}
      };
    },{expectedRevision});
    const managed=scanPages();
    audit(req,'save','cms',[],{navigationDraft:navigationDraftSaved});
    return json({ok:true,pageDrafts:savedContent.pageDrafts||{},contentDrafts:savedContent.contentDrafts||{},products:managed.products,posts:managed.posts,catalogues:managed.catalogues,hasNavigationDraft:navigationDraftSaved,revision:contentRevision(savedContent)});
  }catch(error){
    if(error instanceof CategoryInUseError)return fail(error.message,409);
    if(error instanceof ContentConflictError)return fail('Başka bir yönetici bu içeriği değiştirdi. Değişikliklerinizi koruyup sayfayı yeniden yükleyerek karşılaştırın.',409);
    return fail(error instanceof SyntaxError?'İçerik verisi okunamadı. Sayfayı yenileyip yeniden deneyin.':'İçerik güvenli şekilde kaydedilemedi. Sayfayı yenileyip yeniden deneyin.',400);
  }
}
