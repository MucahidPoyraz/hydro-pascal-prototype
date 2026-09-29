'use client';

import {useEffect, useState} from 'react';
import {ContentCard, PageHeader} from './admin-controls.jsx';

const actionLabels = {save: 'Taslak kaydedildi', publish: 'Yayınlandı', apply: 'Değişiklik uygulandı', show: 'Yayına alındı', hide: 'Yayından kaldırıldı', delete: 'Silindi', discard: 'Taslak atıldı', create: 'Oluşturuldu', update: 'Güncellendi', status: 'Durum değişti'};
const entityLabels = {cms: 'İçerik', products: 'Ürün', posts: 'Blog yazısı', catalogues: 'Katalog', category: 'Kategori', navigation: 'Header/footer menüsü', page: 'Sayfa', media: 'Medya', lead: 'Talep'};
const formatter = new Intl.DateTimeFormat('tr-TR', {dateStyle: 'medium', timeStyle: 'short'});

// Read-only view of the server audit log (publish, delete, reorder…).
export default function AdminActivity() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let active = true;
    fetch('/api/audit?limit=12', {cache: 'no-store'}).then(response => response.ok ? response.json() : []).then(rows => {if (active) setItems(Array.isArray(rows) ? rows : []);}).catch(() => {if (active) setItems([]);});
    return () => {active = false;};
  }, []);
  return <ContentCard className="admin-activity">
    <PageHeader eyebrow="DENETİM KAYDI" title="Son yönetim işlemleri" description="Kaydetme, yayınlama, silme ve menü değişiklikleri sunucuda kayıt altına alınır." />
    {items === null ? <p className="hint">Yükleniyor…</p> : items.length === 0 ? <p className="hint">Henüz kayıtlı işlem yok.</p> : <ul className="audit-list">
      {items.map((item, index) => <li key={item.at + index}><time dateTime={item.at}>{formatter.format(new Date(item.at))}</time><span><b>{entityLabels[item.entity] || item.entity}</b> · {actionLabels[item.action] || item.action}{item.ids?.length ? ` · ${item.ids.length} kayıt` : ''}{item.status ? ` · ${item.status}` : ''}</span></li>)}
    </ul>}
  </ContentCard>;
}
