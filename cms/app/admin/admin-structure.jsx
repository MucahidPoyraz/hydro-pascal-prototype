'use client';

// Structural editing UI for "Sitede düzenle": the page tree, the section
// palette and the schema-driven properties panel. Every action shown here is
// derived from the component capabilities in lib/page-schema.js.
import {useState} from 'react';
import {can,componentTypes,fieldLabel,insertableSections} from '../lib/page-schema.js';
import './page-structure.css';

const kindIcon={section:'▤',collection:'☷',item:'▢',field:'·'};

function fieldPreview(field){
  const value=String(field.value??'').trim();
  if(field.input==='image')return value.split('/').pop()||'Görsel yok';
  return value.length>42?value.slice(0,42)+'…':value||'Boş';
}

// Quick actions for a node, straight from its schema capabilities.
export function nodeActions(found,tree){
  if(!found||!tree)return [];
  const {node}=found;const actions=[];
  if(node.kind==='section'){
    const index=tree.sections.indexOf(node);
    if(!node.hidden)for(const collection of node.collections)actions.push({action:'add:'+collection.id,label:'+ '+collection.itemLabel,title:`${collection.label} alanına yeni ${collection.itemLabel.toLocaleLowerCase('tr')} ekle`,disabled:collection.items.length>=collection.maxItems?`${collection.label} en fazla ${collection.maxItems} öğe içerebilir.`:''});
    actions.push({action:'add-section',label:'+ Bölüm',title:'Bu bölümün altına yeni bölüm ekle'});
    if(can(node,'move')){actions.push({action:'up',label:'↑',title:'Bölümü yukarı taşı',disabled:index<=0?'Zaten en üstte.':''});actions.push({action:'down',label:'↓',title:'Bölümü aşağı taşı',disabled:index>=tree.sections.length-1?'Zaten en altta.':''});}
    if(can(node,'duplicate'))actions.push({action:'duplicate',label:'Çoğalt',title:'Bölümü içeriğiyle çoğalt'});
    if(can(node,node.hidden?'show':'hide'))actions.push({action:node.hidden?'show':'hide',label:node.hidden?'Göster':'Gizle',title:node.hidden?'Bölümü sitede yeniden göster':'Bölümü sitede gizle; yapı ağacında kalır'});
    if(can(node,'delete'))actions.push({action:'delete',label:'Sil',title:'Bölümü sayfadan kaldır',danger:true});
  }else if(node.kind==='item'){
    const {collection}=found;
    if(can(node,'reorder')){actions.push({action:'up',label:'↑',title:'Yukarı taşı',disabled:node.index<=0?'Zaten ilk sırada.':''});actions.push({action:'down',label:'↓',title:'Aşağı taşı',disabled:node.index>=collection.items.length-1?'Zaten son sırada.':''});}
    if(can(node,'duplicate'))actions.push({action:'duplicate',label:'Çoğalt',title:'Öğeyi çoğalt',disabled:collection.items.length>=collection.maxItems?`${collection.label} en fazla ${collection.maxItems} öğe içerebilir.`:''});
    if(can(node,node.hidden?'show':'hide'))actions.push({action:node.hidden?'show':'hide',label:node.hidden?'Göster':'Gizle',title:node.hidden?'Öğeyi sitede yeniden göster':'Öğeyi sitede gizle; yapı ağacında kalır'});
    if(can(node,'delete'))actions.push({action:'delete',label:'Sil',title:'Öğeyi sil',danger:true,disabled:collection.items.length<=collection.minItems?`${collection.label} en az ${collection.minItems} öğe içermeli; son zorunlu öğe silinemez.`:''});
  }
  return actions;
}

function matches(text,query){return !query||String(text||'').toLocaleLowerCase('tr').includes(query);}

