'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import DataTable from './data-table.jsx';
import {AdminButton,AdminOrderButtons,ContentCard,PageHeader,RowActions} from './admin-controls.jsx';
import {MediaPicker} from './admin-media.jsx';

const makeId = () => crypto.randomUUID();

function EditorHeading({title, onClose}) {
  return <div className="panelhead editor-heading">
    <div><span className="eyebrow">REFERANS VE MEDYA YÖNETİMİ</span><h3>{title}</h3></div>
    <AdminButton variant="ghost" onClick={onClose}>← Listeye dön</AdminButton>
  </div>;
}

export default function AdminShowcase({references = [], mediaItems = [], onUpdateReferences, onUpdateMedia, onUpload}) {
  const [section, setSection] = useState('references');
  const [selectedId, setSelectedId] = useState('');
  const [language, setLanguage] = useState('tr');
  const mediaRef = useRef(mediaItems);
  useEffect(() => {mediaRef.current = mediaItems;}, [mediaItems]);

  const isMedia = section === 'media';
  const sourceRows = isMedia ? mediaItems : references;
  const orderedRows = useMemo(() => [...sourceRows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [sourceRows]);
  const updateRows = isMedia ? onUpdateMedia : onUpdateReferences;
  const selected = sourceRows.find(item => item.id === selectedId);

  const addRow = () => {
    const item = isMedia
      ? {id: makeId(), title: 'Yeni görsel', titleEn: '', alt: '', altEn: '', image: '', active: false, sortOrder: orderedRows.length}
      : {id: makeId(), name: 'Yeni marka', nameEn: '', image: '', url: '', active: false, sortOrder: orderedRows.length};
    updateRows([...sourceRows, item]);
    setSelectedId(item.id);
    setLanguage('tr');
  };

  const updateRow = (id, patch) => updateRows(sourceRows.map(item => item.id === id ? {...item, ...patch} : item));
  const removeRows = rows => {
    const ids = new Set(rows.map(item => item.id));
    if (!ids.size || !window.confirm(rows.length > 1 ? `${rows.length} kayıt silinsin mi? Silme, Kaydet ile kalıcı olur.` : (isMedia ? 'Bu görsel' : 'Bu marka') + ' silinsin mi?')) return false;
    updateRows(sourceRows.filter(entry => !ids.has(entry.id)));
    if (ids.has(selectedId)) setSelectedId('');
    return true;
  };
  const removeRow = item => removeRows([item]);
  const setActive = (rows, active) => {const ids = new Set(rows.map(item => item.id)); updateRows(sourceRows.map(item => ids.has(item.id) ? {...item, active} : item)); return true;};
  const moveRow = (id, direction) => {
    const next = [...orderedRows];
    const index = next.findIndex(item => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateRows(next.map((item, sortOrder) => ({...item, sortOrder})));
  };
  const addMediaAssets = assets => {
    const selected=Array.isArray(assets)?assets:[assets];
    const next=[...mediaRef.current,...selected.filter(asset=>asset?.url).map(asset=>({
      id:makeId(),title:(asset.displayName||asset.name||'Yeni görsel').replace(/\.[^.]+$/,''),titleEn:'',
      alt:asset.alt||'',altEn:'',image:asset.url,active:false,sortOrder:mediaRef.current.length
    }))];
    mediaRef.current=next;onUpdateMedia(next);
  };

  const columns = [
    {
      key: 'name', label: isMedia ? 'Görsel' : 'Marka', sortValue: item => (isMedia ? item.title : item.name) || '',
      render: item => {
        const title = isMedia ? item.title : item.name;
        const english = isMedia ? item.titleEn : item.nameEn;
        return <div className="table-entity showcase-table-entity">
          {item.image ? <img src={item.image} alt="" onError={event => {event.currentTarget.hidden = true;}} /> : <span className="showcase-table-placeholder" aria-hidden="true">{(title || '•').slice(0, 1).toLocaleUpperCase('tr')}</span>}
          <span><b>{title || (isMedia ? 'Başlıksız görsel' : 'Adsız marka')}</b><small>{english || 'English adı eklenmemiş'}</small></span>
        </div>;
      }
    },
    {
      key: 'destination', label: isMedia ? 'Görsel açıklaması' : 'Tıklama bağlantısı', sortable: false,
      render: item => <span className="showcase-destination">{isMedia ? (item.alt || item.altEn || 'Açıklama eklenmemiş') : (item.url || 'Bağlantı yok')}</span>
    },
    {key: 'active', label: 'Yayın durumu', sortValue: item => (item.active === false ? 1 : 0), render: item => <select className="table-quick-select" aria-label={(isMedia?item.title:item.name||'Kayıt')+' yayın durumu'} value={item.active===false?'draft':'published'} onChange={event=>updateRow(item.id,{active:event.target.value==='published'})}><option value="published">Yayında</option><option value="draft">Taslak</option></select>},
    {
      key: 'order', label: 'Sıra', sortValue: item => item.sortOrder ?? 0,
      render: (item, view) => <AdminOrderButtons label={(isMedia?item.title:item.name)||'Kayıt sırası'} canMoveUp={!view.sorted && !view.filtered && orderedRows[0]?.id !== item.id} canMoveDown={!view.sorted && !view.filtered && orderedRows.at(-1)?.id !== item.id} onMoveUp={() => moveRow(item.id, -1)} onMoveDown={() => moveRow(item.id, 1)} />
    },
    {key: 'actions', label: 'İşlemler', sortable: false, render: item => <RowActions label="Diğer işlemler" items={[{label: item.active === false ? 'Yayına al' : 'Taslağa al', onClick: () => setActive([item], item.active === false)}, {label: 'Sil', variant: 'danger', onClick: () => removeRow(item)}]}><AdminButton size="compact" onClick={() => setSelectedId(item.id)}>Düzenle</AdminButton></RowActions>}
  ];

  const editor = selected && <ContentCard className="showcase-editor">
    <EditorHeading title={isMedia ? selected.title || 'Görseli düzenle' : selected.name || 'Markayı düzenle'} onClose={() => setSelectedId('')} />
    <div className="showcase-editor-layout">
      <div className="showcase-image-editor">
        <div className="showcase-image-preview">
          {selected.image ? <img src={selected.image} alt={isMedia ? selected.alt || selected.title || '' : selected.name || ''} onError={event => {event.currentTarget.hidden = true;}} /> : <span>{isMedia ? 'Görsel seçilmedi' : 'Logo seçilmedi'}</span>}
        </div>
        <div className="showcase-image-actions">
          <MediaPicker filter="image" value={selected.image||''} label={selected.image?'Medya seç / değiştir':'Medya seç'} onSelect={asset=>updateRow(selected.id,{image:asset.url})} />
          <details className="showcase-manual-image"><summary>Görsel adresini elle gir</summary><input aria-label="Görsel adresi" value={selected.image || ''} onChange={event => updateRow(selected.id, {image: event.target.value})} placeholder="/assets/images/logo.svg" /></details>
        </div>
      </div>

      <div className="showcase-editor-fields">
        <div className="subtabs language-tabs" role="tablist" aria-label="İçerik dili">
          <button type="button" role="tab" aria-selected={language === 'tr'} onClick={() => setLanguage('tr')}>Türkçe</button>
          <button type="button" role="tab" aria-selected={language === 'en'} onClick={() => setLanguage('en')}>English</button>
        </div>
        <div className="formgrid showcase-localized-fields">
          <label>{isMedia ? (language === 'en' ? 'English title' : 'Türkçe başlık') : (language === 'en' ? 'English brand name' : 'Türkçe marka adı')}<input value={isMedia ? (selected[language === 'en' ? 'titleEn' : 'title'] || '') : (selected[language === 'en' ? 'nameEn' : 'name'] || '')} onChange={event => updateRow(selected.id, {[isMedia ? (language === 'en' ? 'titleEn' : 'title') : (language === 'en' ? 'nameEn' : 'name')]: event.target.value})} /></label>
          {isMedia
            ? <label>{language === 'en' ? 'English image description' : 'Türkçe görsel açıklaması'}<input value={selected[language === 'en' ? 'altEn' : 'alt'] || ''} onChange={event => updateRow(selected.id, {[language === 'en' ? 'altEn' : 'alt']: event.target.value})} /></label>
            : <label>Logo tıklama bağlantısı<input value={selected.url || ''} onChange={event => updateRow(selected.id, {url: event.target.value})} placeholder="https://marka.com" /><small>Logo tıklanınca açılacak adres. Boş bırakabilirsiniz.</small></label>}
        </div>

        <label className="showcase-publication-field">Yayın durumu<select value={selected.active === false ? 'draft' : 'published'} onChange={event => updateRow(selected.id, {active: event.target.value === 'published'})}><option value="published">Yayında</option><option value="draft">Taslak</option></select><small>Taslak kayıt ziyaretçilere gösterilmez.</small></label>
        <div className="editor-actions"><AdminButton variant="danger" onClick={() => removeRow(selected)}>Kaydı sil</AdminButton><span>Değişiklikler üstteki Kaydet düğmesiyle siteye yansır.</span></div>
      </div>
    </div>
  </ContentCard>;

  return <ContentCard className="showcase-admin">
    <PageHeader eyebrow="SİTE VİTRİNİ" title="Referanslar ve medya" description="Logo ve fotoğrafları tablodan bulun; ayrı düzenleme ekranında dillerini ve yayın durumunu yönetin. Değişiklikler Kaydet ile siteye yansır." />
    <div className="showcase-tabs" role="tablist" aria-label="Vitrin içerikleri">
      <button type="button" role="tab" aria-selected={!isMedia} id="showcase-tab-references" aria-controls="showcase-panel" onClick={() => {setSection('references');setSelectedId('');}}>Referans markaları <span>{references.length}</span></button>
      <button type="button" role="tab" aria-selected={isMedia} id="showcase-tab-media" aria-controls="showcase-panel" onClick={() => {setSection('media');setSelectedId('');}}>Medya galerisi <span>{mediaItems.length}</span></button>
    </div>
    <div id="showcase-panel" role="tabpanel" aria-labelledby={isMedia ? 'showcase-tab-media' : 'showcase-tab-references'}>
      {selected ? editor : <>
        <div className="showcase-toolbar"><div><b>{isMedia ? 'Sitedeki medya görselleri' : 'Uyumlu marka ve referanslar'}</b><small>{isMedia ? 'Fotoğrafları yükleyin; başlık, açıklama ve yayın durumunu düzenleyin.' : 'Logo, tıklama bağlantısı ve görünme sırasını yönetin.'}</small></div>
          <div className="showcase-toolbar-actions">{isMedia && <MediaPicker filter="image" multiple label="＋ Medyadan görsel ekle" onSelect={addMediaAssets} />}<AdminButton variant="primary" onClick={addRow}>{isMedia ? 'Yeni görsel kaydı' : 'Marka ekle'}</AdminButton></div>
        </div>
        <DataTable
          key={section}
          stateKey={'vitrin-' + section}
          selectable
          bulkActions={[{id: 'show', label: 'Yayına al', run: rows => setActive(rows, true)}, {id: 'hide', label: 'Taslağa al', run: rows => setActive(rows, false)}, {id: 'delete', label: 'Sil', variant: 'danger', run: removeRows}]}
          emptyState={{title: isMedia ? 'Henüz galeri görseli yok.' : 'Henüz referans markası yok.', action: {label: isMedia ? 'Yeni görsel kaydı' : 'Marka ekle', onClick: addRow}}}
          rows={orderedRows}
          columns={columns}
          searchKeys={isMedia ? ['title', 'titleEn', 'alt', 'altEn'] : ['name', 'nameEn', 'url']}
          searchLabel={isMedia ? 'Görsel ara' : 'Marka ara'}
          filters={[{key: 'active', label: 'Yayın durumu', allLabel: 'Tüm durumlar', options: [{value: 'true', label: 'Yayında'}, {value: 'false', label: 'Taslak'}]}]}
          emptyMessage={isMedia ? 'Görsel bulunamadı. Yeni görsel yükleyin veya filtreyi temizleyin.' : 'Marka bulunamadı. Yeni marka ekleyerek listeyi oluşturun.'}
        />
      </>}
    </div>
  </ContentCard>;
}
