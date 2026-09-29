'use client';

import {useEffect,useRef,useState} from 'react';
import {AdminButton,ContentCard,PageHeader} from './admin-controls.jsx';

const pageSize=36;
const formatBytes=value=>value<1024?`${value} B`:value<1024*1024?`${(value/1024).toFixed(0)} KB`:`${(value/1024/1024).toFixed(1)} MB`;
const formatDate=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium'}).format(date)};

function MediaBrowser({filter='all',multiple=false,manage=false,onChoose,onCancel}){
  const [items,setItems]=useState([]),[query,setQuery]=useState(''),[type,setType]=useState(filter),[offset,setOffset]=useState(0),[total,setTotal]=useState(0);
  const [selected,setSelected]=useState([]),[alt,setAlt]=useState(''),[loading,setLoading]=useState(true),[uploading,setUploading]=useState(false),[deleting,setDeleting]=useState(''),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const uploadInput=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setLoading(true);setError('');
      try{
        const params=new URLSearchParams({q:query,type,limit:String(pageSize),offset:String(offset)});
        const response=await fetch('/api/media?'+params,{cache:'no-store',signal:controller.signal});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.error||'Medya dosyaları yüklenemedi.');
        setItems(Array.isArray(payload.items)?payload.items:[]);setTotal(Number(payload.total)||0);
      }catch(reason){if(reason.name!=='AbortError')setError(reason.message||'Medya dosyaları yüklenemedi.');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    },query?180:0);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[query,type,offset,refresh]);

  const chooseItem=item=>{
    if(!multiple){setSelected([item]);setAlt(item.name.replace(/\.[^.]+$/,'').replace(/^[\da-f-]{36}-/i,''));return;}
    setSelected(current=>current.some(entry=>entry.id===item.id)?current.filter(entry=>entry.id!==item.id):[...current,item]);
  };
  const uploadFiles=async files=>{
    const list=Array.from(files||[]);if(!list.length)return;
    setUploading(true);setError('');
    try{
      const uploaded=[];
      for(const file of list){
        const form=new FormData();form.set('file',file);
        const response=await fetch('/api/upload',{method:'POST',body:form});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.error||'Dosya yüklenemedi.');
        uploaded.push({...payload,id:String(payload.url||'').split('/').pop(),displayName:payload.name||file.name,name:payload.name||file.name,type:file.type,size:file.size,updatedAt:new Date().toISOString(),usedBy:[]});
      }
      setOffset(0);setSelected(current=>multiple?[...current,...uploaded]:[uploaded[0]]);setRefresh(value=>value+1);
    }catch(reason){setError(reason.message||'Dosya yüklenemedi.');}
    finally{setUploading(false);if(uploadInput.current)uploadInput.current.value='';}
  };
  const deleteItem=async item=>{
    if(item.usedBy?.length){setError('Bu dosya içeriklerde kullanılıyor. Önce ilgili kayıtlardaki görseli değiştirin.');return;}
    if(!window.confirm(`“${item.name}” dosyası kalıcı olarak silinsin mi?`))return;
    setDeleting(item.id);setError('');
    try{
      const response=await fetch('/api/media',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Dosya silinemedi.');
      setSelected(current=>current.filter(entry=>entry.id!==item.id));setRefresh(value=>value+1);
    }catch(reason){setError(reason.message||'Dosya silinemedi.');}
    finally{setDeleting('');}
  };
  const useSelection=()=>{
    if(!selected.length)return;
    const result=multiple?selected.map(item=>({...item,alt:item.alt||item.name.replace(/\.[^.]+$/,'').replace(/^[\da-f-]{36}-/i,'')})):{...selected[0],alt};
    onChoose?.(result);
  };
  const accept=type==='image'?'image/jpeg,image/png,image/webp':type==='document'?'application/pdf':'image/jpeg,image/png,image/webp,application/pdf';
  const filteredTotal=Math.max(total,0),lastPage=offset+pageSize>=filteredTotal;

  return <div className={`media-browser ${manage?'is-manage':''}`}>
    <div className="media-browser-toolbar">
      <label className="media-browser-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event=>{setQuery(event.target.value);setOffset(0)}} placeholder="Dosya adıyla ara" aria-label="Medya dosyalarında ara" /></label>
      {manage&&<select value={type} onChange={event=>{setType(event.target.value);setOffset(0)}} aria-label="Dosya türü"><option value="all">Tüm dosyalar</option><option value="image">Görseller</option><option value="document">PDF dosyaları</option></select>}
      <label className="admin-media-upload"><input ref={uploadInput} type="file" accept={accept} multiple={manage||multiple} onChange={event=>uploadFiles(event.target.files)}/><span>{uploading?'Yükleniyor…':'Dosya yükle'}</span></label>
      <span className="media-browser-count" aria-live="polite">{filteredTotal} dosya</span>
    </div>
    {error&&<p className="media-browser-error" role="alert">{error}</p>}
    {loading?<div className="media-browser-empty" role="status">Medya dosyaları yükleniyor…</div>:items.length===0?<div className="media-browser-empty"><b>Dosya bulunamadı</b><span>Aramayı temizleyin veya yeni dosya yükleyin.</span></div>:<div className="media-browser-grid">
      {items.map(item=>{
        const selectedItem=selected.some(entry=>entry.id===item.id),isImage=item.type.startsWith('image/');
        return <article className={`media-asset-card ${selectedItem?'is-selected':''}`} key={item.id}>
          <button type="button" className="media-asset-pick" onClick={()=>chooseItem(item)} aria-pressed={selectedItem} title={item.name}>
            <span className="media-asset-preview">{isImage?<img src={item.url} alt="" loading="lazy" onError={event=>{event.currentTarget.hidden=true}}/>:<span className="media-pdf-icon" aria-hidden="true">PDF</span>}{selectedItem&&<span className="media-asset-check" aria-hidden="true">✓</span>}</span>
            <span className="media-asset-name">{item.displayName||item.name}</span>
            <small>{formatBytes(item.size)} · {formatDate(item.updatedAt)}</small>
          </button>
          {item.type==='application/pdf'&&<a className="media-asset-preview-open" href={item.url} target="_blank" rel="noopener noreferrer">PDF'i önizle ↗</a>}
          {manage?<div className="media-asset-actions"><span title={item.usedBy?.join('\n')||''}>{item.usedBy?.length?`${item.usedBy.length} alanda kullanılıyor`:'Kullanılmıyor'}</span><AdminButton variant="danger" disabled={!!item.usedBy?.length||deleting===item.id} onClick={()=>deleteItem(item)}>{deleting===item.id?'Siliniyor…':'Sil'}</AdminButton></div>:null}
        </article>;
      })}
    </div>}
    {!loading&&filteredTotal>pageSize&&<nav className="media-browser-pagination" aria-label="Medya sayfaları"><AdminButton disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-pageSize))}>Önceki</AdminButton><span>{Math.floor(offset/pageSize)+1} / {Math.ceil(filteredTotal/pageSize)}</span><AdminButton disabled={lastPage} onClick={()=>setOffset(offset+pageSize)}>Sonraki</AdminButton></nav>}
    {manage?null:<>
      {selected.length===1&&selected[0].type.startsWith('image/')&&!multiple&&<label className="media-selected-alt">Görsel açıklaması (alt metin)<input value={alt} onChange={event=>setAlt(event.target.value)} placeholder="Görselde ne olduğunu kısaca yazın" /></label>}
      {multiple&&selected.length>0&&<p className="media-selection-count">{selected.length} dosya seçildi</p>}
      <div className="media-browser-footer"><AdminButton variant="secondary" onClick={onCancel}>Vazgeç</AdminButton><AdminButton variant="primary" disabled={!selected.length||uploading} onClick={useSelection}>{selected.length>1||multiple?`Seçilenleri kullan (${selected.length})`:'Dosyayı kullan'}</AdminButton></div>
    </>}
  </div>;
}

