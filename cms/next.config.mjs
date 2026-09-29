// Allow isolated acceptance-test servers without touching the running admin.
// mssql/tedious load optional native pieces at runtime; keep them out of the server bundle.
const nextConfig = {distDir:process.env.CMS_BUILD_DIR||'.next',serverExternalPackages:['mssql','tedious']};
export default nextConfig;
