import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Allow isolated acceptance-test servers without touching the running admin.
// mssql/tedious load optional native pieces at runtime; keep them out of the server bundle.
// CMS_OUTPUT=standalone builds the deployable server folder (scripts/publish.mjs, IIS/iisnode).
const standalone=process.env.CMS_OUTPUT==='standalone';
const nextConfig = {
  distDir:process.env.CMS_BUILD_DIR||'.next',
  serverExternalPackages:['mssql','tedious'],
  ...(standalone?{output:'standalone',outputFileTracingRoot:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')}:{}),
};
export default nextConfig;
