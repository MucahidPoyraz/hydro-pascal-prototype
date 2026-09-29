import {updateContent} from '../../../lib/content.js';
import {isAdminRequest} from '../../../lib/auth.js';
import {audit} from '../../../lib/audit.js';

export const runtime='nodejs';
const statuses=new Set(['Yeni','İşlemde','Yanıtlandı','Kapatıldı']);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'}});

export async function PATCH(req,{params}){
  if(!isAdminRequest(req))return json({error:'Oturum gerekli'},401);
  const {id}=await params;
  if(!/^[\w-]{16,80}$/.test(id))return json({error:'Talep bulunamadı.'},404);
  try{
    const {status}=await req.json();if(!statuses.has(status))return json({error:'Geçersiz durum.'},400);
    let found=false;
    await updateContent(data=>{data.leads=(data.leads||[]).map(lead=>{if(lead.id!==id)return lead;found=true;return {...lead,status};});return data;});
    if(!found)return json({error:'Talep bulunamadı.'},404);
    audit(req,'status','lead',[id],{status});
    return json({ok:true});
  }catch{return json({error:'Talep durumu kaydedilemedi.'},400);}
}
