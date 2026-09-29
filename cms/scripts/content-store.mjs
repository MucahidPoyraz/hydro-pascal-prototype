// CLI scripts see the same content store as the server: .env.local/.env are loaded like Next does
// (real environment variables win), then the MSSQL snapshot is loaded when that store is active.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initContentStore,closeContentDb} from '../app/lib/content-db.js';

export const cmsRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export async function openContentStore(){
  for(const name of ['.env.local','.env']){const file=path.join(cmsRoot,name);if(fs.existsSync(file))process.loadEnvFile(file);}
  const db=await initContentStore();
  console.error(db?`Content store: MSSQL ${process.env.MSSQL_SERVER}/${process.env.MSSQL_DATABASE}`:`Content store: file ${path.resolve(process.env.CMS_DATA_DIR||path.join(cmsRoot,'data'))}`);
  return db;
}

export const closeContentStore=closeContentDb;