export function StructureTree({tree,pageTitle,selectedNode,focusField,expanded,search,onToggle,onSelect,onSelectField,onMoveNode}){
  const [drag,setDrag]=useState(null);
  const query=search.trim().toLocaleLowerCase('tr');
  if(!tree)return null;
  const fieldMatches=field=>matches(fieldLabel(field.field)+' '+field.value,query);
  const itemMatches=item=>matches(item.label,query)||item.fields.some(fieldMatches);
  const collectionMatches=collection=>matches(collection.label,query)||collection.items.some(itemMatches);
  const sectionMatches=section=>matches(section.label+' '+section.typeLabel,query)||section.fields.some(fieldMatches)||section.collections.some(collectionMatches);
  const isOpen=id=>!!query||expanded.has(id);
  const keyMove=(event,id,index)=>{
    if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();onMoveNode(id,index+(event.key==='ArrowUp'?-1:1));
  };
  const dragProps=(id,index,scope,enabled)=>enabled?{
    draggable:true,
    onDragStart:event=>{setDrag({id,scope});event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);},
    onDragOver:event=>{if(drag&&drag.scope===scope&&drag.id!==id){event.preventDefault();event.dataTransfer.dropEffect='move';}},
    onDrop:event=>{if(drag&&drag.scope===scope&&drag.id!==id){event.preventDefault();onMoveNode(drag.id,index);}setDrag(null);},
    onDragEnd:()=>setDrag(null)
  }:{};
  const fieldRow=(field,depth,ownerId)=>{
    const selected=focusField&&focusField.section===field.section&&focusField.field===field.field;
    return <li key={field.section+'|'+field.field} role="none"><button type="button" role="treeitem" aria-level={depth+1} aria-selected={!!selected} className={`structure-row is-field ${selected?'is-selected':''}`} style={{'--depth':depth}} onClick={()=>onSelectField(ownerId,field)}>
      <span className="structure-icon" aria-hidden="true">{field.input==='image'?'▧':field.linkField||field.input==='url'?'↗':'·'}</span>
      <span className="structure-label">{fieldLabel(field.field)}</span><small>{fieldPreview(field)}</small>
    </button></li>;
  };
  return <div className="structure-tree">
    <button type="button" className={`structure-row is-page ${!selectedNode?'is-selected':''}`} onClick={()=>onSelect(null)}><span className="structure-icon" aria-hidden="true">◫</span><span className="structure-label">{pageTitle}</span><small>{tree.sections.length} bölüm</small></button>
    <ul role="tree" aria-label={pageTitle+' sayfa yapısı'}>
      {tree.sections.filter(sectionMatches).map(section=>{
        const index=tree.sections.indexOf(section),open=isOpen(section.id);
        const hasChildren=section.fields.length||section.collections.length;
        return <li key={section.id} role="none" className={drag?.id===section.id?'is-dragging':''}>
          <div className={`structure-line ${section.hidden?'is-hidden':''}`} {...dragProps(section.id,index,'sections',can(section,'move'))}>
            <button type="button" className="structure-toggle" aria-label={open?'Daralt':'Genişlet'} aria-expanded={open} disabled={!hasChildren} onClick={()=>onToggle(section.id)}>{hasChildren?(open?'▾':'▸'):''}</button>
            <button type="button" role="treeitem" aria-level={1} aria-selected={selectedNode===section.id} aria-expanded={hasChildren?open:undefined} className={`structure-row is-section ${selectedNode===section.id?'is-selected':''}`} onClick={()=>onSelect(section.id)} onKeyDown={event=>can(section,'move')&&keyMove(event,section.id,index)} title={`${section.typeLabel}${can(section,'move')?' · Taşımak için sürükleyin veya Alt+↑/↓':''}`}>
              <span className="structure-icon" aria-hidden="true">{kindIcon.section}</span><span className="structure-label">{section.label}</span>
              {section.isNew&&<em className="structure-badge">Yeni</em>}{section.hidden&&<em className="structure-badge is-hidden" title="Sitede gizli">👁‍🗨 Gizli</em>}
            </button>
          </div>
          {open&&hasChildren&&<ul role="group">
            {section.fields.filter(fieldMatches).map(field=>fieldRow(field,1,section.id))}
            {section.collections.filter(collectionMatches).map(collection=>{
              const collectionOpen=isOpen(collection.id)||collection.items.some(item=>item.id===selectedNode);
              return <li key={collection.id} role="none">
                <div className="structure-line">
                  <button type="button" className="structure-toggle" aria-label={collectionOpen?'Daralt':'Genişlet'} aria-expanded={collectionOpen} onClick={()=>onToggle(collection.id)}>{collectionOpen?'▾':'▸'}</button>
                  <button type="button" role="treeitem" aria-level={2} aria-selected={false} className="structure-row is-collection" style={{'--depth':1}} onClick={()=>{onSelect(section.id);if(!collectionOpen)onToggle(collection.id);}}>
                    <span className="structure-icon" aria-hidden="true">{kindIcon.collection}</span><span className="structure-label">{collection.label}</span><small>{collection.items.length}</small>
                  </button>
                </div>
                {collectionOpen&&<ul role="group">
                  {collection.items.length===0&&<li className="structure-empty">Henüz {collection.itemLabel.toLocaleLowerCase('tr')} yok.</li>}
                  {collection.items.filter(itemMatches).map(item=>{
                    const itemOpen=selectedNode===item.id||!!query;
                    return <li key={item.id} role="none" className={drag?.id===item.id?'is-dragging':''}>
                      <div className={`structure-line ${item.hidden?'is-hidden':''}`} {...dragProps(item.id,item.index,collection.id,can(item,'reorder'))}>
                        <span className="structure-toggle" aria-hidden="true" />
                        <button type="button" role="treeitem" aria-level={3} aria-selected={selectedNode===item.id} className={`structure-row is-item ${selectedNode===item.id?'is-selected':''}`} style={{'--depth':2}} onClick={()=>onSelect(item.id)} onKeyDown={event=>can(item,'reorder')&&keyMove(event,item.id,item.index)} title={`${componentTypes[item.type]?.label||'Öğe'} · Sürükleyin veya Alt+↑/↓`}>
                          <span className="structure-icon" aria-hidden="true">{kindIcon.item}</span><span className="structure-label">{item.label}</span>
                          {item.isNew&&<em className="structure-badge">Yeni</em>}{item.hidden&&<em className="structure-badge is-hidden" title="Sitede gizli">👁‍🗨 Gizli</em>}
                        </button>
                      </div>
                      {itemOpen&&<ul role="group">{item.fields.filter(field=>!['target','variant'].includes(field.field)).filter(fieldMatches).map(field=>fieldRow(field,3,item.id))}</ul>}
                    </li>;
                  })}
                </ul>}
              </li>;
            })}
          </ul>}
        </li>;
      })}
    </ul>
    {tree.sections.length===0&&<p className="visual-panel-help">Bu sayfada düzenlenebilir bölüm bulunamadı.</p>}
  </div>;
}

