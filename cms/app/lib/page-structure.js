// Server side of the structural page editor.
//
// extractStructure(html) reads a static page and returns its component tree
// (sections → collections → items → fields) together with the exact source
// ranges of each part. renderStructure(html, content) then rebuilds <main>
// from that tree and the page's `__layout`, cloning existing markup for new
// items so they reuse the page's own CSS, spacing and responsive behaviour.
// Preview and public rendering share this single code path.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {LAYOUT_KEY,componentTypes,detectedCollections,escapeAttr,escapeText,inferItemType,isKey,resolvePage,tokens,validateLayoutContent} from './page-schema.js';

// htmlparser2 (ESM) is also require()d by sanitize-html. Loading it through
// require() here too keeps Node's module loader from racing an async import
// against that synchronous require when routes are imported concurrently.
// Anchored at the runtime cwd, not import.meta.url: webpack inlines the build
// machine's absolute path there, which does not exist on Vercel (/var/task).
// The package is added to the trace in next.config.mjs.
const {parseDocument}=createRequire(path.join(process.cwd(),'package.json'))('htmlparser2');
const siteRoot=path.resolve(process.cwd(),'..');
const FIXED_TAGS=new Set(['script','style','template','noscript']);
const cache=new Map();

const attrsOf=node=>node?.attribs||{};
const isElement=node=>node&&(node.type==='tag'||node.type==='script'||node.type==='style');
function* descendants(node){for(const child of node.children||[]){if(isElement(child)){yield child;yield* descendants(child);}}}
function textOf(node){
  if(node.type==='text')return node.data;
  if(!isElement(node)||FIXED_TAGS.has(node.name))return '';
  return (node.children||[]).map(textOf).join('');
}
const cleanText=value=>String(value||'').replace(/\s+/g,' ').trim();
function openTagEnd(html,start){
  let quote='';
  for(let index=start;index<html.length;index++){
    const char=html[index];
    if(quote){if(char===quote)quote='';}
    else if(char==='"'||char==="'")quote=char;
    else if(char==='>')return index+1;
  }
  return -1;
}
function slug(value){
  return String(value||'').split(/[(:—–]/)[0].normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ı/g,'i').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);
}
function fieldDescriptor(element){
  const attrs=attrsOf(element),field=attrs['data-field'],tag=element.name;
  let value;
  if(tag==='img')value=attrs.src||'';
  else if(tag==='a'&&field==='href')value=attrs.href||'';
  else if(tag==='input'||tag==='textarea')value=attrs.value||cleanText(textOf(element));
  else value=cleanText(textOf(element));
  const input=tag==='img'||field==='image'?'image':/(^|-)(url|href)$/.test(field)?'url':(['content','excerpt'].includes(field)||value.length>120)?'textarea':'text';
  const descriptor={section:attrs['data-section'],field,tag,input,value};
  if(attrs['data-field-link']){descriptor.linkField=attrs['data-field-link'];descriptor.linkValue=attrs.href||'';}
  return descriptor;
}
function collectFields(root,predicate){
  const fields=[],seen=new Set();
  const candidates=[root,...descendants(root)];
  for(const element of candidates){
    const attrs=attrsOf(element);
    if(!attrs['data-section']||!attrs['data-field']||!predicate(element))continue;
    const id=attrs['data-section']+'|'+attrs['data-field'];
    if(seen.has(id))continue;seen.add(id);
    fields.push(fieldDescriptor(element));
  }
  return fields;
}
function containsKey(element,key){
  if(attrsOf(element)['data-section']===key)return true;
  for(const child of descendants(element))if(attrsOf(child)['data-section']===key)return true;
  return false;
}
function onlyWhitespaceBetween(parent,from,to){
  const children=parent.children||[];
  for(let index=children.indexOf(from)+1;index<children.indexOf(to);index++){
    const node=children[index];
    if(node.type==='text'&&!node.data.trim())continue;
    if(node.type==='comment')continue;
    return false;
  }
  return true;
}
const isButtonLink=element=>{
  if(element.name!=='a')return false;
  const attrs=attrsOf(element),cls=' '+(attrs.class||'')+' ';
  return !attrs['data-field']&&/\srounded(?:-md|-lg|-full)?\s/.test(cls)&&/\spx-\d/.test(cls)&&(/bg-\[#fb923c\]/.test(cls)||/\sborder\s/.test(cls));
};
const insertAfterTagName=(html,attrText)=>html.replace(/^(<[a-zA-Z][\w:-]*)/,`$1${attrText}`);
const buttonVariant=cls=>/bg-\[#fb923c\]/.test(cls||'')?'primary':'secondary';

function sectionTypeOf(element,key){
  if(/^hero/.test(key))return 'hero';
  if(['nav','article','aside','form'].includes(element.name))return 'dynamic-section';
  for(const child of [element,...descendants(element)]){
    const attrs=attrsOf(child);
    if(['form','script','template','iframe','details'].includes(child.name)||attrs['x-data']!==undefined||attrs['x-for']!==undefined)return 'dynamic-section';
  }
  return 'content-section';
}

function extractSection(html,element,rangeStart,key,leadingComment){
  const tagNameEnd=element.startIndex+1+element.name.length;
  const itemNodes=new Set();
  const collections=[];
  const insideItem=node=>{for(let current=node;current&&current!==element;current=current.parent)if(itemNodes.has(current))return true;return false;};
  // Card collections: sibling elements whose id is also their data-section key.
  for(const parent of [element,...descendants(element)]){
    if(insideItem(parent))continue;
    const children=(parent.children||[]).filter(isElement);
    const qualifying=children.filter(child=>attrsOf(child).id&&isKey(attrsOf(child).id)&&containsKey(child,attrsOf(child).id));
    if(qualifying.length<2)continue;
    const first=children.indexOf(qualifying[0]),last=children.indexOf(qualifying.at(-1));
    if(children.slice(first,last+1).some(child=>!qualifying.includes(child)))continue;
    qualifying.forEach(child=>itemNodes.add(child));
    const items=qualifying.map(child=>{const itemKey=attrsOf(child).id;return {key:itemKey,start:child.startIndex,end:child.endIndex+1,html:html.slice(child.startIndex,child.endIndex+1),fields:collectFields(child,node=>attrsOf(node)['data-section']===itemKey)};});
    const itemType=inferItemType(items.flatMap(item=>item.fields.map(field=>field.field)));
    items.forEach(item=>{item.type=itemType;});
    const count=collections.filter(value=>value.name.startsWith('items')).length;
    const separator=items.length>1?html.slice(items[0].end,items[1].start):'\n';
    collections.push({name:count?`items-${count+1}`:'items',kind:'cards',...detectedCollections.cards,itemType,allowedChildren:[itemType],start:items[0].start,end:items.at(-1).end,separator:/^\s*$/.test(separator)?separator:'\n',items});
  }
  // Button groups: consecutive button links that are not already fields.
  let buttonIndex=0;
  const grouped=new Set();
  for(const candidate of descendants(element)){
    if(grouped.has(candidate)||!isButtonLink(candidate)||insideItem(candidate))continue;
    const parent=candidate.parent,siblings=(parent.children||[]).filter(isElement);
    const group=[candidate];
    for(let index=siblings.indexOf(candidate)+1;index<siblings.length&&isButtonLink(siblings[index])&&onlyWhitespaceBetween(parent,group.at(-1),siblings[index]);index++)group.push(siblings[index]);
    group.forEach(node=>{grouped.add(node);itemNodes.add(node);});
    const items=group.map(node=>{
      buttonIndex+=1;
      const itemKey=`${key}_btn-${buttonIndex}`,attrs=attrsOf(node);
      const raw=html.slice(node.startIndex,node.endIndex+1);
      return {key:itemKey,type:'button',start:node.startIndex,end:node.endIndex+1,variant:buttonVariant(attrs.class),relative:/\brelative\b/.test(attrs.class||''),
        html:insertAfterTagName(raw,` data-section="${escapeAttr(itemKey)}" data-field="label" data-field-link="href"`),
        fields:[
          {section:itemKey,field:'label',tag:'a',input:'text',value:cleanText(textOf(node))},
          {section:itemKey,field:'href',tag:'a',input:'url',value:attrs.href||''},
          {section:itemKey,field:'target',tag:'a',input:'select',options:componentTypes.button.fields.target.options,value:attrs.target==='_blank'?'_blank':'_self'},
          {section:itemKey,field:'variant',tag:'a',input:'select',options:componentTypes.button.fields.variant.options,value:buttonVariant(attrs.class)}
        ]};
    });
    const parentClass=' '+(attrsOf(parent).class||'')+' ';
    const wrap=/\s(?:inline-)?flex\s/.test(parentClass)?'':`flex flex-wrap gap-4${/\stext-center\s/.test(parentClass)?' justify-center':''}${items.some(item=>item.relative)?' relative':''}`;
    const count=collections.filter(value=>value.name.startsWith('buttons')).length;
    const separator=items.length>1?html.slice(items[0].end,items[1].start):'\n';
    collections.push({name:count?`buttons-${count+1}`:'buttons',kind:'buttons',...detectedCollections.buttons,itemType:'button',allowedChildren:['button'],start:items[0].start,end:items.at(-1).end,separator:/^\s*$/.test(separator)?separator:'\n',wrap,items});
  }
  collections.sort((left,right)=>left.start-right.start);
  const fields=collectFields(element,node=>!insideItem(node));
  const keys=new Set();
  for(const node of [element,...descendants(element)]){const attrs=attrsOf(node);if(attrs['data-section']&&isKey(attrs['data-section']))keys.add(attrs['data-section']);if(attrs.id&&isKey(attrs.id))keys.add(attrs.id);}
  for(const collection of collections)for(const item of collection.items)keys.add(item.key);
  const type=sectionTypeOf(element,key);
  const heading=[element,...descendants(element)].find(node=>/^h[1-4]$/.test(node.name)&&!insideItem(node));
  const label=cleanText(heading?textOf(heading):'')||cleanText(String(leadingComment||'').split(/[(:—–]/)[0]).toLocaleLowerCase('tr').replace(/^\w/,char=>char.toLocaleUpperCase('tr'))||componentTypes[type].label;
  return {key,type,label:label.slice(0,80),tag:element.name,keys:[...keys],fields,collections,rangeStart,end:element.endIndex+1,tagNameEnd,html:html.slice(rangeStart,element.endIndex+1)};
}

export function extractStructure(html){
  if(cache.has(html))return cache.get(html);
  const document=parseDocument(html,{withStartIndices:true,withEndIndices:true});
  let main=null;
  for(const node of descendants(document))if(node.name==='main'){main=node;break;}
  let structure=null;
  if(main){
    const innerStart=openTagEnd(html,main.startIndex);
    // No toLowerCase(): Turkish "İ" lowercases to two code units and would
    // shift every offset after it.
    const innerEnd=Math.max(html.lastIndexOf('</main',main.endIndex),html.lastIndexOf('</MAIN',main.endIndex));
    const sections=[];const used=new Set();
    let pendingStart=null,pendingComment='',lastEnd=innerStart,index=0;
    for(const node of main.children||[]){
      if(node.type==='text'){if(node.data.trim()&&pendingStart===null)pendingStart=node.startIndex;continue;}
      if(node.type==='comment'){if(pendingStart===null)pendingStart=node.startIndex;pendingComment=pendingComment||cleanText(node.data);continue;}
      if(!isElement(node))continue;
      if(FIXED_TAGS.has(node.name)){if(pendingStart===null)pendingStart=node.startIndex;continue;}
      index+=1;
      const attrs=attrsOf(node);
      let key=isKey(attrs.id)?attrs.id:slug(pendingComment)||'';
      if(!key){const inner=[...descendants(node)].find(child=>isKey(attrsOf(child)['data-section']));key=inner?`sec-${attrsOf(inner)['data-section']}`:`section-${index}`;}
      if(!isKey(key))key=`section-${index}`;
      let unique=key,suffix=2;while(used.has(unique))unique=`${key}-${suffix++}`;used.add(unique);
      sections.push(extractSection(html,node,pendingStart??node.startIndex,unique,pendingComment));
      lastEnd=node.endIndex+1;pendingStart=null;pendingComment='';
    }
    if(innerStart>0&&innerEnd>=lastEnd)structure={innerStart,innerEnd,head:sections.length?html.slice(innerStart,sections[0].rangeStart):'',tail:html.slice(lastEnd,innerEnd),sections};
  }
  cache.set(html,structure);
  if(cache.size>60)cache.delete(cache.keys().next().value);
  return structure;
}

// The tree the admin sees: no source ranges or markup.
export function publicStructure(structure){
  if(!structure)return null;
  return {sections:structure.sections.map(section=>({key:section.key,type:section.type,label:section.label,keys:section.keys,fields:section.fields,
    collections:section.collections.map(collection=>({name:collection.name,label:collection.label,itemLabel:collection.itemLabel,itemType:collection.itemType,allowedChildren:collection.allowedChildren,minItems:collection.minItems,maxItems:collection.maxItems,items:collection.items.map(item=>({key:item.key,type:item.type,fields:item.fields}))}))}))};
}

export function structureEditable(route){return /^(tr|en)\/[a-zA-Z0-9_./-]+\.html$/.test(route)&&!/\/blog\/(?!index\.html$)[^/]+\.html$/.test(route);}
function staticFile(route){
  if(!structureEditable(route)||route.includes('..'))return null;
  const file=path.resolve(siteRoot,route);
  return file.startsWith(siteRoot+path.sep)&&fs.existsSync(file)?file:null;
}
export function structureForRoute(route){
  const file=staticFile(route);
  return file?extractStructure(fs.readFileSync(file,'utf8')):null;
}
export function validatePageStructure(route,content){
  if(!content||content[LAYOUT_KEY]===undefined)return '';
  const structure=structureForRoute(route);
  if(!structure)return 'Bu sayfanın bölüm yapısı düzenlenemez.';
  return validateLayoutContent(structure,content);
}

const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function rekey(markup,from,to){return markup.replace(new RegExp(`(\\s(?:data-section|id)=)(["'])${escapeRegExp(from)}\\2`,'g'),`$1$2${to}$2`);}
function namespaceKeys(markup,ns,keys){return markup.replace(/(\s(?:data-section|id)=)(["'])([^"']+)\2/g,(all,name,quote,value)=>keys.has(value)?`${name}${quote}${ns}_${value}${quote}`:all);}
function valuesOf(item){return Object.fromEntries(item.fields.map(field=>[field.field,field.value]));}
function applyButtonAttributes(markup,values,template){
  const end=openTagEnd(markup,0);if(end<0)return markup;
  let open=markup.slice(0,end);
  if(values.variant&&values.variant!==template.variant){
    const className=(values.variant==='secondary'?tokens.buttonSecondary:tokens.buttonPrimary)+(template.relative?' relative':'');
    open=/\sclass=/.test(open)?open.replace(/\sclass=(["'])[^"']*\1/,` class="${className}"`):open.replace(/>$/,` class="${className}">`);
  }
  open=open.replace(/\s(?:target|rel)=(["'])[^"']*\1/g,'');
  if(values.target==='_blank')open=open.replace(/>$/,' target="_blank" rel="noopener noreferrer">');
  return open+markup.slice(end);
}
function emptyPlaceholder(collection,preview){
  return preview?`<div class="cms-empty-collection" data-cms-empty="${escapeAttr(collection.id)}">Henüz ${escapeText(collection.itemLabel.toLocaleLowerCase('tr'))} yok. Sağ paneldeki “+ ${escapeText(collection.itemLabel)} ekle” ile ekleyin.</div>`:'';
}
function renderBaseCollection(collection,resolved,preview){
  const byKey=new Map(collection.items.map(item=>[item.key,item]));
  const parts=[];
  for(const item of resolved.items){
    if(item.hidden)continue;
    const template=byKey.get(item.baseKey)||byKey.get(item.template)||collection.items[0];
    if(!template)continue;
    let markup=item.baseKey?template.html:rekey(template.html,template.key,item.key);
    if(collection.kind==='buttons')markup=applyButtonAttributes(markup,valuesOf(item),template);
    if(preview)markup=insertAfterTagName(markup,` data-cms-node="${escapeAttr(item.id)}"`);
    parts.push(markup);
  }
  if(!parts.length)return emptyPlaceholder(resolved,preview);
  const joined=parts.join(collection.separator);
  return collection.wrap&&parts.length>1?`<div class="${collection.wrap}">${joined}</div>`:joined;
}
function renderBaseSection(section,node,preview){
  let markup=section.html;
  const resolved=new Map(node.collections.map(collection=>[collection.name,collection]));
  for(const collection of [...section.collections].sort((left,right)=>right.start-left.start)){
    const rendered=renderBaseCollection(collection,resolved.get(collection.name),preview);
    markup=markup.slice(0,collection.start-section.rangeStart)+rendered+markup.slice(collection.end-section.rangeStart);
  }
  const at=section.tagNameEnd-section.rangeStart;
  markup=markup.slice(0,at)+` data-cms-key="${escapeAttr(node.key)}"`+(preview?` data-cms-node="${escapeAttr(node.id)}"`:'')+markup.slice(at);
  return node.namespace?namespaceKeys(markup,node.namespace,new Set(section.keys)):markup;
}
function renderTypedSection(node,preview){
  const type=componentTypes[node.type];
  const ctx={preview};
  const collections={};
  for(const collection of node.collections){
    const itemType=componentTypes[collection.itemType];
    const parts=collection.items.filter(item=>!item.hidden).map(item=>componentTypes[item.type]?.render?.({key:item.key,values:valuesOf(item),ctx})||itemType?.render?.({key:item.key,values:valuesOf(item),ctx})||'');
    collections[collection.name]=parts.length?parts.join(''):emptyPlaceholder(collection,preview);
  }
  const markup=type.render({key:node.key,values:valuesOf(node),collections,ctx});
  return insertAfterTagName(markup,` data-cms-key="${escapeAttr(node.key)}"`+(preview?` data-cms-node="${escapeAttr(node.id)}"`:''));
}

// Content keys owned by existing button groups are only meaningful after the
// structure pass annotated them, so their presence also enables the pass.
export function needsStructurePass(content,{preview=false}={}){
  if(preview)return true;
  if(!content||typeof content!=='object')return false;
  return content[LAYOUT_KEY]!==undefined||content.__visual!==undefined||Object.keys(content).some(key=>/_btn-\d+$/.test(key));
}

export function renderStructure(html,content,{preview=false,lang='tr'}={}){
  const structure=extractStructure(html);
  if(!structure||!structure.sections.length)return html;
  const tree=resolvePage(structure,content,lang);
  const byKey=new Map(structure.sections.map(section=>[section.key,section]));
  const parts=tree.sections.filter(node=>!node.hidden).map(node=>node.baseKey?renderBaseSection(byKey.get(node.baseKey),node,preview):renderTypedSection(node,preview));
  return html.slice(0,structure.innerStart)+structure.head+parts.join('\n\n')+structure.tail+html.slice(structure.innerEnd);
}
