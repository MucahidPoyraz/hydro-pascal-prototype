'use client';
import {useState} from 'react';
import {AdminButton} from './admin-controls.jsx';
import {MAX_NAV_DEPTH,childrenOf,descendantsOf,indentNode,moveNode,outdentNode,validateTree} from '../lib/navigation-tree.js';

// Recursive menu editor. Children render under their parent; every move rewrites parentId + sortOrder.
export default function TreeEditor({items,onChange,defaults={},limit=40,allowButton=false,title='Menü'}){
  const [error,setError]=useState(''),[editingId,setEditingId]=useState(''),[dragId,setDragId]=useState(''),[drop,setDrop]=useState(null);
  const commit=next=>{const message=validateTree(next);setError(message);if(!message)onChange(next);return !message;};
  const attempt=build=>{try{return commit(build());}catch(err){setError(err.message);return false;}};
  const patch=(id,values)=>commit(items.map(item=>item.id===id?{...item,...values}:item));
  const nextOrder=parentId=>childrenOf(items,parentId).reduce((max,row)=>Math.max(max,row.sortOrder+1),0);
  const add=(parentId='')=>{
    if(items.length>=limit)return setError(`En fazla ${limit} bağlantı eklenebilir.`);
    const id=crypto.randomUUID();
    if(commit([...items,{...defaults,id,parentId,sortOrder:nextOrder(parentId),label:'Yeni bağlantı',labelEn:'',href:'#',active:true}]))setEditingId(id);
  };
  const duplicate=item=>{
    const ids=[item.id,...descendantsOf(items,item.id)];
    if(items.length+ids.length>limit)return setError(`Kopyalamak için yer yok: en fazla ${limit} bağlantı.`);
    const mapping=new Map(ids.map(id=>[id,crypto.randomUUID()]));
    const copies=items.filter(row=>mapping.has(row.id)).map(row=>({...row,id:mapping.get(row.id),parentId:mapping.get(row.parentId)||row.parentId,...(row.id===item.id?{label:row.label+' (kopya)',active:false,sortOrder:nextOrder(row.parentId)}:{})}));
    const index=childrenOf(items,item.parentId).findIndex(row=>row.id===item.id);
    attempt(()=>moveNode([...items,...copies],mapping.get(item.id),item.parentId,index+1));
  };
  const remove=item=>{
    const descendants=descendantsOf(items,item.id);
    if(!window.confirm(`“${item.label||'Adsız bağlantı'}”${descendants.size?` ve ${descendants.size} alt bağlantısı`:''} silinsin mi?`))return;
    commit(items.filter(row=>row.id!==item.id&&!descendants.has(row.id)));
  };
  const place=(id,target,position)=>{
    if(!id||id===target?.id)return;
    attempt(()=>{
      if(!target)return moveNode(items,id,'');
      if(position==='inside')return moveNode(items,id,target.id);
      const siblings=childrenOf(items,target.parentId).filter(row=>row.id!==id);
      return moveNode(items,id,target.parentId,siblings.findIndex(row=>row.id===target.id)+(position==='after'?1:0));
    });
  };
  const endDrag=()=>{setDragId('');setDrop(null);};
  const dragOver=(event,item)=>{
    if(!dragId)return;
    event.preventDefault();event.stopPropagation();
    const box=event.currentTarget.getBoundingClientRect(),ratio=(event.clientY-box.top)/box.height;
    const position=ratio<.3?'before':ratio>.7?'after':'inside';
    if(drop?.id!==item.id||drop.position!==position)setDrop({id:item.id,position});
  };
  const parentOptions=item=>{
    const blocked=new Set([item.id,...descendantsOf(items,item.id)]);
    const walk=(parentId,depth)=>childrenOf(items,parentId).flatMap(row=>blocked.has(row.id)||depth>=MAX_NAV_DEPTH-1?[]:[{row,depth},...walk(row.id,depth+1)]);
    return walk('',0);
  };
  const render=(parentId='',depth=0)=><ul className={depth?'cms-tree':'cms-tree cms-tree-rootlist'}>{childrenOf(items,parentId).map((item,index,siblings)=>{
    const children=childrenOf(items,item.id),editing=editingId===item.id,name=item.label||'Adsız bağlantı';
    const dropClass=drop?.id===item.id?' drop-'+drop.position:'';
    return <li key={item.id} className="cms-tree-item">
      <div className={'cms-tree-row'+dropClass+(item.active===false?' is-hidden':'')+(dragId===item.id?' is-dragging':'')} onDragOver={event=>dragOver(event,item)} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget))setDrop(null);}} onDrop={event=>{event.preventDefault();event.stopPropagation();place(dragId||event.dataTransfer.getData('text/plain'),item,drop?.position||'inside');endDrag();}}>
        <span className="cms-tree-handle" draggable onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);setDragId(item.id);}} onDragEnd={endDrag} title="Sürükleyip başka bir bağlantının önüne, arkasına veya üzerine bırakın" aria-hidden="true">⠿</span>
        <div className="cms-tree-summary">
          <b>{name}</b>
          <span className="cms-tree-meta"><code>{item.href&&item.href!=='#'?item.href:'Bağlantısız başlık'}</code>{item.labelEn&&<small>EN · {item.labelEn}</small>}</span>
          <span className="cms-tree-badges">{children.length>0&&<em>{children.length} alt</em>}{item.active===false&&<em className="is-warning">Gizli</em>}{item.variant==='button'&&<em>Buton</em>}{item.newTab&&<em>Yeni sekme</em>}</span>
        </div>
        <div className="cms-tree-actions" role="group" aria-label={`“${name}” işlemleri`}>
          <AdminButton size="compact" aria-expanded={editing} onClick={()=>setEditingId(editing?'':item.id)}>{editing?'Kapat':'✎ Düzenle'}</AdminButton>
          <AdminButton size="compact" disabled={depth>=MAX_NAV_DEPTH-1} title={depth>=MAX_NAV_DEPTH-1?`En fazla ${MAX_NAV_DEPTH} seviye`:undefined} onClick={()=>add(item.id)}>＋ Alt menü</AdminButton>
          <AdminButton size="compact" variant="icon" aria-label={`“${name}” yukarı taşı`} title="Yukarı taşı" disabled={index===0} onClick={()=>attempt(()=>moveNode(items,item.id,parentId,index-1))}>↑</AdminButton>
          <AdminButton size="compact" variant="icon" aria-label={`“${name}” aşağı taşı`} title="Aşağı taşı" disabled={index===siblings.length-1} onClick={()=>attempt(()=>moveNode(items,item.id,parentId,index+1))}>↓</AdminButton>
          <AdminButton size="compact" variant="icon" aria-label={`“${name}” üstteki bağlantının altına al`} title="İçeri al: üstteki bağlantının alt menüsü yap" disabled={index===0||depth>=MAX_NAV_DEPTH-1} onClick={()=>attempt(()=>indentNode(items,item.id))}>⇥</AdminButton>
          <AdminButton size="compact" variant="icon" aria-label={`“${name}” bir üst seviyeye çıkar`} title="Dışarı al: bir üst seviyeye çıkar" disabled={!depth} onClick={()=>attempt(()=>outdentNode(items,item.id))}>⇤</AdminButton>
          <AdminButton size="compact" variant="ghost" onClick={()=>duplicate(item)}>Kopyala</AdminButton>
          <AdminButton size="compact" variant="ghost" aria-pressed={item.active===false} onClick={()=>patch(item.id,{active:item.active===false})}>{item.active===false?'Göster':'Gizle'}</AdminButton>
          <AdminButton size="compact" variant="danger" aria-label={`“${name}” sil`} onClick={()=>remove(item)}>Sil</AdminButton>
        </div>
      </div>
      {editing&&<div className="cms-tree-edit">
        <label>Görünen ad<input autoFocus value={item.label||''} maxLength={120} onChange={event=>patch(item.id,{label:event.target.value})}/></label>
        <label>English name<input value={item.labelEn||''} maxLength={120} placeholder="Boşsa Türkçe ad kullanılır" onChange={event=>patch(item.id,{labelEn:event.target.value})}/></label>
        <label>URL<input value={item.href||''} maxLength={2048} placeholder="hakkimizda.html veya https://…" onChange={event=>patch(item.id,{href:event.target.value})}/><small>Site sayfası için dosya adını yazın (dil klasörü otomatik eklenir). Sadece başlık olacaksa # bırakın.</small></label>
        <label>Üst menü<select value={item.parentId} onChange={event=>attempt(()=>moveNode(items,item.id,event.target.value))}><option value="">Ana seviye</option>{parentOptions(item).map(({row,depth:level})=><option key={row.id} value={row.id}>{'— '.repeat(level)+(row.label||'Adsız bağlantı')}</option>)}</select></label>
        <div className="cms-tree-checks">
          <label><input type="checkbox" checked={item.active!==false} onChange={event=>patch(item.id,{active:event.target.checked})}/> Sitede görünsün</label>
          <label><input type="checkbox" checked={Boolean(item.newTab)} onChange={event=>patch(item.id,{newTab:event.target.checked})}/> Yeni sekmede aç</label>
          {allowButton&&!depth&&<label><input type="checkbox" checked={item.variant==='button'} onChange={event=>patch(item.id,{variant:event.target.checked?'button':''})}/> Turuncu buton olarak göster</label>}
        </div>
        <div className="cms-tree-edit-actions"><AdminButton size="compact" variant="primary" onClick={()=>setEditingId('')}>Tamam</AdminButton><span className="hint">Kaydet ile taslak olur; siteye “Menüyü yayınla” ile yansır.</span></div>
      </div>}
      {children.length>0&&render(item.id,depth+1)}
    </li>;
  })}</ul>;
  return <div className="cms-tree-editor">
    <div className="cms-tree-toolbar"><span className="hint">{title} · {items.length}/{limit} bağlantı · en fazla {MAX_NAV_DEPTH} seviye</span><AdminButton size="compact" variant="primary" onClick={()=>add()}>＋ Ana bağlantı</AdminButton></div>
    {error&&<p role="alert" className="error">{error}</p>}
    {items.length?render():<p className="catalog-matrix-empty">Henüz bağlantı yok. “＋ Ana bağlantı” ile başlayın.</p>}
    {dragId&&<div className={'cms-tree-rootdrop'+(drop?.id==='__root'?' is-over':'')} onDragOver={event=>{event.preventDefault();if(drop?.id!=='__root')setDrop({id:'__root',position:'inside'});}} onDrop={event=>{event.preventDefault();place(dragId,null);endDrag();}}>Buraya bırakın: ana seviyenin sonuna taşı</div>}
    <p className="hint">Sürükleme: bağlantıyı bir satırın üst kenarına bırakırsanız önüne, alt kenarına bırakırsanız arkasına, ortasına bırakırsanız alt menüsü olur. Klavyeyle ↑ ↓ ⇥ ⇤ düğmelerini kullanın.</p>
  </div>;
}
