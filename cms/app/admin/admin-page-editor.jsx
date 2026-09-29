'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {addItem, addSection, duplicateItem, duplicateSection, findNode, moveItem, moveSection, removeItem, removeSection, resolvePage, restoreSection, setItemHidden, setSectionHidden} from '../lib/page-schema.js';
import {NodeProperties, SectionPalette, StructureTree, nodeActions} from './admin-structure.jsx';
import {AdminButton} from './admin-controls.jsx';
import {PageSeoFields} from './admin-seo-panel.jsx';

const commonPages = [
  ['Ana sayfa', 'tr/index.html'],
  ['Ürünler', 'tr/hpl-products.html'],
  ['Teklif al', 'tr/teklif-al.html'],
  ['İletişim', 'tr/contact.html'],
  ['Hakkımızda', 'tr/about-us.html'],
  ['Blog', 'tr/blog/index.html'],
  ['Home page', 'en/index.html'],
  ['Products', 'en/hpl-products.html'],
  ['Request a quote', 'en/teklif-al.html'],
  ['Contact', 'en/contact.html'],
  ['About us', 'en/about-us.html'],
  ['Blog', 'en/blog/index.html']
];

const defaultSlides = [
  {src: '../assets/images/hero-hydraulic-cylinder.webp', alt: 'Yüksek mukavemetli hidrolik silindir yakın çekim'},
  {src: '../assets/images/hero-tractor-field.webp', alt: 'Tarım makinesi ve traktör sahada çalışırken'},
  {src: '../assets/images/hero-cnc-workshop.webp', alt: 'CNC torna atölyesinde hassas işleme'},
  {src: '../assets/images/hero-factory-production-line.webp', alt: 'Fabrika üretim hattı'}
];

const fieldLabels = {
  title: 'Başlık',
  content: 'Açıklama',
  image: 'Görsel adresi',
  href: 'Bağlantı adresi',
  'cta-text': 'Düğme yazısı',
  'cta-text-2': 'İkinci düğme yazısı',
  'cta-url': 'Düğme bağlantısı',
  'cta-url-2': 'İkinci düğme bağlantısı',
  alt: 'Görsel açıklaması'
};

function readableField(value) {
  return fieldLabels[value] || value.replaceAll('-', ' ').replace(/\b\w/g, char => char.toLocaleUpperCase('tr'));
}

function readableSection(value) {
  if (value === 'hero-1') return 'Ana görsel alanı';
  if (/^content-\d+$/.test(value)) return 'İçerik kartı ' + value.split('-')[1];
  return value.replaceAll('-', ' ').replace(/\b\w/g, char => char.toLocaleUpperCase('tr'));
}

function pageLabel(path) {
  const knownPage = commonPages.find(([, value]) => value === path)?.[0];
  if (knownPage) return knownPage;
  const language = path.startsWith('en/') ? 'English' : 'Türkçe';
  const title = path.split('/').pop().replace('.html', '').replace(/^\d+-/, '').replaceAll('-', ' ').replace(/\b\w/g, char => char.toLocaleUpperCase('tr'));
  return title + ' · ' + language;
}

