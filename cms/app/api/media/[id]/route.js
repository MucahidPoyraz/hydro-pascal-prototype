import fs from 'node:fs';import path from 'node:path';
import {dataRoot} from '../../../lib/content.js';
export const runtime='nodejs';
const mime={'.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf'};
export async function GET(req,{params}){const {id}=await params;if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(jpg|png|webp|pdf)$/i.test(id)||id.includes('..'))return new Response('Not found',{status:404});const file=path.join(dataRoot,'uploads',id);if(!fs.existsSync(file)||!fs.lstatSync(file).isFile())return new Response('Not found',{status:404});return new Response(fs.readFileSync(file),{headers:{'Content-Type':mime[path.extname(id).toLowerCase()],'Content-Disposition':'inline; filename="'+id+'"','X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=3600'}})}
