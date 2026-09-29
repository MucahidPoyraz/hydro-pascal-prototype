import {isAdminRequest} from '../../lib/auth.js';
import {readAudit} from '../../lib/audit.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!isAdminRequest(request)) return Response.json({error: 'Oturum gerekli'}, {status: 401, headers: {'Cache-Control': 'no-store'}});
  const limit = Number.parseInt(new URL(request.url).searchParams.get('limit') || '30', 10) || 30;
  return Response.json(await readAudit(limit), {headers: {'Cache-Control': 'no-store'}});
}
