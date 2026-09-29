import fs from 'node:fs';import path from 'node:path';
import {isAdminRequest} from '../../../lib/auth.js';
import {dataRoot} from '../../../lib/content.js';
export const runtime='nodejs';
export async function GET(req,{params}){if(!isAdminRequest(req))return new Response('Unauthorized',{status:401});const {id}=await params;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[\w.-]+$/i.test(id))return new Response('Not found',{status:404});const file=path.join(dataRoot,'attachments',id);if(!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('Not found',{status:404});return new Response(fs.readFileSync(file),{headers:{'Content-Disposition':`attachment; filename="${id.slice(37)}"`,'Content-Type':'application/octet-stream','Cache-Control':'no-store'}})}
