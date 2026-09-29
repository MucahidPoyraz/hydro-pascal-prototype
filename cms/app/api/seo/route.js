import {allHtmlPages,readContent} from '../../lib/content.js';
import {isAdminRequest} from '../../lib/auth.js';
import {siteOrigin,staticHeadForRoute,effectiveSettings} from '../../lib/seo.js';
import {resolveAnalytics} from '../../lib/analytics.js';
import {resolveSeoSettings} from '../../lib/seo-model.js';
import {auditSite} from '../../lib/seo-audit.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}});}

// Admin-only read endpoints for the SEO screens:
//   ?action=status          deployment facts the admin cannot change (site URL, env locks, what really loads)
//   ?action=page&route=...  the static page's own head values (defaults under the page SEO override)
//   ?action=audit           checks run on the real public HTML of every page
export async function GET(request){
  if(!isAdminRequest(request))return json({error:'Oturum gerekli'},401);
  const url=new URL(request.url),action=url.searchParams.get('action')||'status';
  if(action==='page'){
    const route=url.searchParams.get('route')||'';
    if(!allHtmlPages().includes(route))return json({error:'Sayfa bulunamadı.'},404);
    return json({route,origin:siteOrigin(),head:staticHeadForRoute(route)});
  }
  if(action==='audit'){
    try{return json(auditSite());}catch{return json({error:'Denetim çalıştırılamadı.'},500);}
  }
  const settings=effectiveSettings(readContent().settings||{});
  const analytics=resolveAnalytics(settings);
  const seo=resolveSeoSettings(settings);
  return json({
    origin:siteOrigin(),siteUrlFromEnv:Boolean(process.env.SITE_URL),
    indexing:seo.indexing,indexingLockedByEnv:String(process.env.SEARCH_INDEXING||'').toLowerCase()==='false',
    verificationFromEnv:{google:Boolean(process.env.GOOGLE_SITE_VERIFICATION),bing:Boolean(process.env.BING_SITE_VERIFICATION)},
    analytics:{mode:analytics.mode,configured:analytics.configured,active:analytics.active,debug:analytics.debug,consentRequired:analytics.consentRequired,google:analytics.google,meta:Boolean(analytics.meta),linkedin:Boolean(analytics.linkedin),env:analytics.env}
  });
}
