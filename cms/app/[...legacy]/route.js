import {getLegacyPage,publicRecords} from '../lib/content.js';
import {isAdminRequest} from '../lib/auth.js';
import {validatePageStructure} from '../lib/page-structure.js';
import {productRedirect,resolveRedirect} from '../lib/seo.js';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const htmlResponse=(html,status=200)=>new Response(html,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
const withPreviewScript=html=>html.replace(/<\/body>/i,'<script src="/api/admin-preview"></script></body>');
const redirectTo=(request,location,status)=>new Response(null,{status,headers:{Location:new URL(location,request.url).href,'Cache-Control':'no-store'}});
// A missing page answers with the themed 404 page and a real 404 status (never a blind redirect home).
function notFound(route){
  const lang=String(route).startsWith('en/')?'en':'tr';
  const html=getLegacyPage(`${lang}/404.html`,'',false,{notFound:true});
  return html?htmlResponse(html,404):new Response('Not found',{status:404});
}
export async function GET(request,{params}){
  const {legacy=[]}=await params;
  if(legacy.length===1&&legacy[0]==='index.html')return Response.redirect(new URL('/tr/index.html',request.url),308);
  if(legacy[0]==='admin')return new Response('Not found',{status:404});
  const route=legacy.join('/'),url=new URL(request.url),mode=url.searchParams.get('cmsPreview');
  if(/^(tr|en)(\/blog)?$/.test(route))return redirectTo(request,`/${route}/index.html`,301);
  // cmsPreview=1: editor iframe (drafts + click-to-edit script). cmsPreview=view: read-only draft preview tab.
  const isAdmin=(mode==='1'||mode==='view')&&isAdminRequest(request);const isEditor=isAdmin&&mode==='1';
  if(!isAdmin){
    const records=publicRecords();
    const rule=resolveRedirect(url.pathname,records);
    if(rule)return redirectTo(request,rule.location,rule.status);
    if(/^(tr|en)\/urun-detay\.html$/.test(route)){const moved=productRedirect(url.searchParams.get('id')||'',records.products,route.slice(0,2));if(moved)return redirectTo(request,moved.location,moved.status);}
  }
  let html=getLegacyPage(route,url.searchParams.get('id')||'',isAdmin,{preview:isEditor});
  if(!html)return notFound(route);
  if(isEditor)html=withPreviewScript(html);
  return new Response(html,{status:/(^|\/)404\.html$/.test(route)?404:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...(isAdmin?{'X-Robots-Tag':'noindex, nofollow'}:{})}});
}

// Admin-only preview of the unsaved editor state: the page editor posts the
// current page content into the preview iframe, so structural changes are
// rendered by the same server renderer the public site uses. Nothing is saved.
// The admin cookie is SameSite=strict, so other sites cannot trigger this.
export async function POST(request,{params}){
  const {legacy=[]}=await params;
  if(!isAdminRequest(request)||legacy[0]==='admin')return new Response('Not found',{status:404});
  if(Number(request.headers.get('content-length')||0)>3*1024*1024)return htmlResponse('Önizleme verisi çok büyük.',413);
  const route=legacy.join('/');
  let content;
  try{const form=await request.formData();content=JSON.parse(String(form.get('cmsState')||''));}
  catch{return htmlResponse('Önizleme verisi okunamadı.',400);}
  if(!content||typeof content!=='object'||Array.isArray(content))return htmlResponse('Önizleme verisi geçersiz.',400);
  const invalid=validatePageStructure(route,content);
  if(invalid)return htmlResponse(invalid,400);
  const url=new URL(request.url);
  const html=getLegacyPage(route,url.searchParams.get('id')||'',true,{edits:content,preview:true});
  if(!html)return new Response('Not found',{status:404});
  return htmlResponse(withPreviewScript(html));
}
