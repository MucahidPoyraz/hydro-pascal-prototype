// Copies the JSON content store (data/content.json by default) into the MSSQL store.
// Refuses to overwrite a database that already has content unless --force is given
// (the replaced database content is then kept in cms_content_backups).
//   npm run migrate:mssql                 → data/content.json
//   npm run migrate:mssql -- --from x.json --force
import fs from 'node:fs';
import path from 'node:path';
import {openContentStore,closeContentStore,cmsRoot} from './content-store.mjs';
import {readContent,updateContent,contentRevision} from '../app/lib/content.js';

const args=process.argv.slice(2);
const fromIndex=args.indexOf('--from');
const source=path.resolve(fromIndex>=0?args[fromIndex+1]||'':path.join(cmsRoot,'data','content.json'));
const force=args.includes('--force');
const summary=data=>({pages:Object.keys(data.pages||{}).length,products:(data.products||[]).length,posts:(data.posts||[]).length,catalogues:(data.catalogues||[]).length,categories:(data.categories||[]).length,leads:(data.leads||[]).length,revision:contentRevision(data).slice(0,12)});

try{
  if(!await openContentStore())throw new Error('MSSQL store is not active. Set MSSQL_* in .env.local and leave CMS_DATA_DIR unset (or set CMS_STORAGE=mssql).');
  if(!fs.existsSync(source))throw new Error(`Source not found: ${source}`);
  const data=JSON.parse(fs.readFileSync(source,'utf8'));
  if(!data||typeof data!=='object'||Array.isArray(data)||!data.settings||!data.pages)throw new Error('Source is not a valid CMS content snapshot.');
  const existing=readContent();
  if(Object.keys(existing.pages||{}).length&&!force)throw new Error(`The database already has content (${JSON.stringify(summary(existing))}). Re-run with --force to replace it.`);
  await updateContent(()=>data);
  const stored=readContent();
  if(contentRevision(stored)!==contentRevision(data))throw new Error('Verification failed: stored revision differs from the source.');
  console.log(JSON.stringify({source,migrated:summary(stored),bytes:Buffer.byteLength(JSON.stringify(stored),'utf8')},null,2));
}catch(error){
  console.error(error.message);
  process.exitCode=1;
}finally{
  await closeContentStore();
}
