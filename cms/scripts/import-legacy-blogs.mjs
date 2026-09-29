import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readContent,updateContent} from '../app/lib/content.js';
import {openContentStore,closeContentStore} from './content-store.mjs';
import {mergeLegacyBlogPosts,readLegacyBlogPosts} from '../app/lib/legacy-blog-import.js';

const cmsRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const siteRoot=path.resolve(cmsRoot,'..');
const apply=process.argv.includes('--apply');

try{
  await openContentStore();
  const imported=readLegacyBlogPosts(siteRoot);
  const current=readContent();
  const merged=mergeLegacyBlogPosts(current.posts||[],imported);
  const added=merged.length-(current.posts||[]).length;
  const summary={mode:apply?'apply':'dry-run',legacyArticles:imported.length,added,existing:imported.length-added,languageCounts:imported.reduce((counts,post)=>({...counts,[post.lang]:(counts[post.lang]||0)+1}),{}),estimatedBytes:Buffer.byteLength(JSON.stringify(merged),'utf8')};

  if(!apply){
    console.log(JSON.stringify(summary,null,2));
    console.log('No records were written. Re-run with --apply to import after reviewing this count.');
    await closeContentStore();process.exit(0);
  }

  await updateContent(data=>({...data,posts:mergeLegacyBlogPosts(data.posts||[],imported),legacyBlogsImportedAt:new Date().toISOString()}));
  console.log(JSON.stringify({...summary,backupDirectory:path.join(path.resolve(process.env.CMS_DATA_DIR||path.join(cmsRoot,'data')),'backups')},null,2));
}catch(error){
  console.error(`Legacy blog import stopped without writing: ${error.message}`);
  process.exitCode=1;
}finally{
  await closeContentStore();
}
