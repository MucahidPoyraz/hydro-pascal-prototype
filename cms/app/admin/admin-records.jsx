'use client';

import RelationSelect,{BulkCategoryDialog,RelationInlineSelect} from './relation-select.jsx';
import {useRef, useState} from 'react';
import DataTable from './data-table.jsx';
import AdminCatalogEditor from './admin-catalog-editor.jsx';
import AdminRichEditor from './admin-rich-editor.jsx';
import {AdminButton,AdminStatusBadge,ContentCard,PageHeader,RowActions,useAfterRender} from './admin-controls.jsx';
import {MediaPicker} from './admin-media.jsx';
import {PostSeoFields} from './admin-seo-panel.jsx';
import {handleTabKeyDown} from './tab-keyboard.js';
import {normalizeCategoryName as categoryKey} from '../lib/category-utils.js';

const leadStatuses = ['Yeni', 'İşlemde', 'Yanıtlandı', 'Kapatıldı'];
const dateFormatter = new Intl.DateTimeFormat('tr-TR', {dateStyle: 'medium', timeStyle: 'short'});
const statusOptions = [{value: 'true', label: 'Yayında'}, {value: 'false', label: 'Taslak'}];

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

function readableTitle(path) {
  return path.split('/').pop().replace('.html', '').replaceAll('-', ' ');
}