export function SectionPalette({tree,insertAfter,insertAfterLabel,onAdd,onRestore}){
  return <div className="structure-palette">
    <p className="visual-panel-help">{insertAfter?<>Yeni bölüm <b>{insertAfterLabel}</b> bölümünün altına eklenir.</>:'Yeni bölüm sayfanın sonuna eklenir. Belirli bir yere eklemek için önce bir bölüm seçin.'}</p>
    {insertableSections.map(type=><button key={type.id} type="button" className="visual-add-section" onClick={()=>onAdd(type.id)}><b>{type.label}</b><small>{type.description}</small></button>)}
    {tree?.removed?.length>0&&<div className="visual-block-list"><strong>Kaldırılan özgün bölümler</strong>
      {tree.removed.map(section=><div key={section.key} className="visual-block-row"><span title={section.label}>{section.label}</span><div><button type="button" className="structure-inline-button" onClick={()=>onRestore(section.key)}>Geri ekle</button></div></div>)}
    </div>}
  </div>;
}

function FieldInput({field,focused,onChange,onUpload}){
  const label=field.label||fieldLabel(field.field);
  const id='structure-field-'+field.section+'-'+field.field;
  const value=String(field.value??'');
  const [status,setStatus]=useState('');
  const common={id,'data-structure-field':field.section+'|'+field.field};
  let control;
  if(field.input==='select')control=<select {...common} value={value} onChange={event=>onChange(field,field.field,event.target.value)}>{(field.options||[]).map(([option,text])=><option key={option} value={option}>{text}</option>)}</select>;
  else if(field.input==='textarea')control=<textarea {...common} rows={5} value={value} onChange={event=>onChange(field,field.field,event.target.value)}/>;
  else control=<input {...common} type={field.input==='url'?'text':'text'} inputMode={field.input==='url'?'url':undefined} value={value} onChange={event=>onChange(field,field.field,event.target.value)}/>;
  // Label and control are siblings so the accessible name is the label only.
  return <div className={`structure-field ${focused?'is-focused':''}`}>
    <div className="visual-property-field"><label htmlFor={id}>{label}</label>{control}</div>
    {field.input==='image'&&<>
      <div className="visual-image-preview">{value?<img src={value.replace(/^\.\.\//,'/')} alt=""/>:<span>Görsel seçilmedi</span>}</div>
      <label className="visual-upload-button">Görsel yükle<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;setStatus('Yükleniyor…');try{const url=await onUpload(file);onChange(field,field.field,url);setStatus('Görsel yüklendi.');}catch(error){setStatus(error.message||'Görsel yüklenemedi.');}}}/></label>
      {status&&<small className="structure-status" role="status">{status}</small>}
    </>}
    {field.linkField&&<div className="visual-property-field"><label htmlFor={id+'-link'}>{fieldLabel(field.linkField)}</label><input id={id+'-link'} type="text" inputMode="url" value={String(field.linkValue??'')} onChange={event=>onChange(field,field.linkField,event.target.value)}/></div>}
  </div>;
}

function ActionBar({actions,onAction}){
  return <div className="structure-actions" role="toolbar" aria-label="Öğe işlemleri">
    {actions.filter(action=>!action.action.startsWith('add')).map(action=><button key={action.action} type="button" className={action.danger?'is-danger':''} disabled={!!action.disabled} title={action.disabled||action.title} aria-label={action.title||action.label} onClick={()=>onAction(action.action)}>{action.label}</button>)}
  </div>;
}

function ItemList({collection,selectedNode,onSelect,onItemAction,onAdd,onMoveItem}){
  const [drag,setDrag]=useState(null);
  const atMax=collection.items.length>=collection.maxItems;
  const atMin=collection.items.length<=collection.minItems;
  return <section className="structure-collection" aria-label={collection.label}>
    <header><b>{collection.label}</b><small>{collection.items.length} / {collection.maxItems}</small></header>
    {collection.items.length===0?<div className="structure-empty-state"><p>Henüz {collection.itemLabel.toLocaleLowerCase('tr')} yok.</p></div>:
    <ol className="structure-items">
      {collection.items.map(item=><li key={item.id} className={`structure-item ${selectedNode===item.id?'is-selected':''} ${item.hidden?'is-hidden':''} ${drag===item.id?'is-dragging':''}`}
        draggable onDragStart={event=>{setDrag(item.id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);}}
        onDragOver={event=>{if(drag&&drag!==item.id){event.preventDefault();event.dataTransfer.dropEffect='move';}}}
        onDrop={event=>{if(drag&&drag!==item.id){event.preventDefault();onMoveItem(drag,item.index);}setDrag(null);}} onDragEnd={()=>setDrag(null)}>
        <span className="structure-handle" aria-hidden="true" title="Sürükleyerek sırala">☰</span>
        <button type="button" className="structure-item-label" onClick={()=>onSelect(item.id)} onKeyDown={event=>{if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();onMoveItem(item.id,item.index+(event.key==='ArrowUp'?-1:1));}}} title="Düzenlemek için seçin · Alt+↑/↓ ile taşıyın">
          <span>{item.label}</span>{item.hidden&&<em className="structure-badge is-hidden">👁‍🗨 Gizli</em>}{item.isNew&&<em className="structure-badge">Yeni</em>}
        </button>
        <div className="structure-item-actions">
          <button type="button" aria-label={`${item.label}: yukarı taşı`} title="Yukarı taşı" disabled={item.index===0} onClick={()=>onItemAction(item.id,'up')}>↑</button>
          <button type="button" aria-label={`${item.label}: aşağı taşı`} title="Aşağı taşı" disabled={item.index===collection.items.length-1} onClick={()=>onItemAction(item.id,'down')}>↓</button>
          <button type="button" aria-label={`${item.label}: düzenle`} title="Düzenle" onClick={()=>onSelect(item.id)}>✎</button>
          {can(item,'duplicate')&&<button type="button" aria-label={`${item.label}: çoğalt`} title={atMax?`En fazla ${collection.maxItems} öğe`:'Çoğalt'} disabled={atMax} onClick={()=>onItemAction(item.id,'duplicate')}>⧉</button>}
          <button type="button" aria-label={`${item.label}: ${item.hidden?'göster':'gizle'}`} title={item.hidden?'Göster':'Gizle'} aria-pressed={item.hidden} onClick={()=>onItemAction(item.id,item.hidden?'show':'hide')}>{item.hidden?'◌':'◉'}</button>
          {can(item,'delete')&&<button type="button" className="is-danger" aria-label={`${item.label}: sil`} title={atMin?`En az ${collection.minItems} öğe kalmalı`:'Sil'} disabled={atMin} onClick={()=>onItemAction(item.id,'delete')}>×</button>}
        </div>
      </li>)}
    </ol>}
    <button type="button" className="structure-add-item" disabled={atMax} title={atMax?`${collection.label} en fazla ${collection.maxItems} öğe içerebilir.`:''} onClick={()=>onAdd(collection.id)}>+ {collection.itemLabel} ekle</button>
  </section>;
}

