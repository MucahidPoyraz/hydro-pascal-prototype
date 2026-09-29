// Schema/capability registry for the structural page editor ("Sitede düzenle").
//
// Page → Section → Collection → Item → Field.
// This module is pure (no Node APIs) and is shared by the server renderer
// (page-structure.js), the draft validators and the admin UI, so existing
// items and newly added items follow one data contract: every item is a
// `data-section` key whose fields live in the page content map exactly like the
// original static cards (`content-9: {title, content}`).
//
// Structural state lives in the reserved page section `__layout`:
//   {version:1,
//    sections:[{key, hidden?} | {key, source, hidden?} | {key, type, hidden?}],
//    collections:{'<sectionKey>:<name>':{items:[{key, hidden?, type?, template?}]}}}
// A missing `sections`/collection entry means "as in the static HTML".

export const LAYOUT_KEY='__layout';
export const LAYOUT_VERSION=1;
const KEY_PATTERN=/^[a-zA-Z0-9_-]{1,120}$/;
export const isKey=value=>typeof value==='string'&&KEY_PATTERN.test(value);
export const MAX_SECTIONS=80;
export const MAX_FIELD_LENGTH=10000;

export function escapeText(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
export function escapeAttr(value){return escapeText(value).replace(/"/g,'&quot;');}
// Allows http(s)/mailto/tel and scheme-less relative paths ("teklif-al.html",
// "../assets/x.webp", "#id"); rejects other schemes and protocol-relative URLs.
export function safeUrl(value){
  const url=String(value||'').trim();
  if(!url||/[\u0000-\u001f\u007f\\]/.test(url)||url.startsWith('//'))return '#';
  const scheme=url.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  return !scheme||['http','https','mailto','tel'].includes(scheme)?url:'#';
}

export const fieldLabels={title:'Başlık',content:'Açıklama',image:'Görsel',alt:'Görsel açıklaması',href:'Bağlantı adresi','cta-text':'Düğme yazısı','cta-url':'Düğme bağlantısı','cta-text-2':'İkinci düğme yazısı','cta-url-2':'İkinci düğme bağlantısı',excerpt:'Özet',date:'Tarih',label:'Düğme yazısı',target:'Açılış biçimi',variant:'Düğme stili',eyebrow:'Üst etiket'};
export const fieldLabel=name=>fieldLabels[name]||String(name||'').replaceAll('-',' ').replace(/^\w/,char=>char.toLocaleUpperCase('tr'));

// Design tokens copied verbatim from existing HydroPascal components (see
// tr/index.html features-7, quote-cta, content-11, content-15, hero CTAs).
// New components are assembled only from these class lists.
export const tokens={
  eyebrow:'inline-block mb-4 text-xs font-semibold tracking-widest uppercase text-[#fb923c] bg-white/5 border border-white/10 rounded-full px-4 py-1.5',
  heading:'text-4xl md:text-5xl font-extrabold text-[#fb923c]',
  description:'mt-6 text-slate-300 text-lg leading-relaxed',
  card:'bg-white/5 backdrop-blur-xl rounded-lg p-8 border border-white/10 shadow-2xl hover:-translate-y-2 hover:border-[#fb923c]/40 hover:shadow-[#fb923c]/20 transition-all duration-300',
  cardIcon:'h-14 w-14 flex items-center justify-center rounded-md bg-[#fb923c] mb-5',
  cardTitle:'font-bold text-xl mb-2 text-white',
  cardText:'text-slate-300 text-sm leading-relaxed',
  buttonPrimary:'inline-block rounded-md bg-[#fb923c] text-slate-950 font-semibold px-8 py-4 text-lg hover:brightness-110 hover:shadow-lg hover:shadow-[#fb923c]/30 transition',
  buttonSecondary:'inline-block rounded-md border border-white/20 bg-white/5 backdrop-blur px-8 py-4 text-lg font-semibold hover:bg-white/10 hover:border-white/40 transition'
};
const checkIcon='<svg class="h-7 w-7 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>';

const SECTION_ALL=['edit','duplicate','hide','show','delete','move'];
const SECTION_FIXED=['edit','hide','show','move'];
const ITEM_ALL=['edit','duplicate','hide','show','delete','reorder'];

const text=(label,extra={})=>({type:'text',label,max:400,...extra});
const area=(label,extra={})=>({type:'textarea',label,max:MAX_FIELD_LENGTH,...extra});
const url=(label,extra={})=>({type:'url',label,max:2048,...extra});
const image=(label,extra={})=>({type:'image',label,max:2048,...extra});
const select=(label,options,extra={})=>({type:'select',label,options,...extra});

function attr(name,value){return value===undefined||value===null||value===''?'':` ${name}="${escapeAttr(value)}"`;}
function hook(key,field){return ` data-section="${escapeAttr(key)}" data-field="${escapeAttr(field)}"`;}
function nodeAttr(ctx,id){return ctx.preview?attr('data-cms-node',id):'';}
function buttonMarkup(key,values,ctx,extraClass=''){
  const variant=values.variant==='secondary'?'secondary':'primary';
  const blank=values.target==='_blank';
  return `<a href="${escapeAttr(safeUrl(values.href||'#'))}"${nodeAttr(ctx,'i:'+key)}${hook(key,'label')} data-field-link="href"${blank?' target="_blank" rel="noopener noreferrer"':''} class="${variant==='secondary'?tokens.buttonSecondary:tokens.buttonPrimary}${extraClass}">${escapeText(values.label||'')}</a>`;
}

export const componentTypes={
  // ── Sections detected in the static pages ─────────────────────────────
  hero:{kind:'section',label:'Ana görsel alanı',capabilities:SECTION_FIXED},
  'content-section':{kind:'section',label:'İçerik bölümü',capabilities:SECTION_ALL},
  'dynamic-section':{kind:'section',label:'Dinamik bölüm',capabilities:SECTION_FIXED,note:'Form, katalog veya etkileşimli içerik taşıdığı için çoğaltılamaz ve silinemez; gizlenebilir.'},

  // ── Insertable sections (built only from design tokens) ───────────────
  'text-section':{kind:'section',label:'Metin bölümü',description:'Üst etiket, başlık ve açıklama',insertable:true,capabilities:SECTION_ALL,
    fields:{eyebrow:text('Üst etiket'),title:text('Başlık',{required:true}),content:area('Açıklama')},
    defaults:{tr:{eyebrow:'HydroPascal',title:'Yeni bölüm başlığı',content:'Bu bölümün açıklamasını buraya yazın.'},en:{eyebrow:'HydroPascal',title:'New section heading',content:'Write the description of this section here.'}},
    render:({key,values,ctx})=>`<section id="${escapeAttr(key)}" class="max-w-5xl mx-auto px-6 lg:px-8 py-24 text-center">${values.eyebrow?`<span class="${tokens.eyebrow}"${hook(key,'eyebrow')}>${escapeText(values.eyebrow)}</span>`:''}<h2 class="${tokens.heading}"${hook(key,'title')}>${escapeText(values.title||'')}</h2><p class="${tokens.description}"${hook(key,'content')}>${escapeText(values.content||'')}</p></section>`},
  'feature-grid-section':{kind:'section',label:'Kart ızgarası',description:'Başlık ve düzenlenebilir kart listesi',insertable:true,capabilities:SECTION_ALL,
    fields:{title:text('Başlık',{required:true}),content:area('Açıklama')},
    collections:{items:{label:'Kartlar',itemLabel:'Kart',allowedChildren:['feature-card'],minItems:0,maxItems:12,initialItems:3}},
    defaults:{tr:{title:'Yeni kart bölümü',content:'Kartlarla öne çıkarmak istediğiniz konuları anlatın.'},en:{title:'New card section',content:'Describe the topics you want to highlight with cards.'}},
    render:({key,values,collections})=>`<section id="${escapeAttr(key)}" class="max-w-7xl mx-auto px-6 lg:px-8 py-24"><div class="max-w-3xl mx-auto text-center mb-14"><h2 class="${tokens.heading}"${hook(key,'title')}>${escapeText(values.title||'')}</h2>${values.content?`<p class="${tokens.description}"${hook(key,'content')}>${escapeText(values.content)}</p>`:''}</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">${collections.items||''}</div></section>`},
  'cta-section':{kind:'section',label:'Çağrı (CTA) bandı',description:'Başlık, açıklama ve düğmeler',insertable:true,capabilities:SECTION_ALL,
    fields:{title:text('Başlık',{required:true}),content:area('Açıklama')},
    collections:{buttons:{label:'Düğmeler',itemLabel:'Düğme',allowedChildren:['button'],minItems:0,maxItems:3,initialItems:1}},
    defaults:{tr:{title:'Projenizi konuşalım',content:'İhtiyacınızı paylaşın, mühendislik ekibimiz size en uygun çözümü hazırlasın.'},en:{title:"Let's talk about your project",content:'Share your requirements and our engineering team will prepare the right solution.'}},
    render:({key,values,collections})=>`<section id="${escapeAttr(key)}" class="max-w-6xl mx-auto px-6 lg:px-8 py-24"><div class="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 text-center shadow-2xl overflow-hidden"><div class="pointer-events-none absolute -top-24 -right-24 w-72 h-72 bg-[#fb923c]/20 rounded-full blur-3xl"></div><h2 class="relative text-3xl md:text-4xl font-extrabold text-white mb-4"${hook(key,'title')}>${escapeText(values.title||'')}</h2><p class="relative text-slate-300 text-lg leading-relaxed mb-8 max-w-2xl mx-auto"${hook(key,'content')}>${escapeText(values.content||'')}</p><div class="relative flex flex-wrap justify-center gap-4">${collections.buttons||''}</div></div></section>`},
  'image-text-section':{kind:'section',label:'Görsel ve metin',description:'Görsel, başlık ve açıklama yan yana',insertable:true,capabilities:SECTION_ALL,
    fields:{image:image('Görsel'),alt:text('Görsel açıklaması'),eyebrow:text('Üst etiket'),title:text('Başlık',{required:true}),content:area('Açıklama')},
    defaults:{tr:{image:'/assets/images/hero-hydraulic-cylinder.webp',alt:'HydroPascal hidrolik silindir',eyebrow:'HydroPascal',title:'Görsel ve metin bölümü',content:'Görselin anlattığı konuyu burada açıklayın.'},en:{image:'/assets/images/hero-hydraulic-cylinder.webp',alt:'HydroPascal hydraulic cylinder',eyebrow:'HydroPascal',title:'Image and text section',content:'Explain the topic of the image here.'}},
    render:({key,values})=>`<section id="${escapeAttr(key)}" class="relative py-24 overflow-hidden"><div class="relative max-w-7xl mx-auto px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center"><img src="${escapeAttr(safeUrl(values.image||''))}" alt="${escapeAttr(values.alt||values.title||'')}" loading="lazy" class="rounded-lg shadow-2xl w-full h-80 object-cover border border-white/10"${hook(key,'image')}><div>${values.eyebrow?`<span class="${tokens.eyebrow}"${hook(key,'eyebrow')}>${escapeText(values.eyebrow)}</span>`:''}<h2 class="text-4xl font-extrabold text-white"${hook(key,'title')}>${escapeText(values.title||'')}</h2><p class="mt-6 text-slate-300 leading-relaxed text-lg"${hook(key,'content')}>${escapeText(values.content||'')}</p></div></div></section>`},
  'quote-section':{kind:'section',label:'Öne çıkan mesaj',description:'Vurgulu kısa içerik',insertable:true,capabilities:SECTION_ALL,
    fields:{title:text('Başlık'),content:area('Mesaj',{required:true})},
    defaults:{tr:{title:'Öne çıkan mesaj',content:'Buraya öne çıkarmak istediğiniz notu yazın.'},en:{title:'Highlighted message',content:'Write the note you want to highlight here.'}},
    render:({key,values})=>`<section id="${escapeAttr(key)}" class="max-w-5xl mx-auto px-6 lg:px-8 py-14"><blockquote class="rounded-2xl border-l-4 border-[#fb923c] bg-white/5 p-7 md:p-10">${values.title?`<h2 class="text-3xl md:text-4xl font-bold text-white mb-6"${hook(key,'title')}>${escapeText(values.title)}</h2>`:''}<p class="text-xl leading-relaxed text-slate-200"${hook(key,'content')}>${escapeText(values.content||'')}</p></blockquote></section>`},

  // ── Repeating items ────────────────────────────────────────────────────
  'feature-card':{kind:'item',label:'Özellik kartı',capabilities:ITEM_ALL,signature:{requires:['title','content'],excludes:['cta-text','excerpt']},
    fields:{title:text('Başlık',{required:true}),content:area('Açıklama')},
    defaults:{tr:{title:'Yeni kart',content:'Kart açıklamasını buraya yazın.'},en:{title:'New card',content:'Write the card description here.'}},
    render:({key,values,ctx})=>`<div id="${escapeAttr(key)}"${nodeAttr(ctx,'i:'+key)} class="${tokens.card}"><div class="${tokens.cardIcon}">${checkIcon}</div><h3 class="${tokens.cardTitle}"${hook(key,'title')}>${escapeText(values.title||'')}</h3><p class="${tokens.cardText}"${hook(key,'content')}>${escapeText(values.content||'')}</p></div>`},
  'link-card':{kind:'item',label:'Bağlantılı kart',capabilities:ITEM_ALL,signature:{requires:['title','cta-text'],excludes:['excerpt']},
    fields:{title:text('Başlık',{required:true}),'cta-text':text('Bağlantı yazısı'),'cta-url':url('Bağlantı adresi')},
    defaults:{tr:{title:'Yeni kart','cta-text':'Daha Fazla →','cta-url':'#'},en:{title:'New card','cta-text':'Learn More →','cta-url':'#'}}},
  'post-card':{kind:'item',label:'Yazı kartı',capabilities:ITEM_ALL,signature:{requires:['title','excerpt']},
    fields:{date:text('Tarih'),title:text('Başlık',{required:true}),excerpt:area('Özet'),'cta-text':text('Bağlantı yazısı')},
    defaults:{tr:{title:'Yeni yazı kartı',excerpt:'Yazının kısa özetini buraya yazın.'},en:{title:'New post card',excerpt:'Write a short summary here.'}}},
  'badge-card':{kind:'item',label:'Rozet kartı',capabilities:ITEM_ALL,signature:{requires:['title'],excludes:['content','excerpt','cta-text']},
    fields:{title:text('Başlık',{required:true})},
    defaults:{tr:{title:'Yeni rozet'},en:{title:'New badge'}}},
  'content-card':{kind:'item',label:'İçerik kartı',capabilities:ITEM_ALL,signature:{requires:[]},fields:{},defaults:{tr:{},en:{}}},
  button:{kind:'item',label:'Düğme',capabilities:ITEM_ALL,
    fields:{label:text('Düğme yazısı',{required:true,max:120}),href:url('Bağlantı adresi'),target:select('Açılış biçimi',[['_self','Aynı sekmede'],['_blank','Yeni sekmede']]),variant:select('Düğme stili',[['primary','Birincil (dolu)'],['secondary','İkincil (çerçeveli)']])},
    attributeFields:['target','variant'],
    defaults:{tr:{label:'Teklif Al',href:'teklif-al.html',target:'_self',variant:'primary'},en:{label:'Get a Quote',href:'teklif-al.html',target:'_self',variant:'primary'}},
    render:({key,values,ctx})=>buttonMarkup(key,values,ctx)}
};

// Collections detected in the static pages. `cards` = sibling elements whose
// id equals their own data-section key; `buttons` = consecutive button links.
export const detectedCollections={
  cards:{label:'Kartlar',itemLabel:'Kart',minItems:1,maxItems:12},
  buttons:{label:'Düğmeler',itemLabel:'Düğme',minItems:0,maxItems:4,allowedChildren:['button']}
};

export const insertableSections=Object.entries(componentTypes).filter(([,type])=>type.kind==='section'&&type.insertable).map(([id,type])=>({id,label:type.label,description:type.description||''}));

export function inferItemType(fieldNames){
  const names=new Set(fieldNames);
  for(const id of ['post-card','link-card','feature-card','badge-card']){
    const signature=componentTypes[id].signature;
    if(signature.requires.every(name=>names.has(name))&&!(signature.excludes||[]).some(name=>names.has(name)))return id;
  }
  return 'content-card';
}

export function capabilitiesOf(type){return componentTypes[type]?.capabilities||[];}
export function can(node,action){return !!node&&(node.capabilities||[]).includes(action);}
export function defaultsFor(type,lang){const defaults=componentTypes[type]?.defaults||{};return {...(defaults[lang==='en'?'en':'tr']||defaults.tr||{})};}

// ── Resolution: static base structure + page content → editor/render tree ──
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const fieldValue=(content,key,field,fallback)=>{const value=content?.[key]?.[field];return value===undefined||value===null?fallback:value;};
const itemTitle=fields=>{const primary=fields.find(field=>['title','label'].includes(field.field)&&String(field.value||'').trim());return primary?String(primary.value).trim():'';};

function sectionEntries(base,layout){
  if(Array.isArray(layout?.sections))return layout.sections;
  return base.sections.map(section=>({key:section.key}));
}

function resolveBaseCollection(collection,sectionKey,ns,content,layout){
  const map=key=>ns?`${ns}_${key}`:key;
  const key=`${sectionKey}:${collection.name}`;
  const baseItems=new Map(collection.items.map(item=>[map(item.key),item]));
  const baseByRaw=new Map(collection.items.map(item=>[item.key,item]));
  const entries=Array.isArray(layout?.collections?.[key]?.items)?layout.collections[key].items:collection.items.map(item=>({key:map(item.key)}));
  const seen=new Set();
  const items=[];
  for(const entry of entries){
    if(!entry||!isKey(entry.key)||seen.has(entry.key))continue;seen.add(entry.key);
    const existing=baseItems.get(entry.key);
    const template=existing||baseByRaw.get(entry.template)||collection.items[0];
    if(!template&&!componentTypes[collection.itemType]?.render)continue;
    const templateFields=template?template.fields:Object.entries(componentTypes[collection.itemType]?.fields||{}).map(([field,schema])=>({field,input:schema.type,value:''}));
    const fields=templateFields.map(field=>({...field,section:entry.key,value:fieldValue(content,entry.key,field.field,existing?field.value:(template?field.value:''))}));
    items.push({id:'i:'+entry.key,kind:'item',key:entry.key,type:existing?.type||entry.type||collection.itemType,baseKey:existing?existing.key:null,template:existing?existing.key:template?.key||null,isNew:!existing,hidden:entry.hidden===true,capabilities:capabilitiesOf(existing?.type||entry.type||collection.itemType),fields});
  }
  items.forEach((item,index)=>{item.label=itemTitle(item.fields)||`${collection.itemLabel} ${index+1}`;item.index=index;});
  return {id:'c:'+key,kind:'collection',key,name:collection.name,label:collection.label,itemLabel:collection.itemLabel,itemType:collection.itemType,allowedChildren:collection.allowedChildren||[collection.itemType],minItems:collection.minItems,maxItems:collection.maxItems,items,explicit:Array.isArray(layout?.collections?.[key]?.items)};
}

function resolveTypedCollection(name,definition,sectionKey,content,layout,lang){
  const key=`${sectionKey}:${name}`;
  const itemType=definition.allowedChildren[0];
  const schema=componentTypes[itemType]?.fields||{};
  const entries=Array.isArray(layout?.collections?.[key]?.items)?layout.collections[key].items:[];
  const seen=new Set();const items=[];
  for(const entry of entries){
    if(!entry||!isKey(entry.key)||seen.has(entry.key))continue;seen.add(entry.key);
    const type=definition.allowedChildren.includes(entry.type)?entry.type:itemType;
    const defaults=defaultsFor(type,lang);
    const fields=Object.entries(componentTypes[type]?.fields||schema).map(([field,fieldSchema])=>({field,section:entry.key,input:fieldSchema.type,label:fieldSchema.label,options:fieldSchema.options,value:fieldValue(content,entry.key,field,defaults[field]??'')}));
    items.push({id:'i:'+entry.key,kind:'item',key:entry.key,type,baseKey:null,template:null,isNew:true,hidden:entry.hidden===true,capabilities:capabilitiesOf(type),fields});
  }
  items.forEach((item,index)=>{item.label=itemTitle(item.fields)||`${definition.itemLabel} ${index+1}`;item.index=index;});
  return {id:'c:'+key,kind:'collection',key,name,label:definition.label,itemLabel:definition.itemLabel,itemType,allowedChildren:definition.allowedChildren,minItems:definition.minItems,maxItems:definition.maxItems,items,explicit:true};
}

export function resolvePage(base,content={},lang='tr'){
  const layout=content?.[LAYOUT_KEY];
  const baseByKey=new Map((base?.sections||[]).map(section=>[section.key,section]));
  const seen=new Set();const sections=[];
  for(const entry of sectionEntries(base||{sections:[]},layout)){
    if(!entry||!isKey(entry.key)||seen.has(entry.key))continue;
    const existing=baseByKey.get(entry.key);
    let node=null;
    if(existing&&!entry.source&&!entry.type){
      node=resolveBaseSection(existing,'',content,layout);
    }else if(!existing&&entry.source&&baseByKey.has(entry.source)&&capabilitiesOf(baseByKey.get(entry.source).type).includes('duplicate')){
      node=resolveBaseSection(baseByKey.get(entry.source),entry.key,content,layout);
    }else if(!existing&&componentTypes[entry.type]?.insertable){
      const type=componentTypes[entry.type];
      const defaults=defaultsFor(entry.type,lang);
      const fields=Object.entries(type.fields||{}).map(([field,schema])=>({field,section:entry.key,input:schema.type,label:schema.label,options:schema.options,value:fieldValue(content,entry.key,field,defaults[field]??'')}));
      node={id:'s:'+entry.key,kind:'section',key:entry.key,type:entry.type,baseKey:null,namespace:'',isNew:true,fields,collections:Object.entries(type.collections||{}).map(([name,definition])=>resolveTypedCollection(name,definition,entry.key,content,layout,lang))};
    }
    if(!node)continue;
    seen.add(entry.key);
    node.hidden=entry.hidden===true;
    node.capabilities=capabilitiesOf(node.type);
    node.typeLabel=componentTypes[node.type]?.label||'Bölüm';
    const titleField=node.fields.find(field=>field.field==='title'&&String(field.value||'').trim());
    node.label=(titleField?String(titleField.value).trim():node.baseLabel||node.typeLabel).slice(0,80);
    sections.push(node);
  }
  const removed=(base?.sections||[]).filter(section=>!seen.has(section.key)).map(section=>({key:section.key,label:section.label,type:section.type}));
  return {sections,removed};
}

function resolveBaseSection(section,ns,content,layout){
  const map=key=>ns?`${ns}_${key}`:key;
  const key=ns||section.key;
  return {id:'s:'+key,kind:'section',key,type:section.type,baseKey:section.key,namespace:ns,isNew:!!ns,isDuplicate:!!ns,baseLabel:section.label,
    fields:section.fields.map(field=>({...field,baseSection:field.section,section:map(field.section),value:fieldValue(content,map(field.section),field.field,field.value),...(field.linkField?{linkValue:fieldValue(content,map(field.section),field.linkField,field.linkValue)}:{})})),
    collections:section.collections.map(collection=>resolveBaseCollection(collection,key,ns,content,layout))};
}

export function findNode(tree,id){
  for(const section of tree.sections){
    if(section.id===id)return {node:section,section};
    for(const collection of section.collections){
      if(collection.id===id)return {node:collection,section,collection};
      for(const item of collection.items)if(item.id===id)return {node:item,section,collection};
    }
  }
  return null;
}

// ── Operations (pure: content in → content out) ────────────────────────────
export class LayoutError extends Error{}
const randomId=prefix=>prefix+(globalThis.crypto?.randomUUID?.()||Math.random().toString(16).slice(2)+Date.now().toString(16)).replace(/-/g,'').slice(0,10);
function allKeys(base,content){
  const keys=new Set(Object.keys(content||{}));
  for(const section of base.sections){keys.add(section.key);for(const key of section.keys||[])keys.add(key);}
  return keys;
}
function uniqueKey(prefix,base,content){const used=allKeys(base,content);let key;do key=randomId(prefix);while(used.has(key));return key;}
function prepare(content,base,tree){
  const next=clone(content||{});
  const layout=next[LAYOUT_KEY]&&typeof next[LAYOUT_KEY]==='object'?next[LAYOUT_KEY]:{};
  layout.version=LAYOUT_VERSION;
  if(!Array.isArray(layout.sections))layout.sections=tree.sections.map(section=>({key:section.key,...(section.baseKey&&section.namespace?{source:section.baseKey}:{}),...(section.baseKey?{}:{type:section.type}),...(section.hidden?{hidden:true}:{})}));
  if(!layout.collections||typeof layout.collections!=='object'||Array.isArray(layout.collections))layout.collections={};
  next[LAYOUT_KEY]=layout;
  return {next,layout};
}
function materializeCollection(layout,collection){
  if(!Array.isArray(layout.collections[collection.key]?.items))layout.collections[collection.key]={items:collection.items.map(item=>({key:item.key,...(item.isNew?{type:item.type,...(item.template?{template:item.template}:{})}:{}),...(item.hidden?{hidden:true}:{})}))};
  return layout.collections[collection.key].items;
}
function locate(base,content,lang,id){
  const tree=resolvePage(base,content,lang);
  const found=findNode(tree,id);
  if(!found)throw new LayoutError('Seçili öğe bulunamadı. Sayfayı yenileyip yeniden deneyin.');
  return {tree,...found};
}
const itemValues=item=>Object.fromEntries(item.fields.flatMap(field=>[[field.field,field.value],...(field.linkField?[[field.linkField,field.linkValue??'']]:[])]));

export function addItem(base,content,lang,collectionId,{afterId,type}={}){
  const {tree,node:collection}=locate(base,content,lang,collectionId);
  if(collection.kind!=='collection')throw new LayoutError('Öğe yalnızca bir koleksiyona eklenebilir.');
  const itemType=type||collection.itemType;
  if(!collection.allowedChildren.includes(itemType))throw new LayoutError(`${componentTypes[itemType]?.label||'Bu öğe'} bu alana eklenemez.`);
  if(collection.items.length>=collection.maxItems)throw new LayoutError(`${collection.label} en fazla ${collection.maxItems} öğe içerebilir.`);
  const {next,layout}=prepare(content,base,tree);
  const items=materializeCollection(layout,collection);
  const key=uniqueKey('n',base,next);
  const template=collection.items.find(item=>item.template)?.template||null;
  const templateItem=collection.items.find(item=>item.key===template)||collection.items[0];
  const templateValues=templateItem?itemValues(templateItem):{};
  next[key]={...Object.fromEntries(Object.entries(templateValues).filter(([field])=>!['title','content','label','excerpt'].includes(field))),...defaultsFor(itemType,lang)};
  const entry={key,type:itemType,...(template?{template}:{})};
  const at=afterId?items.findIndex(item=>'i:'+item.key===afterId):-1;
  items.splice(at>=0?at+1:items.length,0,entry);
  return {content:next,id:'i:'+key};
}

export function duplicateItem(base,content,lang,itemId){
  const {tree,node:item,collection}=locate(base,content,lang,itemId);
  if(item.kind!=='item'||!can(item,'duplicate'))throw new LayoutError('Bu öğe çoğaltılamaz.');
  if(collection.items.length>=collection.maxItems)throw new LayoutError(`${collection.label} en fazla ${collection.maxItems} öğe içerebilir.`);
  const {next,layout}=prepare(content,base,tree);
  const items=materializeCollection(layout,collection);
  const key=uniqueKey('n',base,next);
  next[key]=clone(itemValues(item));
  if(next[key].title)next[key].title=String(next[key].title)+(lang==='en'?' (copy)':' (kopya)');
  else if(next[key].label)next[key].label=String(next[key].label)+(lang==='en'?' (copy)':' (kopya)');
  const at=items.findIndex(entry=>entry.key===item.key);
  items.splice(at+1,0,{key,type:item.type,...(item.template?{template:item.template}:{}),...(item.hidden?{hidden:true}:{})});
  return {content:next,id:'i:'+key};
}

export function removeItem(base,content,lang,itemId){
  const {tree,node:item,collection}=locate(base,content,lang,itemId);
  if(item.kind!=='item'||!can(item,'delete'))throw new LayoutError('Bu öğe silinemez.');
  if(collection.items.length<=collection.minItems)throw new LayoutError(`${collection.label} en az ${collection.minItems} öğe içermeli; son zorunlu öğe silinemez.`);
  const {next,layout}=prepare(content,base,tree);
  const items=materializeCollection(layout,collection);
  layout.collections[collection.key].items=items.filter(entry=>entry.key!==item.key);
  if(item.isNew)delete next[item.key];
  const fallback=collection.items[item.index+1]||collection.items[item.index-1];
  return {content:next,id:fallback?fallback.id:tree.sections.find(section=>section.collections.includes(collection))?.id};
}

export function setItemHidden(base,content,lang,itemId,hidden){
  const {tree,node:item,collection}=locate(base,content,lang,itemId);
  if(item.kind!=='item'||!can(item,hidden?'hide':'show'))throw new LayoutError('Bu öğenin görünürlüğü değiştirilemez.');
  const {next,layout}=prepare(content,base,tree);
  const entry=materializeCollection(layout,collection).find(value=>value.key===item.key);
  if(hidden)entry.hidden=true;else delete entry.hidden;
  return {content:next,id:item.id};
}

export function moveItem(base,content,lang,itemId,toIndex){
  const {tree,node:item,collection}=locate(base,content,lang,itemId);
  if(item.kind!=='item'||!can(item,'reorder'))throw new LayoutError('Bu öğe taşınamaz.');
  const target=Math.max(0,Math.min(collection.items.length-1,toIndex));
  if(target===item.index)return {content,id:item.id};
  const {next,layout}=prepare(content,base,tree);
  const items=materializeCollection(layout,collection);
  const [entry]=items.splice(item.index,1);items.splice(target,0,entry);
  return {content:next,id:item.id};
}

export function addSection(base,content,lang,type,{afterId}={}){
  const definition=componentTypes[type];
  if(!definition?.insertable)throw new LayoutError('Bu bölüm türü eklenemez.');
  const tree=resolvePage(base,content,lang);
  if(tree.sections.length>=MAX_SECTIONS)throw new LayoutError(`Bir sayfada en fazla ${MAX_SECTIONS} bölüm olabilir.`);
  const {next,layout}=prepare(content,base,tree);
  const key=uniqueKey('s',base,next);
  next[key]=defaultsFor(type,lang);
  for(const [name,collection] of Object.entries(definition.collections||{})){
    const items=[];
    for(let index=0;index<(collection.initialItems||0);index++){
      const itemKey=uniqueKey('n',base,next);const itemType=collection.allowedChildren[0];
      const defaults=defaultsFor(itemType,lang);
      next[itemKey]=itemType==='button'?defaults:{...defaults,title:`${defaults.title||collection.itemLabel} ${index+1}`};
      items.push({key:itemKey,type:itemType});
    }
    layout.collections[`${key}:${name}`]={items};
  }
  const at=afterId?layout.sections.findIndex(section=>'s:'+section.key===afterId):-1;
  layout.sections.splice(at>=0?at+1:layout.sections.length,0,{key,type});
  return {content:next,id:'s:'+key};
}

export function duplicateSection(base,content,lang,sectionId){
  const {tree,node:section}=locate(base,content,lang,sectionId);
  if(section.kind!=='section'||!can(section,'duplicate'))throw new LayoutError('Bu bölüm çoğaltılamaz.');
  if(tree.sections.length>=MAX_SECTIONS)throw new LayoutError(`Bir sayfada en fazla ${MAX_SECTIONS} bölüm olabilir.`);
  const {next,layout}=prepare(content,base,tree);
  const at=layout.sections.findIndex(entry=>entry.key===section.key);
  if(section.baseKey){
    const ns=uniqueKey('s',base,next);
    const baseSection=base.sections.find(value=>value.key===section.baseKey);
    // Copy every stored value of the source instance (incl. alt/image extras),
    // then the resolved values so unedited static text is carried over too.
    const from=key=>section.namespace?`${section.namespace}_${key}`:key;
    for(const key of baseSection.keys||[])if(next[from(key)]!==undefined)next[`${ns}_${key}`]=clone(next[from(key)]);
    for(const field of section.fields){const copyKey=`${ns}_${field.baseSection}`;next[copyKey]={...(next[copyKey]||{}),[field.field]:field.value,...(field.linkField?{[field.linkField]:field.linkValue??''}:{})};}
    for(const collection of section.collections){
      const items=[];
      for(const item of collection.items){
        if(item.baseKey){const copyKey=`${ns}_${item.baseKey}`;next[copyKey]={...(next[copyKey]||{}),...clone(itemValues(item))};items.push({key:copyKey,...(item.hidden?{hidden:true}:{})});}
        else{const copyKey=uniqueKey('n',base,next);next[copyKey]=clone(itemValues(item));items.push({key:copyKey,type:item.type,...(item.template?{template:item.template}:{}),...(item.hidden?{hidden:true}:{})});}
      }
      layout.collections[`${ns}:${collection.name}`]={items};
    }
    layout.sections.splice(at+1,0,{key:ns,source:section.baseKey});
    return {content:next,id:'s:'+ns};
  }
  const key=uniqueKey('s',base,next);
  next[key]=clone(Object.fromEntries(section.fields.map(field=>[field.field,field.value])));
  for(const collection of section.collections){
    const items=collection.items.map(item=>{const copyKey=uniqueKey('n',base,next);next[copyKey]=clone(itemValues(item));return {key:copyKey,type:item.type,...(item.hidden?{hidden:true}:{})};});
    layout.collections[`${key}:${collection.name}`]={items};
  }
  layout.sections.splice(at+1,0,{key,type:section.type});
  return {content:next,id:'s:'+key};
}

export function removeSection(base,content,lang,sectionId){
  const {tree,node:section}=locate(base,content,lang,sectionId);
  if(section.kind!=='section'||!can(section,'delete'))throw new LayoutError('Bu bölüm silinemez; yalnızca gizlenebilir.');
  const {next,layout}=prepare(content,base,tree);
  layout.sections=layout.sections.filter(entry=>entry.key!==section.key);
  if(section.isNew){
    delete next[section.key];
    for(const field of section.fields)if(field.section!==section.key)delete next[field.section];
    for(const collection of section.collections){for(const item of collection.items)delete next[item.key];delete layout.collections[collection.key];}
  }
  const index=tree.sections.indexOf(section);
  const fallback=tree.sections[index+1]||tree.sections[index-1];
  return {content:next,id:fallback?.id||null};
}

export function restoreSection(base,content,lang,baseKey,{afterId}={}){
  const tree=resolvePage(base,content,lang);
  if(!tree.removed.some(section=>section.key===baseKey))throw new LayoutError('Geri alınacak bölüm bulunamadı.');
  const {next,layout}=prepare(content,base,tree);
  const at=afterId?layout.sections.findIndex(section=>'s:'+section.key===afterId):-1;
  layout.sections.splice(at>=0?at+1:layout.sections.length,0,{key:baseKey});
  return {content:next,id:'s:'+baseKey};
}

export function setSectionHidden(base,content,lang,sectionId,hidden){
  const {tree,node:section}=locate(base,content,lang,sectionId);
  if(section.kind!=='section'||!can(section,hidden?'hide':'show'))throw new LayoutError('Bu bölümün görünürlüğü değiştirilemez.');
  const {next,layout}=prepare(content,base,tree);
  const entry=layout.sections.find(value=>value.key===section.key);
  if(hidden)entry.hidden=true;else delete entry.hidden;
  return {content:next,id:section.id};
}

export function moveSection(base,content,lang,sectionId,toIndex){
  const {tree,node:section}=locate(base,content,lang,sectionId);
  if(section.kind!=='section'||!can(section,'move'))throw new LayoutError('Bu bölüm taşınamaz.');
  const from=tree.sections.indexOf(section);
  const target=Math.max(0,Math.min(tree.sections.length-1,toIndex));
  if(target===from)return {content,id:section.id};
  const {next,layout}=prepare(content,base,tree);
  const index=layout.sections.findIndex(entry=>entry.key===section.key);
  const [entry]=layout.sections.splice(index,1);
  const targetKey=tree.sections[target].key;
  const targetIndex=layout.sections.findIndex(value=>value.key===targetKey);
  layout.sections.splice(target>from?targetIndex+1:targetIndex,0,entry);
  return {content:next,id:section.id};
}

// ── Validation (server trust boundary; UI enforces the same rules) ─────────
export function validateLayoutContent(base,content){
  const layout=content?.[LAYOUT_KEY];
  if(layout===undefined)return '';
  if(!layout||typeof layout!=='object'||Array.isArray(layout))return 'Sayfa yapısı geçersiz.';
  if(Object.keys(layout).some(key=>!['version','sections','collections'].includes(key)))return 'Sayfa yapısında bilinmeyen alan var.';
  if(layout.version!==undefined&&layout.version!==LAYOUT_VERSION)return 'Sayfa yapısı sürümü desteklenmiyor.';
  const baseByKey=new Map(base.sections.map(section=>[section.key,section]));
  const baseKeys=new Set(base.sections.flatMap(section=>[section.key,...(section.keys||[])]));
  if(layout.sections!==undefined){
    if(!Array.isArray(layout.sections)||layout.sections.length>MAX_SECTIONS)return `Bir sayfada en fazla ${MAX_SECTIONS} bölüm olabilir.`;
    const seen=new Set();
    for(const entry of layout.sections){
      if(!entry||typeof entry!=='object'||!isKey(entry.key)||seen.has(entry.key))return 'Bölüm anahtarları geçersiz veya tekrarlı.';
      if(Object.keys(entry).some(key=>!['key','hidden','source','type'].includes(key))||(entry.hidden!==undefined&&typeof entry.hidden!=='boolean'))return 'Bölüm kaydında izin verilmeyen alan var.';
      seen.add(entry.key);
      if(baseByKey.has(entry.key)){if(entry.source||entry.type)return 'Mevcut bir bölüm başka türe dönüştürülemez.';continue;}
      if(baseKeys.has(entry.key))return 'Yeni bölüm anahtarı mevcut bir alanla çakışıyor.';
      if(entry.source!==undefined){
        if(entry.type!==undefined||!baseByKey.has(entry.source))return 'Çoğaltılan bölümün kaynağı bulunamadı.';
        if(!capabilitiesOf(baseByKey.get(entry.source).type).includes('duplicate'))return 'Bu bölüm türü çoğaltılamaz.';
        continue;
      }
      if(!componentTypes[entry.type]?.insertable)return 'Sayfaya izin verilmeyen bir bölüm türü eklenemez.';
    }
  }
  if(layout.collections!==undefined&&(!layout.collections||typeof layout.collections!=='object'||Array.isArray(layout.collections)||Object.keys(layout.collections).length>200))return 'Koleksiyon listesi geçersiz.';
  const tree=resolvePage(base,{...content,[LAYOUT_KEY]:{...layout,collections:{}}});
  const collections=new Map(tree.sections.flatMap(section=>section.collections.map(collection=>[collection.key,{collection,section}])));
  const itemKeys=new Set();
  for(const [key,value] of Object.entries(layout.collections||{})){
    const found=collections.get(key);
    if(!found)continue; // collection of a removed section: ignored by the renderer
    const {collection,section}=found;
    if(!value||typeof value!=='object'||!Array.isArray(value.items))return 'Koleksiyon kaydı geçersiz.';
    if(value.items.length>collection.maxItems)return `${collection.label} en fazla ${collection.maxItems} öğe içerebilir.`;
    if(value.items.length<collection.minItems)return `${collection.label} en az ${collection.minItems} öğe içermeli.`;
    const ns=section.namespace;
    const allowedBase=new Set(collection.items.filter(item=>!item.isNew).map(item=>item.key));
    const templates=new Set(base.sections.find(value=>value.key===section.baseKey)?.collections.find(value=>value.name===collection.name)?.items.map(item=>item.key)||[]);
    for(const item of value.items){
      if(!item||typeof item!=='object'||!isKey(item.key)||itemKeys.has(item.key))return 'Koleksiyon öğesi anahtarı geçersiz veya tekrarlı.';
      if(Object.keys(item).some(name=>!['key','hidden','type','template'].includes(name))||(item.hidden!==undefined&&typeof item.hidden!=='boolean'))return 'Koleksiyon öğesinde izin verilmeyen alan var.';
      itemKeys.add(item.key);
      if(allowedBase.has(item.key)){if(item.type!==undefined&&item.type!==collection.itemType&&!collection.allowedChildren.includes(item.type))return 'Geçersiz öğe türü.';continue;}
      if(baseKeys.has(item.key)||(ns&&item.key.startsWith(ns+'_')))return 'Başka bir alana ait öğe bu koleksiyona taşınamaz.';
      const type=item.type||collection.itemType;
      if(!collection.allowedChildren.includes(type))return `${componentTypes[type]?.label||'Bu öğe türü'} ${collection.label.toLocaleLowerCase('tr')} alanına eklenemez.`;
      if(item.template!==undefined&&!templates.has(item.template))return 'Yeni öğenin şablonu bu koleksiyona ait değil.';
    }
  }
  // Every value of structurally-added content must be a bounded string.
  const addedKeys=new Set();
  for(const section of resolvePage(base,content).sections){
    if(section.isNew)for(const field of section.fields)addedKeys.add(field.section);
    for(const collection of section.collections)for(const item of collection.items)if(item.isNew)addedKeys.add(item.key);
  }
  for(const key of addedKeys){
    const fields=content[key];
    if(fields===undefined)continue;
    if(!fields||typeof fields!=='object'||Array.isArray(fields))return 'Yeni öğe içeriği geçersiz.';
    for(const [name,item] of Object.entries(fields))if(typeof item!=='string'||item.length>MAX_FIELD_LENGTH||!/^[a-zA-Z0-9_-]{1,60}$/.test(name))return 'Yeni öğe alanlarından biri geçersiz veya çok uzun.';
    for(const name of ['href','cta-url','image'])if(String(fields[name]??'').trim()&&String(fields[name]).trim()!=='#'&&safeUrl(fields[name])==='#')return 'Bağlantı veya görsel adresi güvenli değil.';
    if(fields.target!==undefined&&!['_self','_blank'].includes(fields.target))return 'Düğme açılış biçimi geçersiz.';
    if(fields.variant!==undefined&&!['primary','secondary'].includes(fields.variant))return 'Düğme stili geçersiz.';
  }
  return '';
}

export function layoutSignature(content){return JSON.stringify(content?.[LAYOUT_KEY]??null);}
