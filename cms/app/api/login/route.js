import {NextResponse} from 'next/server';
import {adminPassword,adminToken,checkLoginRate,clearLoginFailures,passwordMatches,recordLoginFailure} from '../../lib/auth.js';

export const runtime='nodejs';
const noStore={'Cache-Control':'no-store'};

export async function POST(req){
  const rate=checkLoginRate(req);
  if(!rate.allowed)return NextResponse.json({error:'Çok fazla giriş denemesi yapıldı. Biraz bekleyip yeniden deneyin.'},{status:429,headers:{...noStore,'Retry-After':String(rate.retryAfter)}});
  const password=adminPassword(),token=adminToken();
  if(!password||!token)return NextResponse.json({error:'Yönetim girişi sunucuda henüz yapılandırılmamış.'},{status:503,headers:noStore});
  if(process.env.NODE_ENV==='production'&&(password.length<12||token.length<32))return NextResponse.json({error:'Güvenlik için yönetici şifresi en az 12, güvenlik anahtarı en az 32 karakter olmalı.'},{status:503,headers:noStore});
  if(Number(req.headers.get('content-length')||0)>4096)return NextResponse.json({error:'Giriş isteği geçersiz. Yeniden deneyin.'},{status:413,headers:noStore});
  let body;try{body=await req.json();}catch{return NextResponse.json({error:'Giriş isteği geçersiz. Yeniden deneyin.'},{status:400,headers:noStore});}
  if(typeof body?.password!=='string'||!passwordMatches(body.password,password)){
    recordLoginFailure(req);
    return NextResponse.json({error:'Şifre doğru değil. Yeniden deneyin.'},{status:401,headers:noStore});
  }
  clearLoginFailures(req);
  const response=NextResponse.json({ok:true},{headers:noStore});
  response.cookies.set('hp-admin',token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*12});
  return response;
}
