import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd(),'..','assets');
const types={'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.pdf':'application/pdf','.woff2':'font/woff2'};

export async function GET(req,{params}){
  const {asset=[]}=await params;
  const file=path.resolve(root,...asset);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('Not found',{status:404});
  let bytes=fs.readFileSync(file);
  if(asset.join('/')==='js/form-submit.js'){
    let js=bytes.toString('utf8')
      .replace("target: 'info@hydropascal.com.tr'","target: 'internal'")
      .replace("ajaxBase: 'https://formsubmit.co/ajax/'","ajaxBase: '/api/lead?target='")
      .replace("postBase: 'https://formsubmit.co/'","postBase: '/api/lead?mode=post&target='")
      .replace('ajaxSupportsFiles: false','ajaxSupportsFiles: true')
      .replace(/if \(!ok\) \{ throw new Error\([^;]+; \}/,"if (!ok) { var serverError = new Error(json && json.error ? json.error : 'Request failed'); serverError.serverMessage = !!(json && json.error); throw serverError; }")
      .replace("status.textContent = (err && err.name === 'TypeError') ? T.network : T.error;","status.textContent = (err && err.serverMessage) ? err.message : ((err && err.name === 'TypeError') ? T.network : T.error);");
    bytes=Buffer.from(js);
  }
  return new Response(bytes,{headers:{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'public, max-age=120'}});
}
