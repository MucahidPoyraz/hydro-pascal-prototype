'use client';
import {useId, useImperativeHandle, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {AdminButton} from './admin-controls.jsx';
import {normalizeCategoryName as key, recordBelongsToCategory} from '../lib/category-utils.js';

export const relationName = (item, language = 'tr') => language === 'en' ? (item?.nameEn || item?.name || '') : (item?.name || '');

// Records keep the category as TR + EN name copies; resolve them back to the category entity.
export function findRelation(options, record = {}) {
  return (record.category || record.categoryEn) ? options.find(item => recordBelongsToCategory(record, item)) || null : null;
}

// Selecting a category always writes both language copies so TR and EN never drift apart.
export const relationPatch = item => ({category: item?.name || '', categoryEn: item?.nameEn || ''});

const duplicateOf = (options, draft) => options.find(item => item.id !== draft.id && key(item.name) === key(draft.name));

// Small-entity create/edit drawer shared by contextual selectors and the global category manager.
export function QuickCategoryDialog({dialogRef, scope, options = [], onSave, onSaved, noun = 'kategori'}) {
  const id = useId();
  const [draft, setDraft] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const holder = useRef(null);
  useImperativeHandle(dialogRef, () => ({open: item => {setDraft(item ? {...item} : {scope, name: '', nameEn: ''}); setError(''); holder.current?.showModal();}}), [scope]);
  const close = () => {if (!busy) holder.current?.close();};
  const title = draft?.id ? `${noun[0].toLocaleUpperCase('tr') + noun.slice(1)} düzenle` : `Yeni ${noun}`;
  const submit = async event => {
    event.preventDefault();
    if (busy || !draft) return;
    const next = {...draft, name: draft.name.trim(), nameEn: (draft.nameEn || '').trim()};
    if (!next.name) return setError('Ad alanını doldurun.');
    if (duplicateOf(options, next)) return setError(`Bu isimde bir ${noun} zaten var.`);
    setBusy(true); setError('');
    try {
      const saved = await onSave(next);
      holder.current?.close();
      onSaved?.(saved, Boolean(draft.id));
    } catch (err) {
      setError(`${draft.id ? 'Değişiklik kaydedilemedi' : `${noun[0].toLocaleUpperCase('tr') + noun.slice(1)} oluşturulamadı`}: ${err.message || 'bilinmeyen hata'}. Formunuzdaki değişiklikler korunuyor.`);
    } finally {setBusy(false);}
  };
  if (typeof document === 'undefined') return null;
  return createPortal(<dialog ref={holder} aria-labelledby={id + '-title'} className="relation-dialog" onCancel={event => {if (busy) event.preventDefault();}}>
    <form onSubmit={submit}>
      <div className="relation-dialog-head"><span className="eyebrow">{draft?.id ? 'HIZLI DÜZENLE' : 'HIZLI OLUŞTUR'}</span><h3 id={id + '-title'}>{title}</h3></div>
      <label>Ad<input autoFocus required maxLength={100} value={draft?.name || ''} onChange={event => setDraft({...draft, name: event.target.value})} placeholder="Örn. Endüstriyel Pompalar"/></label>
      <label>English name<input maxLength={100} value={draft?.nameEn || ''} onChange={event => setDraft({...draft, nameEn: event.target.value})} placeholder="e.g. Industrial Pumps"/></label>
      {draft?.id && <p className="hint">Yeni ad, bu {noun}yi kullanan kayıtlara taslak olarak uygulanır; yayımladığınızda sitede görünür.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="relation-dialog-actions"><AdminButton disabled={busy} onClick={close}>Vazgeç</AdminButton><AdminButton type="submit" variant="primary" disabled={busy} aria-busy={busy}>{busy ? 'Kaydediliyor…' : draft?.id ? 'Kaydet' : 'Oluştur'}</AdminButton></div>
    </form>
  </dialog>, document.body);
}

// Contextual relation field: search, select, clear, create and edit without leaving the parent editor.
export default function RelationSelect({categories = [], scope, language = 'tr', record = {}, onChange, onSave, label = 'Kategori', noun = 'kategori'}) {
  const id = useId(), dialog = useRef(null);
  const [query, setQuery] = useState('');
  const options = categories.filter(item => item.scope === scope);
  const selected = findRelation(options, record);
  const orphan = !selected && (record.category || record.categoryEn);
  const needle = key(query);
  const visible = options.filter(item => item.id === selected?.id || !needle || [item.name, item.nameEn].some(text => key(text).includes(needle)))
    .sort((a, b) => relationName(a, language).localeCompare(relationName(b, language), language));
  const optionLabel = item => {const main = relationName(item, language), other = language === 'en' ? item.name : item.nameEn; return other && other !== main ? `${main} · ${other}` : main;};
  return <div className="relation-select">
    <label htmlFor={id}>{label}</label>
    <div className="relation-control">
      <select id={id} value={selected?.id || (orphan ? '__orphan' : '')} onChange={event => {const item = options.find(option => option.id === event.target.value); if (event.target.value !== '__orphan') onChange(relationPatch(item));}}>
        <option value="">{`${label} seçilmedi`}</option>
        {orphan && <option value="__orphan">{(language === 'en' ? record.categoryEn || record.category : record.category || record.categoryEn) + ' (listede yok)'}</option>}
        {visible.map(item => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}
      </select>
      <AdminButton onClick={() => dialog.current.open(null)} aria-label={`Yeni ${noun} oluştur`}>＋ Yeni</AdminButton>
      <AdminButton variant="icon" size="compact" className="relation-edit" disabled={!selected} aria-label={`Seçili ${noun}yi düzenle`} title={selected ? `“${relationName(selected, language)}” düzenle` : `Önce bir ${noun} seçin`} onClick={() => dialog.current.open(selected)}>✎</AdminButton>
    </div>
    {options.length > 8 && <input type="search" className="relation-search" aria-label={`${label} ara`} placeholder={`Listede ara (${options.length} ${noun})…`} value={query} onChange={event => setQuery(event.target.value)}/>}
    {needle && !visible.length && <small className="relation-hint">Eşleşen {noun} yok. “＋ Yeni” ile oluşturabilirsiniz.</small>}
    <QuickCategoryDialog dialogRef={dialog} scope={scope} options={options} noun={noun} onSave={onSave} onSaved={(saved, edited) => {setQuery(''); if (!edited || saved.id === selected?.id) onChange(relationPatch(saved));}}/>
  </div>;
}

// Bulk "change category" picker for list selections; "＋ Yeni" creates and auto-selects in place.
export function BulkCategoryDialog({dialogRef, categories = [], scope, onSave, onApply, noun = 'kategori'}) {
  const id = useId(), holder = useRef(null), create = useRef(null);
  const [count, setCount] = useState(0), [value, setValue] = useState('');
  useImperativeHandle(dialogRef, () => ({open: total => {setCount(total); setValue(''); holder.current?.showModal();}}), []);
  const options = categories.filter(item => item.scope === scope).sort((a, b) => relationName(a).localeCompare(relationName(b), 'tr'));
  const submit = event => {
    event.preventDefault();
    const item = options.find(option => option.id === value) || null;
    holder.current?.close();
    onApply(relationPatch(item));
  };
  if (typeof document === 'undefined') return null;
  return createPortal(<dialog ref={holder} aria-labelledby={id + '-title'} className="relation-dialog">
    <form onSubmit={submit}>
      <div className="relation-dialog-head"><span className="eyebrow">TOPLU İŞLEM</span><h3 id={id + '-title'}>{count} kayıt için {noun}</h3></div>
      <div className="relation-select">
        <label htmlFor={id}>Yeni {noun}</label>
        <div className="relation-control">
          <select id={id} value={value} onChange={event => setValue(event.target.value)}>
            <option value="">{noun[0].toLocaleUpperCase('tr') + noun.slice(1)}siz bırak</option>
            {options.map(item => <option key={item.id} value={item.id}>{relationName(item)}{item.nameEn && item.nameEn !== item.name ? ` · ${item.nameEn}` : ''}</option>)}
          </select>
          <AdminButton onClick={() => create.current.open(null)} aria-label={`Yeni ${noun} oluştur`}>＋ Yeni</AdminButton>
        </div>
      </div>
      <p className="hint">Seçilen kayıtlar taslak olarak kaydedilir; canlı sitede görünmesi için yayınlayın.</p>
      <div className="relation-dialog-actions"><AdminButton onClick={() => holder.current?.close()}>Vazgeç</AdminButton><AdminButton type="submit" variant="primary">Uygula</AdminButton></div>
    </form>
    <QuickCategoryDialog dialogRef={create} scope={scope} options={options} noun={noun} onSave={onSave} onSaved={saved => setValue(saved.id)}/>
  </dialog>, document.body);
}

// Compact list-row variant for inline editing inside tables.
export function RelationInlineSelect({categories = [], scope, language = 'tr', record = {}, onChange, ariaLabel}) {
  const options = categories.filter(item => item.scope === scope).sort((a, b) => relationName(a, language).localeCompare(relationName(b, language), language));
  const selected = findRelation(options, record);
  const orphan = !selected && (record.category || record.categoryEn);
  return <select className="table-quick-select" aria-label={ariaLabel} value={selected?.id || (orphan ? '__orphan' : '')} onChange={event => {if (event.target.value !== '__orphan') onChange(relationPatch(options.find(item => item.id === event.target.value)));}}>
    <option value="">Kategorisiz</option>
    {orphan && <option value="__orphan">{(record.category || record.categoryEn) + ' (listede yok)'}</option>}
    {options.map(item => <option key={item.id} value={item.id}>{relationName(item, language)}</option>)}
  </select>;
}
