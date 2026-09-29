import {allHtmlPages,contentRevision,ContentConflictError,scanPages,updateContent} from '../../lib/content.js';
import {isAdminRequest} from '../../lib/auth.js';
import {validatePageStructure} from '../../lib/page-structure.js';
import {validatePageSeo} from '../../lib/seo-validation.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}});}
function validPageContent(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>300)return false;
  if(JSON.stringify(value).length>1_500_000)return false;
  for(const [section,fields] of Object.entries(value)){
    if(!section||section.length>120||!fields||typeof fields!=='object'||Array.isArray(fields))return false;
    if(fields.slides!==undefined&&(!Array.isArray(fields.slides)||fields.slides.length<1||fields.slides.length>12||fields.slides.some(slide=>!slide||typeof slide.src!=='string'||slide.src.length>2048||typeof slide.alt!=='string'||slide.alt.length>240)))return false;
    if(fields.items!==undefined&&section==='__blocks'&&(!Array.isArray(fields.items)||fields.items.length>30||fields.items.some(item=>!item||!['text','image','quote'].includes(item.type)||typeof item.id!=='string'||item.id.length>120||String(item.title||'').length>240||String(item.content||'').length>10000||String(item.image||'').length>2048)))return false;
    if(fields.__invalid===true)return false;
  }
  const visual=value.__visual;
  if(visual!==undefined&&(!visual||typeof visual!=='object'||Array.isArray(visual)||Object.keys(visual).length>250||Object.entries(visual).some(([key,patch])=>!key||key.length>1200||!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(name=>!['text','src','alt','href','hrefSelector','icon'].includes(name))||Object.entries(patch).some(([name,item])=>String(item??'').length>(name==='text'?10000:2048)))))return false;
  return true;
}

export async function POST(request){
  if(!isAdminRequest(request))return json({error:'Oturum gerekli'},401);
  try{
    if(Number(request.headers.get('content-length')||0)>2*1024*1024)return json({error:'Sayfa taslağı 2 MB sınırını aşıyor.'},413);
    const body=await request.json();
    if(typeof body?.page!=='string'||!allHtmlPages().includes(body.page)||!validPageContent(body.content))return json({error:'Sayfa veya taslak içeriği geçersiz.'},400);
    const invalidStructure=validatePageStructure(body.page,body.content)||validatePageSeo(body.content.__seo);
    if(invalidStructure)return json({error:invalidStructure},400);
    const expectedRevision=request.headers.get('if-match')?.replace(/^"|"$/g,'');
    if(!/^[a-f0-9]{64}$/.test(expectedRevision||''))return json({error:'Kayıt sürümü eksik. Sayfayı yenileyip yeniden deneyin.'},428);
    let hasChanges=false,savedDraft=null;
    const saved=await updateContent(current=>{
      const base=scanPages({includeDrafts:false}).pages?.[body.page]||{};
      const diff={};
      for(const section of new Set([...Object.keys(base),...Object.keys(body.content)])){
        const before=base[section]||{},after=body.content[section]||{};const fields={};
        for(const field of new Set([...Object.keys(before),...Object.keys(after)]))if(JSON.stringify(before[field])!==JSON.stringify(after[field])&&field in after)fields[field]=after[field];
        if(Object.keys(fields).length)diff[section]=fields;
      }
      const pageDrafts={...(current.pageDrafts||{})};
      if(Object.keys(diff).length){pageDrafts[body.page]=diff;savedDraft=diff;hasChanges=true;}else delete pageDrafts[body.page];
      return {...current,pageDrafts};
    },{expectedRevision});
    return json({ok:true,page:body.page,draft:savedDraft,hasChanges,savedAt:new Date().toISOString(),revision:contentRevision(saved)});
  }catch(error){if(error instanceof ContentConflictError)return json({error:'Başka bir yönetici bu içeriği değiştirdi. Yerel değişikliklerinizi koruyup yenileyerek karşılaştırın.'},409);return json({error:'Taslak kaydedilemedi. Sayfayı yenileyip yeniden deneyin.'},400);}
}
