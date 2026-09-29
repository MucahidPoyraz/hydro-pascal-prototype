import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {isAdminRequest} from '../../lib/auth.js';
import {dataRoot} from '../../lib/content.js';

export const runtime='nodejs';
const types={
  'image/jpeg':{ext:'.jpg',limit:8*1024*1024,valid:bytes=>bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff},
  'image/png':{ext:'.png',limit:8*1024*1024,valid:bytes=>bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
  'image/webp':{ext:'.webp',limit:8*1024*1024,valid:bytes=>bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'},
  'application/pdf':{ext:'.pdf',limit:20*1024*1024,valid:bytes=>bytes.length>=5&&bytes.subarray(0,5).toString('ascii')==='%PDF-'}
};

const json=(value,options={})=>new Response(JSON.stringify(value),{status:options.status||200,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}});

export async function POST(req){
  if(!isAdminRequest(req))return json({error:'Oturum gerekli'},{status:401});
  try{
    const fd=await req.formData(),file=fd.get('file');
    if(!file||typeof file.arrayBuffer!=='function')return json({error:'Bir dosya seçin.'},{status:400});
    const type=types[file.type];
    if(!type)return json({error:'JPG, PNG, WEBP veya PDF dosyası seçin.'},{status:400});
    if(file.size>type.limit)return json({error:type.ext==='.pdf'?'PDF dosyası en fazla 20 MB olabilir.':'Görsel en fazla 8 MB olabilir.'},{status:413});
    const bytes=Buffer.from(await file.arrayBuffer());
    if(!type.valid(bytes))return json({error:'Dosya içeriği seçilen türle eşleşmiyor.'},{status:400});
    const dir=path.join(dataRoot,'uploads');fs.mkdirSync(dir,{recursive:true});
    const original=path.basename(String(file.name||'dosya'),path.extname(String(file.name||''))).normalize('NFKC');
    const stem=original.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'dosya';
    const name=randomUUID()+'-'+stem+type.ext;
    fs.writeFileSync(path.join(dir,name),bytes,{flag:'wx',mode:0o600});
    return json({url:'/api/media/'+name,name:file.name,type:file.type,size:bytes.length});
  }catch{return json({error:'Dosya yüklenemedi.'},{status:500});}
}
