// Isolated end-to-end smoke check for CMS leads and dynamic legacy renderers.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {JSDOM}=require('jsdom');

async function run(){
  const project=path.resolve(__dirname,'..');
  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'hydropascal-cms-smoke-'));
  const assert=(condition,message)=>{if(!condition)throw new Error(message);};
  process.env.CMS_DATA_DIR=path.join(tempRoot,'data');
  process.env.NODE_ENV='development';
  for(const key of ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'])process.env[key]='';

  try{
    const [{POST},{readContent,updateContent,getLegacyPage,allHtmlPages,scanPages,contentRevision},{GET:assetGET},{GET:sitemapGET},{GET:cmsGet,PUT:cmsPut},{readLegacyBlogPosts}]=await Promise.all([
      import(pathToFileURL(path.join(project,'cms/app/api/lead/route.js'))),
      import(pathToFileURL(path.join(project,'cms/app/lib/content.js'))),
      import(pathToFileURL(path.join(project,'cms/app/assets/[...asset]/route.js'))),
      import(pathToFileURL(path.join(project,'cms/app/sitemap.xml/route.js'))),
      import(pathToFileURL(path.join(project,'cms/app/api/cms/route.js'))),
      import(pathToFileURL(path.join(project,'cms/app/lib/legacy-blog-import.js')))
    ]);
    const {POST:publishContent}=await import(pathToFileURL(path.join(project,'cms/app/api/content-publish/route.js')));
    const deniedPublish=await publishContent({cookies:{get:()=>undefined},json:async()=>({type:'posts',id:'not-authorized',mode:'publish'})});
    assert(deniedPublish.status===401,'Content publication must require an authenticated admin session.');

    const proxiedForm=await assetGET(new Request('http://localhost/assets/js/form-submit.js'),{params:Promise.resolve({asset:['js','form-submit.js']})});
    const proxiedScript=await proxiedForm.text();
    assert(proxiedForm.status===200&&proxiedScript.includes("ajaxBase: '/api/lead?target='")&&proxiedScript.includes('ajaxSupportsFiles: true'),'The live form script should use the internal lead API and support files.');
    assert(proxiedScript.includes('serverMessage = !!(json && json.error)'),'Server validation messages should reach the form.');

    const missingConsent=new FormData();
    missingConsent.set('name','Visitor');missingConsent.set('email','visitor@example.com');missingConsent.set('message','Please contact me.');
    const rejected=await POST(new Request('http://localhost/api/lead',{method:'POST',body:missingConsent}));
    assert(rejected.status===400,'A request without consent must be rejected.');

    const bot=new FormData();bot.set('_honey','filled');
    const botResponse=await POST(new Request('http://localhost/api/lead',{method:'POST',body:bot}));
    assert(botResponse.status===200&&(await botResponse.json()).success===true,'The honeypot should silently discard a bot request.');
    assert(readContent().leads.length===0,'Rejected and honeypot requests must not be saved.');

    const form=new FormData();
    form.set('name','Test Visitor');form.set('email','visitor@example.com');form.set('company','Demo Co');
    form.set('phone','+90 555 000 00 00');form.set('title','Quote Request');form.set('interest','Hydraulic cylinder');
    form.set('quantity','12 units');form.set('Consent','Granted');
    form.set('_page','https://www.hydropascal.com.tr/en/teklif-al.html');
    form.append('attachment_1',new File([Buffer.from('demo drawing')],'cylinder-spec.pdf',{type:'application/pdf'}));
    const response=await POST(new Request('http://localhost/api/lead?target=internal',{method:'POST',headers:{referer:'https://www.hydropascal.com.tr/en/teklif-al.html'},body:form}));
    assert(response.status===200&&(await response.json()).success===true,'A valid English quote request should succeed.');

    let stored=readContent();assert(stored.leads.length===1,'A valid lead should be persisted.');
    const lead=stored.leads[0];
    assert(lead.lang==='en'&&lead.type==='quote','The lead language and type should be detected.');
    assert(lead.fields.quantity==='12 units','Custom quote fields should be preserved.');
    assert(lead.attachments.length===1,'Attachment metadata should be saved.');
    const attachmentPath=path.join(process.env.CMS_DATA_DIR,'attachments',lead.attachments[0].id);
    assert(fs.readFileSync(attachmentPath,'utf8')==='demo drawing','Uploaded attachment bytes should be saved.');

    const {GET}=await import(pathToFileURL(path.join(project,'cms/app/api/attachment/[id]/route.js')));
    const adminRequest={cookies:{get:()=>({value:'local-prototype-session-rotate-before-deploy'})}};
    const download=await GET(adminRequest,{params:Promise.resolve({id:lead.attachments[0].id})});
    assert(download.status===200,'An admin should be able to download an attachment.');
    const publicDownload=await GET({cookies:{get:()=>undefined}},{params:Promise.resolve({id:lead.attachments[0].id})});
    assert(publicDownload.status===401,'Attachment downloads must require an admin session.');
    const {PATCH}=await import(pathToFileURL(path.join(project,'cms/app/api/leads/[id]/route.js')));
    const statusResult=await PATCH({...adminRequest,json:async()=>({status:'\u0130\u015flemde'})},{params:Promise.resolve({id:lead.id})});
    assert(statusResult.status===200&&readContent().leads[0].status==='\u0130\u015flemde','An admin should be able to update a lead status.');

    await updateContent(data=>({...data,
      products:[{id:'test-product',slug:'dynamic-cylinder',name:'Dynamic Cylinder',code:'HPL-TEST',category:'Bağlantı elemanları',description:'Live product',image:'javascript:alert(1)',active:true}],
      posts:[{id:'test-post',slug:'dynamic-review-post',lang:'tr',title:'Dinamik blog yazısı',category:'Mühendislik',excerpt:'Dynamic excerpt',content:'First paragraph\n\n<script>alert(1)</script>',image:'javascript:alert(1)',published:true}]
    }));
    const productPage=getLegacyPage('tr/hpl-products.html');
    const encodedProductPayload=productPage.match(/atob\('([^']+)'\)/)?.[1];
    const renderedProducts=encodedProductPayload?JSON.parse(Buffer.from(encodedProductPayload,'base64').toString('utf8')):[];
    assert(renderedProducts.some(product=>product.name==='Dynamic Cylinder')&&productPage.includes('Teklif iste'),'The product catalogue should render managed products.');
    assert(renderedProducts.some(product=>product.name==='Dynamic Cylinder'&&product.image==='#'),'Unsafe product image URLs should be rejected.');
    const productDetail=getLegacyPage('tr/urun-detay.html','dynamic-cylinder');
    const encodedProductDetail=productDetail?.match(/atob\('([^']+)'\)/)?.[1];
    const renderedProductDetail=encodedProductDetail?JSON.parse(Buffer.from(encodedProductDetail,'base64').toString('utf8')):null;
    assert(renderedProductDetail?.title==='Dynamic Cylinder','Published product edits should render on the public detail page.');
    assert(productDetail.includes('<meta name="robots" content="index, follow">')&&productDetail.includes('https://www.hydropascal.com.tr/tr/urun-detay.html?id=dynamic-cylinder'),'Product SEO metadata should be rendered in the response head.');
    assert(!productDetail.includes('document.title = p.title'),'Client hydration must not overwrite the server-rendered SEO title.');
    const archive=getLegacyPage('tr/blog/index.html');
    assert(archive.includes('dynamic-review-post')&&archive.includes('Dinamik blog yazısı'),'The blog archive should render new published posts.');
    const archiveExpression=new JSDOM(archive).window.document.querySelector('.blog-archive')?.getAttribute('x-data');
    let archiveState;
    try{archiveState=archiveExpression?new Function(`return (${archiveExpression})`)():null;}catch(error){throw new Error(`Serialized Alpine post data should parse after HTML decoding: ${error.message}`);}
    assert(archiveState?.posts?.some(post=>post.s==='dynamic-review-post'),'Published CMS posts should remain in the blog archive filter and pagination data.');
    const detail=getLegacyPage('tr/blog/dynamic-review-post.html');
    // Every blog post (new or imported) uses the same '| <site> Blog' title suffix from lib/seo-model.js.
    assert(detail.includes('<title>Dinamik blog yazısı | HydroPascal Blog</title>'),'The dynamic post detail page should render.');
    assert(detail.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),'Blog body HTML should be escaped.');
    assert(detail.includes('src="#"'),'Unsafe blog image URLs should be rejected.');
    const sitemap=await sitemapGET(new Request('http://localhost/sitemap.xml'));
    assert(sitemap.status===200&&(await sitemap.text()).includes('/tr/blog/dynamic-review-post.html'),'Published CMS posts should appear in the live sitemap.');
    const templateData=scanPages().templates;
    assert(templateData.quote.subjectEn&&templateData.sample.bodyEn,'Quote and sample acknowledgement templates should have EN defaults.');
    const importedLegacyPosts=readLegacyBlogPosts(project);
    assert(importedLegacyPosts.length===120&&importedLegacyPosts.filter(post=>post.lang==='tr').length===60&&importedLegacyPosts.filter(post=>post.lang==='en').length===60,'The legacy blog importer should parse all 120 TR/EN article files.');
    await updateContent(data=>({...data,posts:[...(data.posts||[]),...importedLegacyPosts]}));
    const managedLegacy=importedLegacyPosts[0];
    const originalLegacyHtml=getLegacyPage(managedLegacy.legacyPath);
    assert(originalLegacyHtml.includes('class="space-y-6 text-slate-300 text-lg leading-relaxed"'),'Imported legacy content should keep its original page styling until an editor changes the article body.');
    await updateContent(data=>({...data,posts:data.posts.map(post=>post.id===managedLegacy.id?{...post,title:'Legacy CMS smoke title',excerpt:'Legacy CMS smoke excerpt',category:'Test category',content:'<section><h2>Managed legacy body</h2><script>alert(1)</script><p>Safe paragraph</p></section>',image:'/assets/images/hero-hydraulic-cylinder.webp',date:'2026-09-12',seoTitle:'Legacy SEO smoke title',seoDescription:'Legacy SEO smoke description'}:post)}));
    const managedLegacyHtml=getLegacyPage(managedLegacy.legacyPath);
    assert(managedLegacyHtml.includes('<title>Legacy SEO smoke title | HydroPascal Blog</title>')&&managedLegacyHtml.includes('Managed legacy body')&&!managedLegacyHtml.includes('<script>alert(1)</script>'),'Managed legacy articles should update their original page safely and preserve SEO fields.');
    const managedLegacyArchive=getLegacyPage('tr/blog/index.html');
    assert(managedLegacyArchive.includes('Legacy CMS smoke title')&&managedLegacyArchive.includes('Legacy CMS smoke excerpt'),'Legacy article edits should update the public blog cards and searchable list.');
    await updateContent(data=>({...data,posts:data.posts.map(post=>post.id===managedLegacy.id?{...post,published:false}:post)}));
    assert(getLegacyPage(managedLegacy.legacyPath)===null&&getLegacyPage(managedLegacy.legacyPath,'',true)?.includes('Managed legacy body'),'Unpublishing a legacy article should hide it publicly while keeping admin preview available.');
    const hiddenSitemap=await sitemapGET(new Request('http://localhost/sitemap.xml'));
    const hiddenSitemapText=await hiddenSitemap.text();
    assert(!hiddenSitemapText.includes('/'+managedLegacy.legacyPath),'An unpublished legacy article should be removed from the sitemap: '+managedLegacy.legacyPath+' '+hiddenSitemapText.split(/\r?\n/).filter(line=>line.includes(managedLegacy.slug)).join(' || '));
    await updateContent(data=>({...data,posts:data.posts.map(post=>post.id===managedLegacy.id?{...post,published:true}:post)}));
    await updateContent(data=>({...data,settings:{...(data.settings||{}),smtpPass:'cms-smoke-secret'}}));
    const adminSnapshotResponse=await cmsGet(adminRequest),adminSnapshot=await adminSnapshotResponse.json();
    assert(adminSnapshotResponse.status===200&&!Object.prototype.hasOwnProperty.call(adminSnapshot.settings,'smtpPass'),'The CMS API must never send the SMTP password to the browser.');
    let cmsPayload=scanPages();
    cmsPayload.products=cmsPayload.products.map(item=>item.id==='test-product'?{...item,image:'/assets/images/hero-hydraulic-cylinder.webp',seoTitle:'Hydraulic SEO smoke',seoTitleEn:'Hydraulic SEO smoke EN',seoDescription:'Managed search snippet',seoDescriptionEn:'Managed English search snippet',seoImage:'/assets/images/hero-hydraulic-cylinder.webp',seoIndex:true}:item);
    cmsPayload.posts=cmsPayload.posts.map(item=>item.id==='test-post'?{...item,image:'/assets/images/hero-hydraulic-cylinder.webp'}:item);
    let cmsRevision=cmsPayload._revision;
    const cmsRequest=(payload,revision=cmsRevision)=>({...adminRequest,headers:{get:name=>name.toLowerCase()==='content-length'?String(Buffer.byteLength(JSON.stringify(payload))):name.toLowerCase()==='if-match'?revision:null},json:async()=>payload});
    const publishRequest=(type,id,mode='publish',revision=cmsRevision)=>({...adminRequest,headers:{get:name=>name.toLowerCase()==='if-match'?revision:null},json:async()=>({type,mode,...(Array.isArray(id)?{ids:id}:{id})})});
    const publishSavedContent=async(type,id,mode='publish')=>{
      const response=await publishContent(publishRequest(type,id,mode));
      const result=await response.json();
      if(response.ok)cmsRevision=result.revision;
      return {response,result};
    };
    const publicCatalogueItems=page=>[...page.matchAll(/atob\('([^']+)'\)/g)].map(match=>{try{return JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));}catch{return null;}}).filter(Array.isArray).flat();
    const managedCategory={id:'test-blog-category',scope:'blog',name:'CMS Smoke Category',nameEn:'CMS Smoke Category EN'};
    const managedCatalogueCategory={id:'test-catalog-category',scope:'catalog',name:'CMS Catalog Category',nameEn:'CMS Catalog Category EN'};
    cmsPayload.categories=[...(cmsPayload.categories||[]),managedCategory,managedCatalogueCategory];
    cmsPayload.posts=cmsPayload.posts.map(post=>post.id==='test-post'?{...post,category:managedCategory.name}:post);
    cmsPayload.posts.push({id:'test-en-post',slug:'cms-english-category-smoke',lang:'en',title:'English category smoke',category:managedCategory.name,excerpt:'English category display',content:'English content',image:'/assets/images/hero-hydraulic-cylinder.webp',published:true});
    cmsPayload.catalogues=cmsPayload.catalogues.map((item,index)=>index===0?{...item,category:managedCatalogueCategory.name,categoryEn:managedCatalogueCategory.nameEn}:item);
    const categorySave=await cmsPut(cmsRequest(cmsPayload));
    const categorySaveData=await categorySave.json();
    assert(categorySave.status===200&&scanPages().categories.some(category=>category.id===managedCategory.id)&&scanPages().categories.some(category=>category.id===managedCatalogueCategory.id),'Blog and catalogue categories should persist in the CMS content store. Got '+categorySave.status+': '+JSON.stringify(categorySaveData));
    cmsRevision=categorySaveData.revision;
    assert(cmsRevision===contentRevision(readContent()),'The admin API should return the current content revision.');
    assert(readContent().settings.smtpPass==='cms-smoke-secret','Saving other settings must preserve the server-only SMTP password.');
    assert(readContent().contentDrafts?.posts?.['test-post']?.category===managedCategory.name&&readContent().contentDrafts?.products?.['test-product']?.seoTitle==='Hydraulic SEO smoke','Product and blog changes should be saved as separate drafts.');
    assert(!getLegacyPage('tr/blog/index.html').includes('CMS Smoke Category')&&!getLegacyPage('tr/urun-detay.html','dynamic-cylinder').includes('Hydraulic SEO smoke'),'Saving a draft must leave the public blog and product pages unchanged.');
    const publishedProduct=await publishSavedContent('products','test-product');
    assert(publishedProduct.response.status===200&&getLegacyPage('tr/urun-detay.html','dynamic-cylinder').includes('Hydraulic SEO smoke'),'Explicitly publishing a product draft should update its public detail and SEO.');
    const publishedBlog=await publishSavedContent('posts','test-post');
    assert(publishedBlog.response.status===200&&getLegacyPage('tr/blog/dynamic-review-post.html').includes('CMS Smoke Category'),'Explicitly publishing a blog draft should update its public detail page.');
    const publishedEnglishBlog=await publishSavedContent('posts','test-en-post');
    assert(publishedEnglishBlog.response.status===200,'A new English blog draft should publish through the same API.');
    for(const [route,slug] of [['tr/blog/index.html','dynamic-review-post'],['en/blog/index.html','cms-english-category-smoke']]){
      const archive=getLegacyPage(route);
      const expression=new JSDOM(archive).window.document.querySelector('.blog-archive')?.getAttribute('x-data');
      let state;
      try{state=expression?new Function(`return (${expression})`)():null;}catch(error){throw new Error(`${route} must keep its searchable blog state valid inside the HTML attribute: ${error.message}`);}
      assert(state?.posts?.some(post=>post.s===slug)&&archive.includes(`${slug}.html`),`${route} should render the published post and include it in valid filter/pagination data.`);
    }
    const catalogueDraft=scanPages().catalogues.find(item=>item.category===managedCatalogueCategory.name);
    assert(catalogueDraft?.hasDraft&&!publicCatalogueItems(getLegacyPage('tr/kataloglar.html')).some(item=>item.category===managedCatalogueCategory.name),'Saving a catalogue edit should preserve the public catalogue until publication.');
    const publishedCatalogue=await publishSavedContent('catalogues',catalogueDraft.id,'apply');
    assert(publishedCatalogue.response.status===200&&publicCatalogueItems(getLegacyPage('tr/kataloglar.html')).some(item=>item.category===managedCatalogueCategory.name),'Publishing a catalogue draft should update the public catalogue page: '+publishedCatalogue.response.status+' / '+catalogueDraft.id);
    const categoryArchive=getLegacyPage('tr/blog/index.html');
    assert(categoryArchive.includes('CMS Smoke Category')&&categoryArchive.includes('data-tag="cms-smoke-category"'),'A saved blog category should reach the public blog filter and card.');
    const englishCategoryArchive=getLegacyPage('en/blog/index.html');
    assert(englishCategoryArchive.includes('CMS Smoke Category EN')&&englishCategoryArchive.includes('data-tag="cms-smoke-category-en"'),'The English blog archive should use the category translation.');
    const categoryCataloguePage=getLegacyPage('tr/kataloglar.html');
    const categoryCataloguePayloads=[...categoryCataloguePage.matchAll(/atob\('([^']+)'\)/g)].map(match=>{try{return JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));}catch{return null;}});
    assert(categoryCataloguePayloads.some(items=>Array.isArray(items)&&items.some(item=>item.category===managedCatalogueCategory.name)),'A managed catalogue category should reach the public catalogue filters.');
    const duplicateCategory={...cmsPayload,categories:[...cmsPayload.categories,{...managedCategory,id:'duplicate-blog-category'}]};
    assert((await cmsPut(cmsRequest(duplicateCategory))).status===400,'Duplicate categories in the same section must be rejected by the CMS API.');
    const blankSlug={...cmsPayload,posts:[...cmsPayload.posts,{id:'blank-slug-test',slug:'',lang:'tr',title:'Published without URL',published:true}]};
    const blankSlugResponse=await cmsPut(cmsRequest(blankSlug));
    assert(blankSlugResponse.status===400,'Published posts without a slug must be rejected. Got '+blankSlugResponse.status+': '+await blankSlugResponse.text());
    const staticRoute=allHtmlPages().find(route=>/^tr\/blog\/[^/]+\.html$/.test(route)&&!route.endsWith('blog-post-template.html'));
    const collisionSlug=path.basename(staticRoute,'.html');
    const collision={...cmsPayload,posts:[...cmsPayload.posts,{id:'collision-test',slug:collisionSlug,lang:'tr',title:'Conflicting URL',published:true}]};
    assert((await cmsPut(cmsRequest(collision))).status===400,'A dynamic post must not shadow an existing static blog URL.');
    const originalNavigation=cmsPayload.settings.navigation,orderedNavigation=[{...originalNavigation[1],active:false},{...originalNavigation[0],newTab:true},...originalNavigation.slice(2)];
    const navigationPayload={...cmsPayload,settings:{...cmsPayload.settings,navigation:orderedNavigation}};
    const navigationSave=await cmsPut(cmsRequest(navigationPayload));
    if(navigationSave.ok)cmsRevision=(await navigationSave.json()).revision;
    // Menus are staged: saved to navigationDraft, public header unchanged until published.
    assert(navigationSave.status===200&&readContent().navigationDraft?.navigation?.[0]?.id===orderedNavigation[0].id,'Navigation order must persist as a draft in the content store.');
    assert(!getLegacyPage('tr/index.html').split('<!-- HEADER END -->')[0].includes('target="_blank" rel="noopener noreferrer"'),'A saved menu draft must not reach the public header before publishing.');
    const navigationPublish=await publishContent({...adminRequest,headers:{get:name=>name.toLowerCase()==='if-match'?cmsRevision:null},json:async()=>({type:'navigation',mode:'publish'})});
    assert(navigationPublish.status===200,'Publishing the menu draft should succeed.');cmsRevision=(await navigationPublish.json()).revision;
    const publicHeader=getLegacyPage('tr/index.html').split('<!-- HEADER END -->')[0];
    assert(readContent().settings.navigation[0].id===orderedNavigation[0].id&&!readContent().navigationDraft,'Published navigation order must persist in the content store.');
    assert(!publicHeader.includes('>HakkÄ±mÄ±zda</a>')&&publicHeader.includes('target="_blank" rel="noopener noreferrer"'), 'Navigation visibility and new-tab settings must reach the public header.');
    const validPayload={...cmsPayload,posts:[...cmsPayload.posts,{id:'cms-save-test',slug:'cms-save-smoke-post',lang:'en',title:'CMS save smoke post',published:true},{id:'cms-draft-test',slug:'cms-draft-smoke-post',lang:'en',title:'CMS draft smoke post',published:false}],catalogues:cmsPayload.catalogues.map((item,index)=>index===0?{...item,title:'CMS catalogue smoke'}:index===1?{...item,title:'CMS catalogue secondary smoke'}:item)};
    const staleRevision=cmsRevision;
    const savedResponse=await cmsPut(cmsRequest(validPayload));
    const savedResponseData=await savedResponse.json();
    assert(savedResponse.status===200&&!readContent().posts.some(post=>post.slug==='cms-save-smoke-post')&&readContent().contentDrafts?.posts?.['cms-save-test']?.slug==='cms-save-smoke-post','A valid CMS update should persist new blog entries as unpublished drafts. Got '+savedResponse.status+': '+JSON.stringify(savedResponseData));
    cmsRevision=savedResponseData.revision;
    assert(!getLegacyPage('en/blog/index.html').includes('cms-save-smoke-post')&&!getLegacyPage('en/blog/index.html').includes('cms-draft-smoke-post'),'Neither a publishable draft nor a normal draft should appear publicly before an explicit publish action.');
    const publishedNewPost=await publishSavedContent('posts','cms-save-test');
    assert(publishedNewPost.response.status===200&&getLegacyPage('en/blog/index.html').includes('cms-save-smoke-post')&&!getLegacyPage('en/blog/index.html').includes('cms-draft-smoke-post'),'Publishing a new blog should make only the selected record public.');
    const removePostPayload=scanPages();
    removePostPayload.posts=removePostPayload.posts.filter(post=>post.id!=='cms-save-test');
    const removalDraftResponse=await cmsPut(cmsRequest(removePostPayload));
    const removalDraftData=await removalDraftResponse.json();
    if(removalDraftResponse.ok)cmsRevision=removalDraftData.revision;
    assert(removalDraftResponse.status===200&&scanPages().posts.find(post=>post.id==='cms-save-test')?.pendingDelete&&getLegacyPage('en/blog/index.html').includes('cms-save-smoke-post'),'Deleting a published blog should stay pending until the deletion is applied.');
    const appliedRemoval=await publishSavedContent('posts','cms-save-test','apply');
    assert(appliedRemoval.response.status===200&&!getLegacyPage('en/blog/index.html').includes('cms-save-smoke-post'),'Applying a pending blog deletion should remove it from the public site.');
    const staleSave=await cmsPut(cmsRequest(scanPages(),staleRevision));
    assert(staleSave.status===409,'A stale admin snapshot must not overwrite a newer saved revision.');
    const backupFiles=fs.readdirSync(path.join(process.env.CMS_DATA_DIR,'backups')).filter(name=>name.endsWith('.json.gz'));
    assert(backupFiles.length>0,'Each content replacement should keep a compressed pre-write backup.');
    const backups=backupFiles.map(name=>JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(process.env.CMS_DATA_DIR,'backups',name))).toString('utf8')));
    assert(backups.some(snapshot=>snapshot.posts?.filter(post=>post.legacy===true).length===120),'A pre-write backup should contain the complete imported legacy blog set.');
    assert(readContent().catalogues.length===validPayload.catalogues.length,'Catalogue edits must persist alongside blog and product edits.');
    const catalogueTitleDrafts=scanPages().catalogues.filter(item=>item.hasDraft);
    assert(catalogueTitleDrafts.some(item=>item.title==='CMS catalogue smoke')&&catalogueTitleDrafts.some(item=>item.title==='CMS catalogue secondary smoke')&&!publicCatalogueItems(getLegacyPage('tr/kataloglar.html')).some(item=>item.name==='CMS catalogue smoke'||item.name==='CMS catalogue secondary smoke'),'Saved catalogue titles should remain drafts until explicitly applied.');
    const publishedCatalogueTitles=await publishSavedContent('catalogues',catalogueTitleDrafts.map(item=>item.id),'apply');
    assert(publishedCatalogueTitles.response.status===200&&publicCatalogueItems(getLegacyPage('tr/kataloglar.html')).some(item=>item.name==='CMS catalogue smoke')&&publicCatalogueItems(getLegacyPage('tr/kataloglar.html')).some(item=>item.name==='CMS catalogue secondary smoke'),'Multiple catalogue drafts should publish atomically from one action.');
    assert(!getLegacyPage('en/blog/index.html').includes('cms-save-smoke-post')&&!getLegacyPage('en/blog/index.html').includes('cms-draft-smoke-post'),'Applied blog deletions and unpublished drafts should both stay hidden from the public archive.');
    const managedProductSeo=getLegacyPage('tr/urun-detay.html','dynamic-cylinder');
    assert(managedProductSeo.includes('<title>Hydraulic SEO smoke | HydroPascal</title>')&&managedProductSeo.includes('content="Managed search snippet"')&&managedProductSeo.includes('content="index, follow"'),'Saved product SEO values should reach server-rendered metadata.');
    const publicProductSitemap=await sitemapGET(new Request('http://localhost/sitemap.xml'));
    const publicProductSitemapText=await publicProductSitemap.text();
    assert(publicProductSitemapText.includes('https://www.hydropascal.com.tr/tr/urun-detay.html?id=dynamic-cylinder'),'Published products should appear in the sitemap with the public site origin.');
    const cataloguePage=getLegacyPage('tr/kataloglar.html');
    const cataloguePayloads=[...cataloguePage.matchAll(/atob\('([^']+)'\)/g)].map(match=>{try{return JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));}catch{return null;}});
    assert(cataloguePayloads.some(items=>Array.isArray(items)&&items.some(item=>item.name==='CMS catalogue smoke')),'Published catalogue edits should render on the public catalogue page.');

    const {POST:upload}=await import(pathToFileURL(path.join(project,'cms/app/api/upload/route.js')));
    const {GET:mediaList,DELETE:deleteMedia}=await import(pathToFileURL(path.join(project,'cms/app/api/media/route.js')));
    const {GET:mediaFile}=await import(pathToFileURL(path.join(project,'cms/app/api/media/[id]/route.js')));
    const uploadFile=async(name,type,bytes)=>{
      const data=new FormData();data.set('file',new File([bytes],name,{type}));
      return upload({...adminRequest,formData:async()=>data});
    };
    const unauthUpload=await upload({cookies:{get:()=>null},formData:async()=>new FormData()});
    assert(unauthUpload.status===401,'Media uploads must require an admin session.');
    const badImage=await uploadFile('not-an-image.png','image/png','plain text');
    assert(badImage.status===400,'Image uploads must verify file signatures, not trust the MIME type.');
    const uploadedImageResponse=await uploadFile('hydraulic-cover.png','image/png',Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]));
    const uploadedImage=await uploadedImageResponse.json();
    assert(uploadedImageResponse.status===200&&uploadedImage.url.startsWith('/api/media/'),'A valid image should be stored in the shared media directory.');
    const uploadedPdfResponse=await uploadFile('hydraulic-catalogue.pdf','application/pdf','%PDF-1.4\nCMS smoke');
    const uploadedPdf=await uploadedPdfResponse.json();
    assert(uploadedPdfResponse.status===200&&uploadedPdf.url.endsWith('.pdf'),'The shared upload API should accept valid PDF files for catalogues and product documents.');
    const listed=await mediaList({...adminRequest,url:'http://localhost/api/media?type=all&limit=20'});
    const listedPayload=await listed.json();
    assert(listed.status===200&&listedPayload.items.some(item=>item.url===uploadedImage.url)&&listedPayload.items.some(item=>item.url===uploadedPdf.url),'The authenticated media library should list image and PDF files.');
    const servedPdf=await mediaFile({url:'http://localhost'+uploadedPdf.url},{params:Promise.resolve({id:uploadedPdf.url.split('/').pop()})});
    assert(servedPdf.status===200&&servedPdf.headers.get('content-type')==='application/pdf','Uploaded catalog PDFs should be previewable from the public file route.');
    await updateContent(data=>({...data,posts:[...(data.posts||[]),{id:'media-reference-smoke',slug:'',lang:'tr',title:'Media reference',published:false,image:uploadedImage.url}]}));
    const protectedDelete=await deleteMedia({...adminRequest,json:async()=>({id:uploadedImage.url.split('/').pop()})});
    assert(protectedDelete.status===409,'A media file referenced by CMS content must not be deleted.');
    const deletablePdf=await deleteMedia({...adminRequest,json:async()=>({id:uploadedPdf.url.split('/').pop()})});
    assert(deletablePdf.status===200,'An unused media file should be removable from the authenticated media library.');
    assert((await mediaFile({url:'http://localhost'+uploadedPdf.url},{params:Promise.resolve({id:uploadedPdf.url.split('/').pop()})})).status===404,'A deleted media file should no longer be served.');
    const invalidCatalogue={...scanPages(),catalogues:scanPages().catalogues.map((item,index)=>index===0?{...item,file:'javascript:alert(1)'}:item)};
    assert((await cmsPut(cmsRequest(invalidCatalogue))).status===400,'Catalogue PDF URLs must be validated by the backend.');
    const invalidProduct={...scanPages(),products:scanPages().products.map((item,index)=>index===0?{...item,code:'DUPLICATE'}:item).map((item,index)=>index===1?{...item,code:'DUPLICATE'}:item)};
    assert((await cmsPut(cmsRequest(invalidProduct))).status===400,'Duplicate product codes within a product type must be rejected.');
    const unsafeProductUrl={...cmsPayload,products:cmsPayload.products.map(item=>item.id==='test-product'?{...item,image:'javascript:alert(1)'}:item)};
    assert((await cmsPut(cmsRequest(unsafeProductUrl))).status===400,'Unsafe product image URLs must be rejected by the backend.');
    const duplicateProductSlugs={...cmsPayload,products:cmsPayload.products.map((item,index)=>index===1?{...item,slug:cmsPayload.products[0].slug}:item)};
    assert((await cmsPut(cmsRequest(duplicateProductSlugs))).status===400,'Duplicate product page addresses must be rejected.');
    const duplicateBlogSlugs={...cmsPayload,posts:[...cmsPayload.posts,{id:'duplicate-blog-one',slug:'duplicate-blog-smoke',lang:'tr',title:'First draft',published:false},{id:'duplicate-blog-two',slug:'duplicate-blog-smoke',lang:'tr',title:'Second draft',published:false}]};
    assert((await cmsPut(cmsRequest(duplicateBlogSlugs))).status===400,'Duplicate blog page addresses must be rejected.');

    const {POST:savePageDraft}=await import(pathToFileURL(path.join(project,'cms/app/api/page-draft/route.js')));
    const {POST:publishPage}=await import(pathToFileURL(path.join(project,'cms/app/api/page-publish/route.js')));
    const pageRoute='tr/index.html',sourcePage=scanPages().pages[pageRoute];
    const section=Object.keys(sourcePage).find(key=>Object.values(sourcePage[key]||{}).some(value=>typeof value==='string'));
    const field=Object.keys(sourcePage[section]).find(key=>typeof sourcePage[section][key]==='string');
    const token='PAGE_DRAFT_SMOKE_'+Date.now(),draftContent=JSON.parse(JSON.stringify(sourcePage));
    draftContent[section][field]=token;
    let pageRevision=scanPages()._revision;
    const pageRequest=payload=>({ ...adminRequest,headers:{get:name=>name.toLowerCase()==='content-length'?String(Buffer.byteLength(JSON.stringify(payload))):name.toLowerCase()==='if-match'?pageRevision:null},json:async()=>payload });
    const draftResult=await savePageDraft(pageRequest({page:pageRoute,content:draftContent}));
    const draftResultData=await draftResult.json();
    assert(draftResult.status===200,'A valid visual-page draft should save. Got '+draftResult.status+': '+JSON.stringify(draftResultData));
    pageRevision=draftResultData.revision;
    assert(readContent().pageDrafts?.[pageRoute],'The page draft should persist separately from live page data.');
    assert(!getLegacyPage(pageRoute).includes(token),'Saving a page draft must not change the public renderer.');
    const draftPreview=getLegacyPage(pageRoute,'',true);
    assert(draftPreview?.includes(token),'The authenticated editor preview should render the saved draft. '+pageRoute+' / '+section+' / '+field+' / '+JSON.stringify(readContent().pageDrafts?.[pageRoute])+' / '+draftPreview?.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0]);
    const publishResult=await publishPage(pageRequest({page:pageRoute}));
    const publishResultData=await publishResult.json();
    assert(publishResult.status===200,'A saved page draft should publish. Got '+publishResult.status+': '+JSON.stringify(publishResultData));
    pageRevision=publishResultData.revision;
    assert(!readContent().pageDrafts?.[pageRoute]&&getLegacyPage(pageRoute).includes(token),'Publishing should move the draft into the live page data.');
    console.log('CMS smoke passed: category create/persistence/localization, forms, attachments, media upload/library/delete protection, catalogue/product validation, status updates, templates, blog, sitemap, and page draft/publish flow.');
  }finally{
    const resolved=path.resolve(tempRoot),tempBase=path.resolve(os.tmpdir())+path.sep;
    if(!resolved.startsWith(tempBase)||!path.basename(resolved).startsWith('hydropascal-cms-smoke-'))throw new Error('Refusing unsafe test cleanup path: '+resolved);
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}

run().catch(error=>{console.error(error);process.exitCode=1;});
