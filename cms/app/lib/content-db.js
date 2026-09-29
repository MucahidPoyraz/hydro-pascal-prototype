// MSSQL content store. The CMS reads content synchronously everywhere (readContent), so the
// published document is kept in a process-wide snapshot that is loaded before the server
// takes requests (instrumentation.js) and revalidated against the database in the background.
// Every write is a transaction that locks the single content row, so If-Match revisions stay
// correct across processes; the previous version is kept (gzip) in cms_content_backups.
import sql from 'mssql';
import {gzipSync,gunzipSync} from 'node:zlib';

const MAX_BACKUPS=50;
const REVALIDATE_MS=2000;
// globalThis: instrumentation and route bundles may hold separate copies of this module.
const state=globalThis[Symbol.for('hydropascal.cms.mssql')]??={poolPromise:null,raw:null,version:null,checkedAt:0,refreshing:null};

// CMS_STORAGE=file|mssql forces a store. Otherwise MSSQL is used when configured, except when
// CMS_DATA_DIR is given explicitly: isolated test servers point there and must never reach the live DB.
export function dbEnabled(){
  const mode=String(process.env.CMS_STORAGE||'').toLowerCase();
  if(mode==='file')return false;
  const configured=Boolean(process.env.MSSQL_SERVER&&process.env.MSSQL_DATABASE&&process.env.MSSQL_USER);
  if(mode==='mssql'){if(!configured)throw new Error('CMS_STORAGE=mssql needs MSSQL_SERVER, MSSQL_DATABASE, MSSQL_USER and MSSQL_PASSWORD.');return true;}
  return configured&&!process.env.CMS_DATA_DIR;
}

function config(){
  return {
    server:process.env.MSSQL_SERVER,
    port:Number(process.env.MSSQL_PORT||1433),
    database:process.env.MSSQL_DATABASE,
    user:process.env.MSSQL_USER,
    password:process.env.MSSQL_PASSWORD||'',
    options:{encrypt:process.env.MSSQL_ENCRYPT==='true',trustServerCertificate:process.env.MSSQL_TRUST_SERVER_CERTIFICATE!=='false'},
    pool:{max:5,min:0,idleTimeoutMillis:30000},
    connectionTimeout:15000,
    requestTimeout:30000,
  };
}

export function getPool(){
  state.poolPromise??=new sql.ConnectionPool(config()).connect().then(pool=>{
    pool.on('error',error=>{console.error('[cms] MSSQL pool error:',error.message);state.poolPromise=null;});
    return pool;
  }).catch(error=>{state.poolPromise=null;throw error;});
  return state.poolPromise;
}

export async function ensureSchema(){
  const pool=await getPool();
  await pool.request().batch(`
IF OBJECT_ID(N'dbo.cms_content',N'U') IS NULL
CREATE TABLE dbo.cms_content(
  id TINYINT NOT NULL CONSTRAINT PK_cms_content PRIMARY KEY CONSTRAINT CK_cms_content_single CHECK(id=1),
  body NVARCHAR(MAX) NOT NULL,
  version BIGINT NOT NULL,
  updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_cms_content_updated DEFAULT SYSUTCDATETIME());
IF OBJECT_ID(N'dbo.cms_content_backups',N'U') IS NULL
CREATE TABLE dbo.cms_content_backups(
  id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_cms_content_backups PRIMARY KEY,
  content_version BIGINT NOT NULL,
  created_at DATETIME2(3) NOT NULL CONSTRAINT DF_cms_content_backups_created DEFAULT SYSUTCDATETIME(),
  body_gz VARBINARY(MAX) NOT NULL);
IF OBJECT_ID(N'dbo.cms_audit',N'U') IS NULL
CREATE TABLE dbo.cms_audit(
  id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_cms_audit PRIMARY KEY,
  at DATETIME2(3) NOT NULL,
  action NVARCHAR(80) NOT NULL,
  entity NVARCHAR(80) NOT NULL,
  entry NVARCHAR(MAX) NOT NULL);`);
}

async function loadFromDb(){
  const pool=await getPool();
  const current=await pool.request().query('SELECT version FROM dbo.cms_content WHERE id=1');
  const version=current.recordset[0]?.version??null;
  if(state.raw!==null&&String(version)===String(state.version)){state.checkedAt=Date.now();return;}
  const row=(await pool.request().query('SELECT body,version FROM dbo.cms_content WHERE id=1')).recordset[0];
  state.raw=row?row.body:'';state.version=row?row.version:null;state.checkedAt=Date.now();
}

