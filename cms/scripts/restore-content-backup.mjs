import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {dataRoot,updateContent} from '../app/lib/content.js';
import {listDbBackups,readDbBackup} from '../app/lib/content-db.js';
import {openContentStore,closeContentStore} from './content-store.mjs';

const backupRoot=path.resolve(dataRoot,'backups');
const candidate=process.argv.slice(2).find(value=>value.endsWith('.json.gz'));
const backupId=process.argv.slice(2).find(value=>/^\d+$/.test(value));

try{
  const db=await openContentStore();
  let restored,label;
  if(db&&!candidate){
    // MSSQL: backups live in dbo.cms_content_backups; without an id, list them.
    if(!backupId){console.table(await listDbBackups());console.log('Usage: npm run restore:content -- <backup id>');process.exit(0);}
    restored=await readDbBackup(backupId);label=`database backup #${backupId}`;
    if(!restored)throw new Error(`No database backup with id ${backupId}.`);
  }else{
    if(!candidate)throw new Error('Usage: npm run restore:content -- <backup-file-name>.json.gz');
    const backupPath=path.resolve(backupRoot,path.basename(candidate));
    if(!backupPath.startsWith(backupRoot+path.sep)||!fs.existsSync(backupPath))throw new Error('Choose an existing backup inside the CMS data/backups folder.');
    restored=JSON.parse(gunzipSync(fs.readFileSync(backupPath)).toString('utf8'));label=path.basename(backupPath);
  }
  if(!restored||typeof restored!=='object'||Array.isArray(restored)||!restored.settings||typeof restored.settings!=='object'||!restored.pages||typeof restored.pages!=='object')throw new Error('The selected backup is not a valid CMS content snapshot.');
  await updateContent(()=>restored);
  console.log(`Content restored from ${label}. The content that was active before restore was backed up automatically.`);
}catch(error){
  console.error(error.message);
  process.exitCode=1;
}finally{
  await closeContentStore();
}
