'use client';

import RelationSelect from './relation-select.jsx';
import {useEffect, useRef, useState} from 'react';
import {handleTabKeyDown} from './tab-keyboard.js';
import {MediaPicker} from './admin-media.jsx';
import {AdminButton} from './admin-controls.jsx';
import {ProductSeoFields} from './admin-seo-panel.jsx';

const sections = [
  {id: 'basics', label: 'Ürün bilgisi'},
  {id: 'technical', label: 'Teknik detaylar'},
  {id: 'files', label: 'Görseller ve PDF'},
  {id: 'seo', label: 'SEO'}
];

const typeLabels = {hydraulic: 'Hidrolik ürün', oem: 'OEM parça', cast: 'PascalCast', forge: 'PascalForge'};

function Field({label, children, className = ''}) {
  return <label className={className}>{label}{children}</label>;
}

export default function AdminCatalogEditor({product, categories=[], seoSettings={}, onSaveCategory, onUpdate, onDelete, onPublishContent, onUpload, onPreview, onClose}) {
  const [section, setSection] = useState('basics');
  const [language, setLanguage] = useState('tr');
  const english = language === 'en';
  const update = (key, value) => onUpdate(product.id, key, value);
  const localized = key => `${key}${english ? 'En' : ''}`;
  const setLocalized = (key, value) => update(localized(key), value);
  const type = product.type || 'hydraulic';
  const attachments = Array.isArray(product.attachments) ? product.attachments : [];
  const gallery = Array.isArray(product.gallery) ? product.gallery : [];
  const galleryRef = useRef(gallery);
  useEffect(() => {galleryRef.current = gallery;}, [product.id, gallery]);

  const addAttachments = assets => {
    const selected=Array.isArray(assets)?assets:[assets];
    const next=[...attachments,...selected.filter(asset=>asset?.url&&!attachments.some(item=>item.url===asset.url)).map(asset=>({id:crypto.randomUUID(),name:asset.name||asset.displayName||asset.url.split('/').pop(),url:asset.url}))];
    update('attachments',next);
  };

  return (
    <section className="panel editor-panel catalog-editor">
      <div className="panelhead editor-heading">
        <div><span className="eyebrow">{typeLabels[type] || 'Katalog kaydı'}</span><h3>{product.name || 'Yeni kayıt'}</h3></div>
        <div className="admin-heading-actions">{onPreview && <AdminButton onClick={onPreview} title="Kaydedilmiş taslağı yeni sekmede açar">Önizle ↗</AdminButton>}<AdminButton variant="ghost" onClick={onClose}>← Listeye dön</AdminButton></div>
      </div>

      <div className="editor-subhead">
        <div className="subtabs" role="tablist" aria-label="Katalog düzenleme bölümleri">
          {sections.map(item => <button type="button" key={item.id} id={`catalog-edit-tab-${item.id}`} role="tab" aria-selected={section === item.id} aria-controls="catalog-edit-panel" tabIndex={section === item.id ? 0 : -1} onKeyDown={event => handleTabKeyDown(event, sections, section, setSection, 'catalog-edit-tab-')} onClick={() => setSection(item.id)}>{item.label}</button>)}
        </div>
        {['basics','technical','files','seo'].includes(section) && <div className="subtabs language-tabs" role="group" aria-label="Ürün dili">
          <button type="button" aria-pressed={!english} onClick={() => setLanguage('tr')}>Türkçe</button>
          <button type="button" aria-pressed={english} onClick={() => setLanguage('en')}>English</button>
        </div>}
      </div>

      <div role="tabpanel" id="catalog-edit-panel" aria-labelledby={`catalog-edit-tab-${section}`} className="catalog-edit-content">
        {section === 'basics' && <div className="formgrid">
          <Field label={english ? 'Name in English' : 'Türkçe ürün adı'}><input autoFocus value={product[localized('name')] || ''} onChange={event => setLocalized('name', event.target.value)} placeholder={english ? 'Product name' : 'Örnek: Çift etkili silindir'} /></Field>
          <RelationSelect categories={categories} scope="product" language={language} record={product} onChange={patch=>onUpdate(product.id,patch)} onSave={onSaveCategory}/>
          <Field label="Ürün / OEM kodu"><input value={product.code || ''} onChange={event => update('code', event.target.value)} placeholder="Örnek: HPL-120" /></Field>
          <Field label="Sayfa kısa adı"><input value={product.slug || ''} onChange={event => update('slug', event.target.value)} placeholder="urun-adi" /></Field>
          <Field label={english ? 'Short description' : 'Kısa açıklama'} className="wide"><textarea rows="4" value={product[localized('description')] || ''} onChange={event => setLocalized('description', event.target.value)} placeholder={english ? 'A short product summary' : 'Ürünü müşteriye kısaca anlatın'} /></Field>
          <Field label={english ? 'Detail page title' : 'Detay sayfası başlığı'}><input value={product[localized('detailTitle')] || ''} onChange={event => setLocalized('detailTitle', event.target.value)} placeholder={product[localized('name')] || product.name || ''} /></Field>
          <Field label="Yayın durumu"><select value={product.active === false ? 'draft' : 'active'} onChange={event => update('active', event.target.value === 'active')}><option value="draft">Taslak</option><option value="active">Yayında</option></select></Field>
          <Field label="Vitrin sırası"><input type="number" min="0" value={product.sortOrder ?? 0} onChange={event => update('sortOrder', Number(event.target.value) || 0)} /></Field>
        </div>}

        {section === 'technical' && <div className="formgrid">
          <Field label="OEM seri kodu"><input value={product.oemCode || ''} onChange={event => update('oemCode', event.target.value)} placeholder="Örnek: T06xx serisi" /></Field>
          <Field label={english ? 'Technical note in English' : 'Ölçü notu'}><input value={product[localized('dimensionNote')] || ''} onChange={event => setLocalized('dimensionNote', event.target.value)} placeholder={english ? 'Model dependent dimensions' : 'Ölçüler modele göre değişir'} /></Field>
          <section className="catalog-matrix wide">
            <div className="catalog-matrix-heading"><div><h4>Teknik ölçü tablosu</h4><p>Her ölçüyü kendi satırında girin; boş hücreler müşteriye gösterilmez.</p></div><button type="button" className="smallprimary" onClick={() => update('dimensionRows', [...(product.dimensionRows || []), {label:'',value:'',labelEn:'',valueEn:''}])}>＋ Ölçü satırı</button></div>
            <div className="catalog-matrix-table" role="table" aria-label="Teknik ölçüler"><div className="catalog-matrix-head" role="row"><span role="columnheader">{english?'Dimension':'Ölçü adı'}</span><span role="columnheader">{english?'Value':'Ölçü değeri'}</span><span role="columnheader">İşlem</span></div>
              {(product.dimensionRows || []).map((row,index) => <div className="catalog-matrix-row" role="row" key={index}><input aria-label={(english?'Dimension':'Ölçü adı')+' '+(index+1)} placeholder={english?'Length':'Örn. Boy'} value={english?(row.labelEn||''):(row.label||'')} onChange={event => {const rows=[...(product.dimensionRows||[])];rows[index]={...rows[index],[english?'labelEn':'label']:event.target.value};update('dimensionRows',rows);}}/><input aria-label={(english?'Value':'Ölçü değeri')+' '+(index+1)} placeholder={english?'455–965 mm':'455–965 mm'} value={english?(row.valueEn||''):(row.value||'')} onChange={event => {const rows=[...(product.dimensionRows||[])];rows[index]={...rows[index],[english?'valueEn':'value']:event.target.value};update('dimensionRows',rows);}}/><button type="button" className="delete" aria-label={'Ölçü satırı '+(index+1)+' sil'} onClick={() => update('dimensionRows',(product.dimensionRows||[]).filter((_,rowIndex)=>rowIndex!==index))}>Sil</button></div>)}
              {!(product.dimensionRows||[]).length && <p className="catalog-matrix-empty">Henüz ölçü satırı yok. “Ölçü satırı” ile başlayın.</p>}
            </div>
          </section>
          {Array.isArray(product.dimensionGroups) && product.dimensionGroups.length > 0 && <section className="catalog-matrix wide"><div className="catalog-matrix-heading"><div><h4>Gruplanmış ölçüler</h4><p>Ürüne özgü ölçü grupları</p></div><button type="button" className="smallprimary" onClick={() => update('dimensionGroups',[...product.dimensionGroups,{title:'',rows:[{label:'',value:''}]}])}>＋ Grup ekle</button></div>
            {product.dimensionGroups.map((group,groupIndex)=><div className="catalog-dimension-group" key={groupIndex}><div className="catalog-dimension-group-title"><input aria-label="Ölçü grubu adı" placeholder="Örn. Çatal Tip" value={english?(group.titleEn||''):(group.title||'')} onChange={event=>{const groups=[...product.dimensionGroups];groups[groupIndex]={...groups[groupIndex],[english?'titleEn':'title']:event.target.value};update('dimensionGroups',groups);}}/><button type="button" className="delete" onClick={()=>update('dimensionGroups',product.dimensionGroups.filter((_,i)=>i!==groupIndex))}>Grubu sil</button></div>
              {(group.rows||[]).map((row,rowIndex)=><div className="catalog-matrix-row" key={rowIndex}><input aria-label="Ölçü adı" value={english?(row.labelEn||''):(row.label||'')} placeholder="Ölçü adı" onChange={event=>{const groups=[...product.dimensionGroups];const rows=[...(groups[groupIndex].rows||[])];rows[rowIndex]={...rows[rowIndex],[english?'labelEn':'label']:event.target.value};groups[groupIndex]={...groups[groupIndex],rows};update('dimensionGroups',groups);}}/><input aria-label="Ölçü değeri" value={english?(row.valueEn||''):(row.value||'')} placeholder="Ölçü değeri" onChange={event=>{const groups=[...product.dimensionGroups];const rows=[...(groups[groupIndex].rows||[])];rows[rowIndex]={...rows[rowIndex],[english?'valueEn':'value']:event.target.value};groups[groupIndex]={...groups[groupIndex],rows};update('dimensionGroups',groups);}}/><button type="button" className="delete" onClick={()=>{const groups=[...product.dimensionGroups];groups[groupIndex]={...groups[groupIndex],rows:groups[groupIndex].rows.filter((_,i)=>i!==rowIndex)};update('dimensionGroups',groups);}}>Sil</button></div>)}
              <button type="button" className="text-action" onClick={()=>{const groups=[...product.dimensionGroups];groups[groupIndex]={...groups[groupIndex],rows:[...(groups[groupIndex].rows||[]),{label:'',value:'',labelEn:'',valueEn:''}]};update('dimensionGroups',groups);}}>＋ Bu gruba ölçü ekle</button>
            </div>)}
          </section>}
          <section className="catalog-matrix wide"><div className="catalog-matrix-heading"><div><h4>Uyumlu marka ve modeller</h4><p>OEM ürününde marka-model listesi ayrı satırlarda görünür.</p></div><button type="button" className="smallprimary" onClick={() => update('compatibleBrands',[...(product.compatibleBrands||[]),{brand:'',model:'',brandEn:'',modelEn:''}])}>＋ Marka ekle</button></div>
            <div className="catalog-matrix-table"><div className="catalog-matrix-head" role="row"><span role="columnheader">Marka</span><span role="columnheader">Model</span><span role="columnheader">İşlem</span></div>
              {(product.compatibleBrands||[]).map((row,index)=><div className="catalog-matrix-row" key={index}><input aria-label={'Marka '+(index+1)} placeholder="Massey Ferguson" value={english?(row.brandEn||''):(row.brand||'')} onChange={event=>{const rows=[...product.compatibleBrands];rows[index]={...rows[index],[english?'brandEn':'brand']:event.target.value};update('compatibleBrands',rows);}}/><input aria-label={'Model '+(index+1)} placeholder="285" value={english?(row.modelEn||''):(row.model||'')} onChange={event=>{const rows=[...product.compatibleBrands];rows[index]={...rows[index],[english?'modelEn':'model']:event.target.value};update('compatibleBrands',rows);}}/><button type="button" className="delete" aria-label={'Marka '+(index+1)+' sil'} onClick={()=>update('compatibleBrands',product.compatibleBrands.filter((_,rowIndex)=>rowIndex!==index))}>Sil</button></div>)}
              {!(product.compatibleBrands||[]).length&&<p className="catalog-matrix-empty">Henüz uyumlu marka eklenmedi.</p>}
            </div>
          </section>
        </div>}

        {section === 'files' && <div className="file-editor-grid">
          <div className="formgrid">
            <Field label="Ana kart görseli"><input value={product.image || ''} onChange={event => update('image', event.target.value)} placeholder="/assets/images/urun.webp" /><MediaPicker filter="image" value={product.image||''} label="Medya kütüphanesinden seç" onSelect={asset=>update('image',asset.url)} /></Field>
            <div className="media-preview media-preview-inline"><span>Ana görsel önizlemesi</span><img src={product.image || '/assets/images/hero-hydraulic-cylinder.webp'} alt={product.name || 'Ürün görseli'} onError={event => {event.currentTarget.src = '/assets/images/hero-hydraulic-cylinder.webp'}} /></div>
            <section className="product-gallery-manager wide"><div className="catalog-matrix-heading"><div><h4>Ürün fotoğraf galerisi</h4><p>Birden fazla görsel seçin. Ayrıntı sayfasında küçük fotoğraflar olarak görünür.</p></div><MediaPicker filter="image" multiple value={gallery.map(photo=>photo.url)} label="＋ Galeriden görsel ekle" onSelect={assets=>{const selected=Array.isArray(assets)?assets:[assets];const additions=selected.filter(asset=>asset?.url&&!galleryRef.current.some(photo=>photo.url===asset.url)).map(asset=>({id:crypto.randomUUID(),url:asset.url,alt:asset.alt||asset.displayName||asset.name||''}));galleryRef.current=[...galleryRef.current,...additions];update('gallery',galleryRef.current);}} /></div>
              {gallery.length===0?<p className="catalog-matrix-empty">Henüz ek görsel yok.</p>:<div className="product-gallery-grid">{gallery.map((photo,index)=><article key={photo.id||photo.url||index} className="product-gallery-item"><img src={photo.url||''} alt={photo.alt||product.name||'Ürün görseli'} onError={event=>{event.currentTarget.hidden=true}}/><label>Görsel açıklaması<input value={photo[english?'altEn':'alt']||''} onChange={event=>{const next=[...gallery];next[index]={...next[index],[english?'altEn':'alt']:event.target.value};galleryRef.current=next;update('gallery',next);}}/></label><div><button type="button" className="text-action" disabled={index===0} onClick={()=>{const next=[...gallery];[next[index-1],next[index]]=[next[index],next[index-1]];galleryRef.current=next;update('gallery',next);}}>← Sırala</button><button type="button" className="delete" onClick={()=>{const next=gallery.filter((_,i)=>i!==index);galleryRef.current=next;update('gallery',next);}}>Kaldır</button></div></article>)}</div>}
            </section>
            <Field label="Ana teknik PDF"><input value={product.pdf || ''} onChange={event => update('pdf', event.target.value)} placeholder="PDF adresi veya yükleyin" /><MediaPicker filter="document" value={product.pdf||''} label="PDF dosyası seç veya yükle" onSelect={asset=>update('pdf',asset.url)} /></Field>
          </div>
          {product.pdf && <div className="pdf-card"><div><b>{product.pdf.split('/').pop()}</b><a href={product.pdf} target="_blank" rel="noreferrer">PDF'i yeni sekmede önizle ↗</a></div><iframe title={`${product.name || 'Ürün'} PDF önizlemesi`} src={product.pdf} loading="lazy" /></div>}
          <div className="attachment-list">
            <div className="attachment-list-heading"><div><b>Ek dosyalar</b><small>Teknik föy veya ek katalog</small></div><MediaPicker filter="document" label="PDF ekle" onSelect={addAttachments} /></div>
            {attachments.length === 0 ? <p className="hint">Henüz ek dosya yok.</p> : attachments.map(file => <div className="attachment-row" key={file.id}><a href={file.url} target="_blank" rel="noreferrer">{file.name || file.url.split('/').pop()} ↗</a><button type="button" className="delete" onClick={() => update('attachments', attachments.filter(item => item.id !== file.id))}>Kaldır</button></div>)}
          </div>
        </div>}

        {section === 'seo' && <ProductSeoFields product={product} language={language} settings={seoSettings} onUpdate={update} />}
      </div>

      <div className="editor-actions"><AdminButton variant="danger" onClick={() => onDelete(product)}>{product.pendingDelete?'Silme işlemini uygula':'Kaydı sil'}</AdminButton><span>{product.hasDraft?'Taslak değişiklikleri kaydedildi; canlı site, yayınlayana kadar eski içeriği gösterir.':'Değişiklikler önce taslak olarak kaydedilir.'}</span>{product.hasDraft&&<AdminButton variant={product.pendingDelete?'danger':'primary'} onClick={()=>onPublishContent('products',product.id,product.pendingDelete||product.active===false&&product.hasPublishedVersion?'apply':'publish')}>{product.pendingDelete?'Silme işlemini uygula':product.active===false&&product.hasPublishedVersion?'Değişikliği uygula':'Yayınla'}</AdminButton>}</div>
    </section>
  );
}
