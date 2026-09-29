import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {dataRoot,scanPages,updateContent} from '../../lib/content.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const noStore={'Cache-Control':'no-store'};
const maxRequestBytes=12*1024*1024;
const maxFiles=5;
const maxFileBytes=10*1024*1024;
const maxTextBytes=64*1024;
const requests=new Map();
const statuses={quote:'Teklif talebi',sample:'Numune talebi',contact:'İletişim mesajı'};

function getIp(req){return req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';}
function rateLimit(req){
  const now=Date.now(),ip=getIp(req),entry=requests.get(ip);
  if(requests.size>1000)for(const [key,value] of requests)if(value.resetAt<=now)requests.delete(key);
  if(!entry||entry.resetAt<=now){requests.set(ip,{count:1,resetAt:now+15*60_000});return true;}
  if(entry.count>=12)return false;
  entry.count++;return true;
}
function cleanText(value,max=4000){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max);}
function safeFilename(value){
  const original=String(value||'file').replace(/[\r\n\u0000]/g,'').split(/[\\/]/).pop()||'file';
  const ascii=original.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'file';
  return {original:original.slice(0,120),stored:ascii};
}
function htmlText(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function responseError(error,status,lang='tr'){return new Response(JSON.stringify({success:false,error:lang==='en'?error.en:error.tr}),{status,headers:{...noStore,'Content-Type':'application/json; charset=utf-8'}});}

export async function POST(req){
  const referer=req.headers.get('referer')||'';
  const langHint=new URL(req.url).searchParams.get('lang')==='en'||/^https?:\/\/[^/]+\/en\//i.test(referer)?'en':'tr';
  if(!rateLimit(req))return responseError({tr:'Çok sayıda deneme yapıldı. Lütfen daha sonra tekrar deneyin.',en:'Too many requests. Please try again later.'},429,langHint);
  const length=Number(req.headers.get('content-length')||0);
  if(length>maxRequestBytes)return responseError({tr:'Form ve ekleri izin verilen boyutu aşıyor.',en:'The form and its attachments exceed the allowed size.'},413,langHint);

  let values={},files=[];
  try{
    const type=req.headers.get('content-type')||'';
    if(type.includes('multipart/form-data')||type.includes('application/x-www-form-urlencoded')){
      const form=await req.formData();
      for(const [key,value] of form.entries()){
        if(typeof value==='string')values[key]=value;
        else if(typeof value?.arrayBuffer==='function'&&value.size>0)files.push({key,file:value});
      }
    }else{
      const body=await req.json();
      if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid body');
      values=Object.fromEntries(Object.entries(body).filter(([,value])=>typeof value==='string'));
    }
  }catch{return responseError({tr:'Form verileri okunamadı.',en:'Could not read the form data.'},400,langHint);}

  const textSize=Object.entries(values).reduce((total,[key,value])=>total+Buffer.byteLength(key+value,'utf8'),0);
  if(textSize>maxTextBytes)return responseError({tr:'Form metni çok uzun.',en:'The form text is too long.'},413,langHint);
  if(files.length>maxFiles)return responseError({tr:'En fazla 5 dosya ekleyebilirsiniz.',en:'You can attach up to 5 files.'},413,langHint);
  if(files.reduce((sum,item)=>sum+item.file.size,0)>maxFileBytes)return responseError({tr:'Eklerin toplam boyutu 10 MB sınırını aşıyor.',en:'Attachments exceed the 10 MB total limit.'},413,langHint);

  if(cleanText(values._honey||values.botcheck,300))return new Response(JSON.stringify({success:true}),{headers:{...noStore,'Content-Type':'application/json; charset=utf-8'}});

  const page=cleanText(values._page,2048);
  const lang=(()=>{try{return new URL(page).pathname.startsWith('/en/')?'en':langHint;}catch{return langHint;}})();
  const consentTr=cleanText(values['KVKK Onayi'],60).toLocaleLowerCase('tr-TR');
  const consentEn=cleanText(values.Consent,60).toLowerCase();
  const granted=['onaylandi','onaylandı'].includes(consentTr)||consentEn==='granted';
  if(!granted)return responseError({tr:'Talebinizi göndermek için kişisel veri işleme onayını vermelisiniz.',en:'Please consent to personal data processing before submitting your request.'},400,lang);

  const name=cleanText(values.name,160),email=cleanText(values.email,254).replace(/[\r\n]/g,'');
  const emailValid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if(!name||!emailValid)return responseError({tr:'Ad ve geçerli e-posta adresi zorunludur.',en:'Name and a valid email address are required.'},400,lang);

  const kind=['quote','sample','contact'].includes(cleanText(values._type||values.type,24))?cleanText(values._type||values.type,24):(/quote|teklif/i.test(page+' '+values.title)?'quote':'contact');
  const subject=cleanText(values.subject||values.title||values.interest||statuses[kind],240).replace(/[\r\n]+/g,' ');
  const message=cleanText(values.message||values.description||subject,8000);
  const excluded=new Set(['name','email','company','phone','message','description','_honey','botcheck','_page','_subject','_template','_captcha','_autoresponse','_next','KVKK Onayi','Consent','_type','type']);
  const fields=Object.fromEntries(Object.entries(values).filter(([key,value])=>!excluded.has(key)&&!key.startsWith('_')&&value.trim()).map(([key,value])=>[cleanText(key,100),cleanText(value,2000)]));
  if(page)fields['Kaynak sayfa']=(()=>{try{return new URL(page).pathname;}catch{return page;}})();
  if(subject)fields['Konu']=subject;

  const id=randomUUID();
  const attachmentDir=path.join(dataRoot,'attachments');
  const attachments=[];
  try{
    if(files.length)fs.mkdirSync(attachmentDir,{recursive:true});
    for(const {file} of files){
      const filename=safeFilename(file.name),attachmentId=`${randomUUID()}-${filename.stored}`;
      fs.writeFileSync(path.join(attachmentDir,attachmentId),Buffer.from(await file.arrayBuffer()),{flag:'wx',mode:0o600});
      attachments.push({id:attachmentId,name:filename.original,size:file.size,type:file.type||'application/octet-stream'});
    }
    await updateContent(data=>{
      data.leads=Array.isArray(data.leads)?data.leads:[];
      data.leads.unshift({id,type:kind,lang,name,email,company:cleanText(values.company,180),phone:cleanText(values.phone,80),subject,message,fields,attachments,status:'Yeni',emailStatus:'E-posta bekliyor',createdAt:new Date().toISOString()});
      return data;
    });
  }catch{
    for(const item of attachments)try{fs.rmSync(path.join(attachmentDir,item.id),{force:true});}catch{}
    return responseError({tr:'Talep kaydedilemedi. Lütfen tekrar deneyin.',en:'Your request could not be saved. Please try again.'},500,lang);
  }

  let emailStatus='SMTP ayarlanmamış; talep yönetim paneline kaydedildi.';
  try{
    const {settings,templates}=scanPages();
    const {smtpHost,smtpPort,smtpUser,smtpPass,smtpFrom}=settings;
    if(smtpHost&&smtpPort&&smtpUser&&smtpPass&&smtpFrom&&settings.email){
      const transport=nodemailer.createTransport({host:smtpHost,port:Number(smtpPort),secure:Number(smtpPort)===465,auth:{user:smtpUser,pass:smtpPass},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000});
      const template=templates?.[kind]||templates?.contact||{};
      const languageSuffix=lang==='en'?'En':'';
      const templateSubject=template[`subject${languageSuffix}`]||template.subject;
      const templateBody=template[`body${languageSuffix}`]||template.body;
      const replace=value=>String(value||'').replaceAll('{{name}}',name).replaceAll('{{company}}',cleanText(values.company,180)).replaceAll('{{subject}}',subject);
      const detailText=Object.entries(fields).map(([key,value])=>`${key}: ${value}`).join('\n');
      const fileText=attachments.length?`\n\nEkli dosyalar (panelden indirip e-postaya ekleyin): ${attachments.map(item=>item.name).join(', ')}`:'';
      const notification=`${statuses[kind]}\n\nAd: ${name}\nŞirket: ${cleanText(values.company,180)}\nE-posta: ${email}\nTelefon: ${cleanText(values.phone,80)}\nKonu: ${subject}\n\n${message}\n\n${detailText}${fileText}`;
      const from={name:settings.companyName||'HydroPascal',address:smtpFrom};
      await transport.sendMail({from,to:settings.email,replyTo:email,subject:`[${statuses[kind]}] ${subject}`.slice(0,250),text:notification,html:`<pre style="font:14px/1.6 Arial,sans-serif;white-space:pre-wrap">${htmlText(notification)}</pre>`});
      let customerSent=false;
      try{
        await transport.sendMail({from,to:email,subject:replace(templateSubject)||`HydroPascal: ${statuses[kind]}`,text:replace(templateBody)||`Merhaba ${name}, talebinizi aldık. En kısa sürede size dönüş yapacağız.`,replyTo:settings.email});
        customerSent=true;
      }catch{}
      emailStatus=customerSent?'Şirket bildirimi ve otomatik yanıt gönderildi.':'Şirket bildirimi gönderildi; otomatik yanıt gönderilemedi.';
      await updateContent(data=>{data.leads=(data.leads||[]).map(lead=>lead.id===id?{...lead,emailStatus}:lead);return data;});
    }
  }catch{
    emailStatus='E-posta gönderilemedi; talep panelde kayıtlı.';
    try{await updateContent(data=>{data.leads=(data.leads||[]).map(lead=>lead.id===id?{...lead,emailStatus}:lead);return data;});}catch{}
  }
  return new Response(JSON.stringify({success:true}),{headers:{...noStore,'Content-Type':'application/json; charset=utf-8'}});
}