function slugify(value) {
  return String(value || '').toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function blogCategoryValue(item, categories) {
  if (item.lang !== 'en') return item.category || '';
  if (item.categoryEn) return item.categoryEn;
  const key = categoryKey(item.category);
  return categories.find(category => category.scope === 'blog' && [category.name, category.nameEn].some(value => categoryKey(value) === key))?.nameEn || item.category || '';
}

const postUrl = post => `/${post.lang || 'tr'}/blog/${post.slug || 'yeni-yazi'}.html`;
const productPreviewUrl = product => ['hydraulic', 'oem'].includes(product.type || 'hydraulic') ? `/tr/urun-detay.html?id=${encodeURIComponent(product.slug || product.id)}&cmsPreview=view` : '';
const openPreview = url => window.open(url, '_blank', 'noopener');

function StatusTag({children, active = false}) {
  return <AdminStatusBadge status={active?'published':'draft'}>{children}</AdminStatusBadge>;
}

function EditorHeading({eyebrow, title, onClose, actions = null}) {
  return (
    <div className="panelhead editor-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      <div className="admin-heading-actions">{actions}<AdminButton variant="ghost" onClick={onClose}>← Listeye dön</AdminButton></div>
    </div>
  );
}

// Publish state cell shared by products and posts: pending delete, unsaved draft, quick live/draft select.
function PublishCell({item, visible, label, onToggle}) {
  if (item.pendingDelete) return <AdminStatusBadge status="warning">Silme bekliyor</AdminStatusBadge>;
  return <div className="admin-status-cell">
    {item.hasDraft && <AdminStatusBadge status="warning">Yayınlanmamış değişiklik</AdminStatusBadge>}
    <select className="table-quick-select" aria-label={label} value={visible ? 'published' : 'draft'} onChange={event => onToggle(event.target.value === 'published')}><option value="published">Yayında</option><option value="draft">Taslak</option></select>
  </div>;
}

export default function AdminRecords({
  tab,
  seoSettings = {},
  selection = {},
  onSelect,
  products,
  posts,
  categories = [],
  legacyPosts,
  sitePages = {},
  leads,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onAddPost,
  onUpdatePost,
  onDeletePost,
  onPublishContent,
  onSave,
  confirm,
  onBulkLeadStatus,
  onSetLead,
  onReply,
  onManageCategories,
  onSaveCategory,
  onUpload,
  onOpenLegacy
}) {
  // Selection lives in the admin shell so switching tabs (e.g. to Kategoriler) returns to the same editor.
  const selectedProductId = selection.product || '', setSelectedProductId = id => onSelect('product', id);
  const selectedPostId = selection.post || '', setSelectedPostId = id => onSelect('post', id);
  const selectedLeadId = selection.lead || '', setSelectedLeadId = id => onSelect('lead', id);
  const [catalogType, setCatalogType] = useState('hydraulic');
  const [notice, setNotice] = useState('');
  const bulkCategory = useRef(null), bulkTarget = useRef([]);
  const saveAfterRender = useAfterRender(() => onSave?.());
  const product = products.find(item => item.id === selectedProductId);
  const post = posts.find(item => item.id === selectedPostId);
  const lead = leads.find(item => item.id === selectedLeadId);

  const ask = options => confirm ? confirm(options) : Promise.resolve(window.confirm(options.message || options.title) ? 'confirm' : 'cancel');
  const confirmDelete = async (count, noun, extra = '') => (await ask({eyebrow: 'SİLME ONAYI', title: count > 1 ? `${count} ${noun} silinsin mi?` : `${noun[0].toLocaleUpperCase('tr') + noun.slice(1)} silinsin mi?`, message: `Kayıt canlı siteden ve yönetim panelinden kaldırılır. Bu işlem geri alınamaz.${extra}`, actions: [{id: 'cancel', label: 'Vazgeç'}, {id: 'confirm', label: 'Kalıcı olarak sil', variant: 'danger'}]})) === 'confirm';
  const bulkResultNotice = (result, verb) => {
    if (!result) return false;
    const skipped = result.skipped?.length || 0;
    setNotice(`${result.changed} kayıt ${verb}.${skipped ? ` ${skipped} kayıt atlandı (silme bekleyen veya eski statik yazı: yalnızca yayından kaldırılabilir).` : ''}`);
    return true;
  };
  const openBulkCategory = rows => {bulkTarget.current = rows.map(row => row.id); bulkCategory.current.open(rows.length); return false;};
  const noticeBar = notice && <p className="category-form-message" role="status">{notice} <button type="button" className="dt-link" onClick={() => setNotice('')}>Kapat</button></p>;

  if (tab === 'urunler') {
    const catalogTabs = [
      {id: 'hydraulic', label: 'Hidrolik'},
      {id: 'oem', label: 'OEM'},
      {id: 'cast', label: 'PascalCast'},
      {id: 'forge', label: 'PascalForge'}
    ];
    const catalogDescriptions = {
      hydraulic: 'HPL hidrolik ürünlerinizi, ürün kodlarını ve teknik PDF’lerini yönetin.',
      oem: 'Marka uyumlu OEM parçalarını ve teknik ölçülerini yönetin.',
      cast: 'PascalCast döküm ürünlerinizi ve vitrin bilgilerini yönetin.',
      forge: 'PascalForge dövme ürünlerinizi ve vitrin bilgilerini yönetin.'
    };
    const groupLabel = catalogTabs.find(item => item.id === catalogType)?.label;
    const productRows = products.filter(item => (item.type || 'hydraulic') === catalogType);
    const addProduct = () => setSelectedProductId(onAddProduct(catalogType));
    const duplicateProduct = item => {
      const id=onAddProduct(catalogType),suffix=crypto.randomUUID().split('-')[0],base=slugify(item.slug||item.name).slice(0,88)||'urun',prefix={hydraulic:'HPL',oem:'OEM',cast:'PC',forge:'PF'}[catalogType]||'HPL';
      const {hasDraft:_hasDraft,hasPublishedVersion:_hasPublished,pendingDelete:_pendingDelete,previousSlugs:_previousSlugs,updatedAt:_updatedAt,...source}=item;
      onUpdateProduct(id,{...source,id,name:(item.name||'Ürün').slice(0,190)+' (kopya)',nameEn:item.nameEn?item.nameEn.slice(0,190)+' (copy)':'',slug:base+'-kopya-'+suffix,code:prefix+'-'+suffix.toUpperCase(),active:false,sortOrder:0,gallery:(item.gallery||[]).map(photo=>({...photo,id:crypto.randomUUID()})),attachments:(item.attachments||[]).map(file=>({...file,id:crypto.randomUUID()}))});
      setSelectedProductId(id);
    };
    const removeProducts = async rows => {
      if (!rows.length || !await confirmDelete(rows.length, 'ürün')) return false;
      const result = await onPublishContent('products', rows.map(row => row.id), 'delete');
      if (result && rows.some(row => row.id === selectedProductId)) setSelectedProductId('');
      return bulkResultNotice(result, 'silindi');
    };
    const setVisibility = async (rows, visible) => bulkResultNotice(await onPublishContent('products', rows.map(row => row.id), 'visibility', {visible}), visible ? 'yayına alındı' : 'yayından kaldırıldı');
    const publishDrafts = async rows => {
      const drafts = rows.filter(row => row.hasDraft && !row.pendingDelete);
      if (!drafts.length) {setNotice('Seçilen kayıtlarda yayımlanmayı bekleyen değişiklik yok.'); return false;}
      return bulkResultNotice(await onPublishContent('products', drafts.map(row => row.id), 'publish'), 'yayınlandı');
    };
    const categoryOptions = [...new Set([...categories.filter(item=>item.scope==='product').flatMap(item=>[item.name,item.nameEn]),...productRows.flatMap(item=>[item.category,item.categoryEn])].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')).map(value => ({value, label: value}));
    const liveCount = productRows.filter(item => item.active !== false).length;
    const draftCount = productRows.length - liveCount;
    const translatedCount = productRows.filter(item => item.nameEn && item.descriptionEn).length;
    const columns = [
      {
        key: 'name',
        label: 'Ürün',
        render: item => (
          <div className="table-entity">
            <img src={item.image || '/assets/images/hero-hydraulic-cylinder.webp'} alt="" />
            <span><b>{item.name || 'Adsız ürün'}</b><small>{item.nameEn ? `EN · ${item.nameEn}` : 'İngilizce ürün adı eklenmemiş'} · {item.slug || 'sayfa adı belirlenmemiş'}</small></span>
          </div>
        )
      },
      {key: 'code', label: 'Ürün kodu', secondary: true, render: item => <span className="catalog-product-code">{item.code || 'Kod eklenmemiş'}</span>},
      {key: 'category', label: 'Kategori', render:item=><RelationInlineSelect categories={categories} scope="product" record={item} ariaLabel={(item.name||'Ürün')+' kategorisi'} onChange={patch=>onUpdateProduct(item.id,patch)}/>},
      {key: 'active', label: 'Yayın durumu', sortValue: item => (item.active === false ? 1 : 0), render: item => <PublishCell item={item} visible={item.active !== false} label={(item.name||'Ürün')+' yayın durumu'} onToggle={value => onUpdateProduct(item.id,{active:value})}/>},
      {key: 'actions', label: 'İşlemler', sortable: false, render: item => <RowActions label={`“${item.name || 'Ürün'}” için diğer işlemler`} items={[
        {label: item.active === false && item.hasPublishedVersion ? 'Değişikliği uygula' : 'Yayınla', hidden: !item.hasDraft || item.pendingDelete, onClick: () => onPublishContent('products', item.id, item.active === false && item.hasPublishedVersion ? 'apply' : 'publish')},
        {label: 'Yayına al', hidden: item.active !== false || item.hasDraft || item.pendingDelete, onClick: () => setVisibility([item], true)},
        {label: 'Yayından kaldır', hidden: item.active === false || item.pendingDelete, onClick: () => setVisibility([item], false)},
        {label: 'Silme işlemini geri al', hidden: !item.pendingDelete, onClick: () => onUpdateProduct(item.id, {pendingDelete: false, hasDraft: false})},
        {label: 'Önizle ↗', hidden: !productPreviewUrl(item), onClick: () => openPreview(productPreviewUrl(item))},
        {label: 'Kopyala', onClick: () => duplicateProduct(item)},
        {label: 'Sil', variant: 'danger', onClick: () => removeProducts([item])}
      ]}><AdminButton size="compact" onClick={() => setSelectedProductId(item.id)}>Düzenle</AdminButton></RowActions>}
    ];

    return (
      <div className="record-workspace">
        {!product && <ContentCard className="products-panel">
          <PageHeader eyebrow="ÜRÜN KATALOĞU" title="Ürünlerinizi yönetin" description="Ürün grubu seçin, kayıtları arayın ve düzenlemek istediğiniz ürünü açın." actions={<><AdminButton onClick={onManageCategories}>Kategorileri yönet</AdminButton><AdminButton variant="primary" onClick={addProduct}>＋ {groupLabel} ekle</AdminButton></>} />
          <div className="catalog-type-tabs" role="tablist" aria-label="Ürün grubu">
            {catalogTabs.map(item => <button type="button" key={item.id} id={'catalog-type-tab-' + item.id} role="tab" aria-selected={catalogType === item.id} aria-controls="catalog-products-panel" tabIndex={catalogType === item.id ? 0 : -1} onKeyDown={event => handleTabKeyDown(event, catalogTabs, catalogType, setCatalogType, 'catalog-type-tab-')} onClick={() => setCatalogType(item.id)}><span>{item.label}</span><b>{products.filter(product => (product.type || 'hydraulic') === item.id).length}</b></button>)}
          </div>
          <div className="product-group-summary" id="catalog-products-panel" role="tabpanel" aria-labelledby={'catalog-type-tab-' + catalogType}>
            <div className="product-group-description"><span>SEÇİLİ ÜRÜN GRUBU</span><h4>{groupLabel}</h4><p>{catalogDescriptions[catalogType]}</p></div>
            <div className="product-group-stats"><div><b>{productRows.length}</b><span>Toplam</span></div><div><b>{liveCount}</b><span>Yayında</span></div><div><b>{draftCount}</b><span>Taslak</span></div><div><b>{productRows.length - translatedCount}</b><span>Çeviri eksik</span></div></div>
          </div>
          {noticeBar}
          <DataTable
            key={catalogType}
            stateKey={'urun-' + catalogType}
            rows={productRows}
            columns={columns}
            defaultSort={{key: 'name', direction: 'asc'}}
            searchKeys={['name', 'nameEn', 'slug', 'code', 'category', 'categoryEn', 'description', 'descriptionEn', 'oemCode']}
            searchLabel="Ürün ara"
            filters={[
              {key: 'active', label: 'Yayın durumu', allLabel: 'Tüm durumlar', options: statusOptions},
              {key: 'category', label: 'Kategori', allLabel: 'Tüm kategoriler', options: categoryOptions, match: (row, value) => row.category === value || row.categoryEn === value},
              {key: 'hasDraft', label: 'Yayın bekleyen değişiklik', allLabel: 'Tüm kayıtlar', options: [{value: 'true', label: 'Yayın bekleyen'}], match: row => Boolean(row.hasDraft)}
            ]}
            selectable
            bulkActions={[
              {id: 'publish', label: 'Değişiklikleri yayınla', variant: 'primary', run: publishDrafts},
              {id: 'show', label: 'Yayına al', run: rows => setVisibility(rows, true)},
              {id: 'hide', label: 'Yayından kaldır', run: rows => setVisibility(rows, false)},
              {id: 'category', label: 'Kategori değiştir', run: openBulkCategory},
              {id: 'delete', label: 'Sil', variant: 'danger', run: removeProducts}
            ]}
            emptyState={{title: `${groupLabel} grubunda henüz ürün yok.`, action: {label: `＋ ${groupLabel} ekle`, onClick: addProduct}}}
          />
          <BulkCategoryDialog dialogRef={bulkCategory} categories={categories} scope="product" onSave={onSaveCategory} onApply={patch => {bulkTarget.current.forEach(id => onUpdateProduct(id, patch)); saveAfterRender(); setNotice(`${bulkTarget.current.length} ürünün kategorisi değiştirildi ve taslak olarak kaydediliyor. Canlıya almak için “Değişiklikleri yayınla”.`);}}/>
        </ContentCard>}

        {product && <AdminCatalogEditor product={product} categories={categories} seoSettings={seoSettings} onSaveCategory={onSaveCategory} onUpdate={onUpdateProduct} onDelete={item => removeProducts([item])} onPublishContent={onPublishContent} onUpload={onUpload} onPreview={productPreviewUrl(product) ? () => openPreview(productPreviewUrl(product)) : null} onClose={() => setSelectedProductId('')} />}
      </div>
    );
  }

  if (tab === 'blog') {
    const addPost = () => setSelectedPostId(onAddPost());
    const duplicatePost = item => {
      const {categoryFilter:_categoryFilter,legacy:_legacy,legacyPath:_legacyPath,sourceHash:_sourceHash,legacySourceContentHash:_legacySourceContentHash,canonical:_canonical,translationId:_translationId,previousSlugs:_previousSlugs,updatedAt:_updatedAt,hasDraft:_hasDraft,hasPublishedVersion:_hasPublished,pendingDelete:_pendingDelete,...source}=item;
      const id=onAddPost(),suffix=crypto.randomUUID().split('-')[0],base=slugify(item.slug||item.title).slice(0,88)||'yazi';
      onUpdatePost(id,{...source,id,title:(item.title||'Blog yazısı').slice(0,190)+' (kopya)',slug:base+'-kopya-'+suffix,published:false});
      setSelectedPostId(id);
    };
    const managedRoutes = new Set(posts.filter(item => item.legacyPath).map(item => item.legacyPath));
    const legacyRows = legacyPosts.filter(path => !managedRoutes.has(path)).map(path => {
      const page = sitePages[path] || {};
      const title = page['hero-1']?.title || readableTitle(path).replace(/\b\w/g, letter => letter.toLocaleUpperCase('tr'));
      return {id: path, path, slug: path.split('/').pop().replace('.html', ''), title, lang: path.startsWith('en/') ? 'en' : 'tr', published: true, legacy: true};
    });
    const cmsIds = new Set(posts.map(item => item.id));
    const managedOnly = rows => rows.filter(row => cmsIds.has(row.id));
    const removePosts = async rows => {
      const targets = managedOnly(rows);
      if (!targets.length) {setNotice('Seçilen yazılar statik sayfalardan geliyor; içerik düzenleyicisinden yönetilir.'); return false;}
      const legacyCount = targets.filter(row => row.legacy).length;
      if (!await confirmDelete(targets.length, 'yazı', legacyCount ? `\n${legacyCount} eski yazının adresi korunur; bu yazılar silinmez, yayından kaldırılır.` : '')) return false;
      const result = await onPublishContent('posts', targets.map(row => row.id), 'delete');
      if (result && targets.some(row => row.id === selectedPostId)) setSelectedPostId('');
      return bulkResultNotice(result, 'silindi veya yayından kaldırıldı');
    };
    const setVisibility = async (rows, visible) => {
      const targets = managedOnly(rows);
      if (!targets.length) return false;
      return bulkResultNotice(await onPublishContent('posts', targets.map(row => row.id), 'visibility', {visible}), visible ? 'yayına alındı' : 'yayından kaldırıldı');
    };
    const publishDrafts = async rows => {
      const drafts = managedOnly(rows).filter(row => row.hasDraft && !row.pendingDelete);
      if (!drafts.length) {setNotice('Seçilen yazılarda yayımlanmayı bekleyen değişiklik yok.'); return false;}
      return bulkResultNotice(await onPublishContent('posts', drafts.map(row => row.id), 'publish'), 'yayınlandı');
    };
    const categoryOptionsFor = language => [...new Set([
      ...categories.filter(item=>item.scope==='blog').map(item=>language==='en'?(item.nameEn||item.name):(item.name)),
      ...posts.filter(item=>(item.lang||'tr')===language).map(item=>language==='en'?blogCategoryValue(item,categories):(item.category||''))
    ].filter(Boolean))].sort((a,b)=>a.localeCompare(b,language==='en'?'en':'tr'));
    const blogCategoryOptions=[...new Set([...categoryOptionsFor('tr'),...categoryOptionsFor('en')])].sort((a,b)=>a.localeCompare(b,'tr'));
    const blogRows = [...posts.map(item=>({...item,categoryFilter:blogCategoryValue(item,categories)})), ...legacyRows.map(item=>({...item,categoryFilter:''}))];
    const columns = [
      {key: 'title', label: 'Yazı', render: item => <span className="table-primary-text table-entity">{(!item.legacy || item.legacyPath) && <img src={item.image || '/assets/images/hero-hydraulic-cylinder.webp'} alt="" onError={event => {event.currentTarget.src = '/assets/images/hero-hydraulic-cylinder.webp'}} />}<span><b>{item.title || 'Başlıksız yazı'}</b><small>{item.legacyPath ? '/' + item.legacyPath : item.legacy ? '/' + item.path : postUrl(item)}</small></span></span>},
      {key: 'categoryFilter', label: 'Kategori', render:item=>item.legacy&&!item.legacyPath?(item.categoryFilter||'—'):<RelationInlineSelect categories={categories} scope="blog" language={item.lang||'tr'} record={item} ariaLabel={(item.title||'Yazı')+' kategorisi'} onChange={patch=>onUpdatePost(item.id,patch)}/>},
      {key: 'lang', label: 'Dil', secondary: true, render: item => item.lang === 'en' ? 'English' : 'Türkçe'},
      {key: 'date', label: 'Yayın tarihi', secondary: true, sortValue:item=>new Date(item.date||item.createdAt||0).getTime()||0, render:item=>{const value=item.date||item.createdAt;return value?new Date(value).toLocaleDateString('tr-TR'): '—';}},
      {key: 'published', label: 'Durum', sortValue: item => (item.published === false ? 1 : 0), render: item => item.legacy&&!item.legacyPath?<StatusTag active>Mevcut sayfada</StatusTag>:<PublishCell item={item} visible={item.published !== false} label={(item.title||'Yazı')+' yayın durumu'} onToggle={value => onUpdatePost(item.id,'published',value)}/>},
      {key: 'actions', label: 'İşlemler', sortable: false, render: item => item.legacy&&!item.legacyPath ? <AdminButton size="compact" onClick={() => onOpenLegacy(item.path)}>İçeriği düzenle</AdminButton> : <RowActions label={`“${item.title || 'Yazı'}” için diğer işlemler`} items={[
        {label: item.published === false && item.hasPublishedVersion ? 'Değişikliği uygula' : 'Yayınla', hidden: !item.hasDraft || item.pendingDelete, onClick: () => onPublishContent('posts', item.id, item.published === false && item.hasPublishedVersion ? 'apply' : 'publish')},
        {label: 'Yayına al', hidden: item.published !== false || item.hasDraft || item.pendingDelete, onClick: () => setVisibility([item], true)},
        {label: 'Yayından kaldır', hidden: item.published === false || item.pendingDelete, onClick: () => setVisibility([item], false)},
        {label: 'Silme işlemini geri al', hidden: !item.pendingDelete, onClick: () => onUpdatePost(item.id, {pendingDelete: false, hasDraft: false})},
        {label: 'Önizle ↗', onClick: () => openPreview(postUrl(item) + '?cmsPreview=view')},
        {label: 'Kopyala', onClick: () => duplicatePost(item)},
        {label: item.legacy ? 'Yayından kaldır (eski yazı)' : 'Sil', hidden: item.legacy && item.published === false, variant: 'danger', onClick: () => removePosts([item])}
      ]}><AdminButton size="compact" onClick={() => setSelectedPostId(item.id)}>Düzenle</AdminButton></RowActions>}
    ];

    return (
      <div className="record-workspace">
        {!post && <ContentCard>
          <PageHeader eyebrow="BLOG YÖNETİMİ" title="Tüm yazılar" count={blogRows.length} description="Yeni yazılar ve içe aktarılan eski site yazıları tek listede; adresleri korunur." actions={<><AdminButton onClick={onManageCategories}>Kategorileri yönet</AdminButton><AdminButton variant="primary" onClick={addPost}>＋ Yeni yazı</AdminButton></>} />
          {noticeBar}
          <DataTable
            stateKey="blog"
            rows={blogRows}
            columns={columns}
            defaultSort={{key: 'date', direction: 'desc'}}
            searchKeys={['title', 'slug', 'categoryFilter', 'path', 'excerpt']}
            searchLabel="Yazı ara"
            filters={[
              {key: 'lang', label: 'Dil', allLabel: 'Tüm diller', options: [{value: 'tr', label: 'Türkçe'}, {value: 'en', label: 'English'}], match: (row, value) => (row.lang || 'tr') === value},
              {key: 'categoryFilter', label: 'Kategori', allLabel: 'Tüm kategoriler', options: blogCategoryOptions.map(value=>({value,label:value}))},
              {key: 'published', label: 'Yayın durumu', allLabel: 'Tüm durumlar', options: statusOptions},
              {key: 'hasDraft', label: 'Yayın bekleyen değişiklik', allLabel: 'Tüm kayıtlar', options: [{value: 'true', label: 'Yayın bekleyen'}], match: row => Boolean(row.hasDraft)}
            ]}
            selectable
            bulkActions={[
              {id: 'publish', label: 'Değişiklikleri yayınla', variant: 'primary', run: publishDrafts},
              {id: 'show', label: 'Yayına al', run: rows => setVisibility(rows, true)},
              {id: 'hide', label: 'Yayından kaldır', run: rows => setVisibility(rows, false)},
              {id: 'category', label: 'Kategori değiştir', run: rows => {const targets = managedOnly(rows); return targets.length ? openBulkCategory(targets) : false;}},
              {id: 'delete', label: 'Sil', variant: 'danger', run: removePosts}
            ]}
            emptyState={{title: 'Henüz blog yazısı yok.', action: {label: '＋ Yeni yazı', onClick: addPost}}}
          />
          <BulkCategoryDialog dialogRef={bulkCategory} categories={categories} scope="blog" onSave={onSaveCategory} onApply={patch => {bulkTarget.current.forEach(id => onUpdatePost(id, patch)); saveAfterRender(); setNotice(`${bulkTarget.current.length} yazının kategorisi değiştirildi ve taslak olarak kaydediliyor. Canlıya almak için “Değişiklikleri yayınla”.`);}}/>
        </ContentCard>}

        {post && (
          <ContentCard className="editor-panel">
            <EditorHeading eyebrow="BLOG YAZISI" title={post.title || 'Yeni yazı'} onClose={() => setSelectedPostId('')} actions={<><AdminButton onClick={() => openPreview(postUrl(post) + '?cmsPreview=view')} title="Kaydedilmiş taslağı yeni sekmede açar">Önizle ↗</AdminButton><AdminButton variant="ghost" onClick={() => duplicatePost(post)}>Kopyala</AdminButton></>} />
            <div className="formgrid">
              <label>Yazı başlığı<input value={post.title || ''} onChange={event => onUpdatePost(post.id, 'title', event.target.value)} /></label>
              <label>Sayfa kısa adı<input value={post.slug || ''} readOnly={Boolean(post.legacyPath)} onChange={event => onUpdatePost(post.id, 'slug', event.target.value)} onBlur={event => onUpdatePost(post.id, 'slug', slugify(event.target.value))} /><small>{post.legacyPath ? 'Mevcut bağlantı korunur.' : 'Küçük harf, rakam ve tire kullanın.'}</small></label>
              <RelationSelect categories={categories} scope="blog" language={post.lang||'tr'} record={post} onChange={patch=>onUpdatePost(post.id,patch)} onSave={onSaveCategory}/>
              <label>Dil ve yayın durumu<div className="inline"><select value={post.lang || 'tr'} disabled={Boolean(post.legacyPath)} onChange={event => onUpdatePost(post.id, 'lang', event.target.value)}><option value="tr">Türkçe</option><option value="en">English</option></select><select value={post.published === false ? 'draft' : 'published'} onChange={event => onUpdatePost(post.id, 'published', event.target.value === 'published')}><option value="published">Yayında</option><option value="draft">Taslak</option></select></div></label>
              <label>Yayın tarihi<input type="date" value={post.date || ''} onChange={event => onUpdatePost(post.id, 'date', event.target.value)} /></label>
              <label>Yazı özeti<textarea rows="3" value={post.excerpt || ''} onChange={event => onUpdatePost(post.id, 'excerpt', event.target.value)} /></label>
              <label>Kapak görseli<input value={post.image || ''} onChange={event => onUpdatePost(post.id, 'image', event.target.value)} placeholder="Medya dosyası adresi"/><MediaPicker filter="image" value={post.image||''} label="Medya kütüphanesinden seç" onSelect={asset=>onUpdatePost(post.id,'image',asset.url)} /></label>
              <div className="media-preview media-preview-inline"><span>Blog görseli</span><img src={post.image || '/assets/images/hero-hydraulic-cylinder.webp'} alt={post.title || 'Blog görseli'} onError={event => {event.currentTarget.src = '/assets/images/hero-hydraulic-cylinder.webp'}} /></div>
              <details className="wide blog-seo-fields"><summary>SEO ve paylaşım</summary><PostSeoFields post={post} posts={posts} settings={seoSettings} category={blogCategoryValue(post, categories)} onUpdate={(key, value) => onUpdatePost(post.id, key, value)} /></details>
              <div className="wide"><AdminRichEditor value={post.content || ''} onChange={value => onUpdatePost(post.id, 'content', value)} /></div>
            </div>
            <div className="editor-actions"><AdminButton variant="danger" onClick={() => removePosts([post])}>{post.legacyPath?'Yayından kaldır':'Yazıyı sil'}</AdminButton><span>{post.hasDraft?'Taslak değişiklikleri kaydedildi; canlı site, yayınlayana kadar eski içeriği gösterir.':'Değişiklikler önce taslak olarak kaydedilir.'}</span>{post.hasDraft&&<AdminButton variant="primary" onClick={()=>onPublishContent('posts',post.id,post.published===false&&post.hasPublishedVersion?'apply':'publish')}>{post.published===false&&post.hasPublishedVersion?'Değişikliği uygula':'Yayınla'}</AdminButton>}</div>
          </ContentCard>
        )}

      </div>
    );
  }

  if (tab === 'talepler') {
    const bulkStatus = status => ({id: 'status-' + status, label: `“${status}” yap`, run: rows => onBulkLeadStatus(rows.map(row => row.id), status)});
    const columns = [
      {key: 'name', label: 'Müşteri', render: item => <span className="table-customer"><b>{item.name || 'İsimsiz ziyaretçi'}</b><small>{item.company || 'Şirket belirtilmemiş'}</small></span>},
      {key: 'type', label: 'Talep türü', render: item => ({quote: 'Teklif', sample: 'Numune', contact: 'İletişim'}[item.type] || 'Diğer')},
      {key: 'email', label: 'İletişim', secondary: true, render: item => <a className="table-email" href={'mailto:' + item.email}>{item.email || 'E-posta yok'}</a>},
      {key: 'createdAt', label: 'Geliş zamanı', sortValue: item => new Date(item.createdAt).getTime() || 0, render: item => formatDate(item.createdAt)},
      {key: 'status', label: 'Durum', render: item => <select aria-label={(item.name || 'Talep') + ' durumu'} value={item.status || 'Yeni'} onChange={event => onSetLead(item.id, event.target.value)}>{leadStatuses.map(status => <option key={status}>{status}</option>)}</select>},
      {key: 'actions', label: 'İşlemler', sortable: false, render: item => <RowActions label={`${item.name || 'Talep'} için diğer işlemler`} items={[{label: 'E-posta yanıtı hazırla ↗', onClick: () => onReply(item)}]}><AdminButton size="compact" onClick={() => setSelectedLeadId(item.id)}>İncele</AdminButton></RowActions>}
    ];

    return (
      <div className="record-workspace">
        {!lead && <ContentCard>
          <PageHeader eyebrow="TALEP TAKİBİ" title="Teklif ve iletişim talepleri" count={leads.length} description="Web sitesindeki formlardan gelen talepler; durumlarını tek tek veya toplu güncelleyin." />
          <DataTable
            stateKey="talepler"
            rows={leads}
            columns={columns}
            defaultSort={{key: 'createdAt', direction: 'desc'}}
            searchKeys={['name', 'company', 'email', 'phone', 'subject', 'message']}
            searchLabel="Müşteri veya talep ara"
            filters={[
              {key: 'status', label: 'Talep durumu', allLabel: 'Tüm talepler', options: leadStatuses.map(status => ({value: status, label: status})), match: (row, value) => (row.status || 'Yeni') === value},
              {key: 'type', label: 'Talep türü', allLabel: 'Tüm türler', options: [{value: 'quote', label: 'Teklif'}, {value: 'sample', label: 'Numune'}, {value: 'contact', label: 'İletişim'}]}
            ]}
            selectable
            bulkActions={leadStatuses.filter(status => status !== 'Yeni').map(bulkStatus)}
            emptyState={{title: 'Henüz talep yok.', description: 'Web sitesindeki formlar gönderildikçe burada görünecek.'}}
          />
        </ContentCard>}

        {lead && (
          <ContentCard className="editor-panel lead-detail-panel">
            <EditorHeading eyebrow="TALEP AYRINTISI" title={lead.name || 'İsimsiz ziyaretçi'} onClose={() => setSelectedLeadId('')} />
            <div className="lead-detail-top">
              <span>{lead.company || 'Şirket belirtilmemiş'}</span>
              <span>{formatDate(lead.createdAt)}</span>
              <label>Durum<select value={lead.status || 'Yeni'} onChange={event => onSetLead(lead.id, event.target.value)}>{leadStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
            </div>
            <div className="lead-detail-contact">
              <a href={'mailto:' + lead.email}>{lead.email || 'E-posta yok'}</a>
              {lead.phone && <a href={'tel:' + lead.phone}>{lead.phone}</a>}
            </div>
            {lead.subject && <h4>{lead.subject}</h4>}
            <p className="lead-detail-message">{lead.message || 'Mesaj eklenmemiş.'}</p>
            {lead.fields && Object.keys(lead.fields).length > 0 && <details className="lead-extra"><summary>Form yanıtlarının tamamı ({Object.keys(lead.fields).length})</summary><dl>{Object.entries(lead.fields).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>}
            {lead.attachments?.length > 0 && <div className="lead-attachments"><b>Ekli dosyalar</b>{lead.attachments.map(file => <a key={file.id} href={'/api/attachment/' + encodeURIComponent(file.id)}>📎 {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)</a>)}</div>}
            <div className="lead-detail-footer"><AdminButton variant="primary" onClick={() => onReply(lead)}>E-posta yanıtı hazırla ↗</AdminButton><span>{lead.emailStatus || 'E-posta durumu bilgisi yok'}</span></div>
          </ContentCard>
        )}
      </div>
    );
  }

  return null;
}
