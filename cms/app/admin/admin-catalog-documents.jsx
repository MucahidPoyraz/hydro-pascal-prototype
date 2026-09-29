'use client';

import RelationSelect,{BulkCategoryDialog,RelationInlineSelect} from './relation-select.jsx';
import {useMemo, useRef, useState} from 'react';
import DataTable from './data-table.jsx';
import {AdminButton,AdminOrderButtons,AdminStatusBadge,ContentCard,PageHeader,RowActions,useAfterRender} from './admin-controls.jsx';
import {MediaPicker} from './admin-media.jsx';

function EditorHeading({catalogue, onClose}) {
  return <div className="panelhead editor-heading">
    <div><span className="eyebrow">PDF KATALOG YÖNETİMİ</span><h3>{catalogue.title || 'Yeni katalog'}</h3></div>
    <div className="admin-heading-actions">{catalogue.file && <AdminButton onClick={() => window.open(catalogue.file, '_blank', 'noopener')}>PDF’i aç ↗</AdminButton>}<AdminButton variant="ghost" onClick={onClose}>← Listeye dön</AdminButton></div>
  </div>;
}

export default function AdminCatalogDocuments({selectedId = '', onSelect, catalogues = [], categories = [], onAdd, onUpdate, onDelete, onUpload, onManageCategories, onSaveCategory, onPublishContent, onSave, confirm}) {
  const setSelectedId = id => onSelect(id);
  const [language, setLanguage] = useState('tr');
  const [notice, setNotice] = useState('');
  const bulkCategory = useRef(null), bulkTarget = useRef([]);
  const saveAfterRender = useAfterRender(() => onSave?.());
  const selected = catalogues.find(item => item.id === selectedId);
  const ordered = useMemo(() => [...catalogues].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [catalogues]);
  const update = (key, value) => onUpdate(selectedId, key, value);
  const categoryOptionsFor = language => [...new Set([
    ...categories.filter(item=>item.scope==='catalog').map(item=>language==='en'?(item.nameEn||item.name):item.name),
    ...catalogues.map(item=>language==='en'?(item.categoryEn||item.category||''):(item.category||''))
  ].filter(Boolean))].sort((a,b)=>a.localeCompare(b,language==='en'?'en':'tr'));

  const addCatalogue = () => {
    const item = onAdd();
    setSelectedId(item.id);
    setLanguage('tr');
  };
  const duplicateCatalogue = item => {
    const copy = onAdd();
    const {hasDraft: _hasDraft, hasPublishedVersion: _hasPublished, pendingDelete: _pendingDelete, id: _id, sortOrder: _sortOrder, ...source} = item;
    onUpdate(copy.id, {...source, title: (item.title || 'Katalog').slice(0, 190) + ' (kopya)', titleEn: item.titleEn ? item.titleEn.slice(0, 190) + ' (copy)' : '', active: false});
    setSelectedId(copy.id);
  };
  const report = (result, verb) => {
    if (!result) return false;
    setNotice(`${result.changed} katalog ${verb}.${result.skipped?.length ? ` ${result.skipped.length} kayıt atlandı.` : ''}`);
    return true;
  };
  const removeCatalogues = async rows => {
    const choice = await confirm?.({eyebrow: 'SİLME ONAYI', title: rows.length > 1 ? `${rows.length} katalog silinsin mi?` : `“${rows[0]?.title || 'Katalog'}” silinsin mi?`, message: 'Katalog canlı siteden ve yönetim panelinden kaldırılır. PDF dosyası medya kütüphanesinde kalır.', actions: [{id: 'cancel', label: 'Vazgeç'}, {id: 'confirm', label: 'Kalıcı olarak sil', variant: 'danger'}]});
    if (choice !== 'confirm') return false;
    const result = await onPublishContent('catalogues', rows.map(row => row.id), 'delete');
    if (result && rows.some(row => row.id === selectedId)) setSelectedId('');
    return report(result, 'silindi');
  };
  const setVisibility = async (rows, visible) => report(await onPublishContent('catalogues', rows.map(row => row.id), 'visibility', {visible}), visible ? 'yayına alındı' : 'yayından kaldırıldı');
  const publishDrafts = async rows => {
    const drafts = rows.filter(row => row.hasDraft && !row.pendingDelete);
    if (!drafts.length) {setNotice('Seçilen kataloglarda yayımlanmayı bekleyen değişiklik yok.'); return false;}
    return report(await onPublishContent('catalogues', drafts.map(row => row.id), 'apply'), 'yayınlandı');
  };
  const moveCatalogue = (id, direction) => {
    const next = [...ordered];
    const index = next.findIndex(item => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((item, sortOrder) => onUpdate(item.id, 'sortOrder', sortOrder));
  };

  const columns = [
    {key: 'title', label: 'Katalog', sortValue: item => item.title || '', render: item => <span className="table-entity catalog-document-entity"><span className="catalog-table-icon" aria-hidden="true">PDF</span><span><b>{item.title || 'Adsız katalog'}</b><small>{item.titleEn || 'English başlık eklenmemiş'}</small></span></span>},
    {key: 'category', label: 'Kategori', render: item => <RelationInlineSelect categories={categories} scope="catalog" record={item} ariaLabel={(item.title||'Katalog')+' kategorisi'} onChange={patch=>onUpdate(item.id,patch)}/>},
    {key: 'file', label: 'PDF dosyası', secondary: true, sortValue: item => (item.file || '').split('/').pop(), render: item => item.file ? <a className="table-link-button catalog-file-link" href={item.file} target="_blank" rel="noreferrer">{item.file.split('/').pop()} ↗</a> : <span className="muted-count">PDF eklenmemiş</span>},
    {key: 'active', label: 'Yayın durumu', sortValue: item => (item.active === false ? 1 : 0), render: item => item.pendingDelete?<AdminStatusBadge status="warning">Silme bekliyor</AdminStatusBadge>:<div className="admin-status-cell">{item.hasDraft&&<AdminStatusBadge status="warning">Yayınlanmamış değişiklik</AdminStatusBadge>}<select className="table-quick-select" aria-label={(item.title||'Katalog')+' yayın durumu'} value={item.active===false?'draft':'published'} onChange={event=>onUpdate(item.id,'active',event.target.value==='published')}><option value="published">Yayında</option><option value="draft">Taslak</option></select></div>},
    {key: 'sortOrder', label: 'Sıra', sortValue: item => item.sortOrder ?? 0, render: (item, view) => <AdminOrderButtons label={item.title||'Katalog sırası'} canMoveUp={!view.sorted && !view.filtered && ordered[0]?.id !== item.id} canMoveDown={!view.sorted && !view.filtered && ordered.at(-1)?.id !== item.id} moveUpLabel={view.sorted || view.filtered ? 'Sıralamak için sütun sıralamasını ve filtreleri kaldırın' : 'Yukarı taşı'} onMoveUp={() => moveCatalogue(item.id, -1)} onMoveDown={() => moveCatalogue(item.id, 1)} />},
    {key: 'actions', label: 'İşlemler', sortable: false, render: item => <RowActions label={`“${item.title || 'Katalog'}” için diğer işlemler`} items={[
      {label: item.active === false && item.hasPublishedVersion ? 'Değişikliği uygula' : 'Yayınla', hidden: !item.hasDraft || item.pendingDelete, onClick: () => onPublishContent('catalogues', item.id, item.active === false && item.hasPublishedVersion ? 'apply' : 'publish')},
      {label: 'Yayına al', hidden: item.active !== false || item.hasDraft || item.pendingDelete, onClick: () => setVisibility([item], true)},
      {label: 'Yayından kaldır', hidden: item.active === false || item.pendingDelete, onClick: () => setVisibility([item], false)},
      {label: 'Silme işlemini geri al', hidden: !item.pendingDelete, onClick: () => onUpdate(item.id, {pendingDelete: false, hasDraft: false})},
      {label: 'PDF’i aç ↗', hidden: !item.file, onClick: () => window.open(item.file, '_blank', 'noopener')},
      {label: 'Kopyala', onClick: () => duplicateCatalogue(item)},
      {label: 'Sil', variant: 'danger', onClick: () => removeCatalogues([item])}
    ]}><AdminButton size="compact" onClick={() => setSelectedId(item.id)}>Düzenle</AdminButton></RowActions>}
  ];

  if (selected) {
    const localeKey = key => language === 'en' ? key + 'En' : key;
    return <ContentCard className="catalog-documents-panel">
      <EditorHeading catalogue={selected} onClose={() => setSelectedId('')} />
      <div className="subtabs language-tabs" role="tablist" aria-label="Katalog dili">
        <button type="button" role="tab" aria-selected={language === 'tr'} onClick={() => setLanguage('tr')}>Türkçe</button>
        <button type="button" role="tab" aria-selected={language === 'en'} onClick={() => setLanguage('en')}>English</button>
      </div>
      <div className="formgrid catalog-document-fields">
        <label>{language === 'en' ? 'English title' : 'Türkçe katalog adı'}<input autoFocus value={selected[localeKey('title')] || ''} onChange={event => update(localeKey('title'), event.target.value)} placeholder={language === 'en' ? 'Catalogue title' : 'Örn. Çift etkili silindirler'} /></label>
        <RelationSelect categories={categories} scope="catalog" language={language} record={selected} onChange={patch=>onUpdate(selected.id,patch)} onSave={onSaveCategory}/>
        <label className="wide">{language === 'en' ? 'Short description' : 'Kısa açıklama'}<textarea rows="3" value={selected[localeKey('description')] || ''} onChange={event => update(localeKey('description'), event.target.value)} /></label>
        <label>{language === 'en' ? 'English PDF (optional)' : 'PDF dosyası'}<input value={selected[localeKey('file')] || ''} onChange={event => update(localeKey('file'), event.target.value)} placeholder="/assets/documents/catalogue.pdf" /><MediaPicker filter="document" value={selected[localeKey('file')]||''} label="Kütüphaneden seç veya PDF yükle" onSelect={asset=>update(localeKey('file'),asset.url)} /></label>
        {language === 'tr' && <>
          <label>Yayın durumu<select value={selected.active === false ? 'draft' : 'published'} onChange={event => update('active', event.target.value === 'published')}><option value="published">Yayında</option><option value="draft">Taslak</option></select></label>
          <label>Görünme sırası<input type="number" min="0" value={selected.sortOrder ?? 0} onChange={event => update('sortOrder', Number(event.target.value) || 0)} /></label>
        </>}
      </div>
      {selected[localeKey('file')] && <div className="pdf-card catalog-document-preview"><div><b>{selected[localeKey('file')].split('/').pop()}</b><a href={selected[localeKey('file')]} target="_blank" rel="noreferrer">PDF'i yeni sekmede önizle ↗</a></div><iframe title={(selected.title || 'Katalog') + ' PDF önizlemesi'} src={selected[localeKey('file')]} loading="lazy" /></div>}
      <div className="editor-actions"><AdminButton variant="danger" onClick={() => removeCatalogues([selected])}>Kataloğu sil</AdminButton><span>{selected.hasDraft?'Taslak değişiklikleri kaydedildi; canlı site, yayınlayana kadar eski içeriği gösterir.':'Değişiklikler önce taslak olarak kaydedilir.'}</span>{selected.hasDraft&&<AdminButton variant="primary" onClick={()=>onPublishContent('catalogues',selected.id,selected.active===false&&selected.hasPublishedVersion?'apply':'publish')}>{selected.active===false&&selected.hasPublishedVersion?'Değişikliği uygula':'Yayınla'}</AdminButton>}</div>
    </ContentCard>;
  }

  const categoryOptions = categoryOptionsFor('tr').map(value => ({value, label: value}));
  const pending = catalogues.filter(item => item.hasDraft);
  return <ContentCard className="catalog-documents-panel">
    <PageHeader eyebrow="DOKÜMAN YÖNETİMİ" title="PDF kataloglar" count={catalogues.length} description="Mevcut kataloglar korunur. Yeni PDF yükleyin, kategorisini ve sitedeki sırasını belirleyin." actions={<><AdminButton onClick={onManageCategories}>Kategorileri yönet</AdminButton>{pending.length > 0 && <AdminButton onClick={() => onPublishContent('catalogues', pending.map(item => item.id), 'apply')}>Değişiklikleri uygula ({pending.length})</AdminButton>}<AdminButton variant="primary" onClick={addCatalogue}>＋ Katalog ekle</AdminButton></>} />
    {notice && <p className="category-form-message" role="status">{notice} <button type="button" className="dt-link" onClick={() => setNotice('')}>Kapat</button></p>}
    <DataTable
      stateKey="katalog"
      rows={ordered}
      columns={columns}
      searchKeys={['title', 'titleEn', 'category', 'categoryEn', 'file', 'fileEn']}
      searchLabel="Katalog ara"
      filters={[{key: 'category', label: 'Kategori', allLabel: 'Tüm kategoriler', options: categoryOptions}, {key: 'active', label: 'Yayın durumu', allLabel: 'Tüm durumlar', options: [{value: 'true', label: 'Yayında'}, {value: 'false', label: 'Taslak'}]}]}
      selectable
      bulkActions={[
        {id: 'publish', label: 'Değişiklikleri yayınla', variant: 'primary', run: publishDrafts},
        {id: 'show', label: 'Yayına al', run: rows => setVisibility(rows, true)},
        {id: 'hide', label: 'Yayından kaldır', run: rows => setVisibility(rows, false)},
        {id: 'category', label: 'Kategori değiştir', run: rows => {bulkTarget.current = rows.map(row => row.id); bulkCategory.current.open(rows.length); return false;}},
        {id: 'delete', label: 'Sil', variant: 'danger', run: removeCatalogues}
      ]}
      emptyState={{title: 'Henüz katalog yok.', action: {label: '＋ Katalog ekle', onClick: addCatalogue}}}
    />
    <BulkCategoryDialog dialogRef={bulkCategory} categories={categories} scope="catalog" onSave={onSaveCategory} onApply={patch => {bulkTarget.current.forEach(id => onUpdate(id, patch)); saveAfterRender(); setNotice(`${bulkTarget.current.length} kataloğun kategorisi değiştirildi ve taslak olarak kaydediliyor.`);}}/>
  </ContentCard>;
}
