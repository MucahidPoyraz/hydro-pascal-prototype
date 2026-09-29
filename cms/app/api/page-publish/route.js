import {allHtmlPages,contentRevision,ContentConflictError,updateContent} from '../../lib/content.js';
import {isAdminRequest} from '../../lib/auth.js';
import {audit} from '../../lib/audit.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}});}

export async function POST(request){
  if(!isAdminRequest(request))return json({error:'Oturum gerekli'},401);
  try{
    const body=await request.json();
    if(typeof body?.page!=='string'||!allHtmlPages().includes(body.page))return json({error:'Yayımlanacak sayfa geçersiz.'},400);
    const expectedRevision=request.headers.get('if-match')?.replace(/^"|"$/g,'');
    if(!/^[a-f0-9]{64}$/.test(expectedRevision||''))return json({error:'Kayıt sürümü eksik. Sayfayı yenileyip yeniden deneyin.'},428);
    let published=false;
    const saved=await updateContent(current=>{
      const draft=current.pageDrafts?.[body.page];
      if(!draft||typeof draft!=='object')return current;
      const page={...(current.pages?.[body.page]||{})};
      for(const [section,fields] of Object.entries(draft))page[section]={...(page[section]||{}),...(fields||{})};
      const pageDrafts={...(current.pageDrafts||{})};delete pageDrafts[body.page];published=true;
      return {...current,pages:{...(current.pages||{}),[body.page]:page},pageDrafts};
    },{expectedRevision});
    if(!published)return json({error:'Bu sayfada kaydedilmiş taslak bulunamadı.'},409);
    audit(request,'publish','page',[body.page]);
    return json({ok:true,page:body.page,publishedAt:new Date().toISOString(),revision:contentRevision(saved)});
  }catch(error){if(error instanceof ContentConflictError)return json({error:'Başka bir yönetici bu içeriği değiştirdi. Yerel değişikliklerinizi koruyup yenileyerek karşılaştırın.'},409);return json({error:'Sayfa yayımlanamadı. Yeniden deneyin.'},400);}
}