export function MediaPicker({value='',filter='image',multiple=false,label='Medya seç',onSelect,onOpen,className=''}){
  const [open,setOpen]=useState(false),trigger=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const onKeyDown=event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);requestAnimationFrame(()=>trigger.current?.focus())}};
    window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown);
  },[open]);
  const finish=result=>{onSelect?.(result);setOpen(false);requestAnimationFrame(()=>trigger.current?.focus())};
  const current=Array.isArray(value)?value.join(', '):value;
  return <>
    <div className={`media-picker-trigger ${className}`}>
      <AdminButton ref={trigger} variant="secondary" onClick={()=>{onOpen?.();setOpen(true)}}>{label}</AdminButton>
      {current&&<span className="media-picker-current" title={current}>{Array.isArray(value)?`${value.length} görsel seçili`:String(current).split('/').pop()}</span>}
    </div>
    {open&&<div className="admin-media-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget){setOpen(false);requestAnimationFrame(()=>trigger.current?.focus())}}}>
      <section className="admin-media-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-media-dialog-title">
        <header className="admin-media-dialog-heading"><div><span className="eyebrow">HYDROPASCAL MEDYA</span><h3 id="admin-media-dialog-title">{filter==='document'?'PDF dosyası seç':'Görsel seç'}</h3></div><AdminButton variant="icon" aria-label="Medya seçiciyi kapat" onClick={()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus())}}>×</AdminButton></header>
        <MediaBrowser filter={filter} multiple={multiple} onChoose={finish} onCancel={()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus())}} />
      </section>
    </div>}
  </>;
}

export default function AdminMediaLibrary(){
  return <ContentCard className="admin-media-library"><PageHeader eyebrow="DOSYA YÖNETİMİ" title="Medya dosyaları" description="Ürün, blog, katalog ve sayfa editörleri bu kütüphaneyi ortak seçici olarak açar. Kullanımdaki dosyalar silinemez; kaç alanda kullanıldığı kartta gösterilir." /><MediaBrowser manage /></ContentCard>;
}