// Called once at server start (and by CLI scripts) before anything reads content. No-op in file mode.
export async function initContentStore(){
  if(!dbEnabled())return false;
  await ensureSchema();
  await loadFromDb();
  return true;
}

function revalidate(){
  if(state.refreshing||Date.now()-state.checkedAt<REVALIDATE_MS)return;
  state.refreshing=loadFromDb().catch(error=>console.error('[cms] MSSQL revalidate failed:',error.message)).finally(()=>{state.refreshing=null;});
}

// Returns the raw JSON ('' when the table is still empty). Throws until the first load succeeded.
export function readDbSnapshot(){
  if(state.raw===null){
    revalidate();
    throw new Error('CMS content storage (MSSQL) is not loaded yet. Check the database connection and try again.');
  }
  revalidate();
  return state.raw;
}

// apply(current) → {data, backup}. Runs inside a transaction holding an update lock on the row.
export async function mutateDb(apply,emptyContent){
  const pool=await getPool();
  const tx=new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try{
    const row=(await new sql.Request(tx).query('SELECT body,version FROM dbo.cms_content WITH (UPDLOCK,HOLDLOCK) WHERE id=1')).recordset[0];
    const previous=row?.body||null;
    // Mutators also call readContent()/scanPages(); give them the locked, latest committed row.
    state.raw=previous??'';state.version=row?.version??null;state.checkedAt=Date.now();
    const {data,backup}=await apply(previous?JSON.parse(previous):emptyContent());
    const next=JSON.stringify(data);
    let version=row?.version??null;
    if(previous!==next){
      if(previous&&backup){
        await new sql.Request(tx).input('version',sql.BigInt,row.version).input('body',sql.VarBinary(sql.MAX),gzipSync(Buffer.from(previous,'utf8')))
          .query('INSERT INTO dbo.cms_content_backups(content_version,body_gz) VALUES(@version,@body)');
        await new sql.Request(tx).input('keep',sql.Int,MAX_BACKUPS)
          .query('DELETE FROM dbo.cms_content_backups WHERE id NOT IN (SELECT TOP (@keep) id FROM dbo.cms_content_backups ORDER BY id DESC)');
      }
      const request=new sql.Request(tx).input('body',sql.NVarChar(sql.MAX),next);
      version=row
        ?(await request.query('UPDATE dbo.cms_content SET body=@body,version=version+1,updated_at=SYSUTCDATETIME() OUTPUT inserted.version WHERE id=1')).recordset[0].version
        :(await request.query('INSERT INTO dbo.cms_content(id,body,version) OUTPUT inserted.version VALUES(1,@body,1)')).recordset[0].version;
    }
    await tx.commit();
    state.raw=next;state.version=version;state.checkedAt=Date.now();
    return data;
  }catch(error){
    try{await tx.rollback();}catch{}
    throw error;
  }
}

export async function listDbBackups(limit=MAX_BACKUPS){
  const pool=await getPool();
  return (await pool.request().input('limit',sql.Int,limit).query('SELECT TOP (@limit) id,content_version,created_at,DATALENGTH(body_gz) AS bytes FROM dbo.cms_content_backups ORDER BY id DESC')).recordset;
}

export async function readDbBackup(id){
  const pool=await getPool();
  const row=(await pool.request().input('id',sql.BigInt,id).query('SELECT body_gz FROM dbo.cms_content_backups WHERE id=@id')).recordset[0];
  return row?JSON.parse(gunzipSync(row.body_gz).toString('utf8')):null;
}

export function insertDbAudit(entry){
  getPool().then(pool=>pool.request()
    .input('at',sql.DateTime2(3),new Date(entry.at)).input('action',sql.NVarChar(80),String(entry.action).slice(0,80))
    .input('entity',sql.NVarChar(80),String(entry.entity).slice(0,80)).input('entry',sql.NVarChar(sql.MAX),JSON.stringify(entry))
    .query('INSERT INTO dbo.cms_audit(at,action,entity,entry) VALUES(@at,@action,@entity,@entry)'))
    .catch(error=>console.error('[cms] audit write failed:',error.message));
}

export async function readDbAudit(limit){
  const pool=await getPool();
  const rows=(await pool.request().input('limit',sql.Int,limit).query('SELECT TOP (@limit) entry FROM dbo.cms_audit ORDER BY id DESC')).recordset;
  return rows.map(row=>{try{return JSON.parse(row.entry);}catch{return null;}}).filter(Boolean);
}

export async function closeContentDb(){
  const pending=state.poolPromise;state.poolPromise=null;
  if(pending)try{await (await pending).close();}catch{}
}
