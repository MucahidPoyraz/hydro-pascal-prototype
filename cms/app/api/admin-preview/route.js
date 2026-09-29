import {isAdminRequest} from '../../lib/auth.js';
import {iconLibraryMarkup} from '../../lib/icons.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function previewClient(lucideIcons) {
  const pageFromPath = () => decodeURIComponent(location.pathname.replace(/^\//, ''));
  const sendToAdmin = message => window.parent.postMessage(message, location.origin);
  const labels = {title:'Başlık',content:'Açıklama',image:'Görsel',href:'Bağlantı',alt:'Görsel açıklaması','cta-text':'Düğme yazısı','cta-text-2':'İkinci düğme yazısı','cta-url':'Düğme bağlantısı','cta-url-2':'İkinci düğme bağlantısı'};
  let activeTarget = null;
  let activeBubble = null;
  let sliderTools = null;
  let sectionTools = null;
  let activeSliderIndex = 0;
  let propertyPanelMode = false;
  const ignoredTags = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','PATH','INPUT','TEXTAREA','SELECT','OPTION']);

  function markEditableFields() {
    document.querySelectorAll('[data-section][data-field]').forEach(element => {
      element.setAttribute('data-cms-admin-field', 'true');
      element.setAttribute('title', 'Düzenlemek için tıklayın');
    });
  }

  function fieldValue(element, field) {
    if (field === 'image') {
      const image = element.tagName === 'IMG' ? element : element.querySelector('img');
      return image?.getAttribute('src') || '';
    }
    if (field === 'href' && element.tagName === 'A') return element.getAttribute('href') || '';
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return element.value || '';
    return (element.textContent || '').trim();
  }

  function selectorFor(element) {
    if (element.id) return '#' + CSS.escape(element.id);
    const parts = [];
    let current = element;
    while (current && current !== document.body && current.nodeType === 1) {
      if (current.id) { parts.unshift('#' + CSS.escape(current.id)); break; }
      // Sections without an id carry a stable structural key; anchoring on it
      // keeps visual edits attached when sections are reordered.
      if (current.dataset?.cmsKey) { parts.unshift('[data-cms-key="' + CSS.escape(current.dataset.cmsKey) + '"]'); break; }
      const siblings = current.parentElement ? [...current.parentElement.children].filter(node => node.tagName === current.tagName) : [];
      parts.unshift(current.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')');
      current = current.parentElement;
    }
    return parts.join(' > ');
  }
  function safeEditUrl(value) {
    const url=String(value||'').trim();
    return /^(https?:|mailto:|tel:|\/|\.\.?\/|#)/i.test(url)&&!/^\s*(javascript|data|vbscript):/i.test(url)?url:'#';
  }

  function nodeContext(element) {
    const item = element?.closest?.('[data-cms-node^="i:"]');
    const section = element?.closest?.('[data-cms-node^="s:"]');
    return {item:item?.dataset.cmsNode || '', section:section?.dataset.cmsNode || ''};
  }

  function markSelected(element) {
    document.querySelectorAll('[data-cms-admin-selected]').forEach(item => item.removeAttribute('data-cms-admin-selected'));
    element?.setAttribute('data-cms-admin-selected', 'true');
  }

  // Contextual quick actions for the selected section/item. The admin derives
  // the list from the component schema and sends it here; clicks go back.
  let nodeToolbar = null;
  let nodeToolbarTarget = null;
  function positionNodeToolbar() {
    if (!nodeToolbar || !nodeToolbarTarget?.isConnected) return;
    const rect = nodeToolbarTarget.getBoundingClientRect();
    const width = nodeToolbar.offsetWidth;
    const top = Math.min(Math.max(8, rect.top + 8), window.innerHeight - nodeToolbar.offsetHeight - 8);
    nodeToolbar.style.top = top + 'px';
    nodeToolbar.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width - 8)) + 'px';
  }
  function showNodeToolbar(id, label, actions) {
    nodeToolbar?.remove(); nodeToolbar = null; nodeToolbarTarget = null;
    if (!id || !Array.isArray(actions) || !actions.length) return;
    let target = null;
    try { target = document.querySelector('[data-cms-node="' + CSS.escape(id) + '"]'); } catch {}
    if (!target) return;
    nodeToolbarTarget = target;
    nodeToolbar = make('div', 'cms-node-toolbar');
    nodeToolbar.setAttribute('role', 'toolbar');
    nodeToolbar.setAttribute('aria-label', (label || 'Seçili öğe') + ' hızlı işlemleri');
    nodeToolbar.appendChild(make('b', '', label || ''));
    actions.slice(0, 8).forEach(item => {
      const button = make('button', 'cms-node-action' + (item.danger ? ' is-danger' : ''), item.label);
      button.type = 'button';
      button.addEventListener('click', event => {event.preventDefault(); event.stopPropagation(); sendToAdmin({type:'cms-admin:node-action', id, action:item.action});});
      nodeToolbar.appendChild(button);
    });
    document.body.appendChild(nodeToolbar);
    requestAnimationFrame(positionNodeToolbar);
  }

  function emitSelection(element, textInfo=null, image=null) {
    if(!element)return;
    const target=image||textInfo?.owner||element;
    const link=target.closest?.('a[href]')||(target.tagName==='A'?target:null);
    const section=target.dataset?.section||element.dataset?.section||'';
    const field=target.dataset?.field||element.dataset?.field||'';
    const binding=bindingFor(image||textInfo?.owner||element);
    let value='';
    if(binding?.record==='product')value=binding.field==='galleryImage'?binding.product.gallery?.[binding.galleryIndex]?.url||'':binding.product[binding.field]||'';
    else if(binding?.record==='post')value=binding.field==='image'?binding.bound.getAttribute('src')||'':binding.field==='content'?binding.bound.innerHTML:binding.bound.textContent||'';
    else if(section&&field)value=fieldValue(target,field);
    else if(image)value=image.getAttribute('src')||'';
    else if(textInfo)value=textInfo.node.nodeValue||'';
    else value=target.textContent?.trim()||'';
    const kind=image||field==='image'?'image':field==='href'||target.tagName==='A'?'link':textInfo||target.hasAttribute?.('x-text')?'text':'section';
    const key=binding||section&&field?null:(textInfo?.key||selectorFor(image||textInfo?.owner||element));
    sendToAdmin({type:'cms-admin:select-element',element:{selector:selectorFor(target),key,section,field,linkField:target.dataset?.fieldLink||element.dataset?.fieldLink||'',kind,label:section?(section+' · '+(labels[field]||field||'Bölüm')):(binding?.record==='product'?'Ürün alanı':binding?.record==='post'?'Blog alanı':(target.tagName==='IMG'?'Görsel':target.tagName==='A'?'Bağlantı':target.tagName?.toLowerCase()==='section'?'Bölüm':target.tagName?.toLowerCase()==='h1'?'Başlık':target.tagName?.toLowerCase()==='p'?'Metin':'Sayfa öğesi')),value:String(value).slice(0,5000),href:link?.getAttribute('href'),src:image?.getAttribute('src')||((target.tagName==='IMG')?target.getAttribute('src'):''),alt:image?.getAttribute('alt')||((target.tagName==='IMG')?target.getAttribute('alt'):''),binding:binding?{record:binding.record,id:binding.id,field:binding.field,index:binding.galleryIndex}:null,node:nodeContext(target)}});
  }

  function collectStructure() {
    const main=document.querySelector('main')||document.body;
    const roots=[document.querySelector('header'),...main.children,document.querySelector('footer')].filter(Boolean);
    const unique=new Set();
    const describe=(element,kindOverride)=>{
      const selector=selectorFor(element);if(unique.has(selector))return null;unique.add(selector);
      const section=element.dataset?.section||'';const field=element.dataset?.field||'';
      const heading=element.matches?.('h1,h2,h3,h4')?element:element.querySelector?.('h1,h2,h3,h4');
      const label=section?(section+' · '+(labels[field]||field||'Bölüm')):(heading?.textContent?.trim().slice(0,64)||element.getAttribute?.('aria-label')||element.id||({HEADER:'Header',FOOTER:'Footer',SECTION:'Bölüm',DIV:'Bölüm'}[element.tagName]||'Bölüm'));
      const style=getComputedStyle(element);const visible=style.display!=='none'&&style.visibility!=='hidden'&&element.getAttribute('aria-hidden')!=='true';
      return {selector,label,kind:kindOverride||'section',section,field,visible};
    };
    return roots.slice(0,80).map(root=>{
      const parent=describe(root);if(!parent)return null;
      const targets=[...root.querySelectorAll('[data-section][data-field],[data-cms-post-field],[x-text],img')].slice(0,80);
      parent.children=targets.map(element=>describe(element,element.tagName==='IMG'?'image':element.tagName==='A'?'link':'text')).filter(Boolean);
      return parent;
    }).filter(Boolean);
  }

  function clickedText(event, target) {
    let node = null;
    if (document.caretPositionFromPoint) node = document.caretPositionFromPoint(event.clientX, event.clientY)?.offsetNode || null;
    else if (document.caretRangeFromPoint) node = document.caretRangeFromPoint(event.clientX, event.clientY)?.startContainer || null;
    if (node?.nodeType !== Node.TEXT_NODE || !node.nodeValue?.trim()) {
      node = [...target.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.nodeValue?.trim()) || null;
    }
    if (node?.nodeType !== Node.TEXT_NODE || !node.nodeValue?.trim()) return null;
    const owner = node.parentElement;
    if (!owner || ignoredTags.has(owner.tagName) || owner.closest('.cms-edit-bubble, .cms-slider-tools, .cms-section-tools, script, style, noscript, input, textarea, select, [contenteditable="true"]')) return null;
    const textIndex = [...owner.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).indexOf(node);
    return {owner, node, textIndex, key: selectorFor(owner) + '::text:' + textIndex};
  }

  function setIcon(target, name) {
    const entry = lucideIcons?.[name];
    if (!entry?.svg || target?.tagName !== 'svg') return;
    const template = document.createElement('template');
    template.innerHTML = entry.svg;
    const source = template.content.querySelector('svg');
    if (!source) return;
    target.replaceChildren(...[...source.childNodes].map(child => child.cloneNode(true)));
    for (const attr of ['viewBox','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin']) {
      if (source.hasAttribute(attr)) target.setAttribute(attr, source.getAttribute(attr));
    }
  }

  function openIconPicker(icon) {
    activeTarget = icon;
    const {body, footer} = createBubble('İkon seç', icon);
    const search = make('input', 'cms-icon-search');
    search.type = 'search'; search.placeholder = 'Ör. fabrika, ürün, destek'; search.setAttribute('aria-label', 'İkon ara');
    const grid = make('div', 'cms-icon-grid');
    const names = Object.keys(lucideIcons || {});
    const renderOptions = () => {
      grid.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase('tr');
      names.filter(name => (lucideIcons[name].label + ' ' + name).toLocaleLowerCase('tr').includes(query)).forEach(name => {
        const button = make('button', 'cms-icon-option'); button.type = 'button'; button.title = lucideIcons[name].label; button.setAttribute('aria-label', lucideIcons[name].label);
        const template = document.createElement('template'); template.innerHTML = lucideIcons[name].svg;
        const preview = template.content.querySelector('svg'); if (preview) button.appendChild(preview);
        button.appendChild(make('span', '', lucideIcons[name].label));
        button.addEventListener('click', () => {
          setIcon(icon, name);
          sendToAdmin({type:'cms-admin:change-visual', key:selectorFor(icon), patch:{icon:name}});
          closeBubble();
        });
        grid.appendChild(button);
      });
      if (!grid.childElementCount) grid.appendChild(make('small', 'cms-edit-context', 'Eşleşen ikon bulunamadı.'));
    };
    search.addEventListener('input', renderOptions);
    body.append(search, grid); renderOptions();
    footer.textContent = 'Lucide çizgi ikonları. Değişiklik Kaydet düğmesiyle yayınlanır.';
  }

  function bindingFor(element) {
    if (!element) return null;
    const isImage = element.tagName === 'IMG';
    const postField = element.closest('[data-cms-post-id][data-cms-post-field]');
    if (postField) return {record:'post', bound:postField, id:postField.dataset.cmsPostId, field:postField.dataset.cmsPostField};
    if (!window.Alpine?.$data) return null;
    const bound = isImage
      ? element
      : element.closest('[x-text]');
    let expression = isImage
      ? (element.getAttribute('x-bind:src') || element.getAttribute(':src') || '')
      : (bound?.getAttribute('x-text') || '');
    expression = expression.trim();
    if (!bound || !expression) return null;
    let scope;
    try { scope = window.Alpine.$data(bound); } catch { return null; }
    const lang = document.documentElement.lang?.startsWith('en') ? 'En' : '';
    const rowMatch = expression.match(/^row\.(label|value|brand|model)$/);
    if (!isImage && rowMatch && scope?.product && scope.row) {
      const property = rowMatch[1] + lang;
      const groupIndex = Array.isArray(scope.product.dimensionGroups) ? scope.product.dimensionGroups.indexOf(scope.group) : -1;
      if (groupIndex >= 0) {
        const childIndex = scope.product.dimensionGroups[groupIndex].rows?.indexOf(scope.row) ?? -1;
        if (childIndex >= 0 && ['label','value'].includes(rowMatch[1])) return {bound, scope, product:scope.product, id:scope.product.id, field:'rowField', collection:'dimensionGroups', index:groupIndex, childIndex, property, displayField:rowMatch[1]};
      }
      const collection = ['brand','model'].includes(rowMatch[1]) ? 'compatibleBrands' : 'dimensionRows';
      const index = Array.isArray(scope.product[collection]) ? scope.product[collection].indexOf(scope.row) : -1;
      if (index >= 0) return {bound, scope, product:scope.product, id:scope.product.id, field:'rowField', collection, index, property, displayField:rowMatch[1]};
    }
    const groupMatch = expression.match(/^group\.(title)$/);
    if (!isImage && groupMatch && scope?.product && scope.group) {
      const index = Array.isArray(scope.product.dimensionGroups) ? scope.product.dimensionGroups.indexOf(scope.group) : -1;
      if (index >= 0) return {bound, scope, product:scope.product, id:scope.product.id, field:'rowField', collection:'dimensionGroups', index, property:'title'+lang, displayField:'title'};
    }
    if (isImage && /^(?:product|item)\.(?:selectedImage\s*\|\|\s*)?(?:product\.|item\.)?image$/.test(expression)) {
      const product = expression.startsWith('item.') ? scope?.item : scope?.product;
      if (!product) return null;
      const selected = product.selectedImage && product.selectedImage !== product.image
        ? product.gallery?.findIndex(photo => photo.url === product.selectedImage)
        : -1;
      return selected >= 0
        ? {bound, scope, product, id:product.id, field:'galleryImage', galleryIndex:selected, displayField:'image'}
        : {bound, scope, product, id:product.id, field:'image', displayField:'image'};
    }
    if (isImage && expression === 'photo.url') {
      const product = scope?.product;
      const index = Number(scope?.index);
      if (product && product.id && Number.isInteger(index)) return {bound, scope, product, id:product.id, field:'galleryImage', galleryIndex:index, displayField:'url'};
      return null;
    }
    if (!/^(?:product|item)\.[a-zA-Z][\w.]*$/.test(expression)) return null;
    const product = expression.startsWith('item.') ? scope?.item : scope?.product;
    if (!product) return null;
    const rawField = expression.split('.').slice(1).join('.');
    const fieldMap = {name:'name',description:'description',title:'detailTitle',oemCode:'oemCode',category:'category',categoryLabel:'category'};
    const field = fieldMap[rawField];
    if (!field) return null;
    const localized = ['name','description','detailTitle','category'].includes(field) ? field + lang : field;
    return {bound, scope, product, id:product.id, field:localized, displayField:rawField};
  }

  function openVisualBubble(target, textInfo, image) {
    activeTarget = image || textInfo?.owner || target;
    const element = activeTarget;
    const link = element.closest?.('a[href]') || (element.tagName === 'A' ? element : null);
    const selector = selectorFor(element);
    const {body, footer} = createBubble(image ? 'Görseli düzenle' : 'Metni düzenle', element);
    const dataKey = textInfo?.key || selector;
    const binding = bindingFor(image || target);
    let textValue = textInfo?.node?.nodeValue || '';
    let imageValue = image?.getAttribute('src') || '';
    let altValue = image?.getAttribute('alt') || '';
    const applyPatch = patch => {
      if (patch.text !== undefined && textInfo?.node?.isConnected) textInfo.node.nodeValue = patch.text;
      if (patch.src !== undefined && image) image.setAttribute('src', patch.src);
      if (patch.alt !== undefined && image) image.alt = patch.alt;
      if (patch.href !== undefined && link) link.setAttribute('href', safeEditUrl(patch.href));
      if (image && binding?.record === 'post') {
        if (binding.field === 'content' && (patch.src !== undefined || patch.alt !== undefined)) {
          sendToAdmin({type:'cms-admin:post-edit', id:binding.id, field:'content', value:binding.bound.innerHTML});
          return;
        }
        if (binding.field === 'image' && patch.src !== undefined) {
          sendToAdmin({type:'cms-admin:post-edit', id:binding.id, field:'image', value:patch.src});
          return;
        }
      }
      if (binding?.record === 'post' && binding.field === 'content' && patch.href !== undefined) {
        sendToAdmin({type:'cms-admin:post-edit', id:binding.id, field:'content', value:binding.bound.innerHTML});
        return;
      }
      if (image && binding && patch.src !== undefined) {
        if (binding.field === 'galleryImage' && binding.product.gallery?.[binding.galleryIndex]) {
          const previousUrl = binding.product.gallery[binding.galleryIndex].url;
          binding.product.gallery[binding.galleryIndex].url = patch.src;
          if (binding.product.selectedImage === previousUrl) binding.product.selectedImage = patch.src;
        } else if (binding.field === 'image') {
          binding.product.image = patch.src;
          if (binding.product.selectedImage !== undefined) binding.product.selectedImage = patch.src;
        }
        sendToAdmin({type:'cms-admin:product-edit', id:binding.id, field:binding.field, index:binding.galleryIndex, value:patch.src});
        return;
      }
      sendToAdmin({type:'cms-admin:change-visual', key:dataKey, patch:{...patch,...(patch.href!==undefined&&link?{href:safeEditUrl(patch.href),hrefSelector:selectorFor(link)}:{})}});
    };
    if (image) {
      const preview = make('img', 'cms-edit-image-preview'); preview.src = imageValue; preview.alt = altValue || 'Görsel önizlemesi'; body.appendChild(preview);
      addBubbleField(body, 'Görsel adresi', imageValue, false, value => {imageValue=value;preview.src=value;applyPatch({src:value});});
      addBubbleField(body, 'Görsel açıklaması', altValue, false, value => {altValue=value;applyPatch({alt:value});});
      const upload = make('label', 'cms-edit-upload', 'Görsel yükle'); const file = make('input'); file.type='file'; file.accept='image/png,image/jpeg,image/webp';
      const status = make('small','cms-edit-status','PNG, JPG veya WebP'); file.addEventListener('change',()=>{const selected=file.files?.[0];file.value='';uploadImage(selected,url=>{imageValue=url;preview.src=url;applyPatch({src:url});},status);});
      upload.appendChild(file); body.append(upload,status);
    } else {
      const applyText = value => {
        textValue = value;
        if (binding) {
          if (binding.record === 'post') {
            if (binding.field === 'content') {
              if (textInfo?.node?.isConnected) textInfo.node.nodeValue = value;
              sendToAdmin({type:'cms-admin:post-edit', id:binding.id, field:'content', value:binding.bound.innerHTML});
            } else {
              binding.bound.textContent = value;
              sendToAdmin({type:'cms-admin:post-edit', id:binding.id, field:binding.field, value});
            }
          } else if (binding.field === 'rowField') {
            if (binding.collection === 'dimensionGroups' && binding.childIndex !== undefined) binding.product.dimensionGroups[binding.index].rows[binding.childIndex][binding.property] = value;
            else if (binding.collection === 'dimensionGroups') binding.product.dimensionGroups[binding.index][binding.property] = value;
            else binding.product[binding.collection][binding.index][binding.property] = value;
            binding.bound.textContent = value;
            sendToAdmin({type:'cms-admin:product-edit', id:binding.id, field:'rowField', collection:binding.collection, index:binding.index, childIndex:binding.childIndex, property:binding.property, value});
          } else {
            binding.product[binding.displayField] = value;
            if (binding.bound) binding.bound.textContent = value;
            sendToAdmin({type:'cms-admin:product-edit', id:binding.id, field:binding.field, value});
          }
        } else applyPatch({text:value});
      };
      addBubbleField(body, 'Metin', textValue, textValue.length > 110, applyText, 'primary');
    }
    if (link) addBubbleField(body, 'Bağlantı adresi', link.getAttribute('href') || '', false, value => applyPatch({href:value}), 'link');
    footer.textContent = 'Önizlemede hemen görünür. Yayınlamak için üstteki Kaydet düğmesine basın.';
  }

  function updateField(message) {
    const matches = [...document.querySelectorAll('[data-section][data-field]')].filter(element =>
      element.dataset.section === message.section && element.dataset.field === message.field
    );
    matches.forEach(element => {
      if (message.field === 'image' && element.tagName === 'A' && element.querySelector('img')) {
        element.querySelector('img').src = message.value || '';
      } else if (element.tagName === 'IMG') {
        element.src = message.value || '';
      } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = message.value || '';
      } else if (message.field === 'href' && element.tagName === 'A') {
        element.setAttribute('href', message.value || '#');
      } else {
        element.textContent = message.value || '';
      }
      if (message.linkField && element.tagName === 'A') {
        element.setAttribute('href', message.linkValue || '#');
      }
    });
    if (activeBubble && activeTarget?.dataset.section === message.section && activeTarget?.dataset.field === message.field) {
      const input = activeBubble.querySelector('[data-bubble-primary]');
      if (input && document.activeElement !== input) input.value = message.value || '';
      const linkInput = activeBubble.querySelector('[data-bubble-link]');
      if (linkInput && document.activeElement !== linkInput) linkInput.value = message.linkValue || '';
      const image = activeBubble.querySelector('[data-bubble-image-preview]');
      if (image) image.src = message.value || '';
    }
  }

  function updateSlides(slides) {
    const root = document.getElementById('hero-1');
    if (!root || !window.Alpine || !window.Alpine.$data) return;
    const component = window.Alpine.$data(root);
    if (!component) return;
    component.slides = Array.isArray(slides) ? slides.map(slide => ({src: slide.src || '', alt: slide.alt || ''})) : [];
    component.currentSlide = Math.min(component.currentSlide || 0, Math.max(0, component.slides.length - 1));
    refreshSliderTools();
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function positionBubble(anchor) {
    if (!activeBubble || !anchor?.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    activeBubble.style.width = width + 'px';
    const height = activeBubble.offsetHeight;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
    const below = rect.bottom + 12;
    const top = below + height < window.innerHeight - 10 ? below : Math.max(10, rect.top - height - 12);
    activeBubble.style.left = left + 'px';
    activeBubble.style.top = top + 'px';
  }

  function closeBubble() {
    activeBubble?.remove();
    activeBubble = null;
    activeTarget = null;
  }

  function createBubble(title, anchor) {
    closeBubble();
    const bubble = make('section', 'cms-edit-bubble');
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', title);
    const heading = make('div', 'cms-edit-bubble-heading');
    const icon = make('span', 'cms-edit-icon', '✎');
    const titleText = make('b', '', title);
    const close = make('button', 'cms-edit-close', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Düzenleme baloncuğunu kapat'); close.onclick = closeBubble;
    heading.append(icon, titleText, close);
    const body = make('div', 'cms-edit-bubble-body');
    const footer = make('div', 'cms-edit-bubble-footer', 'Değişiklikler üstteki Kaydet düğmesiyle yayınlanır.');
    bubble.append(heading, body, footer);
    document.body.appendChild(bubble);
    activeBubble = bubble;
    requestAnimationFrame(() => positionBubble(anchor));
    return {bubble, body, footer};
  }

  function addBubbleField(parent, labelText, value, multiline, onInput, marker) {
    const label = make('label', 'cms-edit-label', labelText);
    const input = make(multiline ? 'textarea' : 'input', 'cms-edit-control');
    if (multiline) input.rows = 5;
    input.value = value || '';
    if (marker === 'primary') input.dataset.bubblePrimary = 'true';
    if (marker === 'link') input.dataset.bubbleLink = 'true';
    input.addEventListener('input', () => onInput(input.value));
    label.appendChild(input);
    parent.appendChild(label);
    return input;
  }

  async function uploadImage(file, onUploaded, status) {
    if (!file) return;
    const data = new FormData();
    data.set('file', file);
    status.textContent = 'Görsel yükleniyor…';
    try {
      const response = await fetch('/api/upload', {method:'POST', body:data});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Görsel yüklenemedi.');
      status.textContent = 'Görsel yüklendi.';
      onUploaded(result.url);
    } catch (error) {
      status.textContent = error.message || 'Görsel yüklenemedi.';
    }
  }

  function openFieldBubble(element) {
    const section = element.dataset.section;
    const field = element.dataset.field;
    const linkField = element.dataset.fieldLink || '';
    activeTarget = element;
    const value = fieldValue(element, field);
    const title = labels[field] || field.replaceAll('-', ' ');
    const {body, footer} = createBubble(title, element);
    const description = make('small', 'cms-edit-context', section === 'hero-1' ? 'Ana görsel alanı' : 'Sayfa içeriği');
    body.appendChild(description);
    const multiline = field === 'content' || value.length > 120;
    const changeValue = next => {
      updateField({section, field, value:next, linkField, linkValue:linkField ? element.getAttribute('href') || '' : undefined});
      sendToAdmin({type:'cms-admin:change-field', section, field, value:next, linkField, linkValue:linkField ? element.getAttribute('href') || '' : undefined});
    };
    addBubbleField(body, labels[field] || 'Metin', value, multiline, changeValue, 'primary');
    if (linkField) {
      const linkValue = element.getAttribute('href') || '';
      addBubbleField(body, labels[linkField] || 'Bağlantı adresi', linkValue, false, next => {
        updateField({section, field, value:fieldValue(element, field), linkField, linkValue:next});
        sendToAdmin({type:'cms-admin:change-field', section, field, value:fieldValue(element, field), linkField, linkValue:next});
      }, 'link');
    }
    if (field === 'image') {
      const preview = make('img', 'cms-edit-image-preview');
      preview.dataset.bubbleImagePreview = 'true';
      preview.src = value || '';
      preview.alt = 'Seçili görsel önizlemesi';
      body.appendChild(preview);
      const upload = make('label', 'cms-edit-upload', 'Görsel seç');
      const file = make('input');
      file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp';
      const status = make('small', 'cms-edit-status', 'PNG, JPG veya WebP');
      file.addEventListener('change', () => {const selected = file.files?.[0]; file.value = ''; uploadImage(selected, changeValue, status);});
      upload.appendChild(file); body.append(upload, status);
      const clear = make('button', 'cms-edit-secondary', 'Görseli kaldır');
      clear.type = 'button'; clear.onclick = () => changeValue(''); body.appendChild(clear);
    }
    const block=element.closest('[data-cms-block-id]');
    if(block){const remove=make('button','cms-edit-danger','Bölümü sil');remove.type='button';remove.onclick=()=>{const id=block.dataset.cmsBlockId;block.remove();sendToAdmin({type:'cms-admin:remove-block',id});closeBubble();};body.appendChild(remove);}
    footer.textContent = 'Yazdıklarınız önizlemede hemen görünür. Yayınlamak için üstte Kaydet’e basın.';
  }

  function makeContentBlock(block) {
    const section=make('section','cms-content-block max-w-5xl mx-auto px-6 lg:px-8 py-14');section.dataset.cmsBlockId=block.id;
    if(block.type==='image'){
      const figure=make('figure','overflow-hidden rounded-2xl border border-white/10 bg-white/5');
      if(block.image){const image=make('img','w-full max-h-[560px] object-cover');image.dataset.section=block.id;image.dataset.field='image';image.src=block.image;image.alt=block.alt||block.title||'';image.loading='lazy';figure.appendChild(image);}
      const caption=make('figcaption','p-6');
      if(block.title){const title=make('h2','text-3xl md:text-4xl font-bold text-white mb-6',block.title);title.dataset.section=block.id;title.dataset.field='title';caption.appendChild(title);}
      if(block.content){const copy=make('p','text-lg text-slate-300 leading-relaxed',block.content);copy.dataset.section=block.id;copy.dataset.field='content';caption.appendChild(copy);}
      section.appendChild(figure);if(caption.childElementCount)figure.appendChild(caption);
    } else {
      const box=make(block.type==='quote'?'blockquote':'div',block.type==='quote'?'rounded-2xl border-l-4 border-[#fb923c] bg-white/5 p-7 md:p-10':'rounded-2xl border border-white/10 bg-white/5 p-7 md:p-10');
      if(block.title){const title=make('h2','text-3xl md:text-4xl font-bold text-white mb-6',block.title);title.dataset.section=block.id;title.dataset.field='title';box.appendChild(title);}
      if(block.content){const copy=make('p',block.type==='quote'?'text-xl leading-relaxed text-slate-200':'text-lg text-slate-300 leading-relaxed',block.content);copy.dataset.section=block.id;copy.dataset.field='content';box.appendChild(copy);}
      section.appendChild(box);
    }
    return section;
  }

  function addContentBlock(type) {
    const main=document.querySelector('main');if(!main)return;
    const names={text:'Yeni metin bölümü',image:'Yeni görsel bölümü',quote:'Öne çıkan not'};
    const block={id:crypto.randomUUID(),type,title:names[type]||'Yeni bölüm',content:type==='quote'?'Buraya öne çıkarmak istediğiniz notu yazın.':'Bu metni düzenlemek için üzerine tıklayın.',image:type==='image'?'/assets/images/hero-hydraulic-cylinder.webp':'',alt:'Yeni görsel',active:true};
    const element=makeContentBlock(block);main.appendChild(element);markEditableFields();
    sendToAdmin({type:'cms-admin:add-block',block});
    closeBubble();
    if(type==='image'){const image=element.querySelector('img[data-field="image"]');if(image)openFieldBubble(image);}
  }

  function mountSectionTools() {
    if(sectionTools?.isConnected)return;
    sectionTools=make('button','cms-section-tools','＋ Bölüm ekle');sectionTools.type='button';sectionTools.setAttribute('aria-label','Sayfaya bölüm ekle');
    sectionTools.addEventListener('click',()=>{
      const {body,footer}=createBubble('Bölüm ekle',sectionTools);
      const options=[['text','Metin alanı','Başlık ve açıklama ekleyin.'],['image','Görsel bölümü','Fotoğraf, başlık ve kısa açıklama ekleyin.'],['quote','Vurgu alanı','Önemli bir bilgiyi öne çıkarın.']];
      options.forEach(([type,title,description])=>{const button=make('button','cms-section-option');button.type='button';button.append(make('b','',title),make('small','',description));button.addEventListener('click',()=>addContentBlock(type));body.appendChild(button);});
      footer.textContent='Bölümü ekledikten sonra sayfanın altına gelir; metin ve görsele tıklayarak düzenleyin.';
    });
    document.body.appendChild(sectionTools);
  }

  function getSlider() {
    const root = document.getElementById('hero-1');
    if (!root || !window.Alpine || !window.Alpine.$data) return null;
    const component = window.Alpine.$data(root);
    return component ? {root, component} : null;
  }

  function refreshSliderTools() {
    if (!sliderTools) return;
    const slider = getSlider();
    if (!slider) return;
    const count = sliderTools.querySelector('[data-slider-count]');
    if (count) count.textContent = `${slider.component.slides.length} slayt`;
    const remove = sliderTools.querySelector('[data-slider-remove]');
    if (remove) remove.disabled = slider.component.slides.length <= 1;
  }

  function commitSlides(slides, index) {
    const slider = getSlider();
    if (!slider) return;
    slider.component.slides = slides.map(slide => ({src:slide.src || '', alt:slide.alt || ''}));
    slider.component.currentSlide = Math.min(Math.max(index, 0), Math.max(0, slides.length - 1));
    activeSliderIndex = slider.component.currentSlide;
    sendToAdmin({type:'cms-admin:slides-change', slides:slider.component.slides});
    refreshSliderTools();
  }

  function openSlideBubble(index) {
    const slider = getSlider();
    if (!slider) return;
    activeSliderIndex = index;
    slider.component.currentSlide = index;
    const slide = slider.component.slides[index];
    if (!slide) return;
    const {body, footer} = createBubble('Slider görseli ' + (index + 1), slider.root);
    const preview = make('img', 'cms-edit-image-preview');
    preview.src = slide.src || '';
    preview.alt = slide.alt || '';
    body.appendChild(preview);
    const updateSlide = (field, value) => {
      const slides = slider.component.slides.map((item, itemIndex) => itemIndex === index ? {...item, [field]:value} : item);
      if (field === 'src') preview.src = value || '';
      commitSlides(slides, index);
    };
    addBubbleField(body, 'Görsel adresi', slide.src || '', false, value => updateSlide('src', value));
    addBubbleField(body, 'Görsel açıklaması', slide.alt || '', false, value => updateSlide('alt', value));
    const upload = make('label', 'cms-edit-upload', 'Görsel yükle');
    const file = make('input');
    file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp';
    const status = make('small', 'cms-edit-status', 'PNG, JPG veya WebP');
    file.addEventListener('change', () => {const selected = file.files?.[0]; file.value = ''; uploadImage(selected, url => updateSlide('src', url), status);});
    upload.appendChild(file); body.append(upload, status);
    footer.textContent = 'Sıra için slider araç çubuğundaki okları kullanın.';
  }

  function mountSliderTools() {
    const slider = getSlider();
    if (!slider) {setTimeout(mountSliderTools, 180);return;}
    if (sliderTools?.isConnected) return;
    sliderTools = make('div', 'cms-slider-tools');
    sliderTools.setAttribute('aria-label', 'Slider düzenleme araçları');
    const heading = make('div', 'cms-slider-tools-title');
    heading.append(make('b', '', 'Ana görseller'), make('small', '', 'Slayt yönetimi'));
    const count = make('span', 'cms-slider-count', slider.component.slides.length + ' slayt'); count.dataset.sliderCount = 'true';
    heading.appendChild(count);
    const actions = make('div', 'cms-slider-actions');
    const button = (icon, title, action, marker) => {
      const control = make('button', 'cms-slider-action', icon); control.type = 'button'; control.title = title; control.setAttribute('aria-label', title);
      if (marker) control.dataset[marker] = 'true';
      control.addEventListener('click', action); actions.appendChild(control); return control;
    };
    button('✎', 'Bu slaytı düzenle', () => {const value = getSlider(); if (value) openSlideBubble(value.component.currentSlide || 0);});
    button('←', 'Slaytı sola taşı', () => {const value = getSlider(); if (!value) return; const index = value.component.currentSlide || 0; if (index < 1) return; const slides = [...value.component.slides]; [slides[index-1], slides[index]] = [slides[index], slides[index-1]]; commitSlides(slides, index-1);});
    button('→', 'Slaytı sağa taşı', () => {const value = getSlider(); if (!value) return; const index = value.component.currentSlide || 0; if (index >= value.component.slides.length-1) return; const slides = [...value.component.slides]; [slides[index+1], slides[index]] = [slides[index], slides[index+1]]; commitSlides(slides, index+1);});
    button('＋', 'Yeni slayt ekle', () => {const value = getSlider(); if (!value) return; const slides = [...value.component.slides, {src:'/assets/images/hero-hydraulic-cylinder.webp',alt:'Yeni slider görseli'}]; commitSlides(slides, slides.length-1); openSlideBubble(slides.length-1);});
    button('×', 'Bu slaytı sil', () => {const value = getSlider(); if (!value || value.component.slides.length <= 1) return; const index = value.component.currentSlide || 0; const slides = value.component.slides.filter((_, itemIndex) => itemIndex !== index); commitSlides(slides, Math.min(index, slides.length-1)); closeBubble();}, 'sliderRemove');
    sliderTools.append(heading, actions);
    slider.root.appendChild(sliderTools);
    refreshSliderTools();
  }

  document.addEventListener('click', event => {
    if (event.target.closest('.cms-edit-bubble, .cms-slider-tools, .cms-node-toolbar')) return;
    if (event.target.closest('.cms-empty-collection')) {
      event.preventDefault(); event.stopImmediatePropagation();
      const section = event.target.closest('[data-cms-node^="s:"]');
      if (section) {markSelected(section); sendToAdmin({type:'cms-admin:select-node', id:section.dataset.cmsNode});}
      return;
    }
    const element = event.target.closest('[data-section][data-field]');
    if (element) {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelectorAll('[data-cms-admin-selected]').forEach(item => item.removeAttribute('data-cms-admin-selected'));
      element.setAttribute('data-cms-admin-selected', 'true');
      emitSelection(element);
      if(!propertyPanelMode)openFieldBubble(element);
      return;
    }

    const linkedPage=event.target.closest('a[href]');
    if(linkedPage&&!event.shiftKey&&linkedPage.target!=='_blank'){
      const destination=new URL(linkedPage.href,location.href);
      const route=destination.pathname.replace(/^\//,'');
      if(destination.origin===location.origin&&/\.(html)$/.test(destination.pathname)&&/^(tr|en)\/[a-zA-Z0-9_./-]+\.html$/.test(route)&&!route.includes('..')){
        event.preventDefault();event.stopImmediatePropagation();sendToAdmin({type:'cms-admin:navigate',page:route,search:destination.search});return;
      }
    }

    const icon = event.target.closest('svg');
    if (icon && !icon.closest('.cms-edit-bubble, .cms-slider-tools') && (icon.hasAttribute('stroke') || icon.querySelector('[stroke]'))) {
      event.preventDefault(); event.stopImmediatePropagation();
      document.querySelectorAll('[data-cms-admin-selected]').forEach(item => item.removeAttribute('data-cms-admin-selected'));
      icon.setAttribute('data-cms-admin-selected','true');
      emitSelection(icon);
      openIconPicker(icon);
      return;
    }

    const image = event.target.closest('img');
    if (image && !image.closest('.cms-edit-bubble, .cms-slider-tools')) {
      event.preventDefault(); event.stopImmediatePropagation();
      document.querySelectorAll('[data-cms-admin-selected]').forEach(item=>item.removeAttribute('data-cms-admin-selected'));
      image.setAttribute('data-cms-admin-selected','true');
      emitSelection(image,null,image);
      if(propertyPanelMode)return;
      openVisualBubble(image, null, image);
      return;
    }

    const textTarget = event.target.closest('[x-text]') || event.target;
    const textInfo = clickedText(event, textTarget);
    if (textInfo) {
      event.preventDefault(); event.stopImmediatePropagation();
      document.querySelectorAll('[data-cms-admin-selected]').forEach(item => item.removeAttribute('data-cms-admin-selected'));
      textInfo.owner.setAttribute('data-cms-admin-selected','true');
      emitSelection(textTarget,textInfo,null);
      if(propertyPanelMode)return;
      openVisualBubble(textTarget, textInfo, null);
      return;
    }

    const structuralNode=event.target.closest('[data-cms-node^="i:"]')||event.target.closest('[data-cms-node^="s:"]');
    if(structuralNode){
      event.preventDefault();event.stopImmediatePropagation();
      markSelected(structuralNode);sendToAdmin({type:'cms-admin:select-node',id:structuralNode.dataset.cmsNode});return;
    }

    const sectionTarget=event.target.closest('main > section, main > div[id], header, footer');
    if(sectionTarget){
      event.preventDefault();event.stopImmediatePropagation();
      document.querySelectorAll('[data-cms-admin-selected]').forEach(item=>item.removeAttribute('data-cms-admin-selected'));
      sectionTarget.setAttribute('data-cms-admin-selected','true');emitSelection(sectionTarget);return;
    }

    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank') return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || !/\.(html)$/.test(destination.pathname)) return;
    const page = destination.pathname.replace(/^\//, '');
    if (!/^(tr|en)\/[a-zA-Z0-9_./-]+\.html$/.test(page) || page.includes('..')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendToAdmin({type: 'cms-admin:navigate', page, search: destination.search});
  }, true);

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'cms-admin:update-field') updateField(event.data);
    if(event.data?.type==='cms-admin:update-alt'&&typeof event.data.section==='string')document.querySelectorAll('[data-section][data-field="alt"]').forEach(node=>{if(node.dataset.section===event.data.section&&node.tagName==='IMG')node.setAttribute('alt',String(event.data.value||''));});
    if (event.data?.type === 'cms-admin:update-slides') updateSlides(event.data.slides);
    if(event.data?.type==='cms-admin:sync-blocks'&&Array.isArray(event.data.blocks)){
      const main=document.querySelector('main');
      if(main){main.querySelectorAll('[data-cms-block-id]').forEach(node=>node.remove());event.data.blocks.filter(block=>block&&block.active!==false).slice(0,30).forEach(block=>main.appendChild(makeContentBlock(block)));markEditableFields();sendToAdmin({type:'cms-admin:structure',items:collectStructure()});}
    }
    if (event.data?.type === 'cms-admin:set-panel-mode') propertyPanelMode=event.data.enabled===true;
    if (event.data?.type === 'cms-admin:focus-node' && typeof event.data.id === 'string') {
      let node = null;
      try {
        if (event.data.section && event.data.field) node = document.querySelector('[data-section="' + CSS.escape(event.data.section) + '"][data-field="' + CSS.escape(event.data.field) + '"]');
        node = node || document.querySelector('[data-cms-node="' + CSS.escape(event.data.id) + '"]');
      } catch {}
      if (node) {markSelected(node); if (event.data.scroll !== false) node.scrollIntoView({behavior:event.data.instant ? 'auto' : 'smooth', block:'center', inline:'nearest'});}
      else markSelected(null);
    }
    if (event.data?.type === 'cms-admin:node-actions') showNodeToolbar(event.data.id, event.data.label, event.data.actions);
    if (event.data?.type === 'cms-admin:focus-element'&&typeof event.data.selector==='string') {
      try{const node=document.querySelector(event.data.selector);if(node){document.querySelectorAll('[data-cms-admin-selected]').forEach(item=>item.removeAttribute('data-cms-admin-selected'));node.setAttribute('data-cms-admin-selected','true');node.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});}}
      catch{}
    }
    if (event.data?.type === 'cms-admin:update-visual'&&typeof event.data.selector==='string') {
      try{let node=document.querySelector(event.data.selector);if(node){const {property,value}=event.data;if(property==='text'){const part=String(event.data.key||'').match(/::text:(\d+)$/);if(part){const selector=event.data.key.slice(0,part.index);node=document.querySelector(selector)||node;const texts=[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE);const index=Number(part[1]);if(texts[index])texts[index].nodeValue=String(value);else node.appendChild(document.createTextNode(String(value)));}else node.textContent=String(value);}else if(property==='src'&&node.tagName==='IMG')node.setAttribute('src',safeEditUrl(value));else if(property==='alt'&&node.tagName==='IMG')node.setAttribute('alt',String(value));else if(property==='href'){const link=node.closest('a[href]')||(node.tagName==='A'?node:null);if(link)link.setAttribute('href',safeEditUrl(value));}}}
      catch{}
    }
    if(event.data?.type==='cms-admin:update-binding'&&typeof event.data.selector==='string'){
      try{const node=document.querySelector(event.data.selector);if(node){if(event.data.kind==='image'&&node.tagName==='IMG')node.setAttribute('src',safeEditUrl(event.data.value));else node.textContent=String(event.data.value);}}
      catch{}
    }
  });

  window.addEventListener('keydown', event => {if (event.key === 'Escape') closeBubble();});
  window.addEventListener('scroll', () => {if (activeBubble) positionBubble(activeTarget || document.getElementById('hero-1')); positionNodeToolbar();}, true);
  window.addEventListener('resize', () => {if (activeBubble) positionBubble(activeTarget || document.getElementById('hero-1')); positionNodeToolbar();});

  const style = document.createElement('style');
  style.textContent = `
    [data-cms-admin-field="true"]{outline:1px dashed rgba(251,146,60,.78);outline-offset:3px;cursor:pointer}
    [data-cms-admin-field="true"]:hover,[data-cms-admin-selected="true"]{outline:2px solid #fb923c!important;outline-offset:3px!important}
    [data-cms-admin-clickable="true"]{outline:1px dashed rgba(251,146,60,.72);outline-offset:3px;cursor:pointer}
    .cms-icon-search{margin:11px 12px 0;width:calc(100% - 24px);min-height:34px;padding:7px 9px;border:1px solid #dedbd2;border-radius:7px;font:11px system-ui}
    .cms-icon-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;padding:10px 12px}
    .cms-icon-option{display:flex;min-width:0;min-height:58px;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid #eeece6;border-radius:8px;background:#fff;color:#535950;font:9px system-ui;cursor:pointer}
    .cms-icon-option:hover{border-color:#e17a47;background:#fff8f3;color:#a84d22}
    .cms-icon-option svg{width:21px;height:21px;stroke:currentColor;fill:none;stroke-width:1.8}
    .cms-icon-option span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cms-edit-bubble{position:fixed;z-index:2147483000;max-height:min(72vh,600px);overflow:auto;padding:0;border:1px solid #dedbd2;border-radius:12px;background:#fff;color:#30342d;box-shadow:0 18px 55px #17181335;font:12px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}
    .cms-edit-bubble-heading{display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid #efede7;background:#faf9f6}
    .cms-edit-icon{display:grid;width:27px;height:27px;place-items:center;border-radius:8px;background:#fff0e8;color:#b84e1e;font-size:14px}
    .cms-edit-bubble-heading b{flex:1;font-size:12px}
    .cms-edit-close{width:27px;height:27px;border:0;border-radius:7px;background:transparent;color:#777c73;font-size:19px;line-height:1}
    .cms-edit-close:hover{background:#efede7;color:#333}
    .cms-edit-bubble-body{display:flex;flex-direction:column;gap:9px;padding:12px 13px}
    .cms-edit-context,.cms-edit-status{color:#83877f;font-size:9px}
    .cms-edit-label{display:flex;flex-direction:column;gap:5px;color:#60665c;font-size:10px;font-weight:600}
    .cms-edit-control{width:100%;min-height:35px;padding:8px 9px;border:1px solid #dcdad2;border-radius:7px;background:#fff;color:#2f342d;font:12px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;outline:none}
    .cms-edit-control:focus{border-color:#e17a47;box-shadow:0 0 0 3px #df5f1f20}
    textarea.cms-edit-control{min-height:105px;resize:vertical}
    .cms-edit-image-preview{display:block;max-width:100%;max-height:112px;align-self:flex-start;object-fit:contain;border:1px solid #eeece6;border-radius:7px;background:#f8f7f3}
    .cms-edit-upload{position:relative;display:flex;min-height:35px;align-items:center;justify-content:center;overflow:hidden;padding:8px;border:1px dashed #ddbda9;border-radius:7px;background:#fff8f3;color:#a84d22;font-size:10px;font-weight:600;cursor:pointer}
    .cms-edit-upload input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
    .cms-edit-secondary{align-self:flex-start;padding:6px 9px;border:1px solid #e8e5de;border-radius:7px;background:#fff;color:#72776e;font-size:9px}
    .cms-edit-danger{align-self:flex-start;padding:7px 10px;border:1px solid #f1d1c7;border-radius:7px;background:#fff7f5;color:#ae452e;font-size:9px;font-weight:600}
    .cms-edit-bubble-footer{padding:9px 13px;border-top:1px solid #efede7;color:#888d84;font-size:9px}
    .cms-section-tools{position:fixed;top:14px;right:16px;z-index:2147482000;padding:9px 12px;border:1px solid #ffffff45;border-radius:999px;background:#181c1bea;color:#fff;box-shadow:0 7px 24px #0003;font:600 10px system-ui;cursor:pointer}
    .cms-section-tools{display:none!important}
    .cms-section-tools:hover{border-color:#fb923c;color:#ffd1b4}
    .cms-section-option{display:flex;align-items:flex-start;flex-direction:column;gap:3px;padding:10px;border:1px solid #eeece6;border-radius:8px;background:#fff;color:#43483f;text-align:left}
    .cms-section-option:hover{border-color:#e17a47;background:#fff8f3}
    .cms-section-option b{font-size:10px}.cms-section-option small{color:#868a82;font-size:8px}
    .cms-slider-tools{position:absolute;right:18px;bottom:18px;z-index:2147482000;width:min(330px,calc(100% - 28px));padding:10px;border:1px solid #ffffff70;border-radius:11px;background:#171a19ed;color:#fff;box-shadow:0 10px 32px #0005;backdrop-filter:blur(12px);font:11px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif}
    .cms-slider-tools-title{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .cms-slider-tools-title b{font-size:10px}.cms-slider-tools-title small{color:#babcb5;font-size:9px}
    .cms-slider-count{margin-left:auto;color:#dedbd1;font-size:9px}
    .cms-slider-actions{display:flex;gap:6px}
    .cms-slider-action{display:grid;min-width:36px;height:34px;flex:1;place-items:center;border:1px solid #ffffff29;border-radius:7px;background:#ffffff12;color:#fff;font-size:15px}
    .cms-slider-action:hover:not(:disabled){border-color:#fb923c;background:#fb923c2a;color:#ffd4bc}
    .cms-slider-action:disabled{opacity:.35;cursor:not-allowed}
    [data-cms-node^="i:"]{cursor:pointer}
    [data-cms-node^="i:"]:hover{outline:1px dashed rgba(251,146,60,.7);outline-offset:4px}
    .cms-empty-collection{grid-column:1/-1;display:flex;min-height:96px;align-items:center;justify-content:center;padding:18px;border:1px dashed rgba(251,146,60,.7);border-radius:8px;background:rgba(251,146,60,.06);color:#fdba74;font:600 12px system-ui;text-align:center;cursor:pointer}
    .cms-node-toolbar{position:fixed;z-index:2147482500;display:flex;max-width:calc(100vw - 16px);flex-wrap:wrap;align-items:center;gap:4px;padding:5px;border:1px solid #ffffff38;border-radius:9px;background:#171a19f0;box-shadow:0 10px 28px #0006;font:600 10px system-ui,-apple-system,'Segoe UI',sans-serif}
    .cms-node-toolbar b{max-width:150px;overflow:hidden;padding:0 6px;color:#d6d3cb;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
    .cms-node-action{min-height:28px;padding:5px 8px;border:1px solid #ffffff26;border-radius:6px;background:#ffffff10;color:#fff;font:600 10px system-ui;cursor:pointer}
    .cms-node-action:hover,.cms-node-action:focus-visible{border-color:#fb923c;background:#fb923c33;color:#ffe2cf;outline:none}
    .cms-node-action.is-danger:hover{border-color:#f87171;background:#f8717130;color:#fecaca}
    @media(max-width:600px){.cms-slider-tools{right:10px;bottom:10px;width:calc(100% - 20px)}.cms-edit-bubble{max-height:68vh}.cms-icon-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);

  let hoverTarget = null;
  document.addEventListener('pointerover', event => {
    const candidate = event.target.closest?.('[data-section][data-field], [data-cms-post-field], [x-text], img, svg[stroke], svg:has([stroke])');
    const target = candidate || clickedText(event,event.target)?.owner;
    if (!target || target.closest('.cms-edit-bubble, .cms-slider-tools')) return;
    if (hoverTarget && hoverTarget !== target) hoverTarget.removeAttribute('data-cms-admin-clickable');
    hoverTarget = target; hoverTarget.setAttribute('data-cms-admin-clickable','true');
  }, true);
  document.addEventListener('pointerout', event => {
    if (hoverTarget && !hoverTarget.contains(event.relatedTarget)) {hoverTarget.removeAttribute('data-cms-admin-clickable');hoverTarget=null;}
  }, true);

  window.addEventListener('load', () => {
    markEditableFields();
    mountSliderTools();
    mountSectionTools();
    sendToAdmin({type:'cms-admin:structure',items:collectStructure()});
    sendToAdmin({type: 'cms-admin:ready', page: pageFromPath()});
  }, {once: true});
}

export async function GET(request) {
  if (!isAdminRequest(request)) return new Response('Not found', {status: 404});
  const source = '(' + previewClient.toString() + ')(' + JSON.stringify(iconLibraryMarkup()) + ');';
  return new Response(source, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/javascript; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
