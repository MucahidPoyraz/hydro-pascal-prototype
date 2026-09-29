import {allHtmlPages} from '../../lib/content.js';
import {isAdminRequest} from '../../lib/auth.js';
import {publicStructure,structureEditable,structureForRoute} from '../../lib/page-structure.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}});}

// Static component tree of one page (sections, collections, items, fields).
// The admin combines it with the page's `__layout` via page-schema.js.
export async function GET(request){
  if(!isAdminRequest(request))return json({error:'Oturum gerekli'},401);
  const page=new URL(request.url).searchParams.get('page')||'';
  if(!allHtmlPages().includes(page))return json({error:'Sayfa bulunamadı.'},404);
  if(!structureEditable(page))return json({page,editable:false,reason:'Blog yazılarının yapısı Blog Yazıları bölümünden yönetilir.',structure:{sections:[]}});
  const structure=structureForRoute(page);
  if(!structure)return json({page,editable:false,reason:'Bu sayfada düzenlenebilir bir ana içerik alanı bulunamadı.',structure:{sections:[]}});
  return json({page,editable:true,structure:publicStructure(structure)});
}
