import fs from 'node:fs';
import path from 'node:path';
import {clientAddress} from './auth.js';
import {dbEnabled,insertDbAudit,readDbAudit} from './content-db.js';

// Append-only admin audit trail (JSON lines) next to the content store.
const dataRoot = () => path.resolve(process.env.CMS_DATA_DIR || (process.env.VERCEL ? '/tmp/hydropascal-cms' : path.join(process.cwd(), 'data')));
const auditFile = () => path.join(dataRoot(), 'audit.log');
const MAX_BYTES = 5 * 1024 * 1024;

export function audit(request, action, entity, ids = [], details = {}) {
  try {
    const entry = {at: new Date().toISOString(), user: 'admin', ip: request ? clientAddress(request) : 'system', action, entity, ids: (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String).slice(0, 300), ...details};
    if (dbEnabled()) return insertDbAudit(entry);
    const file = auditFile();
    fs.mkdirSync(path.dirname(file), {recursive: true});
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, file.replace(/\.log$/, `-${new Date().toISOString().replace(/[:.]/g, '-')}.log`));
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', {mode: 0o600});
  } catch {
    // Auditing must never block a content change.
  }
}

export async function readAudit(limit = 50) {
  try {
    if (dbEnabled()) return await readDbAudit(Math.min(500, Math.max(1, limit)));
    const lines = fs.readFileSync(auditFile(), 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-Math.min(500, Math.max(1, limit))).reverse().map(line => {try {return JSON.parse(line);} catch {return null;}}).filter(Boolean);
  } catch {
    return [];
  }
}
