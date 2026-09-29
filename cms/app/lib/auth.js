import {createHash,timingSafeEqual} from 'node:crypto';

const devToken='local-prototype-session-rotate-before-deploy';
const attempts=new Map();
const loginWindowMs=15*60*1000;
const maxLoginAttempts=8;

export function adminPassword(){return process.env.ADMIN_PASSWORD||(process.env.NODE_ENV==='development'?'HydroPascal2026!':null)}
export function adminToken(){return process.env.ADMIN_TOKEN||(process.env.NODE_ENV==='development'?devToken:null)}
export function isAdminRequest(req){const token=adminToken();const cookie=req.cookies?.get('hp-admin')?.value;return !!token&&typeof cookie==='string'&&passwordMatches(cookie,token)}
export function clientAddress(req){return req.headers.get('x-real-ip')?.trim()||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'}
export function checkLoginRate(req){
  const key=clientAddress(req);const now=Date.now();const recent=(attempts.get(key)||[]).filter(time=>now-time<loginWindowMs);attempts.set(key,recent);
  return {allowed:recent.length<maxLoginAttempts,retryAfter:Math.max(1,Math.ceil((loginWindowMs-(now-(recent[0]||now)))/1000))};
}
export function recordLoginFailure(req){
  const key=clientAddress(req);const now=Date.now();const recent=(attempts.get(key)||[]).filter(time=>now-time<loginWindowMs);recent.push(now);attempts.set(key,recent);
  if(attempts.size>5000)for(const [address,times] of attempts)if(!times.some(time=>now-time<loginWindowMs))attempts.delete(address);
}
export function clearLoginFailures(req){attempts.delete(clientAddress(req))}
export function passwordMatches(candidate,expected){
  const left=createHash('sha256').update(String(candidate)).digest();const right=createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(left,right);
}
