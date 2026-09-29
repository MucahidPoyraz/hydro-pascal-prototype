'use client';

import {useState} from 'react';
import DataTable from './data-table.jsx';
import {AdminButton,ContentCard,PageHeader} from './admin-controls.jsx';
import {findRelation} from './relation-select.jsx';
import {normalizeCategoryName as categoryKey} from '../lib/category-utils.js';

const scopeLabels = {blog: 'Blog', product: 'Ürün ve OEM', catalog: 'Katalog'};
const usageNouns = {blog: 'yazı', product: 'ürün', catalog: 'katalog'};

export default function AdminCategories({categories = [], posts = [], products = [], catalogues = [], onSaveCategory, onUpdate, onDelete, confirm}) {
  const ask = async (title, message) => (confirm ? await confirm({eyebrow: 'SİLME ONAYI', title, message, actions: [{id: 'cancel', label: 'Vazgeç'}, {id: 'confirm', label: 'Sil', variant: 'danger'}]}) : (window.confirm(title) ? 'confirm' : 'cancel')) === 'confirm';
  const [scope, setScope] = useState('blog');
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});

  const editValue = (item, field) => drafts[item.id]?.[field] ?? item[field] ?? '';
  const setEditValue = (item, field, value) => setDrafts(current => ({...current, [item.id]: {...current[item.id], [field]: value}}));
  const commitEdit = (item, field) => {
    const value = String(editValue(item, field)).trim();
    const previous = String(item[field] || '');
    const next = {...(drafts[item.id] || {})};
    delete next[field];
    setDrafts(current => ({...current, [item.id]: next}));
    if (value === previous) return;
    if (field === 'name' && !value) return;
    if (field === 'name' && categories.some(other => other.id !== item.id && other.scope === item.scope && categoryKey(other.name) === categoryKey(value))) { setMessage({error: true, text: 'Bu isimde bir kategori zaten var.'}); return; }
    onUpdate(item.id, {[field]: value});
  };

  // Same resolution the relation selectors use, so counts match what editors show.
  const recordsFor = scope => ({blog: posts, product: products, catalog: catalogues})[scope] || [];
  const usageCount = category => {
    const options = categories.filter(item => item.scope === category.scope);
    return recordsFor(category.scope).filter(record => !record.pendingDelete && findRelation(options, record)?.id === category.id).length;
  };

  const rows = categories.map(category => ({...category, usage: usageCount(category)}));
  const unused = rows.filter(item => item.usage === 0);

  const add = async event => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setMessage({error: true, text: 'Kategori adını yazın.'});
    if (categories.some(item => item.scope === scope && categoryKey(item.name) === categoryKey(trimmed))) return setMessage({error: true, text: 'Bu isimde bir kategori zaten var.'});
    setBusy(true);
    try {
      await onSaveCategory({scope, name: trimmed, nameEn: nameEn.trim()});
      setName('');
      setNameEn('');
      setMessage({text: `“${trimmed}” oluşturuldu ve kaydedildi. Ürün, yazı veya katalog düzenlerken seçebilirsiniz.`});
    } catch (error) {
      setMessage({error: true, text: `Kategori oluşturulamadı: ${error.message || 'bilinmeyen hata'}`});
    } finally {setBusy(false);}
  };

  // Business rule: a category that is still used by any record cannot be deleted.
  const removeMany = async (items, title) => {
    const blocked = items.filter(item => item.usage > 0), free = items.filter(item => item.usage === 0);
    if (!free.length) {
      setMessage({error: true, text: blocked.length === 1 ? `“${blocked[0].name}” kategorisi ${blocked[0].usage} ${usageNouns[blocked[0].scope] || 'içerik'} tarafından kullanılıyor. Silmeden önce bu kayıtları başka kategoriye taşıyıp yayımlayın.` : `Seçilen ${blocked.length} kategori içeriklerde kullanılıyor; silinemez.`});
      return false;
    }
    if (!await ask(title || (free.length === 1 ? `“${free[0].name}” silinsin mi?` : `${free.length} kategori silinsin mi?`), `Silme, üstteki Kaydet ile kalıcı olur.${blocked.length ? `
Kullanımdaki ${blocked.length} kategori atlanacak.` : ''}`)) return false;
    free.forEach(item => onDelete(item.id));
    setMessage({text: `${free.length} kategori kaldırıldı${blocked.length ? `, kullanımdaki ${blocked.length} kategori korundu` : ''}. Kalıcı olması için Kaydet’e basın.`});
    return true;
  };
  const remove = item => removeMany([item]);
  const removeUnused = () => unused.length && removeMany(unused, `Hiçbir içerikte kullanılmayan ${unused.length} kategori silinsin mi?`);

  const columns = [
    {key: 'scope', label: 'Alan', render: item => <span className="category-scope-badge">{scopeLabels[item.scope] || item.scope}</span>},
    {key: 'name', label: 'Kategori adı', render: item => <input aria-label={item.name + ' kategori adı'} maxLength={100} value={editValue(item, 'name')} onChange={event => setEditValue(item, 'name', event.target.value)} onBlur={() => commitEdit(item, 'name')} onKeyDown={event => {if(event.key==='Enter')event.currentTarget.blur()}} />},
    {key: 'nameEn', label: 'English name', render: item => <input aria-label={item.name + ' English category name'} maxLength={100} value={editValue(item, 'nameEn')} placeholder="Optional" onChange={event => setEditValue(item, 'nameEn', event.target.value)} onBlur={() => commitEdit(item, 'nameEn')} onKeyDown={event => {if(event.key==='Enter')event.currentTarget.blur()}} />},
    {key: 'usage', label: 'Kullanım', sortValue: item => item.usage, render: item => <span className={'category-usage' + (item.usage ? '' : ' is-unused')}>{item.usage ? `${item.usage} ${usageNouns[item.scope] || 'içerik'}` : 'Kullanılmıyor'}</span>},
    {key: 'actions', label: 'İşlem', sortable: false, render: item => <AdminButton size="compact" variant="danger" aria-label={'“' + item.name + '” kategorisini sil'} title={item.usage > 0 ? 'Önce bağlı içeriklerin kategorisini değiştirin.' : 'Kategoriyi sil'} onClick={() => remove(item)}>Sil</AdminButton>}
  ];

  return (
    <div className="category-manager">
      <ContentCard>
        <PageHeader eyebrow="İÇERİK YARDIMCILARI" title="Kategoriler" count={categories.length} description="Kategoriler ürün, blog ve katalog editörlerinde “＋ Yeni” ile de oluşturulabilir; hepsi burada toplanır. Adı düzenleyip Enter’a basın, sonra üstteki Kaydet ile kalıcı yapın." actions={<AdminButton variant="ghost" disabled={!unused.length} onClick={removeUnused}>Kullanılmayanları sil ({unused.length})</AdminButton>} />
        <form className="category-create-form" onSubmit={add}>
          <label>İçerik türü<select value={scope} onChange={event => setScope(event.target.value)}><option value="blog">Blog</option><option value="product">Ürün ve OEM</option><option value="catalog">Katalog</option></select></label>
          <label>Kategori adı<input value={name} maxLength={100} onChange={event => setName(event.target.value)} placeholder="Örn. Hidrolik Silindir" required /></label>
          <label>English name<input value={nameEn} maxLength={100} onChange={event => setNameEn(event.target.value)} placeholder="Örn. Hydraulic Cylinder" /></label>
          <AdminButton variant="primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Kaydediliyor…' : '＋ Kategori ekle'}</AdminButton>
          {message && <p className={'category-form-message' + (message.error ? ' error' : '')} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
        </form>
        <p className="hint category-help">Kullanımdaki bir kategori silinemez; önce bağlı ürün, yazı veya katalogları başka kategoriye taşıyın. Ürün ve OEM aynı kategori listesini kullanır.</p>
        <DataTable stateKey="kategori" rows={rows} columns={columns} defaultSort={{key: 'name', direction: 'asc'}} searchKeys={['name', 'nameEn', 'scope']} searchLabel="Kategori ara" filters={[{key: 'scope', label: 'Alan', allLabel: 'Tüm alanlar', options: [{value: 'blog', label: 'Blog'}, {value: 'product', label: 'Ürün ve OEM'}, {value: 'catalog', label: 'Katalog'}]}, {key: 'usage', label: 'Kullanım', allLabel: 'Tüm kullanım', options: [{value: 'used', label: 'Kullanılıyor'}, {value: 'unused', label: 'Kullanılmıyor'}], match: (row, value) => value === 'used' ? row.usage > 0 : row.usage === 0}]} selectable bulkActions={[{id: 'delete', label: 'Seçilenleri sil', variant: 'danger', run: items => removeMany(items)}]} emptyState={{title: 'Henüz kategori yok.', description: 'İlk kategorinizi yukarıdaki formdan ekleyin.'}} />
      </ContentCard>
    </div>
  );
}
