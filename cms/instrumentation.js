// Loads the MSSQL content snapshot before the server takes requests (no-op in file mode).
export async function register(){
  if(process.env.NEXT_RUNTIME!=='nodejs')return;
  const {initContentStore}=await import('./app/lib/content-db.js');
  try{
    if(await initContentStore())console.log(`[cms] Content store: MSSQL ${process.env.MSSQL_SERVER}/${process.env.MSSQL_DATABASE}`);
  }catch(error){
    // Keep the server up; readContent retries in the background and answers with a clear error meanwhile.
    console.error('[cms] MSSQL content store could not be loaded:',error.message);
  }
}
