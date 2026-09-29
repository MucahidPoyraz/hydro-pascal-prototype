// Builds the FTP-ready package for IIS + iisnode (Plesk Windows) — the "dotnet publish" of this app.
//   npm run publish:iis -- <target folder>
// Target layout (= httpdocs): web.config, hp-server.cjs, the static site (index.html, tr/, en/, assets/…)
// and cms/ (Next standalone server). Local content (data/content.json, backups) is never copied:
// production reads content from MSSQL. cms/.env.production is created once (MSSQL settings from
// .env.local + new admin secrets) and kept on later publishes.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const cmsRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const siteRoot=path.resolve(cmsRoot,'..');
const buildDir='.next-publish';
const target=process.argv[2]&&path.resolve(process.argv[2]);
const marker='.hp-publish';
const siteEntries=['index.html','robots.txt','sitemap.xml','assets','tr','en'];

function fail(message){console.error(message);process.exit(1);}
if(!target)fail('Usage: npm run publish:iis -- <target folder>');
if(fs.existsSync(target)&&fs.readdirSync(target).length&&!fs.existsSync(path.join(target,marker)))fail(`${target} is not empty and was not created by this script. Choose an empty folder.`);

console.log('1/5 Building (standalone)…');
const build=spawnSync('npx',['next','build','--webpack'],{cwd:cmsRoot,stdio:'inherit',shell:true,env:{...process.env,CMS_OUTPUT:'standalone',CMS_BUILD_DIR:buildDir}});
if(build.status!==0)fail('Build failed.');
const standalone=path.join(cmsRoot,buildDir,'standalone');

console.log('2/5 Cleaning target (keeping cms/.env.production and cms/data)…');
fs.mkdirSync(target,{recursive:true});
const envFile=path.join(target,'cms','.env.production');
const keptEnv=fs.existsSync(envFile)?fs.readFileSync(envFile,'utf8'):null;
for(const name of fs.readdirSync(target)){
  if(name==='cms'){for(const inner of fs.readdirSync(path.join(target,'cms')))if(!['data','.env.production'].includes(inner))fs.rmSync(path.join(target,'cms',inner),{recursive:true,force:true});continue;}
  fs.rmSync(path.join(target,name),{recursive:true,force:true});
}

console.log('3/5 Copying server…');
const skip=new Set(['cms/data',...siteEntries].map(item=>path.join(standalone,item)));
fs.cpSync(standalone,target,{recursive:true,dereference:true,filter:source=>!skip.has(source)&&!/[\\/]\.env[^\\/]*$/.test(source)});
fs.cpSync(path.join(cmsRoot,buildDir,'static'),path.join(target,'cms',buildDir,'static'),{recursive:true});
for(const file of ['web.config','hp-server.cjs'])fs.copyFileSync(path.join(cmsRoot,'deploy','iis',file),path.join(target,file));
for(const dir of ['uploads','attachments'])fs.mkdirSync(path.join(target,'cms','data',dir),{recursive:true});

console.log('4/5 Copying site files…');
for(const entry of siteEntries)fs.cpSync(path.join(siteRoot,entry),path.join(target,entry),{recursive:true});

console.log('5/5 Production settings…');
let adminPassword=null;
if(keptEnv)fs.writeFileSync(envFile,keptEnv);
else{
  const local=path.join(cmsRoot,'.env.local');
  const localEnv=fs.existsSync(local)?Object.fromEntries(fs.readFileSync(local,'utf8').split(/\r?\n/).map(line=>line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean).map(match=>[match[1],match[2]])):{};
  const mssql=Object.entries(localEnv).filter(([key])=>key.startsWith('MSSQL_'));
  if(!mssql.length)console.warn('WARNING: no MSSQL_* settings in .env.local — fill them in cms/.env.production.');
  adminPassword=randomBytes(12).toString('base64url');
  fs.writeFileSync(envFile,[
    '# Production secrets — never commit or share. Created by scripts/publish-iis.mjs.',
    ...mssql.map(([key,value])=>`${key}=${value}`),
    `ADMIN_PASSWORD=${adminPassword}`,
    `ADMIN_TOKEN=${randomBytes(32).toString('hex')}`,
    'SITE_URL=https://www.hydropascal.com.tr',
    '',
  ].join('\n'),{mode:0o600});
}
fs.writeFileSync(path.join(target,marker),new Date().toISOString()+'\n');
console.log(`\nDone → ${target}`);
if(adminPassword)console.log(`New admin password (also in cms/.env.production): ${adminPassword}`);
