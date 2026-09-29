// One-off repair for categories created by the legacy import:
//  - HTML entities stored in names ("Döküm &amp; Dövme") never matched the posts' "Döküm & Dövme";
//  - English blog categories were stored as separate records ("Maintenance") instead of the
//    English name of their Turkish category ("Bakım"), so one relation existed as two entities.
// Only `categories` is rewritten; posts/products/catalogues are untouched. Dry-run by default.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readContent,scanPages,updateContent} from '../app/lib/content.js';
import {normalizeCategoryName as key} from '../app/lib/category-utils.js';
import {openContentStore,closeContentStore} from './content-store.mjs';

const cmsRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const apply=process.argv.includes('--apply');
const decode=value=>String(value||'').replace(/&(amp|lt|gt|quot|#39|apos);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'",apos:"'"})[entity]);

export function repairCategories(categories,posts){
  const changes=[];
  let result=categories.map(item=>{
    const next={...item,name:decode(item.name),nameEn:decode(item.nameEn)};
    if(next.name!==item.name||next.nameEn!==item.nameEn)changes.push(`decoded: ${item.name} → ${next.name}`);
    return next;
  });
  // English names observed on English blog posts: TR category → EN category.
  const english=new Map();
  for(const post of posts)if(post.lang==='en'&&post.category&&post.categoryEn){
    const names=english.get(key(post.category))||new Set();names.add(decode(post.categoryEn));english.set(key(post.category),names);
  }
  result=result.map(item=>{
    const found=item.scope==='blog'&&!item.nameEn?english.get(key(item.name)):null;
    if(found?.size!==1)return item;
    const nameEn=[...found][0];changes.push(`linked: ${item.name} → ${nameEn}`);return {...item,nameEn};
  });
  // Drop blog records that only duplicate another category's English name and are not any record's Turkish category.
  const usedTurkish=new Set(posts.map(post=>key(post.category)).filter(Boolean));
  const englishOf=new Set(result.filter(item=>item.scope==='blog'&&item.nameEn).map(item=>key(item.nameEn)));
  result=result.filter(item=>{
    const duplicate=item.scope==='blog'&&englishOf.has(key(item.name))&&!usedTurkish.has(key(item.name))&&!result.some(other=>other!==item&&other.scope==='blog'&&key(other.name)===key(item.name));
    const pairedElsewhere=duplicate&&result.some(other=>other!==item&&other.scope==='blog'&&key(other.nameEn)===key(item.name));
    if(pairedElsewhere)changes.push(`merged duplicate: ${item.name}`);
    return !pairedElsewhere;
  });
  // Decoding can make two records identical; keep the first per scope + Turkish name.
  const seen=new Set();
  result=result.filter(item=>{const id=item.scope+':'+key(item.name);if(seen.has(id)){changes.push(`removed duplicate: ${item.scope}/${item.name}`);return false;}seen.add(id);return true;});
  return {categories:result,changes};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    await openContentStore();
    const stored=readContent().categories||[];
    const {categories,changes}=repairCategories(stored,scanPages().posts||[]);
    console.log(JSON.stringify({mode:apply?'apply':'dry-run',before:stored.length,after:categories.length,changes},null,2));
    if(!apply){console.log('No records were written. Re-run with --apply after reviewing the changes.');process.exit(0);}
    if(!changes.length){console.log('Nothing to repair.');process.exit(0);}
    await updateContent(data=>({...data,categories:repairCategories(data.categories||[],scanPages().posts||[]).categories}));
    console.log('Repaired. Backup directory: '+path.join(path.resolve(process.env.CMS_DATA_DIR||path.join(cmsRoot,'data')),'backups'));
  }catch(error){console.error(`Category repair stopped without writing: ${error.message}`);process.exitCode=1;}
  finally{await closeContentStore();}
}
