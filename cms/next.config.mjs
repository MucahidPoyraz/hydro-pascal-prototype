import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Allow isolated acceptance-test servers without touching the running admin.
// mssql/tedious load optional native pieces at runtime; keep them out of the server bundle.
// CMS_OUTPUT=standalone builds the deployable server folder (scripts/publish.mjs, IIS/iisnode).
const standalone=process.env.CMS_OUTPUT==='standalone';
// The static site (../tr, ../en, ../assets) sits next to cms/ and is read at request time
// (siteRoot = path.resolve(cwd,'..')), so traces must be rooted at the workspace root.
const siteRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// htmlparser2 is loaded through createRequire (app/lib/page-structure.js), which the tracer
// cannot follow; list it and its dependencies explicitly (hoisted or nested install).
const htmlparser2Files='{../,}node_modules/{htmlparser2,domhandler,domutils,dom-serializer,domelementtype,entities}/**/*';
const nextConfig = {
  distDir:process.env.CMS_BUILD_DIR||'.next',
  serverExternalPackages:['mssql','tedious'],
  outputFileTracingRoot:siteRoot,
  outputFileTracingIncludes:{
    '/**':[htmlparser2Files,'../tr/**/*','../en/**/*','../assets/**/*','../index.html','../robots.txt','../sitemap.xml'],
  },
  ...(standalone?{output:'standalone'}:{}),
};
export default nextConfig;