export default function AdminPageEditor({db, page, savedPage={}, onSetPage, onChange, onSetPageContent, onSavePageDraft, onPublishPage, onUpdateProduct, onUpdatePost}) {
  const [mode, setMode] = useState('site');
  const [selected, setSelected] = useState(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [viewport, setViewport] = useState('desktop');
  const [leftView, setLeftView] = useState('structure');
  const [treeSearch, setTreeSearch] = useState('');
  const [actionPending, setActionPending] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [structure, setStructureState] = useState({page:'', status:'idle', base:null, editable:false, reason:''});
  const [selectedNode, setSelectedNode] = useState(null);
  const [focusField, setFocusField] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [insertAfter, setInsertAfter] = useState(null);
  const [renderNonce, setRenderNonce] = useState(0);
  const [frameGeneration, setFrameGeneration] = useState(0);
  const history = useRef({page, past:[], future:[]});
  const frameRef = useRef(null);
  const previewFormRef = useRef(null);
  const previewStateRef = useRef(null);
  const renderedKey = useRef(null);
  const postPending = useRef(false);
  const scrollToSelected = useRef(false);
  const pendingScroll = useRef(null);
  const liveRef = useRef({});
  const navigationReturnFocus = useRef(null);
  const current = db.pages?.[page] || {};
  const pageDirty = JSON.stringify(current) !== JSON.stringify(savedPage || {});
  const availablePages = useMemo(() => [...new Set([
    ...Object.keys(db.pages || {}),
    ...(db.posts || []).filter(post=>post.legacy!==true&&post.slug).map(post=>`${post.lang||'tr'}/blog/${post.slug}.html`)
  ])].sort((left, right) => left.localeCompare(right, 'tr')), [db.pages, db.posts]);
  const language = page.startsWith('en/') ? 'en' : 'tr';
  const isHomePage = /^(tr|en)\/index\.html$/.test(page);
  const hasDraft = !!db.pageDrafts?.[page];
  const editableContent = current;
  const viewportWidth = viewport === 'tablet' ? '768px' : viewport === 'mobile' ? '390px' : '100%';
  const pagesForLanguage = availablePages.filter(path => path.startsWith(language + '/'));
  const savedSlides = current['hero-1']?.slides;
  const slides = Array.isArray(savedSlides) ? savedSlides : defaultSlides;
  const structureBase = structure.page === page && structure.status === 'ready' ? structure.base : null;
  const tree = useMemo(() => structureBase ? resolvePage(structureBase, current, language) : null, [structureBase, current, language]);
  const selectedFound = tree && selectedNode ? findNode(tree, selectedNode) : null;
  const renderKey = JSON.stringify(current.__layout ?? null) + '|' + renderNonce;
  const previewAction = '/' + page + '?cmsPreview=1' + (previewSearch ? '&' + previewSearch.slice(1) : '');
  liveRef.current = {tree, structureBase, current, selectedNode, renderKey, pageDirty};

  useEffect(() => {
    setSelected(null);
    setFrameLoaded(false);
    setSelectedNode(null);
    setFocusField(null);
    setInsertAfter(null);
    setExpanded(new Set());
    setRenderNonce(0);
    renderedKey.current = null;
    history.current={page,past:[],future:[]};
    setHistoryVersion(value=>value+1);
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    setStructureState({page, status:'loading', base:null, editable:false, reason:''});
    fetch('/api/page-structure?page=' + encodeURIComponent(page), {cache:'no-store'})
      .then(async response => {const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Sayfa yapısı yüklenemedi.'); return data;})
      .then(data => {if (!cancelled) setStructureState({page, status:'ready', base:data.editable ? data.structure : null, editable:!!data.editable, reason:data.reason || ''});})
      .catch(error => {if (!cancelled) setStructureState({page, status:'error', base:null, editable:false, reason:error.message || 'Sayfa yapısı yüklenemedi.'});});
    return () => {cancelled = true;};
  }, [page]);

  useEffect(() => {
    if(!fullscreen)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const exit=event=>{if(event.key==='Escape'&&!pendingNavigation)setFullscreen(false)};
    window.addEventListener('keydown',exit);
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',exit)};
  },[fullscreen,pendingNavigation]);

  useEffect(()=>{
    if(!pendingNavigation)return;
    const dialog=document.querySelector('.page-navigation-dialog');
    const buttons=[...(dialog?.querySelectorAll('button:not(:disabled)')||[])];
    buttons[0]?.focus();
    const trapFocus=event=>{
      if(event.key==='Escape'&&!actionPending){event.preventDefault();resolveNavigation('cancel');return}
      if(event.key!=='Tab')return;
      const active=[...(dialog?.querySelectorAll('button:not(:disabled)')||[])];
      if(!active.length)return;
      const first=active[0],last=active[active.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    };
    window.addEventListener('keydown',trapFocus);
    return()=>window.removeEventListener('keydown',trapFocus);
  },[pendingNavigation,actionPending]);

  const clonePage=value=>JSON.parse(JSON.stringify(value||{}));
  const checkpoint=()=>{
    const state=history.current;
    if(state.page!==page)history.current={page,past:[],future:[]};
    const next=clonePage(current),previous=history.current.past.at(-1);
    if(JSON.stringify(previous)!==JSON.stringify(next))history.current.past.push(next);
    if(history.current.past.length>60)history.current.past.shift();
    history.current.future=[];setHistoryVersion(value=>value+1);
  };
  const travelHistory=direction=>{
    const state=history.current,from=direction==='undo'?state.past:state.future,to=direction==='undo'?state.future:state.past;
    if(!from.length)return;
    to.push(clonePage(current));
    const snapshot=from.pop();setHistoryVersion(value=>value+1);onSetPageContent?.(page,snapshot);
    // Undo/redo can restore any field or structure: re-render the preview from state.
    setRenderNonce(value=>value+1);
  };

  const navigateToPage = (nextPage, search='') => {
    setPendingNavigation(null);
    setPreviewSearch(search);
    onSetPage(nextPage);
  };
  const requestNavigation = (nextPage, search='') => {
    if (!nextPage || nextPage === page) {
      setPreviewSearch(search);
      return;
    }
    if (pageDirty) {
      navigationReturnFocus.current=document.activeElement;
      setActionMessage('');
      setPendingNavigation({page: nextPage, search});
      return;
    }
    navigateToPage(nextPage, search);
  };
  const resolveNavigation = async choice => {
    if (!pendingNavigation || actionPending) return;
    if (choice === 'cancel') {
      setPendingNavigation(null);
      requestAnimationFrame(()=>navigationReturnFocus.current?.focus?.());
      return;
    }
    if (choice === 'discard') {
      onSetPageContent?.(page, clonePage(savedPage));
      navigateToPage(pendingNavigation.page, pendingNavigation.search);
      return;
    }
    setActionPending('navigation-save');
    setActionMessage('');
    try {
      const result = await onSavePageDraft?.(page);
      if (!result?.ok) throw new Error(result?.error || 'Taslak kaydedilemedi.');
      setActionMessage('Taslak kaydedildi.');
      navigateToPage(pendingNavigation.page, pendingNavigation.search);
    } catch (error) {
      setActionMessage(error.message || 'Taslak kaydedilemedi.');
    } finally {
      setActionPending('');
    }
  };
  const changeLanguage = nextLanguage => {
    const relativePage = page.replace(/^(tr|en)\//, '');
    const matchingPage = nextLanguage + '/' + relativePage;
    requestNavigation(availablePages.includes(matchingPage) ? matchingPage : nextLanguage + '/index.html');
  };

  useEffect(() => {
    const handleMessage = event => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'cms-admin:structure') {
        // Legacy DOM outline; the tree now comes from the page schema.
      } else if (event.data?.type === 'cms-admin:select-element') {
        setSelected(event.data.element||null);
        selectFromPreview(event.data.element);
      } else if (event.data?.type === 'cms-admin:select-node' && typeof event.data.id === 'string') {
        setSelected(null);setSelectedNode(liveRef.current.tree&&findNode(liveRef.current.tree,event.data.id)?event.data.id:null);setFocusField(null);
      } else if (event.data?.type === 'cms-admin:node-action' && typeof event.data.id === 'string' && typeof event.data.action === 'string') {
        runAction(event.data.id,event.data.action);
      } else if (event.data?.type === 'cms-admin:select-field') {
        setSelected({section: event.data.section, field: event.data.field, linkField: event.data.linkField || '', selector:event.data.selector||'', label:event.data.label||readableField(event.data.field), value:event.data.value||'', href:event.data.href||''});
      } else if (event.data?.type === 'cms-admin:change-field') {
        checkpoint();
        onChange(event.data.section, event.data.field, event.data.value);
        if (event.data.linkField) onChange(event.data.section, event.data.linkField, event.data.linkValue || '');
      } else if (event.data?.type === 'cms-admin:change-visual' && event.data.key && event.data.patch && typeof event.data.patch === 'object') {
        checkpoint();
        onChange('__visual', event.data.key, event.data.patch);
      } else if (event.data?.type === 'cms-admin:add-block' && event.data.block?.id && ['text','image','quote'].includes(event.data.block.type)) {
        checkpoint();
        const blocks=current.__blocks?.items||[];
        onChange('__blocks','items',[...blocks,event.data.block]);
      } else if (event.data?.type === 'cms-admin:remove-block' && event.data.id) {
        checkpoint();
        const blocks=current.__blocks?.items||[];
        onChange('__blocks','items',blocks.filter(block=>block.id!==event.data.id));
      } else if (event.data?.type === 'cms-admin:change-binding' && event.data.binding && typeof event.data.value === 'string') {
        const binding=event.data.binding;
        if(binding.record==='product'&&binding.id&&binding.field)onUpdateProduct?.(binding.id,{[binding.field]:event.data.value});
        else if(binding.record==='post'&&binding.id&&['title','excerpt','image','content'].includes(binding.field))onUpdatePost?.(binding.id,binding.field,event.data.value);
      } else if (event.data?.type === 'cms-admin:product-edit' && event.data.id && event.data.field && typeof event.data.value === 'string') {
        const item=db.products?.find(product=>product.id===event.data.id||product.slug===event.data.id||product.code===event.data.id);
        if(item&&event.data.field==='galleryImage'&&Number.isInteger(event.data.index)&&event.data.index>=0&&event.data.index<(item.gallery||[]).length){
          const gallery=item.gallery.map((photo,index)=>index===event.data.index?{...photo,url:event.data.value}:photo);
          onUpdateProduct?.(item.id,{gallery});
        }else if(item&&event.data.field==='rowField'){
          const {collection,index,childIndex,property,value}=event.data;
          const validProperties={dimensionRows:['label','labelEn','value','valueEn'],compatibleBrands:['brand','brandEn','model','modelEn'],dimensionGroups:['title','titleEn']};
          if(!Number.isInteger(index)||index<0||!validProperties[collection]?.includes(property))return;
          if(collection==='dimensionGroups'){
            if(index>=(item.dimensionGroups||[]).length)return;
            const groups=item.dimensionGroups.map((group,groupIndex)=>{
              if(groupIndex!==index)return group;
              if(childIndex===undefined)return {...group,[property]:value};
              if(!Number.isInteger(childIndex)||childIndex<0||childIndex>=(group.rows||[]).length)return group;
              return {...group,rows:group.rows.map((row,rowIndex)=>rowIndex===childIndex?{...row,[property]:value}:row)};
            });
            onUpdateProduct?.(item.id,{dimensionGroups:groups});
          }else if(index<(item[collection]||[]).length){
            const rows=item[collection].map((row,rowIndex)=>rowIndex===index?{...row,[property]:value}:row);
            onUpdateProduct?.(item.id,{[collection]:rows});
          }
        }else if(item&&event.data.field!=='galleryImage')onUpdateProduct?.(item.id, {[event.data.field]:event.data.value});
      } else if (event.data?.type === 'cms-admin:post-edit' && event.data.id && ['title','excerpt','image','content'].includes(event.data.field) && typeof event.data.value === 'string') {
        const post=db.posts?.find(item=>item.id===event.data.id);
        if(post)onUpdatePost?.(post.id,event.data.field,event.data.value);
      } else if (event.data?.type === 'cms-admin:slides-change' && Array.isArray(event.data.slides)) {
        checkpoint();
        onChange('hero-1', 'slides', event.data.slides);
      } else if (event.data?.type === 'cms-admin:navigate' && availablePages.includes(event.data.page)) {
        requestNavigation(event.data.page, event.data.search || '');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [availablePages, onSetPage, onChange, onUpdateProduct, onUpdatePost, db.products, db.posts, current.__blocks, checkpoint, pageDirty, requestNavigation]);

  const updateField = (section, field, value) => {checkpoint();onChange(section, field, value)};
  const setSlides = nextSlides => updateField('hero-1', 'slides', nextSlides);

  useEffect(() => {
    if (!frameLoaded || mode !== 'site' || !selected) return;
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    const value = current[selected.section]?.[selected.field];
    const linkValue = selected.linkField ? current[selected.section]?.[selected.linkField] : undefined;
    target.postMessage({type: 'cms-admin:update-field', section: selected.section, field: selected.field, value, linkField: selected.linkField, linkValue}, window.location.origin);
  }, [frameLoaded, mode, selected, current]);

  useEffect(() => {
    if (!frameLoaded || mode !== 'site') return;
    frameRef.current?.contentWindow?.postMessage({type: 'cms-admin:update-slides', slides}, window.location.origin);
  }, [frameLoaded, mode, slides]);

  useEffect(()=>{
    if(!frameLoaded||mode!=='site')return;
    frameRef.current?.contentWindow?.postMessage({type:'cms-admin:sync-blocks',blocks:current.__blocks?.items||[]},window.location.origin);
  },[frameLoaded,mode,current.__blocks]);

  useEffect(()=>{
    if(!frameLoaded)return;
    frameRef.current?.contentWindow?.postMessage({type:'cms-admin:set-panel-mode',enabled:true},window.location.origin);
  },[frameLoaded,frameGeneration,page]);

  // ── Structural editing (schema-driven) ─────────────────────────────────
  const postToFrame=message=>frameRef.current?.contentWindow?.postMessage(message,window.location.origin);
  const selectNode=(id,{field=null,scroll=true}={})=>{
    setSelected(null);setSelectedNode(id);setFocusField(field);
    postToFrame({type:'cms-admin:focus-node',id:id||'',section:field?.section,field:field?.field,scroll});
  };
  // A preview click on a schema field selects its owning item/section so the
  // properties panel shows the whole card; other clicks keep the legacy panel.
  const selectFromPreview=element=>{
    const liveTree=liveRef.current.tree;const context=element?.node||{};
    const field=element?.section&&element?.field?{section:element.section,field:element.field}:null;
    for(const owner of [context.item,context.section].filter(Boolean)){
      const found=liveTree&&findNode(liveTree,owner);
      if(!found)continue;
      const fieldMatch=field&&found.node.fields?.some(item=>item.section===field.section&&(item.field===field.field||item.linkField===field.field));
      if(fieldMatch||(!field&&!element.key&&!element.binding&&(owner===context.item||element.kind==='section'))){setSelectedNode(owner);setFocusField(fieldMatch?field:null);return;}
    }
    setSelectedNode(null);setFocusField(null);
  };
  // select: true → select the node the operation returns (add/duplicate);
  // 'if-selected' → only when the affected node was selected (delete);
  // false → keep the current selection (move/hide/show from a list).
  const applyStructure=(operation,message='',{select=true,affected=null}={})=>{
    const {structureBase:base,current:content,selectedNode:currentSelection}=liveRef.current;
    if(!base)return false;
    try{
      const result=operation(base,content);
      checkpoint();onSetPageContent?.(page,result.content);
      if(result.id!==undefined&&(select===true||(select==='if-selected'&&affected===currentSelection))){setSelected(null);setSelectedNode(result.id);setFocusField(null);scrollToSelected.current=true;}
      setActionMessage(message);return true;
    }catch(error){setActionMessage(error.message||'İşlem uygulanamadı.');return false;}
  };
  const moveNode=(id,toIndex)=>{
    const found=liveRef.current.tree&&findNode(liveRef.current.tree,id);if(!found)return;
    if(found.node.kind==='section')applyStructure((base,content)=>moveSection(base,content,language,id,toIndex),'Bölüm taşındı.',{select:false});
    else applyStructure((base,content)=>moveItem(base,content,language,id,toIndex),'Sıra değişti.',{select:false});
  };
  const runAction=(id,action)=>{
    const liveTree=liveRef.current.tree;const found=liveTree&&findNode(liveTree,id);if(!found)return;
    const {node}=found;const isSection=node.kind==='section';
    if(action==='add-section'){setInsertAfter(isSection?node.id:found.section.id);setLeftView('add');return;}
    if(action.startsWith('add:')){
      const collectionId=action.slice(4);const collection=findNode(liveTree,collectionId)?.node;
      const afterId=node.kind==='item'&&found.collection?.id===collectionId?node.id:undefined;
      applyStructure((base,content)=>addItem(base,content,language,collectionId,{afterId}),`${collection?.itemLabel||'Öğe'} eklendi. Değişiklik taslağa kaydedilene kadar yalnızca önizlemede görünür.`);return;
    }
    const index=isSection?liveTree.sections.indexOf(node):node.index;
    if(action==='up'||action==='down'){moveNode(id,index+(action==='up'?-1:1));return;}
    if(action==='duplicate'){applyStructure((base,content)=>isSection?duplicateSection(base,content,language,id):duplicateItem(base,content,language,id),`${isSection?'Bölüm':'Öğe'} çoğaltıldı.`);return;}
    if(action==='hide'||action==='show'){applyStructure((base,content)=>isSection?setSectionHidden(base,content,language,id,action==='hide'):setItemHidden(base,content,language,id,action==='hide'),action==='hide'?'Gizlendi: sitede görünmez, yapı ağacında kalır.':'Yeniden görünür.',{select:false});return;}
    if(action==='delete'){
      if(!window.confirm(`“${node.label}” ${isSection?'bölümü':'öğesi'} silinsin mi? Değişiklik taslağa yazılır; yayımlamadan önce Geri al ile dönebilirsiniz.`))return;
      applyStructure((base,content)=>isSection?removeSection(base,content,language,id):removeItem(base,content,language,id),`${isSection?'Bölüm':'Öğe'} silindi.`,{select:'if-selected',affected:id});
    }
  };
  const changeStructuredField=(field,name,value)=>{
    updateField(field.section,name,value);
    if(name==='target'||name==='variant'){setRenderNonce(nonce=>nonce+1);return;}
    if(name===field.field&&field.input!=='url')postToFrame({type:'cms-admin:update-field',section:field.section,field:field.field,value});
    else if(name===field.linkField)postToFrame({type:'cms-admin:update-field',section:field.section,field:field.field,value:String(field.value??''),linkField:name,linkValue:value});
  };
  const uploadFile=async file=>{
    const form=new FormData();form.set('file',file);
    const response=await fetch('/api/upload',{method:'POST',body:form});const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Görsel yüklenemedi.');
    return result.url;
  };
  const submitPreview=()=>{
    const form=previewFormRef.current,input=previewStateRef.current;if(!form||!input)return;
    try{pendingScroll.current=frameRef.current?.contentWindow?.scrollY??null;}catch{pendingScroll.current=null;}
    input.value=JSON.stringify(liveRef.current.current);
    renderedKey.current=liveRef.current.renderKey;postPending.current=true;
    form.submit();
  };
  const handleFrameLoad=()=>{
    const wasPost=postPending.current;postPending.current=false;
    const win=frameRef.current?.contentWindow;
    if(!wasPost)renderedKey.current=liveRef.current.pageDirty?'stale':liveRef.current.renderKey;
    else if(pendingScroll.current!==null){try{win?.scrollTo(0,pendingScroll.current);}catch{}pendingScroll.current=null;}
    try{if(wasPost&&!win?.document.querySelector('main'))setActionMessage('Önizleme oluşturulamadı: '+(win?.document.body?.textContent||'').trim().slice(0,200));}catch{}
    setFrameLoaded(true);setFrameGeneration(value=>value+1);
    const selectedId=liveRef.current.selectedNode;
    if(selectedId)win?.postMessage({type:'cms-admin:focus-node',id:selectedId,scroll:scrollToSelected.current},window.location.origin);
    scrollToSelected.current=false;
  };
  // Re-render the preview on the server whenever the structure changed.
  useEffect(()=>{
    if(!frameLoaded||mode!=='site'||postPending.current||renderedKey.current===null||renderedKey.current===renderKey)return;
    submitPreview();
  },[frameLoaded,frameGeneration,mode,renderKey]);
  useEffect(()=>{
    if(!tree||!selectedNode)return;
    const found=findNode(tree,selectedNode);if(!found)return;
    // Selecting a section opens it and its collections; selecting an item opens its path.
    const ids=[found.section.id,...(found.collection?[found.collection.id]:found.node.kind==='section'?found.node.collections.map(collection=>collection.id):[])];
    setExpanded(previous=>{if(ids.every(id=>previous.has(id)))return previous;const next=new Set(previous);ids.forEach(id=>next.add(id));return next;});
  },[tree,selectedNode]);
  useEffect(()=>{
    if(!focusField)return;
    requestAnimationFrame(()=>document.querySelector(`[data-structure-field="${CSS.escape(focusField.section+'|'+focusField.field)}"]`)?.focus({preventScroll:false}));
  },[focusField,selectedNode]);
  // Schema-derived quick actions shown on the selected node inside the preview.
  const quickActionsKey=JSON.stringify(selectedFound?[selectedNode,selectedFound.node.label,selectedFound.node.hidden,nodeActions(selectedFound,tree).map(action=>action.action+(action.disabled?'!':''))]:null);
  useEffect(()=>{
    if(!frameLoaded||mode!=='site')return;
    const found=liveRef.current.tree&&selectedNode?findNode(liveRef.current.tree,selectedNode):null;
    const actions=found&&!found.node.hidden?nodeActions(found,liveRef.current.tree).filter(action=>!action.disabled).map(({action,label,danger})=>({action,label,danger:!!danger})):[];
    postToFrame({type:'cms-admin:node-actions',id:actions.length?selectedNode:'',label:found?.node.label||'',actions});
  },[frameLoaded,frameGeneration,mode,quickActionsKey]);
  const paletteAfter=insertAfter||selectedFound?.section?.id||null;
  const paletteAfterLabel=paletteAfter&&tree?findNode(tree,paletteAfter)?.node.label:'';

  const selectedBinding=selected?.binding;
  const selectedValue=selected?.section&&selected?.field
    ? current[selected.section]?.[selected.field]??selected.value??''
    : selected?.key?current.__visual?.[selected.key]?.[selected.kind==='image'?'src':'text']??selected.value??''
    : selected?.value??'';
  const updateSelectedValue=(property,value)=>{
    if(!selected)return;
    if(selected.section&&selected.field){
      if(property==='href'&&selected.linkField)updateField(selected.section,selected.linkField,value);
      else if(property==='alt'){updateField(selected.section,'alt',value);frameRef.current?.contentWindow?.postMessage({type:'cms-admin:update-alt',section:selected.section,value},window.location.origin);}
      else updateField(selected.section,selected.field,value);
    }else if(selectedBinding?.record==='product'&&selectedBinding.id&&selectedBinding.field){
      if(selectedBinding.field==='galleryImage'&&Number.isInteger(selectedBinding.index)){
        const product=db.products?.find(item=>item.id===selectedBinding.id);const gallery=(product?.gallery||[]).map((photo,index)=>index===selectedBinding.index?{...photo,url:value}:photo);onUpdateProduct?.(selectedBinding.id,{gallery});
      }else onUpdateProduct?.(selectedBinding.id,{[selectedBinding.field]:value});
      frameRef.current?.contentWindow?.postMessage({type:'cms-admin:update-binding',selector:selected.selector,kind:selected.kind,value},window.location.origin);
    }else if(selectedBinding?.record==='post'&&selectedBinding.id&&['title','excerpt','image','content'].includes(selectedBinding.field)){
      onUpdatePost?.(selectedBinding.id,selectedBinding.field,value);
      frameRef.current?.contentWindow?.postMessage({type:'cms-admin:update-binding',selector:selected.selector,kind:selected.kind,value},window.location.origin);
    }
    else if(selected.key){updateField('__visual',selected.key,{[property]:value});frameRef.current?.contentWindow?.postMessage({type:'cms-admin:update-visual',selector:selected.selector,key:selected.key,property,value},window.location.origin);}
    setSelected(previous=>previous?{...previous,value}:previous);
  };
  const uploadForSelection=async file=>{
    if(!file||!selected)return;
    const form=new FormData();form.set('file',file);
    try{const response=await fetch('/api/upload',{method:'POST',body:form});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Görsel yüklenemedi.');updateSelectedValue('src',result.url);}
    catch(error){setActionMessage(error.message||'Görsel yüklenemedi.');}
  };
  const saveDraft=async()=>{
    if(!onSavePageDraft||actionPending)return;
    setActionPending('save');setActionMessage('');
    try{const result=await onSavePageDraft(page);if(!result?.ok)throw new Error(result?.error||'Taslak kaydedilemedi.');setActionMessage(result.hasChanges===false?'Bu sayfada yayımlanmamış değişiklik yok.':'Taslak kaydedildi. Canlı site henüz değişmedi.');}
    catch(error){setActionMessage(error.message||'Taslak kaydedilemedi.');}
    finally{setActionPending('');}
  };
  const publishDraft=async()=>{
    if(!onPublishPage||actionPending)return;
    if(!window.confirm('Bu sayfanın taslağı canlı sitede yayımlansın mı?'))return;
    setActionPending('publish');setActionMessage('');
    try{const result=await onPublishPage(page);if(!result?.ok)throw new Error(result?.error||'Sayfa yayımlanamadı.');setActionMessage('Sayfa yayımlandı. Canlı siteyi yenileyerek görebilirsiniz.');}
    catch(error){setActionMessage(error.message||'Sayfa yayımlanamadı.');}
    finally{setActionPending('');}
  };
  return (
    <section className="panel page-editor-panel">
      <div className="panelhead page-editor-heading">
        <div><span className="eyebrow">SAYFA İÇERİĞİ</span><h3>{pageLabel(page)}</h3></div>
        <div className="page-picker-group">
          <div className="subtabs page-language-switch" role="group" aria-label="Düzenlenecek sayfanın dili">
            <button type="button" aria-pressed={language === 'tr'} onClick={() => changeLanguage('tr')}>Türkçe</button>
            <button type="button" aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}>English</button>
          </div>
          <label className="page-picker">Düzenlenecek sayfa
            <select value={page} onChange={event => requestNavigation(event.target.value)}>
              {commonPages.filter(([, path]) => path.startsWith(language + '/')).map(([label, path]) => <option key={path} value={path}>{label}</option>)}
              <optgroup label={language === 'en' ? 'Other English pages' : 'Diğer Türkçe sayfalar'}>
                {pagesForLanguage.filter(path => !commonPages.some(([, commonPath]) => commonPath === path)).map(path => <option key={path} value={path}>{pageLabel(path)}</option>)}
              </optgroup>
            </select>
          </label>
        </div>
      </div>

      <div className="page-mode-switch" role="tablist" aria-label="Sayfa düzenleme görünümü">
        <button type="button" role="tab" aria-selected={mode === 'list'} aria-controls="page-editor-content" id="page-mode-list" tabIndex={mode === 'list' ? 0 : -1} onClick={() => setMode('list')}><span aria-hidden="true">☷</span> Alan listesi</button>
        <button type="button" role="tab" aria-selected={mode === 'site'} aria-controls="page-editor-content" id="page-mode-site" tabIndex={mode === 'site' ? 0 : -1} onClick={() => setMode('site')}><span aria-hidden="true">◉</span> Sitede düzenle</button>
        <button type="button" role="tab" aria-selected={mode === 'seo'} aria-controls="page-editor-content" id="page-mode-seo" tabIndex={mode === 'seo' ? 0 : -1} onClick={() => setMode('seo')}><span aria-hidden="true">⌕</span> SEO ve paylaşım</button>
      </div>

      <div id="page-editor-content" role="tabpanel" aria-labelledby={'page-mode-' + mode}>
        {mode === 'list' && (
          <div className="page-fields-view">
            <p className="hint">Düzenlemek istediğiniz alanı açın. “Sitede düzenle” görünümünde önizleme üzerindeki metinlere tıklayarak da seçim yapabilirsiniz.</p>
            {Object.entries(current).filter(([section]) => !section.startsWith('__')).map(([section, fields], sectionIndex) => {
              const textFields = Object.entries(fields).filter(([field, value]) => field !== 'slides' && typeof value === 'string');
              const hasSlides = Array.isArray(fields.slides) || (section === 'hero-1' && isHomePage);
              return (
                <details key={section} open={sectionIndex === 0}>
                  <summary><span className="dot" />{readableSection(section)}<small>{textFields.length + (hasSlides ? 1 : 0)} düzenlenebilir alan</small></summary>
                  <div className="fields">
                    {textFields.map(([field, value]) => (
                      <label key={field}><span>{readableField(field)}</span>{value.length > 120 ? <textarea rows="3" value={value} onChange={event => updateField(section, field, event.target.value)} /> : <input value={value} onChange={event => updateField(section, field, event.target.value)} />}</label>
                    ))}
                    {hasSlides && <button type="button" className="slider-shortcut" onClick={() => setMode('site')}>Ana sayfa görsellerini düzenle <span aria-hidden="true">→</span></button>}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {mode === 'seo' && (
          <div className="page-seo-view">
            <p className="hint">Arama sonucu ve sosyal paylaşım bilgileri bu sayfanın taslağına kaydedilir; “Yayımla” ile canlı sayfanın &lt;head&gt; etiketlerine, site haritasına ve hreflang bağlantılarına yansır.</p>
            <PageSeoFields route={page} value={current.__seo} settings={db.settings} onChange={(field, value) => updateField('__seo', field, value)} />
            <div className="editor-actions"><span>{hasDraft ? 'Bu sayfada yayımlanmamış taslak var.' : 'Değişiklikler önce taslak olarak kaydedilir.'}{actionMessage ? ' ' + actionMessage : ''}</span><AdminButton onClick={saveDraft} disabled={actionPending !== ''}>{actionPending === 'save' ? 'Kaydediliyor…' : 'Taslak kaydet'}</AdminButton><AdminButton variant="primary" onClick={publishDraft} disabled={!hasDraft || actionPending !== ''}>{actionPending === 'publish' ? 'Yayımlanıyor…' : 'Yayımla'}</AdminButton></div>
          </div>
        )}

        {mode === 'site' && (
          <div className={`visual-page-editor ${fullscreen?'is-fullscreen':''}`}>
            <div className="visual-editor-toolbar">
              <div className="visual-toolbar-page">
                <span className="visual-editor-brand">SAYFA DÜZENLEYİCİ</span>
                <label>Sayfa
                  <select value={page} onChange={event=>requestNavigation(event.target.value)}>
                    {commonPages.filter(([,path])=>path.startsWith(language+'/')).map(([label,path])=><option key={path} value={path}>{label}</option>)}
                    <optgroup label={language==='en'?'Other pages':'Diğer sayfalar'}>{pagesForLanguage.filter(path=>!commonPages.some(([,known])=>known===path)).map(path=><option key={path} value={path}>{pageLabel(path)}</option>)}</optgroup>
                  </select>
                </label>
                <span className={`visual-draft-badge ${hasDraft?'is-draft':''}`}>{hasDraft?'Taslak var':'Yayındaki sürüm'}</span>
              </div>
              <div className="visual-toolbar-actions">
                <div className="visual-viewport-switch" role="group" aria-label="Önizleme görünümü">
                  {[['desktop','Masaüstü'],['tablet','Tablet'],['mobile','Mobil']].map(([value,label])=><button key={value} type="button" aria-pressed={viewport===value} onClick={()=>setViewport(value)}>{label}</button>)}
                </div>
                <button type="button" className="visual-tool-button" onClick={()=>travelHistory('undo')} disabled={!history.current.past.length} title="Geri al">↶ <span>Geri al</span></button>
                <button type="button" className="visual-tool-button" onClick={()=>travelHistory('redo')} disabled={!history.current.future.length} title="Yinele">↷ <span>Yinele</span></button>
                <button type="button" className="visual-save-button" onClick={saveDraft} disabled={actionPending!==''}>{actionPending==='save'||actionPending==='navigation-save'?'Kaydediliyor…':'Taslak kaydet'}</button>
                <button type="button" className="visual-publish-button" onClick={publishDraft} disabled={!hasDraft||actionPending!==''}>{actionPending==='publish'?'Yayımlanıyor…':'Yayımla'}</button>
                <button type="button" className="visual-fullscreen-button" onClick={()=>setFullscreen(value=>!value)}>{fullscreen?'Tam ekrandan çık':'Tam ekran çalış'}</button>
              </div>
            </div>

            <div className="visual-editor-layout">
              <aside className="visual-editor-sidebar visual-editor-left" aria-label="Sayfa yapısı">
                <div className="visual-panel-tabs" role="tablist" aria-label="Sol panel görünümleri">
                  {[['structure','Yapı'],['add','Bölüm ekle']].map(([value,label])=><button key={value} type="button" role="tab" aria-selected={leftView===value} onClick={()=>{setLeftView(value);if(value==='structure')setInsertAfter(null);}}>{label}</button>)}
                </div>
                {leftView==='structure'&&<label className="visual-tree-search"><span aria-hidden="true">⌕</span><input value={treeSearch} onChange={event=>setTreeSearch(event.target.value)} placeholder="Yapıda bul" aria-label="Sayfa yapısında ara" /></label>}
                <div className="visual-tree-content">
                  {structure.status==='loading'&&<p className="visual-panel-help">Sayfa yapısı yükleniyor…</p>}
                  {structure.status==='error'&&<p className="visual-panel-help" role="alert">{structure.reason}</p>}
                  {structure.status==='ready'&&!structure.editable&&<p className="visual-panel-help">{structure.reason}</p>}
                  {leftView==='structure'&&tree&&<StructureTree tree={tree} pageTitle={pageLabel(page)} selectedNode={selectedNode} focusField={focusField} expanded={expanded} search={treeSearch}
                    onToggle={id=>setExpanded(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;})}
                    onSelect={id=>selectNode(id)} onSelectField={(ownerId,field)=>selectNode(ownerId,{field:{section:field.section,field:field.field}})} onMoveNode={moveNode}/>}
                  {leftView==='add'&&tree&&<SectionPalette tree={tree} insertAfter={paletteAfter} insertAfterLabel={paletteAfterLabel}
                    onAdd={type=>{if(applyStructure((base,content)=>addSection(base,content,language,type,{afterId:paletteAfter||undefined}),'Bölüm eklendi. Taslak kaydedene kadar yalnızca önizlemede görünür.')){setLeftView('structure');setInsertAfter(null);}}}
                    onRestore={key=>{if(applyStructure((base,content)=>restoreSection(base,content,language,key,{afterId:paletteAfter||undefined}),'Bölüm sayfaya geri eklendi.')){setLeftView('structure');setInsertAfter(null);}}}/>}
                </div>
              </aside>

              <div className="visual-editor-canvas-column">
                <div className="visual-canvas-hint"><span aria-hidden="true">⌖</span> Önizlemede bir bölüme, karta, yazıya veya düğmeye tıklayın; sağ panelden düzenleyin, ekleyin veya sıralayın. Önizleme canlı siteyle aynı bileşenlerle çizilir.</div>
                <div className={`visual-canvas-stage viewport-${viewport}`}>
                  {!frameLoaded&&<div className="preview-loading">Site önizlemesi açılıyor…</div>}
                  <form ref={previewFormRef} method="post" action={previewAction} target="cms-preview-frame" hidden><input type="hidden" name="cmsState" ref={previewStateRef}/></form>
                  <div className="visual-frame-scroll"><iframe ref={frameRef} name="cms-preview-frame" key={page+previewSearch} title={pageLabel(page)+' sayfa önizlemesi'} src={previewAction} onLoad={handleFrameLoad} style={{width:viewportWidth,maxWidth:'none'}} /></div>
                </div>
                <div className="visual-editor-status"><span>{actionPending? 'Değişiklik işleniyor…':actionMessage|| (hasDraft?'Taslak kayıtlı. Canlı sitede değişiklik yok.':'Düzenlemeler taslak olarak kaydedilir.')}</span><span>{pageLabel(page)}</span></div>
              </div>

              <aside className="visual-editor-sidebar visual-editor-right" aria-label="Seçili öğe özellikleri">
                {selectedFound?<NodeProperties found={selectedFound} tree={tree} focusField={focusField} selectedNode={selectedNode}
                  onAction={action=>runAction(selectedNode,action)} onItemAction={runAction} onFieldChange={changeStructuredField} onUpload={uploadFile}
                  onSelect={id=>selectNode(id)} onAddItem={collectionId=>runAction(selectedNode,'add:'+collectionId)} onMoveItem={moveNode}/>:<>
                <div className="visual-properties-heading"><span className="eyebrow">ÖZELLİKLER</span><h4>{selected?.label||'Bir öğe seçin'}</h4>{selected?.section&&<small>{readableSection(selected.section)} / {readableField(selected.field||'')}</small>}</div>
                {!selected&&<p className="visual-panel-help">Önizlemede bir bölüme, karta veya alana tıklayın ya da soldaki yapı ağacından seçin. Kart, düğme ve bölüm ekleme işlemleri seçili bölümün panelinde görünür.</p>}
                {selected&&<>
                  {selected.section&&selected.field&&<>
                    <label className="visual-property-field"><span>{readableField(selected.field)}</span>{selected.field==='content'||String(selectedValue).length>120?<textarea rows="5" value={selectedValue} onChange={event=>updateSelectedValue('text',event.target.value)} />:<input value={selectedValue} onChange={event=>updateSelectedValue('text',event.target.value)} />}</label>
                    {selected.field==='image'&&<>
                      <div className="visual-image-preview">{selectedValue?<img src={selectedValue} alt="Seçili görsel önizlemesi"/>:<span>Görsel seçilmedi</span>}</div>
                      <label className="visual-property-field"><span>Görsel açıklaması</span><input value={current[selected.section]?.alt||selected.alt||''} onChange={event=>updateField(selected.section,'alt',event.target.value)}/></label>
                      <label className="visual-upload-button">Görsel yükle<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{uploadForSelection(event.target.files?.[0]);event.target.value=''}}/></label>
                    </>}
                    {selected.linkField&&<label className="visual-property-field"><span>{readableField(selected.linkField)}</span><input value={current[selected.section]?.[selected.linkField]||selected.href||''} onChange={event=>updateSelectedValue('href',event.target.value)}/></label>}
                  </>}
                  {!selected.section&&selected.key&&<>
                    <label className="visual-property-field"><span>{selected.kind==='image'?'Görsel adresi':'Metin'}</span>{selected.kind==='text'||String(selectedValue).length>120?<textarea rows="5" value={selectedValue} onChange={event=>updateSelectedValue(selected.kind==='image'?'src':'text',event.target.value)}/>:<input value={selected.kind==='image'?(selected.src||''):selectedValue} onChange={event=>updateSelectedValue(selected.kind==='image'?'src':'text',event.target.value)}/>}</label>
                    {selected.kind==='image'&&<><label className="visual-property-field"><span>Görsel açıklaması</span><input value={selected.alt||''} onChange={event=>updateSelectedValue('alt',event.target.value)}/></label><label className="visual-upload-button">Görsel yükle<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{uploadForSelection(event.target.files?.[0]);event.target.value=''}}/></label></>}
                    {selected.href!==undefined&&<label className="visual-property-field"><span>Bağlantı adresi</span><input value={selected.href||''} onChange={event=>updateSelectedValue('href',event.target.value)}/></label>}
                  </>}
                  {selectedBinding&&<>
                    {selectedBinding.field==='content'&&<p className="visual-panel-help">Blog yazısının biçimlendirilmiş içeriğini Blog Yazıları bölümündeki editörden düzenleyin.</p>}
                    {selectedBinding.field==='image'||selectedBinding.field==='galleryImage'?<>
                      <div className="visual-image-preview">{selectedValue?<img src={selectedValue} alt="Seçili görsel önizlemesi"/>:<span>Görsel seçilmedi</span>}</div>
                      <label className="visual-property-field"><span>Görsel adresi</span><input value={selectedValue} onChange={event=>updateSelectedValue('src',event.target.value)}/></label>
                      <label className="visual-upload-button">Görsel yükle<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{uploadForSelection(event.target.files?.[0]);event.target.value=''}}/></label>
                    </>:selectedBinding.field!=='content'&&<label className="visual-property-field"><span>{readableField(selectedBinding.field)}</span><textarea rows="4" value={selectedValue} onChange={event=>updateSelectedValue('text',event.target.value)}/></label>}
                  </>}
                  {!selected.section&&!selected.key&&!selectedBinding&&<p className="visual-panel-help">Bu bölüm görünümde seçildi. İçindeki yazı veya görsele tıklayarak düzenlenebilir alanlarını açın.</p>}
                </>}
                </>}
              </aside>
            </div>
          </div>
        )}
      </div>
      {pendingNavigation&&<div className="page-navigation-dialog-backdrop" role="presentation">
        <section className="page-navigation-dialog" role="dialog" aria-modal="true" aria-labelledby="page-navigation-title" aria-describedby="page-navigation-description">
          <span className="eyebrow">SAYFA DÜZENLEYİCİ</span>
          <h3 id="page-navigation-title">Kaydedilmemiş değişiklikler var</h3>
          <p id="page-navigation-description">Başka bir sayfaya geçmeden önce bu sayfadaki düzenlemeleri taslak olarak kaydedin. Taslak, siz yayımlayana kadar ziyaretçilere görünmez.</p>
          {actionMessage&&<p className="page-navigation-error" role="alert">{actionMessage}</p>}
          <div className="page-navigation-actions">
            <button type="button" className="page-navigation-cancel" onClick={()=>resolveNavigation('cancel')} disabled={!!actionPending}>Vazgeç</button>
            <button type="button" className="page-navigation-discard" onClick={()=>resolveNavigation('discard')} disabled={!!actionPending}>Kaydetmeden geç</button>
            <button type="button" className="page-navigation-save" onClick={()=>resolveNavigation('save')} disabled={!!actionPending}>{actionPending==='navigation-save'?'Kaydediliyor…':'Taslağı kaydet ve geç'}</button>
          </div>
        </section>
      </div>}
    </section>
  );
}
