import {normalizeNavigation,childrenOf,MAX_NAV_DEPTH} from './navigation-tree.js';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {iconLibraryMarkup} from './icons.js';
import {normalizeCategoryName} from './category-utils.js';
import {isPublicProduct} from './product-seo.js';
import {applySeoHead} from './seo.js';
import {applyAnalytics} from './analytics.js';
import {needsStructurePass,renderStructure,structureEditable} from './page-structure.js';
import {safeUrl} from './page-schema.js';
import {dbEnabled,readDbSnapshot,mutateDb} from './content-db.js';
import sanitizeHtml from 'sanitize-html';
const siteRoot=path.resolve(process.cwd(),'..');
export const dataRoot=path.resolve(process.env.CMS_DATA_DIR||path.join(process.cwd(),'data'));
const contentFile=path.join(dataRoot,'content.json');
const lockFile=path.join(dataRoot,'content.lock');
const backupRoot=path.join(dataRoot,'backups');
export const safeKey=(s)=>String(s||'').replace(/[^a-zA-Z0-9._-]/g,'');
const editableKeys=['settings','pages','pageDrafts','contentDrafts','navigationDraft','products','posts','catalogues','categories','references','mediaItems','tasks','templates','catalogInitialized'];
const MAX_BACKUPS=200;
function pruneBackups(){
  try{
    const files=fs.readdirSync(backupRoot).filter(name=>name.endsWith('.json.gz')).sort();
    for(const name of files.slice(0,Math.max(0,files.length-MAX_BACKUPS)))fs.rmSync(path.join(backupRoot,name),{force:true});
  }catch{}
}
// Unpublished record drafts layered over the published rows (admin list/preview view).
function overlayRecords(items,drafts){
  if(!drafts||typeof drafts!=='object')return items;
  const result=[...items];
  for(const [id,draft] of Object.entries(drafts)){
    if(!draft||typeof draft!=='object'||Array.isArray(draft))continue;
    const index=result.findIndex(item=>String(item.id)===id);
    if(draft._deleted===true){
      if(index>=0)result[index]={...result[index],hasDraft:true,pendingDelete:true,hasPublishedVersion:true};
      continue;
    }
    const clean={...draft};delete clean._deleted;
    const record=index>=0?{...result[index],...clean,hasDraft:true,hasPublishedVersion:true,pendingDelete:false}:{...clean,hasDraft:true,hasPublishedVersion:false,pendingDelete:false};
    if(index>=0)result[index]=record;else result.push(record);
  }
  return result;
}
// Header/footer menus are staged like other content: saved to navigationDraft, applied on publish.
function withNavigationDraft(settings,draft){
  if(!draft||typeof draft!=='object')return settings;
  return {...settings,...(Array.isArray(draft.navigation)?{navigation:draft.navigation}:{}),...(Array.isArray(draft.footerLinks)?{footerLinks:draft.footerLinks}:{})};
}
export function contentRevision(data){
  const editable=Object.fromEntries(editableKeys.map(key=>[key,data?.[key]??null]));
  return createHash('sha256').update(JSON.stringify(editable)).digest('hex');
}
export class ContentConflictError extends Error{
  constructor(){super('Content was changed by another request.');this.name='ContentConflictError';}
}
const emptyContent=()=>({settings:{},pages:{},contentDrafts:{},leads:[],templates:{}});
export function readContent(){
  if(dbEnabled()){const raw=readDbSnapshot();return raw?JSON.parse(raw):emptyContent();}
  try{return JSON.parse(fs.readFileSync(contentFile,'utf8'));}
  catch(error){if(error.code==='ENOENT')return emptyContent();throw new Error('CMS content storage is unreadable. Restore data/content.json from backup before saving.');}
}
export function writeContent(data,{backup=true}={}){
  fs.mkdirSync(dataRoot,{recursive:true});
  const tmp=`${contentFile}.${process.pid}.${randomUUID()}.tmp`;
  try{
    const next=JSON.stringify(data,null,2);
    const previous=fs.existsSync(contentFile)?fs.readFileSync(contentFile):null;
    if(previous&&previous.toString('utf8')===next)return;
    if(previous&&backup){
      fs.mkdirSync(backupRoot,{recursive:true});
      const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      const backup=path.join(backupRoot,`${stamp}-${randomUUID()}.json.gz`);
      fs.writeFileSync(backup,gzipSync(previous),{flag:'wx',mode:0o600});
      pruneBackups();
    }
    const fd=fs.openSync(tmp,'wx',0o600);
    try{fs.writeFileSync(fd,next,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(tmp,contentFile);
  }
  catch(error){try{fs.rmSync(tmp,{force:true});}catch{}throw error;}
}
let writeQueue=Promise.resolve();
async function acquireContentLock(){
  fs.mkdirSync(dataRoot,{recursive:true});
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    try{
      const fd=fs.openSync(lockFile,'wx',0o600);
      try{fs.writeFileSync(fd,`${process.pid} ${new Date().toISOString()}`);fs.fsyncSync(fd);}catch(error){fs.closeSync(fd);fs.rmSync(lockFile,{force:true});throw error;}
      return ()=>{try{fs.closeSync(fd);}finally{fs.rmSync(lockFile,{force:true});}};
    }catch(error){
      if(error.code!=='EEXIST')throw error;
      try{if(Date.now()-fs.statSync(lockFile).mtimeMs>60000)fs.rmSync(lockFile,{force:true});}catch(staleError){if(staleError.code!=='ENOENT')throw staleError;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
  }
  throw new Error('CMS content storage is busy. Try again.');
}
export function updateContent(mutator,{expectedRevision}={}){
  // MSSQL: the row lock of the write transaction replaces the file lock.
  const operation=dbEnabled()?writeQueue.then(()=>mutateDb(async current=>{
    if(expectedRevision!==undefined&&expectedRevision!==contentRevision(current))throw new ContentConflictError();
    const before=contentRevision(current);
    const updated=await mutator(current)||current;
    return {data:updated,backup:contentRevision(updated)!==before};
  },emptyContent)):writeQueue.then(async()=>{
    const release=await acquireContentLock();
    try{
      const current=readContent();
      if(expectedRevision!==undefined&&expectedRevision!==contentRevision(current))throw new ContentConflictError();
      const before=contentRevision(current);
      const updated=await mutator(current)||current;
      // Lead-only writes (public forms) don't change editable content, so they must not rotate content backups away.
      writeContent(updated,{backup:contentRevision(updated)!==before});
      return updated;
    }finally{release();}
  });
  writeQueue=operation.catch(()=>{});
  return operation;
}
function markedBounds(html,section,field){
  const opening=/<([a-z][\w:-]*)\b[^>]*>/gi;
  let match;
  while((match=opening.exec(html))){
    const attrs=match[0];
    if((attrs.match(/\bdata-section=["']([^"']+)["']/i)||[])[1]!==section||(attrs.match(/\bdata-field=["']([^"']+)["']/i)||[])[1]!==field)continue;
    const tag=match[1],endTag=new RegExp(`<\\/?${tag}\\b[^>]*>`,'gi');endTag.lastIndex=opening.lastIndex;
    let depth=1,end;
    while((end=endTag.exec(html))){if(/^<\//.test(end[0]))depth--;else if(!/\/\s*>$/.test(end[0]))depth++;if(depth===0)return {start:match.index,openEnd:opening.lastIndex,closeStart:end.index,end:endTag.lastIndex,tag,outer:html.slice(match.index,endTag.lastIndex)};}
  }
  return null;
}
function replaceMarkedInner(html,section,field,inner){const bounds=markedBounds(html,section,field);return bounds?html.slice(0,bounds.openEnd)+inner+html.slice(bounds.closeStart):html;}
function blogBodyHtml(source){
  return sanitizeHtml(String(source||''),{allowedTags:['p','h2','h3','h4','ul','ol','li','blockquote','strong','em','b','i','u','a','img','br','hr','div','section','figure','figcaption','span','table','thead','tbody','tr','th','td','pre','code'],allowedAttributes:{a:['href','target','rel','class'],img:['src','alt','loading','width','height','class'],div:['class'],section:['class'],figure:['class'],figcaption:['class'],span:['class'],p:['class'],h2:['class'],h3:['class'],h4:['class'],ul:['class'],ol:['class'],li:['class'],blockquote:['class'],table:['class'],thead:['class'],tbody:['class'],tr:['class'],th:['class'],td:['class'],pre:['class'],code:['class']},allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false});
}
// Head metadata (title, description, OG, canonical, JSON-LD) is set once by applySeoHead (lib/seo.js).
function renderManagedLegacyPost(html,post,lang,categories){
  const title=String(post.title||'');
  const category=blogCategoryLabel(post,lang,categories)||'';
  const date=String(post.date||'');
  const dateLabel=date?new Date(`${date}T12:00:00Z`).toLocaleDateString(lang==='en'?'en-US':'tr-TR',{day:'numeric',month:'long',year:'numeric'}):'';
  html=html.replace(/<html\b([^>]*)\blang=["'][^"']+["']/i,`<html$1lang="${lang}">`);
  html=replaceMarkedInner(html,'post-header','title',escapeText(title));
  html=replaceMarkedInner(html,'post-header','category',escapeText(category));
  html=replaceMarkedInner(html,'post-header','date',`<time datetime="${escAttr(date)}">${escapeText(dateLabel)}</time>`);
  const imageBounds=markedBounds(html,'post-header','image');
  if(imageBounds){const outer=imageBounds.outer.replace(/(<img\b[^>]*\bsrc=["'])[^"']*(["'])/i,`$1${escAttr(safeUrl(post.image||''))}$2`).replace(/(<img\b[^>]*\balt=["'])[^"']*(["'])/i,`$1${escAttr(title)}$2`);html=html.slice(0,imageBounds.start)+outer+html.slice(imageBounds.end);}
  const renderedContentHash=createHash('sha256').update(String(post.content||'')).digest('hex');
  if(!post.legacySourceContentHash||renderedContentHash!==post.legacySourceContentHash)html=replaceMarkedInner(html,'post-body','content',blogBodyHtml(post.content||''));
  return html;
}
function updateLegacyBlogArchive(html,posts,lang,categories){
  const managed=posts.filter(post=>post.legacy===true&&(post.lang||'tr')===lang);
  const rows=managed.filter(post=>post.published!==false);
  const bySlug=new Map(rows.map(post=>[post.slug,post]));
  const gridStart=html.indexOf('<div class="catalog-grid blog-card-grid">');
  if(gridStart>=0){
    for(const post of managed){
      const marker=`x-show="show('${escJs(post.slug)}')"`;
      const markerAt=html.indexOf(marker,gridStart);if(markerAt<0)continue;
      const articleStart=html.lastIndexOf('<article',markerAt),articleOpenEnd=html.indexOf('>',markerAt)+1,articleClose=html.indexOf('</article>',articleOpenEnd);
      if(articleStart<gridStart||articleOpenEnd<=0||articleClose<0)continue;
      let card=html.slice(articleStart,articleClose+10);
      const section=(card.match(/\bdata-section=["']([^"']+)["']/i)||[])[1];
      const category=blogCategoryLabel(post,lang,categories)||'';
      card=card.replace(/\bdata-tag=["'][^"']*["']/i,`data-tag="${escAttr(blogCategoryKey(category))}"`);
      if(post.published===false)card=card.replace('<article','<article hidden');
      else card=card.replace(/\s+hidden(?=[\s>])/i,'');
      card=replaceMarkedInner(card,section,'category',escapeText(category));
      const titleBounds=markedBounds(card,section,'title');
      if(titleBounds){const inner=card.slice(titleBounds.openEnd,titleBounds.closeStart);const anchor=inner.match(/(<a\b[^>]*>)[\s\S]*?(<\/a>)/i);const next=anchor?inner.replace(anchor[0],anchor[1]+escapeText(post.title||'')+anchor[2]):escapeText(post.title||'');card=replaceMarkedInner(card,section,'title',next);}
      card=replaceMarkedInner(card,section,'excerpt',escapeText(post.excerpt||''));
      const dateLabel=post.date?new Date(`${post.date}T12:00:00Z`).toLocaleDateString(lang==='en'?'en-US':'tr-TR',{day:'numeric',month:'long',year:'numeric'}):'';
      card=replaceMarkedInner(card,section,'date',`<time datetime="${escAttr(post.date||'')}">${escapeText(dateLabel)}</time>`);
      const image=markedBounds(card,section,'image');
      if(image){const outer=image.outer.replace(/(<img\b[^>]*\bsrc=["'])[^"']*(["'])/i,`$1${escAttr(safeUrl(post.image||''))}$2`).replace(/(<img\b[^>]*\balt=["'])[^"']*(["'])/i,`$1${escAttr(post.title||'')}$2`);card=card.slice(0,image.start)+outer+card.slice(image.end);}
      html=html.slice(0,articleStart)+card+html.slice(articleClose+10);
    }
  }
  const postsStart=html.indexOf('posts: ['),labelsStart=html.indexOf('categoryLabels:',postsStart);
  const listEnd=labelsStart>postsStart?html.lastIndexOf('],',labelsStart):-1;
  if(postsStart>=0&&listEnd>postsStart){
    const existing=html.slice(postsStart,listEnd),order=[...existing.matchAll(/\bs:\s*'([^']+)'/g)].map(match=>match[1]);
    const sorted=[...order.map(slug=>bySlug.get(slug)).filter(Boolean),...rows.filter(post=>!order.includes(post.slug)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))];
    const entries=sorted.map(post=>{const category=blogCategoryLabel(post,lang,categories)||'';return{s:post.slug,t:post.title||'',x:post.excerpt||'',g:blogCategoryKey(category),c:category,d:post.date||''};});
    html=html.slice(0,postsStart)+`posts: ${escAttr(JSON.stringify(entries).replace(/</g,'\\u003c').replace(/&/g,'\\u0026'))}`+html.slice(listEnd+1);
  }
  return html;
}
// options.edits: full unsaved page content posted by the admin preview.
// options.preview: annotate structural nodes for editor selection.
export function getLegacyPage(route,productSlug='',allowDraftPosts=false,options={}){
  const rel=route.replace(/\\/g,'/');
  if(!/^(tr|en)\/[a-zA-Z0-9_./-]+\.html$/.test(rel)||rel.includes('..')) return null;
  // The new-post template is an internal render source, never a public page.
  if(/\/blog\/blog-post-template\.html$/.test(rel)&&!allowDraftPosts&&!options.preview)return null;
  let file=path.resolve(siteRoot,rel);
  if(!file.startsWith(siteRoot+path.sep))return null;
  const raw=readContent();raw.catalogues=resolveCatalogues(raw.catalogues);const stored={...raw,products:resolveCatalogProducts(raw.products,raw.pages||{},Boolean(raw.catalogInitialized))};
  // Signed-in preview renders saved-but-unpublished drafts; the public route never does.
  if(allowDraftPosts){
    const drafts=raw.contentDrafts||{};
    stored.posts=overlayRecords(stored.posts||[],drafts.posts);
    stored.products=overlayRecords(stored.products||[],drafts.products);
    stored.catalogues=overlayRecords(stored.catalogues||[],drafts.catalogues).filter(item=>!item.pendingDelete);
    stored.settings=withNavigationDraft(stored.settings||{},raw.navigationDraft);
  }
  const managedLegacy=stored.posts?.find(post=>post.legacy===true&&post.legacyPath===rel);
  if(managedLegacy?.published===false&&!allowDraftPosts)return null;
  const dynamicPost=stored.posts?.find(post=>rel===`${post.lang||'tr'}/blog/${post.slug}.html`&&(allowDraftPosts||post.published!==false));
  if(!fs.existsSync(file)){if(!dynamicPost)return null;file=path.join(siteRoot,'tr/blog/blog-post-template.html');}
  if(!fs.existsSync(file))return null;
  let html=fs.readFileSync(file,'utf8');
  const data=stored; let edits={...(data.pages?.[rel]||{})};
  if(allowDraftPosts&&data.pageDrafts?.[rel])for(const [section,fields] of Object.entries(data.pageDrafts[rel]))edits[section]={...(edits[section]||{}),...(fields||{})};
  if(options.edits&&typeof options.edits==='object'&&!Array.isArray(options.edits))edits={...options.edits};
  if(structureEditable(rel)&&needsStructurePass(edits,{preview:options.preview===true}))html=renderStructure(html,edits,{preview:options.preview===true,lang:rel.startsWith('en/')?'en':'tr'});
  html=html.replace(/(<([a-zA-Z][\w:-]*)\b[^>]*\bdata-section=["']([^"']+)["'][^>]*\bdata-field=["']([^"']+)["'][^>]*>)([\s\S]*?)(<\/\2\s*>)/g,(all,open,tag,section,field,inner,close)=>{
    const value=edits[section]?.[field];
    const linkField=(open.match(/\bdata-field-link=["']([^"']+)["']/i)||[])[1];
    const linkValue=linkField?edits[section]?.[linkField]:undefined;
    if(value===undefined&&linkValue===undefined)return all;
    let nextOpen=open;
    if(tag.toLowerCase()==='a'&&linkValue!==undefined)nextOpen=nextOpen.replace(/\bhref=["'][^"']*["']/i,`href="${escAttr(safeUrl(linkValue))}"`);
    if(value===undefined)return nextOpen+inner+close;
    if(tag.toLowerCase()==='img') return nextOpen.replace(/\bsrc=["'][^"']*["']/i,`src="${escAttr(value)}"`)+inner+close;
    if(tag.toLowerCase()==='a'&&field==='image')return nextOpen+inner.replace(/(<img\b[^>]*\bsrc=["'])[^"']*(["'])/i,`$1${escAttr(value)}$2`)+close;
    if(tag.toLowerCase()==='a'&&field==='href') return nextOpen.replace(/\bhref=["'][^"']*["']/i,`href="${escAttr(safeUrl(value))}"`)+inner+close;
    if(tag.toLowerCase()==='input') return nextOpen.replace(/\bvalue=["'][^"']*["']/i,`value="${escAttr(value)}"`)+inner+close;
    const changed=inner.replace(/>([^<]+)</,(_,text)=>`>${escapeText(value)}<`);return nextOpen+(changed===inner?escapeText(value):changed)+close;
  });
  // <img> is a void element, so the paired-tag pass above never reaches it.
  html=html.replace(/<img\b[^>]*\bdata-section=["']([^"']+)["'][^>]*\bdata-field=["']image["'][^>]*>/gi,(tag,section)=>{
    const value=edits[section]?.image,alt=edits[section]?.alt;
    let next=tag;
    if(typeof value==='string'&&value.trim())next=next.replace(/\bsrc=["'][^"']*["']/i,`src="${escAttr(safeUrl(value))}"`);
    if(typeof alt==='string')next=/\balt=["']/i.test(next)?next.replace(/\balt=["'][^"']*["']/i,`alt="${escAttr(alt)}"`):next.replace(/<img\b/i,`<img alt="${escAttr(alt)}"`);
    return next;
  });
  const savedSlides=edits['hero-1']?.slides;
  if(Array.isArray(savedSlides)){
    const slides='['+savedSlides.slice(0,12).map(slide=>"{src:'"+escJs(safeUrl(slide.src||''))+"',alt:'"+escJs(String(slide.alt||'').slice(0,240))+"'}").join(',')+']';
    html=html.replace(/slides:\s*\[[\s\S]*?\](?=,\s*next\(\))/i,'slides:'+slides);
  }
  const settings=data.settings||{};
  if(settings.navigation)html=rewriteNavigation(html,settings.navigation,rel.startsWith('en/')?'en':'tr',settings.navigationGroups||{});
  const catalogRoute=rel.match(/^(tr|en)\/(hpl-products|oem-parts|pascalcast|pascalforge)\.html$/);
  if(catalogRoute){
    const lang=catalogRoute[1];
    const pageType=({ 'hpl-products':'hydraulic','oem-parts':'oem','pascalcast':'cast','pascalforge':'forge' })[catalogRoute[2]];
    const isHydraulicOrOem=pageType==='hydraulic'||pageType==='oem';
    const startMarker=isHydraulicOrOem?'<!-- CATEGORY FILTER -->':'<!-- CATEGORY CARDS -->';
    const endPattern=pageType==='cast'?/<!--\s*DUCTILE & GRAY IRON PRODUCTS\s*-->/i:/<!--\s*PASCALFORGE COMPANY\s*-->/i;
    const start=html.indexOf(startMarker);
    if(isHydraulicOrOem&&start>=0){
      // Replace the whole legacy filter/listing section. Replacing only up to
      // its first FASON reminder left the old hard-coded cards and a dangling
      // </section> after the live catalogue, which duplicated products and
      // broke the page's section structure.
      const reminderStartMatch=/<!--\s*FASON[^>]*-->/i.exec(html.slice(start));
      const cardsMarker='<!-- PRODUCT CARDS -->';
      const sectionStart=html.indexOf('<section',start+startMarker.length);
      if(sectionStart>=0&&reminderStartMatch){
        const sectionTags=/<\/?section\b[^>]*>/gi;
        sectionTags.lastIndex=sectionStart;
        let depth=0,sectionEnd=-1,sectionMatch;
        while((sectionMatch=sectionTags.exec(html))){
          if(/^<\//.test(sectionMatch[0]))depth--;
          else if(!/\/\s*>$/.test(sectionMatch[0]))depth++;
          if(depth===0){sectionEnd=sectionMatch.index;break;}
        }
        const reminderStart=start+reminderStartMatch.index;
        const cardsStart=html.indexOf(cardsMarker,reminderStart);
        if(sectionEnd>=sectionStart&&cardsStart>reminderStart&&cardsStart<sectionEnd){
          const reminder=html.slice(reminderStart,cardsStart);
          const replacement=renderCatalogListing(data.products||[],lang,pageType)+reminder;
          const sectionEndTag=html.indexOf('>',sectionEnd)+1;
          html=html.slice(0,start)+replacement+html.slice(sectionEndTag);
          html=html.replace(/<head>/i,'<head><script>window.catalogListing='+catalogListing.toString()+';</script>');
        }
      }
    }else if(start>=0){
      const tail=html.slice(start+startMarker.length).search(endPattern);
      if(tail>=0){
        const end=start+startMarker.length+tail;
        html=html.slice(0,start)+renderCatalogListing(data.products||[],lang,pageType)+html.slice(end);
        html=html.replace(/<head>/i,'<head><script>window.catalogListing='+catalogListing.toString()+';</script>');
      }
    }
    }
  if(rel==='tr/kataloglar.html'||rel==='en/kataloglar.html'){
    const startMarker='<!-- CATALOG LIBRARY START -->';
    const endMarker='<!-- CATALOG LIBRARY END -->';
    const start=html.indexOf(startMarker);
    const end=html.indexOf(endMarker,start+startMarker.length);
    if(start>=0&&end>start){
      const lang=rel.startsWith('en/')?'en':'tr';
      html=html.slice(0,start)+renderCatalogueListing(data.catalogues||[],lang)+html.slice(end+endMarker.length);
      html=html.replace(/<head>/i,'<head><script>window.documentListing='+documentListing.toString()+';</script>');
    }
  }
  if(rel.endsWith('/blog/index.html')&&data.posts?.some(p=>p.legacy===true&&(p.lang||'tr')===(rel.startsWith('en/')?'en':'tr'))){html=updateLegacyBlogArchive(html,data.posts,rel.startsWith('en/')?'en':'tr',data.categories||[]);}
  if(rel.endsWith('/blog/index.html')&&data.posts?.some(p=>p.legacy!==true&&p.published!==false)){
    const lang=rel.startsWith('en/')?'en':'tr';const livePosts=data.posts.filter(p=>p.legacy!==true&&p.published!==false&&(p.lang||'tr')===lang);const dataEnd=html.indexOf('norm(v) {');if(dataEnd>0){const listEnd=html.lastIndexOf('],',dataEnd);const entries=livePosts.map(p=>{const category=blogCategoryLabel(p,lang,data.categories||[]);return{s:p.slug,t:p.title||'',x:p.excerpt||'',g:blogCategoryKey(category),c:category,d:p.date||new Date(p.createdAt||Date.now()).toISOString().slice(0,10)};});if(listEnd>0)html=html.slice(0,listEnd)+','+escAttr(JSON.stringify(entries).slice(1,-1).replace(/</g,'\\u003c').replace(/&/g,'\\u0026'))+html.slice(listEnd);}
    const marker='<div class="catalog-grid blog-card-grid">';const at=html.lastIndexOf(marker);const close=html.indexOf('\n  </div>',at+marker.length);if(at>=0&&close>at){const cards=data.posts.filter(p=>p.legacy!==true&&p.published!==false&&(p.lang||'tr')===lang).map(p=>`<article class="bg-white/5 border border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden"><a href="${escAttr(p.slug)}.html" class="block h-48 bg-white/10 overflow-hidden"><img data-cms-post-id="${escAttr(p.id)}" data-cms-post-field="image" src="${escAttr(safeUrl(p.image||'/assets/images/hero-hydraulic-cylinder.webp'))}" alt="${escAttr(p.title)}" class="h-48 w-full object-cover"></a><div class="p-6 flex flex-col flex-1"><span class="text-xs uppercase text-[#fb923c] mb-3">${escapeText(blogCategoryLabel(p,lang,data.categories||[])||'Mühendislik')}</span><h2 data-cms-post-id="${escAttr(p.id)}" data-cms-post-field="title" class="font-bold text-lg text-white mb-2">${escapeText(p.title)}</h2><p data-cms-post-id="${escAttr(p.id)}" data-cms-post-field="excerpt" class="text-sm text-slate-400 mb-5">${escapeText(p.excerpt||'')}</p><a href="${escAttr(p.slug)}.html" class="text-[#fb923c] font-semibold text-sm mt-auto">Devamını Oku →</a></div></article>`).join('');html=html.slice(0,close)+cards+html.slice(close);for(const p of livePosts){const link=`href="${escAttr(p.slug)}.html"`;const i=html.lastIndexOf(link);const s=html.lastIndexOf('<article',i);const e=html.indexOf('>',s);if(i>0&&s>=0&&e>0)html=html.slice(0,e)+` data-tag="${blogCategoryKey(blogCategoryLabel(p,lang,data.categories||[]))}" x-show="show('${escJs(p.slug)}')" :style="{ order: ord('${escJs(p.slug)}') }"`+html.slice(e);}}
  }
  const newPost=dynamicPost;
  if(newPost?.legacy===true){html=renderManagedLegacyPost(html,newPost,newPost.lang||'tr',data.categories||[]);}
  else if(newPost){const title=escapeText(newPost.title||'Blog');const description=escapeText(newPost.excerpt||'');
    const source=String(newPost.content||'');const body=/<(?:p|h[2-4]|ul|ol|li|blockquote|strong|em|b|i|u|a|img|br|hr)\b/i.test(source)?sanitizeHtml(source,{allowedTags:['p','h2','h3','h4','ul','ol','li','blockquote','strong','em','b','i','u','a','img','br','hr'],allowedAttributes:{a:['href','target','rel'],img:['src','alt','loading']},allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false}):escapeText(source).split(/\n\s*\n/).map(x=>`<p>${x.replace(/\n/g,'<br>')}</p>`).join('');html=html.replace(/<html lang="[^"]+"/i,`<html lang="${newPost.lang||'tr'}"`).replace(/<main[^>]*>[\s\S]*?<\/main>/i,`<main><section class="max-w-5xl mx-auto px-6 lg:px-8 py-24"><a href="index.html" class="text-[#fb923c]">← Blog</a><p class="font-mono text-xs uppercase tracking-wider text-slate-500 mt-8">${escapeText(blogCategoryLabel(newPost,newPost.lang||'tr',data.categories||[])||'Mühendislik')}</p><h1 data-cms-post-id="${escAttr(newPost.id)}" data-cms-post-field="title" class="text-4xl md:text-6xl font-extrabold text-[#fb923c] mt-4">${title}</h1><p data-cms-post-id="${escAttr(newPost.id)}" data-cms-post-field="excerpt" class="text-lg text-slate-400 mt-5">${description}</p><img data-cms-post-id="${escAttr(newPost.id)}" data-cms-post-field="image" src="${escAttr(safeUrl(newPost.image||'/assets/images/hero-hydraulic-cylinder.webp'))}" alt="${title}" class="w-full max-h-[520px] object-cover rounded-lg mt-10"><article data-cms-post-id="${escAttr(newPost.id)}" data-cms-post-field="content" class="prose max-w-none text-slate-300 leading-8 mt-10">${body}</article></section></main>`);}
  if(settings.companyName){html=html.replace(/HydroPascal/g,escapeText(settings.companyName));html=html.replace(/alt="HydroPascal"/g,`alt="${escAttr(settings.companyName)}"`);}
  if(settings.email)html=html.replace(/info@hydropascal\.com\.tr/gi,escAttr(settings.email));
  if(settings.address)html=html.replace(/(<([a-z][\w:-]*)\b[^>]*\bdata-field=["']address["'][^>]*>)([\s\S]*?)(<\/\2\s*>)/gi,(_,open,tag,inner,close)=>open+escapeText(settings.address)+close);

  if(settings.phone)html=html.replace(/\+90\s*555\s*384\s*82\s*29|\+905553848229|05553848229/g,escAttr(settings.phone));
  if(rel==='tr/index.html'&&settings.heroTitle&&edits['hero-1']?.title===undefined)html=html.replace(/(<h1\b[^>]*data-field=["']title["'][^>]*>)[\s\S]*?(<\/h1>)/i,`$1${escapeText(settings.heroTitle)}$2`);
  if(settings.logo)html=html.replace(/src="(?:\.\.\/)?assets\/images\/logo\/hpl-logo-yatay\.svg"/g,`src="${escAttr(safeUrl(settings.logo))}"`);
  if(settings.logoDark)html=html.replace(/src="(?:\.\.\/)?assets\/images\/logo\/hpl-logo-yatay-dark\.svg"/g,`src="${escAttr(safeUrl(settings.logoDark))}"`);
  const language=rel.startsWith('en/')?'en':'tr';
  if(/\/(referanslar)\.html$/.test(rel))html=html.replace(/<!-- BRAND COMPATIBILITY -->[\s\S]*?(?=<!-- WHY THEY CHOOSE US -->)/,`<!-- BRAND COMPATIBILITY -->${renderReferenceCards(data.references||[],language)}`);
  if(/\/(media)\.html$/.test(rel)){const section=data.pages?.[rel]?.['content-media']||{};const title=section.title||(language==='en'?'Media Gallery':'Medya Galerisi');const gallery=renderMediaGallery(data.mediaItems||[],language,title,section.content||'');html=html.replace(/<section id="content-media"[\s\S]*?<\/section>/i,gallery);}
  html=rewriteFooter(html,settings,language);
  const contentBlocks=renderContentBlocks(edits.__blocks?.items,edits);
  if(contentBlocks)html=html.replace(/<\/main>/i,contentBlocks+'</main>');
  html=html.replace(/((?:src|href)=["'])\.\.\/assets\//g,'$1/assets/');
  let matchedProduct=null;
  if(/\/(?:urun-detay)\.html$/.test(rel)){
    const product=productSlug?data.products.find(item=>item.slug===productSlug||item.id===productSlug||item.code===productSlug):null;
    // Public: the bare template or an unknown product id is a real 404, not an empty 200 page.
    if(!product&&!allowDraftPosts&&!options.preview)return null;
    if(product){
      matchedProduct=product;
      if(!allowDraftPosts&&!isPublicProduct(product))return null;
      const lang=rel.startsWith('en/')?'en':'tr';
      const localize=(rows,keys)=>Array.isArray(rows)?rows.map(row=>({...row,...Object.fromEntries(keys.map(key=>[key,lang==='en'?(row[key+'En']||row[key]||''):(row[key]||'')]))})):[];
      const groups=Array.isArray(product.dimensionGroups)?product.dimensionGroups.map(group=>({...group,title:lang==='en'?(group.titleEn||group.title||''):(group.title||''),rows:localize(group.rows,['label','value'])})):[];
      const isOem=product.type==='oem';
      const override={id:String(product.id),slug:String(product.slug||product.id),title:(lang==='en'?(product.detailTitleEn||product.nameEn):(product.detailTitle||product.name))||'',description:(lang==='en'?(product.descriptionEn||''):(product.description||'')),category:isOem?'oem':'hydraulic',categoryLabel:(lang==='en'?(product.categoryEn||product.category):(product.category||'')),parent:isOem?'oem-parts.html':'hpl-products.html',parentLabel:lang==='en'?(isOem?'HPL OEM':'HPL Products'):(isOem?'HPL OEM':'HPL Ürünleri'),breadcrumbLabel:lang==='en'?(isOem?'OEM Parts':'Hydraulic Products'):(isOem?'OEM Parça':'HPL Ürünleri'),image:safeUrl(product.image||''),pdf:safeUrl(product.pdf||'#'),oemCode:product.oemCode||product.code||'',compatibleBrands:localize(product.compatibleBrands,['brand','model']),dimensionRows:localize(product.dimensionRows,['label','value']),dimensionGroups:groups,dimensionNote:(lang==='en'?(product.dimensionNoteEn||''):(product.dimensionNote||'')),gallery:Array.isArray(product.gallery)?product.gallery.map(photo=>({...photo,url:safeUrl(photo.url||''),alt:lang==='en'?(photo.altEn||photo.alt||''):(photo.alt||'')})):[]};
      const encoded=Buffer.from(JSON.stringify(override).replace(/</g,'\\u003c').replace(/&/g,'\\u0026'),'utf8').toString('base64');
      // Language switch keeps the product (the static link pointed at the bare template).
      html=html.replace(/href="\.\.\/(en|tr)\/urun-detay\.html"/g,(_,target)=>`href="/${target}/urun-detay.html?id=${encodeURIComponent(String(product.slug||product.id))}"`);
      html=html.replace(/<\/body>/i,`<script>window.__CMS_PRODUCT_OVERRIDE__=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${encoded}'),c=>c.charCodeAt(0))));</script></body>`);
    }
  }
  const visual=edits.__visual;
  if(visual&&typeof visual==='object'&&Object.keys(visual).length){
    const usedIcons=[...new Set(Object.values(visual).map(value=>value?.icon).filter(Boolean))];
    const iconMarkup=iconLibraryMarkup(usedIcons);
    const payload=Buffer.from(JSON.stringify({visual,iconMarkup}).replace(/</g,'\\u003c').replace(/&/g,'\\u0026'),'utf8').toString('base64');
    const runtime=`(()=>{const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${payload}'),c=>c.charCodeAt(0))));const safe=u=>/^(https?:|mailto:|tel:|\\/|\\.\\.?\\/|#)/i.test(String(u||'').trim())&&!/^\\s*(javascript|data|vbscript):/i.test(String(u||''))?String(u):'#';const apply=()=>{for(const [key,patch] of Object.entries(data.visual||{})){let selector=key,index=-1;const split=key.lastIndexOf('::text:');if(split>=0){selector=key.slice(0,split);index=Number(key.slice(split+7));}let node;try{node=document.querySelector(selector)}catch{continue}if(!node)continue;if(patch?.text!==undefined&&Number.isInteger(index)&&index>=0){const texts=[...node.childNodes].filter(item=>item.nodeType===Node.TEXT_NODE);if(texts[index])texts[index].nodeValue=String(patch.text);else node.appendChild(document.createTextNode(String(patch.text)))}if(patch?.src!==undefined&&node.tagName==='IMG')node.setAttribute('src',safe(patch.src));if(patch?.alt!==undefined&&node.tagName==='IMG')node.setAttribute('alt',String(patch.alt));if(patch?.href!==undefined){let link=node;try{if(patch.hrefSelector)link=document.querySelector(patch.hrefSelector)}catch{}if(link?.tagName==='A')link.setAttribute('href',safe(patch.href))}if(patch?.icon&&node.tagName==='svg'&&data.iconMarkup?.[patch.icon]?.svg){const t=document.createElement('template');t.innerHTML=data.iconMarkup[patch.icon].svg;const source=t.content.querySelector('svg');if(source){node.replaceChildren(...[...source.childNodes].map(child=>child.cloneNode(true)));for(const attr of ['viewBox','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'])if(source.hasAttribute(attr))node.setAttribute(attr,source.getAttribute(attr))}}}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,0),{once:true});else apply()})();`;
    html=html.replace(/<\/body>/i,`<script>${runtime}</script></body>`);
  }
  html=html.replace(/<head>/i,`<head><base href="/${rel.slice(0,rel.lastIndexOf('/')+1)}">`);
  // One pass owns all head metadata + JSON-LD (lib/seo.js); measurement only on the real public page.
  const postCategory=dynamicPost?blogCategoryLabel(dynamicPost,dynamicPost.lang||'tr',data.categories||[]):'';
  const seo=applySeoHead(html,{route:rel,data:{...data,pages:{...(data.pages||{}),[rel]:edits}},product:matchedProduct,post:dynamicPost||null,category:postCategory,notFound:options.notFound===true});
  html=seo.html;
  if(!allowDraftPosts&&!options.preview)html=applyAnalytics(html,{route:rel,lang:seo.meta.lang,settings:data.settings||{},kind:seo.meta.kind,product:matchedProduct,post:dynamicPost||null,category:postCategory});
  return html;
}
function escapeText(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escAttr(v){return escapeText(v).replace(/"/g,'&quot;');}
function normalizedLabel(label){return String(label||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toLowerCase();}
function blogCategoryKey(label){return normalizeCategoryName(label).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'muhendislik';}
function blogCategoryLabel(post,language,categories=[]){
  if(language!=='en')return post.category||'';
  if(post.categoryEn)return post.categoryEn;
  const current=normalizeCategoryName(post.category);
  const match=categories.find(category=>category.scope==='blog'&&[category.name,category.nameEn].some(name=>normalizeCategoryName(name)===current));
  return match?.nameEn||post.category||'';
}
function catalogListing(items,language,group){return {items,language,group,search:'',category:'all',brand:'all',sort:'featured',page:1,pageSize:3,get categories(){return [...new Set(this.items.map(item=>item.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,this.language));},get brands(){return [...new Set(this.items.flatMap(item=>(item.brands||[]).map(row=>row.brand)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));},get filtered(){const needle=this.search.trim().toLocaleLowerCase(this.language==='tr'?'tr':'en');const rows=this.items.filter(item=>(this.category==='all'||item.category===this.category)&&(this.brand==='all'||(item.brands||[]).some(row=>row.brand===this.brand))&&(!needle||[item.name,item.code,item.oemCode,item.description,...(item.brands||[]).flatMap(row=>[row.brand,row.model])].join(' ').toLocaleLowerCase(this.language==='tr'?'tr':'en').includes(needle)));if(this.sort==='az')rows.sort((a,b)=>a.name.localeCompare(b.name,this.language));if(this.sort==='za')rows.sort((a,b)=>b.name.localeCompare(a.name,this.language));if(this.sort==='featured')rows.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));return rows;},get pageCount(){return Math.max(1,Math.ceil(this.filtered.length/this.pageSize));},get pageItems(){return this.filtered.slice((this.page-1)*this.pageSize,this.page*this.pageSize);},get firstItem(){return this.filtered.length?(this.page-1)*this.pageSize+1:0;},get lastItem(){return Math.min(this.page*this.pageSize,this.filtered.length);},reset(){this.search='';this.category='all';this.brand='all';this.sort='featured';this.page=1;}};}
function renderCatalogListing(products,lang,type){
  const names={tr:{hydraulic:'Hidrolik ürünler',oem:'OEM parçalar',cast:'Döküm ürünleri',forge:'Dövme parçalar'},en:{hydraulic:'Hydraulic products',oem:'OEM parts',cast:'Casting products',forge:'Forged parts'}}[lang];
  const items=products.filter(item=>(item.type||'hydraulic')===type&&item.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(item=>({
    id:String(item.id),slug:String(item.slug||item.id),name:String(lang==='en'?(item.nameEn||item.name):item.name||''),code:String(item.code||''),category:String(lang==='en'?(item.categoryEn||item.category):item.category||''),description:String(lang==='en'?(item.descriptionEn||''):item.description||''),image:safeUrl(item.image||'/assets/images/hero-hydraulic-cylinder.webp'),pdf:item.pdf?safeUrl(item.pdf):'',oemCode:String(item.oemCode||''),brands:Array.isArray(item.compatibleBrands)?item.compatibleBrands:[],sortOrder:Number(item.sortOrder)||0,details:['hydraulic','oem'].includes(type)
  }));
  const encoded=Buffer.from(JSON.stringify(items),'utf8').toString('base64');
  const text=lang==='en'?{search:'Search products or codes',category:'All categories',brand:'All brands',sort:'Sort by',featured:'Featured',az:'Name A–Z',za:'Name Z–A',count:'items',empty:'No matching products. Change the filters or search term.',detail:'View details',pdf:'Technical PDF',quote:'Request a quote',showing:'Showing',of:'of',previous:'Previous',next:'Next',pageSize:'Per page'}:{search:'Ürün veya kod ara',category:'Tüm kategoriler',brand:'Tüm markalar',sort:'Sıralama',featured:'Önerilen sıra',az:'Ad: A–Z',za:'Ad: Z–A',count:'kayıt',empty:'Eşleşen ürün bulunamadı. Aramayı veya filtreyi değiştirin.',detail:'Ürün detayları',pdf:'Teknik PDF',quote:'Teklif iste',showing:'Gösterilen',of:'/',previous:'Önceki',next:'Sonraki',pageSize:'Sayfa başına'};
  const brandSelect=type==='oem'?`<label class="catalog-control"><span class="sr-only">${lang==='en'?'Brand':'Marka'}</span><select aria-label="${lang==='en'?'Brand':'Marka'}" x-model="brand" @change="page=1"><option value="all">${text.brand}</option><template x-for="name in brands" :key="name"><option :value="name" x-text="name"></option></template></select></label>`:'';
  const heading=`<div class="catalog-heading"><div><span class="catalog-eyebrow">${lang==='en'?'HYDROPASCAL CATALOG':'HYDROPASCAL KATALOĞU'}</span><h2>${names[type]}</h2></div><span class="catalog-result-count" aria-live="polite"><b x-text="filtered.length">${items.length}</b> ${text.count}</span></div>`;
  const controls=`<div class="catalog-toolbar"><label class="catalog-search"><span aria-hidden="true">⌕</span><span class="sr-only">${text.search}</span><input type="search" x-model="search" @input="page=1" placeholder="${text.search}"></label><label class="catalog-control"><span class="sr-only">${text.category}</span><select aria-label="${text.category}" x-model="category" @change="page=1"><option value="all">${text.category}</option><template x-for="name in categories" :key="name"><option :value="name" x-text="name"></option></template></select></label>${brandSelect}<label class="catalog-control"><span class="sr-only">${text.sort}</span><select aria-label="${text.sort}" x-model="sort" @change="page=1"><option value="featured">${text.featured}</option><option value="az">${text.az}</option><option value="za">${text.za}</option></select></label></div>`;
  const cards=`<div class="catalog-grid"><template x-for="item in pageItems" :key="item.id"><article class="catalog-card"><div class="catalog-card-media"><img :src="item.image" :alt="item.name" loading="lazy"><span x-show="item.category" class="catalog-category" x-text="item.category"></span></div><div class="catalog-card-body"><div class="catalog-card-code" x-show="item.code || item.oemCode"><span x-text="item.code || item.oemCode"></span></div><h3 x-text="item.name"></h3><p x-show="item.description" x-text="item.description"></p><template x-if="group === 'oem' && item.brands.length"><div class="catalog-brand-list"><template x-for="brand in item.brands.slice(0,3)" :key="brand.brand + brand.model"><span x-text="brand.brand + (brand.model ? ' · ' + brand.model : '')"></span></template><span x-show="item.brands.length > 3" x-text="'+' + (item.brands.length - 3)"></span></div></template><div class="catalog-card-actions"><a x-show="item.details" :href="'urun-detay.html?id=' + encodeURIComponent(item.slug)" class="catalog-primary">${text.detail} <span aria-hidden="true">→</span></a><a x-show="!item.details" :href="'teklif-al.html?product=' + encodeURIComponent(item.code || item.name)" class="catalog-primary">${text.quote} <span aria-hidden="true">→</span></a><a x-show="item.pdf" :href="item.pdf" target="_blank" rel="noopener noreferrer" class="catalog-secondary">${text.pdf} ↗</a></div></div></article></template></div>`;
  const pagination=`<nav x-show="pageCount > 1" x-cloak class="catalog-pagination" aria-label="${lang==='en'?'Product pages':'Ürün sayfaları'}"><span>${text.showing} <b x-text="firstItem"></b>–<b x-text="lastItem"></b> ${text.of} <b x-text="filtered.length"></b></span><div><label>${text.pageSize}<select x-model.number="pageSize" @change="page=1"><option value="3">3</option><option value="6">6</option><option value="9">9</option><option value="18">18</option><option value="36">36</option></select></label><button type="button" @click="page=Math.max(1,page-1)" :disabled="page <= 1">‹ ${text.previous}</button><span>${lang==='en'?'Page':'Sayfa'} <b x-text="page"></b> / <b x-text="pageCount"></b></span><button type="button" @click="page=Math.min(pageCount,page+1)" :disabled="page >= pageCount">${text.next} ›</button></div></nav>`;
  const topPageSize=`<label class="catalog-control catalog-page-size"><span>${text.pageSize}</span><select aria-label="${text.pageSize}" x-model.number="pageSize" @change="page=1"><option value="3">3</option><option value="6">6</option><option value="9">9</option><option value="18">18</option><option value="36">36</option></select></label>`;
  const topControls=controls.replace('</div>',topPageSize+'</div>');
  const bottomPagination=pagination.replace(/<label>[\s\S]*?<\/label>/,'');
  return `<section class="catalog-workspace" x-data="window.catalogListing(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${encoded}'), c => c.charCodeAt(0)))), '${lang}', '${type}')"><div class="catalog-shell">${heading}${topControls}<div x-show="filtered.length === 0" x-cloak class="catalog-empty"><b>${text.empty}</b><button type="button" @click="reset()">${lang==='en'?'Clear filters':'Filtreleri temizle'}</button></div>${cards}${bottomPagination}</div></section>`;
}
function documentListing(items,language){
  return {items,language,search:'',category:'all',sort:'featured',page:1,pageSize:6,
    get categories(){return [...new Set(this.items.map(item=>item.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,this.language));},
    get filtered(){const needle=this.search.trim().toLocaleLowerCase(this.language==='tr'?'tr':'en');const rows=this.items.filter(item=>(this.category==='all'||item.category===this.category)&&(!needle||[item.name,item.description,item.fileName].join(' ').toLocaleLowerCase(this.language==='tr'?'tr':'en').includes(needle)));if(this.sort==='az')rows.sort((a,b)=>a.name.localeCompare(b.name,this.language));if(this.sort==='za')rows.sort((a,b)=>b.name.localeCompare(a.name,this.language));if(this.sort==='featured')rows.sort((a,b)=>a.sortOrder-b.sortOrder);return rows;},
    get pageCount(){return Math.max(1,Math.ceil(this.filtered.length/this.pageSize));},
    get pageItems(){return this.filtered.slice((this.page-1)*this.pageSize,this.page*this.pageSize);},
    get firstItem(){return this.filtered.length?(this.page-1)*this.pageSize+1:0;},
    get lastItem(){return Math.min(this.page*this.pageSize,this.filtered.length);},
    reset(){this.search='';this.category='all';this.sort='featured';this.page=1;}
  };
}
function renderCatalogueListing(catalogues,lang){
  const text=lang==='en'?{title:'Catalogues and PDF library',search:'Search catalogues',category:'All categories',sort:'Sort by',featured:'Featured',az:'Name A–Z',za:'Name Z–A',pageSize:'Per page',count:'documents',empty:'No catalogues match your search.',open:'Open PDF',download:'Download PDF',showing:'Showing',of:'of',previous:'Previous',next:'Next'}:{title:'Katalog ve PDF arşivi',search:'Kataloglarda ara',category:'Tüm kategoriler',sort:'Sıralama',featured:'Önerilen sıra',az:'Ad: A–Z',za:'Ad: Z–A',pageSize:'Sayfa başına',count:'doküman',empty:'Aramanızla eşleşen katalog bulunamadı.',open:'PDF’i aç',download:'PDF’i indir',showing:'Gösterilen',of:'/',previous:'Önceki',next:'Sonraki'};
  const items=catalogues.filter(item=>item.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(item=>({id:String(item.id),name:String(lang==='en'?(item.titleEn||item.title||''):(item.title||'')),category:String(lang==='en'?(item.categoryEn||item.category||''):(item.category||'')),description:String(lang==='en'?(item.descriptionEn||''):(item.description||'')),pdf:safeUrl(lang==='en'?(item.fileEn||item.file||'#'):(item.file||'#')),fileName:String((lang==='en'?(item.fileEn||item.file):(item.file||'')).split('/').pop()||''),sortOrder:Number(item.sortOrder)||0}));
  const encoded=Buffer.from(JSON.stringify(items),'utf8').toString('base64');
  const heading=`<div class="catalog-heading"><div><span class="catalog-eyebrow">HYDROPASCAL ${lang==='en'?'DOCUMENTS':'DOKÜMANLARI'}</span><h2>${text.title}</h2></div><span class="catalog-result-count" aria-live="polite"><b x-text="filtered.length">${items.length}</b> ${text.count}</span></div>`;
  const controls=`<div class="catalog-toolbar catalog-document-toolbar"><label class="catalog-search"><span aria-hidden="true">⌕</span><span class="sr-only">${text.search}</span><input type="search" x-model="search" @input="page=1" placeholder="${text.search}"></label><label class="catalog-control"><span class="sr-only">${text.category}</span><select aria-label="${text.category}" x-model="category" @change="page=1"><option value="all">${text.category}</option><template x-for="name in categories" :key="name"><option :value="name" x-text="name"></option></template></select></label><label class="catalog-control"><span class="sr-only">${text.sort}</span><select aria-label="${text.sort}" x-model="sort" @change="page=1"><option value="featured">${text.featured}</option><option value="az">${text.az}</option><option value="za">${text.za}</option></select></label><label class="catalog-control catalog-page-size"><span>${text.pageSize}</span><select aria-label="${text.pageSize}" x-model.number="pageSize" @change="page=1"><option value="6">6</option><option value="9">9</option><option value="18">18</option><option value="36">36</option></select></label></div>`;
  const cards=`<div class="catalog-grid catalog-document-grid"><template x-for="item in pageItems" :key="item.id"><article class="catalog-card catalog-document-card"><div class="catalog-document-media"><span class="catalog-pdf-icon" aria-hidden="true">PDF</span><span class="catalog-category" x-show="item.category" x-text="item.category"></span></div><div class="catalog-card-body"><h3 x-text="item.name"></h3><p class="catalog-document-filename" x-text="item.fileName"></p><p x-show="item.description" x-text="item.description"></p><div class="catalog-card-actions"><a :href="item.pdf" target="_blank" rel="noopener noreferrer" class="catalog-primary">${text.open} <span aria-hidden="true">↗</span></a><a :href="item.pdf" download class="catalog-secondary">${text.download}</a></div></div></article></template></div>`;
  const pagination=`<nav x-show="pageCount > 1" x-cloak class="catalog-pagination" aria-label="${lang==='en'?'Catalogue pages':'Katalog sayfaları'}"><span>${text.showing} <b x-text="firstItem"></b>–<b x-text="lastItem"></b> ${text.of} <b x-text="filtered.length"></b></span><div><button type="button" @click="page=Math.max(1,page-1)" :disabled="page <= 1">‹ ${text.previous}</button><span>${lang==='en'?'Page':'Sayfa'} <b x-text="page"></b> / <b x-text="pageCount"></b></span><button type="button" @click="page=Math.min(pageCount,page+1)" :disabled="page >= pageCount">${text.next} ›</button></div></nav>`;
  return `<section class="catalog-workspace" x-data="window.documentListing(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${encoded}'), c => c.charCodeAt(0)))), '${lang}')"><div class="catalog-shell">${heading}${controls}<div x-show="filtered.length === 0" x-cloak class="catalog-empty"><b>${text.empty}</b><button type="button" @click="reset()">${lang==='en'?'Clear search':'Aramayı temizle'}</button></div>${cards}${pagination}</div></section>`;
}
function rewriteNavigation(html,items,lang,groups={}){
  const end=html.indexOf('<!-- HEADER END -->');
  if(end<0)return html;
  let header=html.slice(0,end);
  const normalized=normalizeNavigation(items,groups);
  const labelFor=item=>lang==='en'?(item.labelEn||item.label||''):item.label||'';
  const hrefFor=item=>navHref(item.href||item.match||'#',lang);
  const targetFor=item=>item.newTab?' target="_blank" rel="noopener noreferrer"':'';
  const visibleChildren=parentId=>childrenOf(normalized,parentId).filter(item=>item.active!==false);
  const hasTarget=item=>Boolean(item.href&&item.href!=='#');
  const link=(item,className)=>'<a href="'+escAttr(hrefFor(item))+'"'+targetFor(item)+' class="'+className+'">'+escapeText(labelFor(item))+'</a>';
  // Same markup as the static header, so theme.css and reveal.js (active-page underline) keep working.
  const chevron='<svg class="h-3.5 w-3.5 transition-transform text-slate-300" :class="menuOpen ? \'rotate-180\' : \'\'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>';
  const dropdownLink='px-3 py-2 rounded-md text-sm text-slate-700 hover:text-[#fb923c] hover:bg-slate-50 transition';
  const dropdownItems=(parentId,depth)=>depth>=MAX_NAV_DEPTH?'':visibleChildren(parentId).map(item=>{
    const nested=dropdownItems(item.id,depth+1);
    if(!nested)return link(item,dropdownLink);
    const head=hasTarget(item)?link(item,dropdownLink+' font-semibold'):'<p class="px-3 pt-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">'+escapeText(labelFor(item))+'</p>';
    return head+'<div class="ml-3 pl-2 border-l border-slate-200 flex flex-col gap-1">'+nested+'</div>';
  }).join('');
  const desktop=visibleChildren('').map(item=>{
    if(item.variant==='button')return link(item,'ml-2 px-5 py-2.5 rounded-md font-semibold bg-[#fb923c] text-slate-950 hover:brightness-110 hover:shadow-lg hover:shadow-[#fb923c]/30 transition');
    const items=dropdownItems(item.id,1);
    if(!items)return link(item,'text-slate-300 hover:text-white hover:bg-white/5 px-4 py-2 rounded-full transition');
    const overview=hasTarget(item)?link(item,dropdownLink+' font-semibold'):'';
    return '<div class="relative" x-data="{ menuOpen: false }" @click.outside="menuOpen = false" @keydown.escape="menuOpen = false"><button type="button" @click="menuOpen = !menuOpen" :aria-expanded="menuOpen" aria-haspopup="true" class="flex items-center gap-1 text-slate-300 hover:text-white hover:bg-white/5 px-4 py-2 rounded-full transition">'+escapeText(labelFor(item))+chevron+'</button><div x-show="menuOpen" x-transition x-cloak class="absolute left-0 mt-2 w-56 rounded-md border border-slate-200 bg-white shadow-2xl p-2 flex flex-col gap-1 z-50">'+overview+items+'</div></div>';
  }).join('');
  const mobileIndent=['','pl-7','pl-10','pl-12','pl-14','pl-16'];
  const renderMobile=(parentId='',depth=0)=>depth>=MAX_NAV_DEPTH?'':visibleChildren(parentId).map(item=>{
    const indent=mobileIndent[Math.min(depth,mobileIndent.length-1)];
    if(depth===0&&item.variant==='button')return link(item,'px-4 py-2 rounded-lg text-center font-semibold bg-[#fb923c] text-slate-950');
    const nested=renderMobile(item.id,depth+1);
    const linkClass=('px-4 py-2 '+indent+' rounded-lg text-slate-300 hover:bg-white/5 hover:text-white transition'+(depth?' text-sm':'')).replace(/\s+/g,' ');
    if(!nested)return link(item,linkClass);
    return (hasTarget(item)?link(item,linkClass):'<p class="'+('px-4 '+indent+' pt-2 text-xs font-semibold text-slate-500 uppercase tracking-wider').replace(/\s+/g,' ')+'">'+escapeText(labelFor(item))+'</p>')+nested;
  }).join('');
  const navMatch=header.match(/<nav\b(?=[^>]*\bhidden\b)(?=[^>]*\blg:flex\b)[^>]*>/i);
  if(navMatch){
    const navStart=navMatch.index,openEnd=navStart+navMatch[0].length;
    const settingsAt=header.indexOf('<div class="relative ml-3">',openEnd);
    const navEnd=settingsAt<0?-1:header.indexOf('</nav>',settingsAt);
    if(settingsAt>0&&navEnd>settingsAt){const settingsMarkup=header.slice(settingsAt,navEnd);header=header.slice(0,navStart)+navMatch[0]+desktop+settingsMarkup+'</nav>'+header.slice(navEnd+6);}
  }
  const mobile=renderMobile();
  const mobileMatch=header.match(/<div\b(?=[^>]*x-show="open")(?=[^>]*\blg:hidden\b)[^>]*>/i);
  if(mobileMatch){const openEnd=mobileMatch.index+mobileMatch[0].length,close=header.indexOf('</div>',openEnd);if(close>openEnd)header=header.slice(0,openEnd)+mobile+header.slice(close);}
  return header+html.slice(end);
}
// One-time migration: the static header rendered the quote link as the filled CTA button.
function navigationVariantFromItem(item){return item?.parentId===undefined&&/(?:^|\/)teklif-al\.html$/.test(String(item?.match||item?.href||''))?'button':'';}
function navigationParentFromItem(item){
  if(item?.parent===''||item?.parent==='products'||item?.parent==='resources')return item.parent;
  const target=String(item?.match||item?.href||'').split('/').pop();
  if(['hpl-products.html','oem-parts.html','pascalforge.html','pascalcast.html'].includes(target))return'products';
  if(['kataloglar.html','media.html','referanslar.html','faq.html'].includes(target))return'resources';
  return'';
}
function navHref(href,lang){const value=String(href||'').trim();if(/^(?:https?:|mailto:|tel:|\/\/|\/|#)/i.test(value))return safeUrl(value);return value?'/'+lang+'/'+value.replace(/^\.\//,''):'#';}
function replaceDataField(html,section,field,value){
  const pattern=new RegExp('(<([a-z][\\w:-]*)\\b[^>]*\\bdata-section="'+section+'"[^>]*\\bdata-field="'+field+'"[^>]*>)[\\s\\S]*?(<\\/\\2\\s*>)','i');
  return html.replace(pattern,(_,open,tag,close)=>open+escapeText(value)+close);
}
function rewriteFooter(html,settings,lang){
  const start=html.indexOf('<!-- FOOTER START -->');
  const end=html.indexOf('<!-- FOOTER END -->',start);
  if(start<0||end<0)return html;
  let footer=html.slice(start,end);
  const companyName=settings.companyName||'HydroPascal';
  const description=lang==='en'?(settings.footerDescriptionEn||'Since 2019, HPL HydroPascal has manufactured hydraulic cylinder systems and supplied reliable solutions for agricultural machinery.'):(settings.footerDescription||'HPL HydroPascal olarak, 2019 yılından bu yana hidrolik silindir sistemleri üretiyor, tarım makineleri sektörüne güvenilir çözümler sunuyoruz.');
  footer=footer.replace(/(<p class="text-sm leading-relaxed text-slate-400">)[\s\S]*?(<\/p>)/i,(_,open,close)=>open+escapeText(description.replaceAll('HydroPascal',companyName))+close);
  const allLinks=Array.isArray(settings.footerLinks)?settings.footerLinks:[];
  const renderWidget=(id,group,title)=>{
    const heading=lang==='en'?(settings[group==='pages'?'footerPageTitleEn':'footerQuickTitleEn']||title):(settings[group==='pages'?'footerPageTitle':'footerQuickTitle']||title);
    const renderLinks=(parentId='',depth=0)=>depth>=6?'':childrenOf(normalizeNavigation(allLinks),parentId).filter(item=>item.group===group&&item.active!==false).map(item=>'<li><a href="'+escAttr(safeUrl(navHref(item.href||'#',lang)))+'"'+(item.newTab?' target="_blank" rel="noopener noreferrer"':'')+' class="hover:text-[#fb923c] transition">'+escapeText(lang==='en'?(item.labelEn||item.label||''):(item.label||''))+'</a>'+ (childrenOf(normalizeNavigation(allLinks),item.id).length?'<ul class="cms-footer-children">'+renderLinks(item.id,depth+1)+'</ul>':'')+'</li>').join('');
    const links=renderLinks();
    const block='<div id="footer-widgets-'+id+'" data-section="footer-widgets-'+id+'"><h2 class="text-white font-bold mb-5 text-sm uppercase tracking-wider">'+escapeText(heading)+'</h2><ul class="space-y-3 text-sm">'+links+'</ul></div>';
    const blockStart=footer.indexOf('<div id="footer-widgets-'+id+'"');
    const blockEnd=blockStart<0?-1:footer.indexOf('</div>',blockStart)+6;
    if(blockStart>=0&&blockEnd>=6)footer=footer.slice(0,blockStart)+block+footer.slice(blockEnd);
  };
  renderWidget(19,'pages','Sayfalar');
  renderWidget(20,'quick','Hızlı Bağlantılar');
  const hours=lang==='en'?(settings.footerHoursEn||'Mon – Fri: 09:00 – 18:30'):(settings.footerHours||'Pzt – Cuma: 09:00 – 18:30');
  const copyright=lang==='en'?(settings.footerCopyrightEn||'All Rights Reserved HydroPascal / Copyright © 2026'):(settings.footerCopyright||'Tüm Hakları Saklıdır HydroPascal / Telif Hakkı © 2026');
  footer=replaceDataField(footer,'map-21','hours',hours);
  footer=replaceDataField(footer,'map-21','copyright',copyright.replaceAll('HydroPascal',companyName));
  return html.slice(0,start)+footer+html.slice(end);
}

function renderReferenceCards(items,lang){
  const active=(items||[]).filter(item=>item.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
  const cards=active.map(item=>{
    const name=lang==='en'?(item.nameEn||item.name||''):(item.name||'');
    const card='<article class="min-h-36 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center gap-4 text-center">'+(item.image?'<img src="'+escAttr(safeUrl(item.image))+'" alt="'+escAttr(name)+'" class="max-h-14 max-w-full object-contain">':'')+'<h3 class="font-bold text-white">'+escapeText(name)+'</h3></article>';
    return item.url?'<a href="'+escAttr(safeUrl(item.url))+'" target="_blank" rel="noopener noreferrer" class="block rounded-2xl transition hover:-translate-y-1 hover:shadow-xl">'+card+'</a>':card;
  }).join('');
  return '<section class="max-w-7xl mx-auto px-6 lg:px-8 pt-8 pb-20"><div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">'+cards+'</div></section>';
}

function renderMediaGallery(items,lang,title,description){
  const active=(items||[]).filter(item=>item.active!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
  return '<section id="content-media" class="max-w-7xl mx-auto px-6 lg:px-8 py-16"><h2 class="text-3xl md:text-4xl font-bold text-white mb-12 text-center">'+escapeText(title||'')+'</h2><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">'+active.map(item=>'<figure class="group relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl"><img src="'+escAttr(safeUrl(item.image||''))+'" alt="'+escAttr(lang==='en'?(item.altEn||item.titleEn||item.alt||''):(item.alt||item.title||''))+'" class="w-full h-64 object-cover" width="600" height="400" loading="lazy">'+((item.title||item.titleEn)?'<figcaption class="p-4 text-sm text-slate-200">'+escapeText(lang==='en'?(item.titleEn||item.title):(item.title||''))+'</figcaption>':'')+'</figure>').join('')+'</div>'+(description?'<p class="mt-12 text-lg text-slate-300 leading-relaxed text-center">'+escapeText(description)+'</p>':'')+'</section>';
}

function renderContentBlocks(blocks,edits={}){
  if(!Array.isArray(blocks))return '';
  return blocks.filter(block=>block&&block.active!==false).slice(0,30).map(block=>{
    const fields=edits[block.id]||{};
    const title=fields.title??block.title??'';
    const content=fields.content??block.content??'';
    const image=fields.image??block.image??'';
    const alt=fields.alt??block.alt??title;
    const common=' data-cms-block-id="'+escAttr(block.id)+'" class="max-w-5xl mx-auto px-6 lg:px-8 py-14"';
    const heading=title?'<h2 data-section="'+escAttr(block.id)+'" data-field="title" class="text-3xl md:text-4xl font-bold text-white mb-6">'+escapeText(title)+'</h2>':'';
    const copy=content?'<p data-section="'+escAttr(block.id)+'" data-field="content" class="text-lg text-slate-300 leading-relaxed">'+escapeText(content)+'</p>':'';
    if(block.type==='image')return '<section'+common+'><figure class="overflow-hidden rounded-2xl border border-white/10 bg-white/5">'+(image?'<img data-section="'+escAttr(block.id)+'" data-field="image" src="'+escAttr(safeUrl(image))+'" alt="'+escAttr(alt)+'" class="w-full max-h-[560px] object-cover" loading="lazy">':'')+(heading||copy?'<figcaption class="p-6">'+heading+copy+'</figcaption>':'')+'</figure></section>';
    if(block.type==='quote')return '<section'+common+'><blockquote class="rounded-2xl border-l-4 border-[#fb923c] bg-white/5 p-7 md:p-10">'+heading+'<p data-section="'+escAttr(block.id)+'" data-field="content" class="text-xl leading-relaxed text-slate-200">'+escapeText(content)+'</p></blockquote></section>';
    return '<section'+common+'><div class="rounded-2xl border border-white/10 bg-white/5 p-7 md:p-10">'+heading+copy+'</div></section>';
  }).join('');
}

function readLegacyProductDefinitions(){
  try{
    const source=fs.readFileSync(path.join(siteRoot,'tr/urun-detay.html'),'utf8');
    const declaration='const PRODUCTS = ';
    const start=source.indexOf(declaration);
    const end=source.indexOf('\n};\n\nfunction productDetail()',start);
    if(start<0||end<0)return {};
    const objectSource=source.slice(start+declaration.length,end+2);
    return Function('"use strict";return ('+objectSource+');')();
  }catch{return {};}
}

function productGroupCategory(type,index,slug=''){
  if(type==='hydraulic')return index===1?'Bağlantı elemanları':index===5?'Diğer':'Hidrolik silindir';
  if(type==='cast')return ['Sfero döküm','Gri döküm','Çelik döküm'][index]||'Döküm';
  if(type==='forge')return ['Makine parçaları','Ekipmanlar','Yedek parçalar'][index]||'Dövme';
  const value=String(slug).toLowerCase();
  if(/chain|zincir/.test(value))return 'Zincirler';
  if(/pin|pim|spare|yedek/.test(value))return 'Pimler ve parçalar';
  if(/link|kol|mafsal|knuckle|yoke/.test(value))return 'Bağlantı elemanları';
  return 'Diğer';
}

function resolveCatalogProducts(existing=[],pages={},initialized=false){
  if(initialized)return Array.isArray(existing)?existing:[];
  const saved=Array.isArray(existing)?existing:[];
  const used=new Set();
  const products=[];
  const definitions=Object.entries(readLegacyProductDefinitions());
  let hydraulicIndex=0,oemIndex=0;
  for(const [slug,detail] of definitions){
    const type=detail.category==='oem'?'oem':'hydraulic';
    const groupIndex=type==='oem'?oemIndex++:hydraulicIndex++;
    const current=saved.find(item=>!used.has(item.id)&&(item.slug===slug||(type==='hydraulic'&&item.code===`HPL-${groupIndex+1}`)||(type==='oem'&&item.code===detail.oemCode)));
    if(current)used.add(current.id);
    const pagePath=type==='oem'?'oem-parts.html':'hpl-products.html';
    const cardSection=`content-${(type==='oem'?3:3)+groupIndex}`;
    const nameEn=pages[`en/${pagePath}`]?.[cardSection]?.title||'';
    const defaultCategory=productGroupCategory(type,groupIndex,slug);
    products.push({
      id:current?.id||`legacy-${slug}`,type,slug,
      name:detail.title||slug,nameEn,
      detailTitle:detail.title||'',detailTitleEn:nameEn,
      code:detail.oemCode||`HPL-${groupIndex+1}`,
      category:defaultCategory,categoryEn:type==='oem'?'OEM parts':type==='hydraulic'?'Hydraulic products':'',
      description:detail.description||'',descriptionEn:'',
      image:String(detail.image||'').replace(/^\.\.\//,'/'),pdf:String(detail.pdf||'').replace(/^\.\.\//,'/'),
      oemCode:detail.oemCode||'',compatibleBrands:detail.compatibleBrands||[],dimensionRows:detail.dimensionRows||[],dimensionGroups:detail.dimensionGroups||[],dimensionNote:detail.dimensionNote||'',
      active:true,sortOrder:products.length,
      ...(current||{}),type,slug,
      name:current?.name||detail.title||slug,
      nameEn:current?.nameEn||nameEn,
      detailTitle:current?.detailTitle||detail.title||'',detailTitleEn:current?.detailTitleEn||nameEn,
      category:current?.category||defaultCategory,categoryEn:current?.categoryEn|| (type==='oem'?'OEM parts':type==='hydraulic'?'Hydraulic products':''),
      description:current?.description||detail.description||'',descriptionEn:current?.descriptionEn||'',
      image:current?.image||String(detail.image||'').replace(/^\.\.\//,'/'),pdf:current?.pdf||String(detail.pdf||'').replace(/^\.\.\//,'/'),
      active:current?.active??true,sortOrder:current?.sortOrder??products.length
    });
  }
  for(const [type,route,labels] of [['cast','pascalcast.html',['Sfero döküm','Gri döküm','Çelik döküm']],['forge','pascalforge.html',['Makine parçaları','Ekipmanlar','Yedek parçalar']]]){
    for(let index=0;index<3;index++){
      const section=`content-${index+3}`;
      const local=pages[`tr/${route}`]?.[section]||{};
      const translated=pages[`en/${route}`]?.[section]||{};
      const slug=`${type}-${index+1}`;
      const current=saved.find(item=>!used.has(item.id)&&(item.slug===slug||item.id===`legacy-${slug}`));
      if(current)used.add(current.id);
      products.push({id:current?.id||`legacy-${slug}`,type,slug,name:local.title||labels[index],nameEn:translated.title||'',detailTitle:local.title||labels[index],detailTitleEn:translated.title||'',code:`${type.toUpperCase()}-${index+1}`,category:labels[index],categoryEn:'',description:local.content||'',descriptionEn:translated.content||'',image:String(local.image||'').replace(/^\.\.\//,'/'),pdf:'',active:true,sortOrder:products.length,...(current||{}),type,slug});
    }
  }
  for(const item of saved)if(!used.has(item.id))products.push({...item,type:['hydraulic','oem','cast','forge'].includes(item.type)?item.type:'hydraulic'});
  return products;
}

function decodeLegacyHtml(value){
  return String(value||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}
function readLegacyCatalogues(){
  const locales={tr:{},en:{}};
  for(const lang of ['tr','en']){
    try{
      const html=fs.readFileSync(path.join(siteRoot,lang,'kataloglar.html'),'utf8');
      const cards=/<div id="catalog-(\d+)"[^>]*>([\s\S]*?)(?=<div id="catalog-\d+"|<\/section>)/g;
      let match;
      while((match=cards.exec(html))){
        const title=decodeLegacyHtml((match[2].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)||[])[1]);
        const file=(match[2].match(/href="([^"]+\.pdf(?:\?[^\"]*)?)"/i)||[])[1]||'';
        if(title&&file)locales[lang][Number(match[1])]={title,file};
      }
    }catch{}
  }
  const ids=[...new Set([...Object.keys(locales.tr),...Object.keys(locales.en)])].map(Number).sort((a,b)=>a-b);
  return ids.map((number,index)=>{
    const tr=locales.tr[number]||locales.en[number]||{};
    const en=locales.en[number]||locales.tr[number]||{};
    const isOem=number>6;
    return {id:'legacy-catalog-'+number,title:tr.title||'',titleEn:en.title||'',category:isOem?'HPL OEM':'HPL Ürünleri',categoryEn:isOem?'HPL OEM':'HPL Products',description:'',descriptionEn:'',file:tr.file||en.file||'',fileEn:en.file||tr.file||'',active:true,sortOrder:index};
  });
}
function resolveCatalogues(existing){return Array.isArray(existing)?existing:readLegacyCatalogues();}

export function scanPages({includeDrafts=true}={}){
  const data=readContent(); const revision=contentRevision(data); const pages={...(data.pages||{})};
  const footerSettings={
    footerDescription:'HPL HydroPascal olarak, 2019 yılından bu yana hidrolik silindir sistemleri üretiyor, tarım makineleri sektörüne güvenilir çözümler sunuyoruz.',
    footerDescriptionEn:'Since 2019, HPL HydroPascal has manufactured hydraulic cylinder systems and supplied reliable solutions for agricultural machinery.',
    footerPageTitle:'Sayfalar',footerPageTitleEn:'Pages',footerQuickTitle:'Hızlı Bağlantılar',footerQuickTitleEn:'Quick Links',
    footerHours:'Pzt – Cuma: 09:00 – 18:30',footerHoursEn:'Mon – Fri: 09:00 – 18:30',
    footerCopyright:'Tüm Hakları Saklıdır HydroPascal / Telif Hakkı © 2026',footerCopyrightEn:'All Rights Reserved HydroPascal / Copyright © 2026',
    footerLinks:[
      {id:'home',group:'pages',label:'Ana Sayfa',labelEn:'Home',href:'index.html'},
      {id:'about',group:'pages',label:'Hakkımızda',labelEn:'About Us',href:'about-us.html'},
      {id:'products',group:'pages',label:'HPL Ürünleri',labelEn:'HPL Products',href:'hpl-products.html'},
      {id:'oem',group:'pages',label:'HPL OEM',labelEn:'HPL OEM',href:'oem-parts.html'},
      {id:'calculator',group:'pages',label:'Silindir Yazılımı',labelEn:'Cylinder Software',href:'calculation-program.html'},
      {id:'services',group:'pages',label:'Hizmetler',labelEn:'Services',href:'hizmetler.html'},
      {id:'blog',group:'pages',label:'Blog',labelEn:'Blog',href:'blog/index.html'},
      {id:'catalogs',group:'pages',label:'Kataloglar',labelEn:'Catalogs',href:'kataloglar.html'},
      {id:'quote',group:'pages',label:'Teklif Al',labelEn:'Get a Quote',href:'teklif-al.html'},
      {id:'references',group:'pages',label:'Referanslar',labelEn:'References',href:'referanslar.html'},
      {id:'forge',group:'pages',label:'PascalForge',labelEn:'PascalForge',href:'pascalforge.html'},
      {id:'cast',group:'pages',label:'PascalCast',labelEn:'PascalCast',href:'pascalcast.html'},
      {id:'media',group:'pages',label:'Medya',labelEn:'Media',href:'media.html'},
      {id:'contact',group:'pages',label:'İletişim',labelEn:'Contact',href:'contact.html'},
      {id:'privacy',group:'quick',label:'Gizlilik Politikası',labelEn:'Privacy Policy',href:'privacy-policy.html'},
      {id:'terms',group:'quick',label:'Kullanım Şartları',labelEn:'Terms of Service',href:'terms-of-service.html'},
      {id:'disclaimer',group:'quick',label:'Sorumluluk Reddi',labelEn:'Disclaimer',href:'disclaimer.html'},
      {id:'faq',group:'quick',label:'SSS',labelEn:'FAQ',href:'faq.html'}
    ]
  };
  data.settings={...footerSettings,...(data.settings||{})};
  for(const lang of ['tr','en']){
    const walk=(dir,sub='')=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name); const rel=path.posix.join(lang,sub,item.name); if(item.isDirectory()) walk(full,path.posix.join(sub,item.name)); else if(item.name.endsWith('.html')){const html=fs.readFileSync(full,'utf8'); const fields={}; const re=/<([a-z][\w:-]*)\b([^>]*\bdata-section=["'][^"']+["'][^>]*\bdata-field=["'][^"']+["'][^>]*)>/gi; let m; while((m=re.exec(html))){const tag=m[1].toLowerCase(),attrs=m[2];const sec=(attrs.match(/\bdata-section=["']([^"']+)["']/i)||[])[1],field=(attrs.match(/\bdata-field=["']([^"']+)["']/i)||[])[1];if(!fields[sec])fields[sec]={};let value='';if(tag==='img')value=(attrs.match(/\bsrc=["']([^"']*)["']/i)||[])[1]||'';else if(tag==='a'&&field==='href')value=(attrs.match(/\bhref=["']([^"']*)["']/i)||[])[1]||'';else{const end=html.indexOf(`</${tag}`,re.lastIndex);value=(end<0?'':html.slice(re.lastIndex,end)).replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();}if(fields[sec][field]===undefined)fields[sec][field]=value;const linkField=(attrs.match(/\bdata-field-link=["']([^"']+)["']/i)||[])[1];if(tag==='a'&&linkField&&fields[sec][linkField]===undefined)fields[sec][linkField]=(attrs.match(/\bhref=["']([^"']*)["']/i)||[])[1]||'';} pages[rel]=pages[rel]||fields; }} };
    walk(path.join(siteRoot,lang));
  }
  if(includeDrafts&&data.pageDrafts&&typeof data.pageDrafts==='object')for(const [route,draft] of Object.entries(data.pageDrafts)){
    if(!draft||typeof draft!=='object'||Array.isArray(draft))continue;
    const merged={...(pages[route]||{})};
    for(const [section,fields] of Object.entries(draft))if(fields&&typeof fields==='object'&&!Array.isArray(fields))merged[section]={...(merged[section]||{}),...fields};
    pages[route]=merged;
  }
  const products=resolveCatalogProducts(data.products,pages,Boolean(data.catalogInitialized));
  const posts=data.posts||[];
  const contentDrafts=data.contentDrafts&&typeof data.contentDrafts==='object'?data.contentDrafts:{};
  const overlay=(items,drafts)=>includeDrafts?overlayRecords(items,drafts):items;
  const managedProducts=overlay(products,contentDrafts.products);
  const managedPosts=overlay(posts,contentDrafts.posts);
  const catalogues=overlay(resolveCatalogues(data.catalogues),contentDrafts.catalogues);
  const derivedCategories=[];
  for(const product of managedProducts)if(product.category)derivedCategories.push({scope:'product',name:product.category,nameEn:product.categoryEn||''});
  for(const post of managedPosts)if(post.category)derivedCategories.push({scope:'blog',name:post.category,nameEn:post.categoryEn||''});
  for(const catalogue of catalogues)if(catalogue.category)derivedCategories.push({scope:'catalog',name:catalogue.category,nameEn:catalogue.categoryEn||''});
  const categoryId=(scope,name)=>'legacy-'+scope+'-'+normalizedLabel(name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
  const storedCategories=Array.isArray(data.categories)?data.categories:[];
  const knownCategories=new Set(storedCategories.map(item=>item.scope+':'+normalizedLabel(item.name)));
  const categories=[...storedCategories,...[...new Map(derivedCategories.map(item=>[item.scope+':'+normalizedLabel(item.name),{id:categoryId(item.scope,item.name),...item}])).values()].filter(item=>!knownCategories.has(item.scope+':'+normalizedLabel(item.name)))];
  const defaultReferenceNames=['Massey Ferguson','Ford','New Holland','John Deere','Case','Renault','Zetor','Landini','Fendt','Deutz','Same'];
  const references=Array.isArray(data.references)?data.references:defaultReferenceNames.map((name,index)=>({id:'legacy-reference-'+(index+1),name,nameEn:name,image:'',url:'',active:true,sortOrder:index}));
  const defaultMedia=[
    ['Fabrika','Factory','HydroPascal Fabrikası','HydroPascal Factory'],
    ['PascalForge üretimi','PascalForge Production','PascalForge Üretimi','PascalForge Production'],
    ['PascalCast üretimi','PascalCast Production','PascalCast Üretimi','PascalCast Production'],
    ['Üretim hattı','Production line','HydroPascal üretim hattı','HydroPascal production line'],
    ['CNC hassas işleme','CNC machining','CNC hassas işleme','CNC precision machining'],
    ['Dövme makine parçaları','Forged machinery parts','PascalForge dövme makine parçaları','PascalForge forged machinery parts']
  ];
  const mediaItems=Array.isArray(data.mediaItems)?data.mediaItems:defaultMedia.map(([title,titleEn,alt,altEn],index)=>({id:'legacy-media-'+(index+1),title,titleEn,alt,altEn,image:pages['tr/media.html']?.['content-media']?.['image-'+(index+1)]||'',active:true,sortOrder:index}));
  const defaults={companyName:'HydroPascal',logo:'/assets/images/logo/hpl-logo-yatay.svg',logoDark:'/assets/images/logo/hpl-logo-yatay-dark.svg',email:'info@hydropascal.com.tr',phone:'+90 555 384 82 29',address:'Fevziçakmak, 10757 Sk No:3/B, 42210 Karatay/Konya',heroTitle:'Hidrolik Güç, Mühendislik Hassasiyeti',navigation:[
{label:'Ana Sayfa',labelEn:'Main Page',match:'index.html',href:'index.html'},
{label:'Hakkımızda',labelEn:'About Us',match:'about-us.html',href:'about-us.html'},
{label:'HPL Ürünleri',labelEn:'HPL Products',match:'hpl-products.html',href:'hpl-products.html'},
{label:'HPL OEM',labelEn:'HPL OEM',match:'oem-parts.html',href:'oem-parts.html'},
{label:'PascalForge',labelEn:'PascalForge',match:'pascalforge.html',href:'pascalforge.html'},
{label:'PascalCast',labelEn:'PascalCast',match:'pascalcast.html',href:'pascalcast.html'},
{label:'Silindir Yazılımı',labelEn:'Cylinder Software',match:'calculation-program.html',href:'calculation-program.html'},
{label:'Hizmetler',labelEn:'Services',match:'hizmetler.html',href:'hizmetler.html'},
{label:'Blog',labelEn:'Blog',match:'blog/index.html',href:'blog/index.html'},
{label:'Kataloglar',labelEn:'Catalogs',match:'kataloglar.html',href:'kataloglar.html'},
{label:'Medya',labelEn:'Media',match:'media.html',href:'media.html'},
{label:'Referanslar',labelEn:'References',match:'referanslar.html',href:'referanslar.html'},
{label:'SSS',labelEn:'FAQ',match:'faq.html',href:'faq.html'},
{label:'İletişim',labelEn:'Contact',match:'contact.html',href:'contact.html'},
{label:'Teklif Al',labelEn:'Get a Quote',match:'teklif-al.html',href:'teklif-al.html'}],navigationGroups:{products:'Ürünler',productsEn:'Products',resources:'Kaynaklar',resourcesEn:'Resources'},smtpHost:process.env.SMTP_HOST||'',smtpPort:Number(process.env.SMTP_PORT)||587,smtpUser:process.env.SMTP_USER||'',smtpPass:process.env.SMTP_PASSWORD||'',smtpFrom:process.env.SMTP_FROM||'',...data.settings};
  defaults.smtpPass=process.env.SMTP_PASSWORD||data.settings?.smtpPass||'';
  defaults.navigation=normalizeNavigation((Array.isArray(defaults.navigation)?defaults.navigation:[]).map(item=>({...item,parent:navigationParentFromItem(item),variant:item.variant??navigationVariantFromItem(item)})),defaults.navigationGroups);
  defaults.footerLinks=normalizeNavigation(defaults.footerLinks||[]);
  const navigationDraft=data.navigationDraft&&typeof data.navigationDraft==='object'&&!Array.isArray(data.navigationDraft)?data.navigationDraft:null;
  if(includeDrafts&&navigationDraft){
    if(Array.isArray(navigationDraft.navigation))defaults.navigation=normalizeNavigation(navigationDraft.navigation,defaults.navigationGroups);
    if(Array.isArray(navigationDraft.footerLinks))defaults.footerLinks=normalizeNavigation(navigationDraft.footerLinks);
  }
  const templateDefaults={
    quote:{subject:'Teklif talebiniz alındı | HydroPascal',body:'Merhaba {{name}},\n\nTeklif talebiniz için teşekkür ederiz. Ekibimiz en kısa sürede sizinle iletişime geçecektir.\n\nHydroPascal',subjectEn:'We received your quote request | HydroPascal',bodyEn:'Hello {{name}},\n\nThank you for your quote request. Our team will contact you as soon as possible.\n\nHydroPascal'},
    sample:{subject:'Numune talebiniz alındı | HydroPascal',body:'Merhaba {{name}},\n\nNumune talebinizi aldık. Ekibimiz en kısa sürede sizinle iletişime geçecektir.\n\nHydroPascal',subjectEn:'We received your sample request | HydroPascal',bodyEn:'Hello {{name}},\n\nWe have received your sample request. Our team will contact you as soon as possible.\n\nHydroPascal'},
    contact:{subject:'Mesajınız bize ulaştı | HydroPascal',body:'Merhaba {{name}},\n\nMesajınız bize ulaştı. En kısa sürede yanıt vereceğiz.\n\nHydroPascal',subjectEn:'We received your message | HydroPascal',bodyEn:'Hello {{name}},\n\nWe have received your message and will reply as soon as possible.\n\nHydroPascal'}
  };
  const templates=Object.fromEntries(Object.entries(templateDefaults).map(([key,value])=>[key,{...value,...(data.templates?.[key]||{})}]));
  return {...data,_revision:revision,settings:defaults,hasNavigationDraft:Boolean(navigationDraft),pages,publishedPages:data.pages||{},pageDrafts:data.pageDrafts||{},contentDrafts,products:managedProducts,catalogInitialized:true,posts:managedPosts,categories,references,mediaItems,catalogues,leads:data.leads||[],templates,tasks:Array.isArray(data.tasks)?data.tasks:[]};
}
function escJs(v){return String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/[\r\n]/g,' ').replace(/</g,'\\x3c').replace(/>/g,'\\x3e').replace(/&/g,'\\x26');}
export function allHtmlPages(){const result=[];for(const lang of ['tr','en']){const walk=(dir,sub='')=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name);const rel=path.posix.join(lang,sub,item.name);if(item.isDirectory())walk(full,path.posix.join(sub,item.name));else if(item.name.endsWith('.html'))result.push(rel);}};walk(path.join(siteRoot,lang));}return result.sort();}
// Minimal published records for request routing (redirects) without rendering a page.
export function publicRecords(){const raw=readContent();return {settings:raw.settings||{},posts:raw.posts||[],products:resolveCatalogProducts(raw.products,raw.pages||{},Boolean(raw.catalogInitialized))};}
