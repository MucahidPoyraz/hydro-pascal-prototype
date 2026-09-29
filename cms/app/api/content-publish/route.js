import {contentRevision,scanPages,ContentConflictError,updateContent} from '../../lib/content.js';
import {isAdminRequest} from '../../lib/auth.js';
import {audit} from '../../lib/audit.js';
import {normalizeNavigation,validateTree} from '../../lib/navigation-tree.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}});}
function clean(record){const result={...record};for(const key of ['hasDraft','hasPublishedVersion','pendingDelete'])delete result[key];return result;}
function safePdf(value){const url=String(value||'').trim();return !url||(!/^(?:mailto|tel|javascript|data|vbscript):/i.test(url)&&!/[\u0000-\u001f\u007f\\]/.test(url)&&/\.pdf(?:[?#].*)?$/i.test(url));}
class PublishError extends Error {}
const visibilityKey={products:'active',posts:'published',catalogues:'active'};

// Throws when a record cannot be shown publicly.
function assertPublishable(type,record,forceVisible){
  if(type==='products'){
    if(!String(record.name||'').trim()||!String(record.slug||'').trim()||!['hydraulic','oem','cast','forge'].includes(record.type||'hydraulic'))throw new PublishError('Yayımlanacak ürünün adı, sayfa adresi veya türü geçersiz.');
  }else if(type==='posts'){
    if(!String(record.title||'').trim()||!String(record.slug||'').trim()||!['tr','en'].includes(record.lang||'tr'))throw new PublishError('Yayımlanacak yazının başlığı, sayfa adresi veya dili geçersiz.');
  }else if(!String(record.title||'').trim()||!safePdf(record.file)||((forceVisible||record.active!==false)&&!record.file))throw new PublishError('Yayımlanacak katalog için geçerli bir ad ve PDF dosyası gerekli.');
}

async function publishNavigation(request,body,expectedRevision){
  if(!['publish','discard'].includes(body.mode))return json({error:'Menü işlemi geçersiz.'},400);
  let found=false;
  const saved=await updateContent(current=>{
    const draft=current.navigationDraft;
    if(!draft||typeof draft!=='object')return current;
    found=true;
    const {navigationDraft:_published,...rest}=current;
    if(body.mode==='discard')return rest;
    const navigation=normalizeNavigation(Array.isArray(draft.navigation)?draft.navigation:[]);
    const footerLinks=normalizeNavigation(Array.isArray(draft.footerLinks)?draft.footerLinks:[]);
    const invalid=validateTree(navigation)||validateTree(footerLinks);
    if(invalid)throw new PublishError(invalid);
    return {...rest,settings:{...(current.settings||{}),navigation,footerLinks}};
  },{expectedRevision});
  if(!found)return json({error:'Yayımlanmayı bekleyen menü değişikliği yok.'},409);
  audit(request,body.mode==='discard'?'discard':'publish','navigation');
  return json({ok:true,type:'navigation',mode:body.mode,revision:contentRevision(saved)});
}

export async function POST(request){
  if(!isAdminRequest(request))return json({error:'Oturum gerekli'},401);
  try{
    const body=await request.json();
    const expectedRevision=request.headers.get('if-match')?.replace(/^"|"$/g,'');
    if(!/^[a-f0-9]{64}$/.test(expectedRevision||''))return json({error:'Kayıt sürümü eksik. Sayfayı yenileyip yeniden deneyin.'},428);
    if(body?.type==='navigation')return await publishNavigation(request,body,expectedRevision);
    const ids=Array.isArray(body?.ids)?body.ids:[body?.id];
    // publish/apply: move drafts live. visibility: bulk show/hide. delete: remove records and their drafts.
    if(!['products','posts','catalogues'].includes(body?.type)||!Array.isArray(ids)||ids.length<1||ids.length>300||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length||!['publish','apply','visibility','delete'].includes(body?.mode)||(body.mode==='visibility'&&typeof body.visible!=='boolean'))return json({error:'Yayımlanacak içerik bilgisi geçersiz.'},400);
    const collection=body.type,key=visibilityKey[collection];
    let foundCount=0;const skipped=[];
    const saved=await updateContent(current=>{
      const drafts={...(current.contentDrafts||{})};
      const typeDrafts={...(drafts[collection]||{})};
      const needsDraft=body.mode==='publish'||body.mode==='apply';
      if(needsDraft&&ids.some(id=>!typeDrafts[id]||typeof typeDrafts[id]!=='object'||Array.isArray(typeDrafts[id])))return current;
      const base=scanPages({includeDrafts:false});
      const rows=[...(base[collection]||[])];
      for(const id of ids){
        const draft=typeDrafts[id],index=rows.findIndex(item=>String(item.id)===id),live=index>=0?rows[index]:null;
        if(!draft&&!live){skipped.push(id);continue;}
        if(body.mode==='delete'){
          // Imported legacy posts keep their static source; they can only be taken offline.
          if(collection==='posts'&&(live||draft)?.legacy===true){if(live)rows[index]={...live,published:false};if(draft&&!draft._deleted)typeDrafts[id]={...draft,published:false};else delete typeDrafts[id];skipped.push(id);foundCount++;continue;}
          if(index>=0)rows.splice(index,1);
          delete typeDrafts[id];foundCount++;continue;
        }
        if(body.mode==='visibility'){
          if(draft?._deleted===true){skipped.push(id);continue;}
          if(body.visible){
            // Showing only flips the live record; pending draft edits stay unpublished (use Yayınla for those).
            if(!live){skipped.push(id);continue;}
            assertPublishable(collection,live,true);
            rows[index]={...live,[key]:true};
            if(draft)typeDrafts[id]={...draft,[key]:true};
          }else{
            if(live)rows[index]={...live,[key]:false};
            if(draft)typeDrafts[id]={...draft,[key]:false};
          }
          foundCount++;continue;
        }
        if(draft._deleted===true){if(index>=0)rows.splice(index,1);}
        else{
          const record=clean(draft);
          assertPublishable(collection,record,body.mode==='publish');
          if(body.mode==='publish')record[key]=true;
          if(collection!=='catalogues'){
            // A renamed address keeps working: the old slug answers with a 301 to the new one (lib/seo.js).
            const history=new Set([...(Array.isArray(live?.previousSlugs)?live.previousSlugs:[]),...(Array.isArray(record.previousSlugs)?record.previousSlugs:[])]);
            if(live?.slug&&record.slug&&live.slug!==record.slug)history.add(live.slug);
            history.delete(record.slug);
            if(history.size)record.previousSlugs=[...history].slice(-20);else delete record.previousSlugs;
            record.updatedAt=new Date().toISOString();
          }
          if(index>=0)rows[index]=record;else rows.push(record);
        }
        delete typeDrafts[id];
        foundCount++;
      }
      drafts[collection]=typeDrafts;
      return {...current,[collection]:rows,catalogInitialized:collection==='products'?true:current.catalogInitialized,contentDrafts:drafts};
    },{expectedRevision});
    if((body.mode==='publish'||body.mode==='apply')&&foundCount!==ids.length)return json({error:'Bu kayıtta yayımlanmayı bekleyen bir taslak bulunamadı. Sayfayı yenileyin.'},409);
    if(!foundCount)return json({error:'Seçilen kayıtlar bulunamadı. Sayfayı yenileyin.'},409);
    audit(request,body.mode==='visibility'?(body.visible?'show':'hide'):body.mode,collection,ids,{skipped:skipped.length});
    const snapshot=scanPages({includeDrafts:false});
    return json({ok:true,type:collection,ids,changed:foundCount,skipped,revision:contentRevision(saved),products:snapshot.products,posts:snapshot.posts,catalogues:snapshot.catalogues});
  }catch(error){
    if(error instanceof ContentConflictError)return json({error:'Başka bir yönetici bu içeriği değiştirdi. Değişikliklerinizi koruyup yenileyerek karşılaştırın.'},409);
    return json({error:error instanceof PublishError?error.message:'İçerik yayımlanamadı. Yeniden deneyin.'},400);
  }
}
