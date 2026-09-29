// IIS (iisnode) entry for the published package (scripts/publish-iis.mjs).
// iisnode hands the app a named pipe in PORT, which Next's standalone server.js cannot parse,
// so the Next request handler is mounted on a plain http server that listens on it.
'use strict';
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {createRequire}=require('node:module');

const cmsDir=path.join(__dirname,'cms');
process.chdir(cmsDir);
process.env.NODE_ENV='production';
const envFile=path.join(cmsDir,'.env.production');
if(fs.existsSync(envFile))process.loadEnvFile(envFile);

const distDir=fs.readdirSync(cmsDir).find(name=>name.startsWith('.next')&&fs.existsSync(path.join(cmsDir,name,'required-server-files.json')));
if(!distDir)throw new Error('Next build output not found in '+cmsDir);
const {config}=JSON.parse(fs.readFileSync(path.join(cmsDir,distDir,'required-server-files.json'),'utf8'));
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG=JSON.stringify(config);

const next=createRequire(path.join(cmsDir,'server.js'))('next');
const app=next({dev:false,dir:cmsDir,conf:config});
const handle=app.getRequestHandler();
const port=process.env.PORT||3000;
app.prepare()
  .then(()=>http.createServer((req,res)=>handle(req,res)).listen(port,()=>console.log('[cms] listening on',port)))
  .catch(error=>{console.error('[cms] start failed:',error);process.exit(1);});
