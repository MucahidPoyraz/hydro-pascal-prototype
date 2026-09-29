import {readContent, updateContent} from '../../lib/content.js';
import {isAdminRequest} from '../../lib/auth.js';
import {audit} from '../../lib/audit.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const statuses = new Set(['Yeni', 'İşlemde', 'Yanıtlandı', 'Kapatıldı']);
const noStore = {'Cache-Control': 'no-store'};

export async function GET(request) {
  if (!isAdminRequest(request)) {
    return Response.json({error: 'Oturum gerekli'}, {
      status: 401,
      headers: noStore
    });
  }

  try {
    const {leads = []} = readContent();
    return Response.json(leads, {headers: noStore});
  } catch {
    return Response.json({error: 'Talepler yüklenemedi.'}, {
      status: 500,
      headers: noStore
    });
  }
}

// Bulk status change: all selected leads are updated in one locked write.
export async function PATCH(request) {
  if (!isAdminRequest(request)) return Response.json({error: 'Oturum gerekli'}, {status: 401, headers: noStore});
  try {
    const {ids, status} = await request.json();
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 500 || ids.some(id => typeof id !== 'string' || !/^[\w-]{16,80}$/.test(id)) || !statuses.has(status)) {
      return Response.json({error: 'Talep seçimi veya durum geçersiz.'}, {status: 400, headers: noStore});
    }
    const wanted = new Set(ids);
    let changed = 0;
    await updateContent(data => {
      data.leads = (data.leads || []).map(lead => {
        if (!wanted.has(lead.id)) return lead;
        changed++;
        return {...lead, status};
      });
      return data;
    });
    if (!changed) return Response.json({error: 'Seçilen talepler bulunamadı.'}, {status: 404, headers: noStore});
    audit(request, 'status', 'lead', ids, {status});
    return Response.json({ok: true, changed}, {headers: noStore});
  } catch {
    return Response.json({error: 'Talep durumları kaydedilemedi.'}, {status: 400, headers: noStore});
  }
}
