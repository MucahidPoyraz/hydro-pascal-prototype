import {isAdminRequest} from '../../lib/auth.js';
import {scanPages, updateContent, contentRevision, ContentConflictError} from '../../lib/content.js';
import {normalizeCategoryName as key,categoryRenamePatch} from '../../lib/category-utils.js';
import {audit} from '../../lib/audit.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request){
  if(!isAdminRequest(request))return json({error:'Oturum gerekli'},401);
  const expectedRevision=request.headers.get('if-match')?.replace(/^"|"$/g,'');
  if(!/^[a-f0-9]{64}$/.test(expectedRevision||''))return json({error:'Kayıt sürümü eksik.'},428);
  try{
    const input=await request.json();
    if(input?.id!==undefined&&(typeof input.id!=='string'||!input.id||input.id.length>120))return json({error:'Kategori kimliği geçersiz.'},400);
    if(!input||!['product','blog','catalog'].includes(input.scope)||typeof input.name!=='string'||!input.name.trim()||input.name.length>100||typeof input.nameEn!=='string'||input.nameEn.length>100)return json({error:'Kategori alanları geçersiz.'},400);
    const category={id:input.id||crypto.randomUUID(),scope:input.scope,name:input.name.trim(),nameEn:input.nameEn.trim()};
    const saved=await updateContent(current=>{
      const managed=scanPages(), categories=managed.categories||[];
      const old=categories.find(item=>item.id===category.id);
      if(input.id&&(!old||old.scope!==category.scope))throw new Error('Kategori bulunamadı.');
      // Same rule as the full CMS save: the Turkish name identifies a category within its scope.
      // English names may repeat (legacy product groups share e.g. "OEM parts").
      if(categories.some(item=>item.id!==category.id&&item.scope===category.scope&&key(item.name)===key(category.name)))throw new Error('Bu isimde bir kategori zaten var.');
      if(!old&&categories.length>=300)throw new Error('Kategori sınırına ulaşıldı.');
      const contentDrafts={...current.contentDrafts};
      if(old){
        const type={product:'products',blog:'posts',catalog:'catalogues'}[old.scope];
        contentDrafts[type]={...contentDrafts[type]};
        for(const item of managed[type]||[]){
          if(item.pendingDelete)continue;
          const patch=categoryRenamePatch(item,old,category);
          if(Object.keys(patch).length){const {hasDraft,hasPublishedVersion,pendingDelete,...record}=item;contentDrafts[type][item.id]={...record,...patch};}
        }
      }
      return {...current,contentDrafts,categories:old?categories.map(item=>item.id===old.id?category:item):[category,...categories]};
    },{expectedRevision});
    audit(request,input.id?'update':'create','category',[category.id],{scope:category.scope});
    return json({category,categories:scanPages().categories,revision:contentRevision(saved)});
  }catch(error){return json({error:error instanceof ContentConflictError?'İçerik başka bir oturumda değişti. Yeniden yükleyip karşılaştırın.':error.message||'Kategori kaydedilemedi.'},error instanceof ContentConflictError?409:400);}
}
