import fs from 'node:fs';
import path from 'node:path';
import {isAdminRequest} from '../../lib/auth.js';
import {dataRoot,readContent} from '../../lib/content.js';
import {audit} from '../../lib/audit.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const filePattern=/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:jpg|png|webp|pdf)$/i;
const mimeByExtension={'.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}});

function findUsages(value,needle,field='content',result=[]){
  if(result.length>=80)return result;
  if(typeof value==='string'){
    if(value.includes(needle))result.push(field);
    return result;
  }
  if(Array.isArray(value)){value.forEach((item,index)=>findUsages(item,needle,`${field}[${index}]`,result));return result;}
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))findUsages(item,needle,`${field}.${key}`,result);
  return result;
}

function listAssets({query='',type='all',limit=40,offset=0}={}){
  const directory=path.join(dataRoot,'uploads');
  if(!fs.existsSync(directory))return {items:[],total:0,limit,offset};
  const needle=String(query).trim().toLocaleLowerCase('tr');
  const content=readContent();
  const assets=fs.readdirSync(directory,{withFileTypes:true})
    .filter(entry=>entry.isFile()&&filePattern.test(entry.name))
    .map(entry=>{
      const absolute=path.join(directory,entry.name),stat=fs.statSync(absolute),extension=path.extname(entry.name).toLowerCase();
      const url='/api/media/'+entry.name;
      const stem=entry.name.replace(/\.[^.]+$/,'');
      const displayName=stem.length>37&&/^[\da-f-]{36}-/i.test(stem)?stem.slice(37):stem;
      return {id:entry.name,name:entry.name,displayName,url,type:mimeByExtension[extension],size:stat.size,updatedAt:stat.mtime.toISOString(),usedBy:findUsages(content,url)};
    })
    .filter(item=>(type==='all'||(type==='image'?item.type.startsWith('image/'):item.type==='application/pdf'))&&(!needle||item.name.toLocaleLowerCase('tr').includes(needle)))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return {items:assets.slice(offset,offset+limit),total:assets.length,limit,offset};
}

export async function GET(req){
  if(!isAdminRequest(req))return json({error:'Oturum gerekli'},401);
  const url=new URL(req.url),query=url.searchParams.get('q')||'',type=url.searchParams.get('type')||'all';
  if(!['all','image','document'].includes(type))return json({error:'Medya filtresi geçersiz.'},400);
  const limit=Math.min(100,Math.max(1,Number.parseInt(url.searchParams.get('limit')||'40',10)||40));
  const offset=Math.min(100000,Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
  try{return json(listAssets({query,type,limit,offset}));}
  catch{return json({error:'Medya dosyaları yüklenemedi.'},500);}
}

export async function DELETE(req){
  if(!isAdminRequest(req))return json({error:'Oturum gerekli'},401);
  try{
    const body=await req.json(),id=String(body?.id||'');
    if(!filePattern.test(id)||id.includes('..'))return json({error:'Dosya seçimi geçersiz.'},400);
    const target=path.join(dataRoot,'uploads',id);
    if(!fs.existsSync(target)||!fs.lstatSync(target).isFile())return json({error:'Dosya bulunamadı.'},404);
    const url='/api/media/'+id,usedBy=findUsages(readContent(),url);
    if(usedBy.length)return json({error:'Bu dosya kayıtlı içeriklerde kullanılıyor; silmeden önce o içeriklerdeki görseli değiştirin.',usedBy},409);
    fs.unlinkSync(target);
    audit(req,'delete','media',[id]);
    return json({ok:true,id});
  }catch{return json({error:'Dosya silinemedi.'},500);}
}