export function NodeProperties({found,tree,focusField,selectedNode,onAction,onItemAction,onFieldChange,onUpload,onSelect,onAddItem,onMoveItem}){
  if(!found)return null;
  const {node,section,collection}=found;
  const actions=nodeActions(found,tree);
  const fields=node.fields||[];
  return <div className="structure-properties">
    <div className="visual-properties-heading">
      {node.kind==='item'&&<button type="button" className="structure-back" onClick={()=>onSelect(section.id)}>← {section.label}</button>}
      <span className="eyebrow">{node.kind==='section'?'BÖLÜM':'ÖĞE'} · {(componentTypes[node.type]?.label||node.typeLabel||'').toLocaleUpperCase('tr')}</span>
      <h4>{node.label}</h4>
      <small>{node.kind==='item'?`${collection.itemLabel} ${node.index+1} / ${collection.items.length}`:`${tree.sections.indexOf(node)+1}. bölüm`}{node.hidden?' · Sitede gizli':''}{node.isNew?' · Yeni':''}</small>
    </div>
    <ActionBar actions={actions} onAction={onAction}/>
    {node.kind==='section'&&componentTypes[node.type]?.note&&<p className="visual-panel-help">{componentTypes[node.type].note}</p>}
    {node.hidden&&<p className="structure-notice">Bu {node.kind==='section'?'bölüm':'öğe'} sitede ve önizlemede görünmez. “Göster” ile geri açabilirsiniz.</p>}
    {fields.length>0&&<div className="structure-fields">{fields.map(field=><FieldInput key={field.section+'|'+field.field} field={field} focused={!!focusField&&focusField.section===field.section&&focusField.field===field.field} onChange={onFieldChange} onUpload={onUpload}/>)}</div>}
    {node.kind==='section'&&fields.length===0&&node.collections.length===0&&<p className="visual-panel-help">Bu bölümde şemaya bağlı alan yok. Önizlemedeki yazı ve görsellere tıklayarak doğrudan düzenleyebilirsiniz.</p>}
    {node.kind==='section'&&node.collections.map(item=><ItemList key={item.id} collection={item} selectedNode={selectedNode} onSelect={onSelect} onItemAction={onItemAction} onAdd={onAddItem} onMoveItem={onMoveItem}/>)}
  </div>;
}
