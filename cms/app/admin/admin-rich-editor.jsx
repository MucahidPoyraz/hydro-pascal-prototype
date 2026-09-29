'use client';

import {useEffect, useRef, useState} from 'react';
import {AdminButton} from './admin-controls.jsx';
import {MediaPicker} from './admin-media.jsx';

const allowedTags=new Set(['P','H2','H3','H4','UL','OL','LI','BLOCKQUOTE','STRONG','B','EM','I','U','A','IMG','BR','HR','PRE','CODE']);
function safeUrl(value){const url=String(value||'').trim();return /^(https?:|mailto:|tel:|\/|\.\.?\/|#)/i.test(url)&&!/^\s*(javascript|data|vbscript):/i.test(url)?url:'#';}
function cleanHtml(value){
  const doc=new DOMParser().parseFromString(String(value||''),'text/html');
  const visit=parent=>[...parent.childNodes].forEach(node=>{
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    if(!allowedTags.has(node.tagName)){if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','FORM'].includes(node.tagName)){node.remove();return;}visit(node);node.replaceWith(...node.childNodes);return;}
    const href=node.getAttribute('href'),target=node.getAttribute('target'),src=node.getAttribute('src'),alt=node.getAttribute('alt');
    [...node.attributes].forEach(attr=>node.removeAttribute(attr.name));
    if(node.tagName==='A'){node.setAttribute('href',safeUrl(href));if(target==='_blank'){node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer');}}
    if(node.tagName==='IMG'){const imageUrl=safeUrl(src);if(imageUrl==='#'){node.remove();return;}node.setAttribute('src',imageUrl);node.setAttribute('alt',alt||'');node.setAttribute('loading','lazy');}
    visit(node);
  });
  visit(doc.body);
  return doc.body.innerHTML;
}

const templates=[
  {id:'product',label:'Ürün tanıtımı',content:'<h2>Ürüne genel bakış</h2><p>Ürünün ne işe yaradığını ve hangi ihtiyacı karşıladığını anlatın.</p><h3>Öne çıkan özellikler</h3><ul><li>Malzeme ve üretim bilgisi</li><li>Uyumlu kullanım alanları</li><li>Ölçü veya bağlantı bilgisi</li></ul><h3>Teknik detaylar</h3><p>Teknik bilgileri ve varsa ürün kodlarını ekleyin.</p><p><strong>Teknik PDF:</strong> İlgili katalog dosyasını ürün sayfasından inceleyebilirsiniz.</p>'},
  {id:'guide',label:'Teknik rehber',content:'<h2>Bu rehberde neler var?</h2><p>Okuyucunun sorusunu ve içeriğin amacını kısaca açıklayın.</p><h3>1. Başlangıç</h3><p>İlk adımı ve önemli noktaları yazın.</p><h3>2. Uygulama</h3><p>İşlemi anlaşılır adımlara bölün.</p><blockquote><p>Uzman önerisi: Uygulamaya başlamadan önce ürün ve sistem ölçülerini kontrol edin.</p></blockquote><h3>Sık sorulan sorular</h3><p>Okuyucunun merak edebileceği soruları yanıtlayın.</p>'},
  {id:'news',label:'Firma haberi',content:'<h2>Haberin özeti</h2><p>Yeniliği, tarihi ve kimleri ilgilendirdiğini ilk paragrafta anlatın.</p><h3>Gelişme hakkında</h3><p>Önemli ayrıntıları ve müşteriye etkisini paylaşın.</p><h3>HydroPascal hakkında</h3><p>Üretim ve hizmetlerimiz hakkında kısa bilgi verin.</p>'}
];

export default function AdminRichEditor({value='',onChange}){
  const [mode,setMode]=useState('write'),[fullscreen,setFullscreen]=useState(false);
  const editor=useRef(null),savedSelection=useRef(null),current=useRef(value);
  current.current=value;
  useEffect(()=>{if(editor.current&&document.activeElement!==editor.current&&editor.current.innerHTML!==value)editor.current.innerHTML=cleanHtml(value);},[value,mode]);
  useEffect(()=>{
    if(!fullscreen)return;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    const onKeyDown=event=>{if(event.key==='Escape'&&!document.querySelector('.admin-media-dialog'))setFullscreen(false)};
    window.addEventListener('keydown',onKeyDown);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKeyDown)};
  },[fullscreen]);
  const save=()=>{if(editor.current){const html=cleanHtml(editor.current.innerHTML);if(html!==editor.current.innerHTML)editor.current.innerHTML=html;current.current=html;onChange(html);}};
  const command=(name,arg)=>{editor.current?.focus();document.execCommand(name,false,arg);save();};
  const keepSelection=()=>{const selection=window.getSelection();if(selection?.rangeCount)savedSelection.current=selection.getRangeAt(0).cloneRange();};
  const restoreSelection=()=>{editor.current?.focus();const selection=window.getSelection();if(savedSelection.current&&selection){selection.removeAllRanges();selection.addRange(savedSelection.current);}};
  const insertHtml=html=>{restoreSelection();document.execCommand('insertHTML',false,html);save();};
  const insertImage=asset=>{if(!asset?.url)return;const alt=String(asset.alt||asset.displayName||asset.name||'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');insertHtml('<img src="'+safeUrl(asset.url)+'" alt="'+alt+'" loading="lazy">');};
  const applyTemplate=template=>{if(current.current.trim()&&!window.confirm('Şablon mevcut yazı içeriğinin yerine geçsin mi?'))return;const html=cleanHtml(template.content);current.current=html;onChange(html);if(editor.current)editor.current.innerHTML=html;setMode('write');};
  const addLink=()=>{keepSelection();const href=window.prompt('Bağlantı adresini yazın');if(!href)return;command('createLink',safeUrl(href));};
  const switchMode=next=>{if(mode==='write')save();setMode(next)};
  return <section className={`rich-editor-panel ${fullscreen?'is-fullscreen':''}`}>
    <div className="rich-editor-heading"><div><b>Yazı içeriği</b><small>Metni seçip biçimlendirin veya hazır bir taslakla başlayın.</small></div><div className="rich-editor-heading-actions"><div className="rich-editor-modes" role="tablist" aria-label="Blog düzenleme görünümü">{[['write','Düzenle'],['source','HTML'],['preview','Önizleme']].map(([id,label])=><button type="button" role="tab" aria-selected={mode===id} onClick={()=>switchMode(id)} key={id}>{label}</button>)}</div><AdminButton variant="secondary" onClick={()=>{if(mode==='write')save();setFullscreen(value=>!value)}}>{fullscreen?'Tam ekrandan çık':'Tam ekran'}</AdminButton></div></div>
    {mode==='write'&&<>
      <div className="rich-template-row"><span>Başlangıç şablonu</span>{templates.map(template=><AdminButton key={template.id} size="compact" variant="ghost" onClick={()=>applyTemplate(template)}>{template.label}</AdminButton>)}</div>
      <div className="rich-toolbar" role="toolbar" aria-label="Metin biçimlendirme">
        <AdminButton size="compact" onMouseDown={event=>event.preventDefault()} onClick={()=>command('undo')} aria-label="Geri al">↶</AdminButton>
        <AdminButton size="compact" onMouseDown={event=>event.preventDefault()} onClick={()=>command('redo')} aria-label="Yinele">↷</AdminButton>
        <span className="rich-toolbar-divider" aria-hidden="true" />
        <AdminButton size="compact" onMouseDown={event=>event.preventDefault()} onClick={()=>command('formatBlock','<p>')}>Paragraf</AdminButton>
        <AdminButton size="compact" onMouseDown={event=>event.preventDefault()} onClick={()=>command('formatBlock','<h2>')}>Başlık</AdminButton>
        <AdminButton size="compact" onMouseDown={event=>event.preventDefault()} onClick={()=>command('formatBlock','<h3>')}>Alt başlık</AdminButton>
        <AdminButton size="compact" aria-label="Kalın" title="Kalın" onMouseDown={event=>event.preventDefault()} onClick={()=>command('bold')}><b>B</b></AdminButton>
        <AdminButton size="compact" aria-label="İtalik" title="İtalik" onMouseDown={event=>event.preventDefault()} onClick={()=>command('italic')}><i>İ</i></AdminButton>
        <AdminButton size="compact" onMouseDown={event=>event.preventDefault()} onClick={()=>command('insertUnorderedList')}>• Liste</AdminButton>
        <AdminButton size="compact" onMouseDown={event=>event.preventDefault()} onClick={()=>command('formatBlock','<blockquote>')}>Alıntı</AdminButton>
        <AdminButton size="compact" onMouseDown={event=>event.preventDefault()} onClick={()=>command('formatBlock','<pre>')}>Kod</AdminButton>
        <AdminButton size="compact" onMouseDown={event=>event.preventDefault()} onClick={addLink}>Bağlantı</AdminButton>
        <MediaPicker filter="image" label="Görsel ekle" onOpen={keepSelection} onSelect={insertImage} />
      </div>
      <div ref={editor} className="rich-editor-canvas" contentEditable suppressContentEditableWarning role="textbox" aria-label="Blog yazısı içeriği" aria-multiline="true" onInput={save} onBlur={save} onKeyUp={keepSelection} onMouseUp={keepSelection} />
      <p className="rich-editor-note">Başlık ve paragrafları biçimlendirin; görselleri medya kütüphanesinden seçin. Taslak ve yayın durumu üstteki Kaydet işlemiyle saklanır.</p>
    </>}
    {mode==='source'&&<label className="rich-source-label">HTML kaynağı<textarea rows="16" spellCheck="false" value={value} onChange={event=>onChange(event.target.value)} onBlur={event=>onChange(cleanHtml(event.target.value))}/><small>HTML yazarken etiketler korunur; bu alandan ayrıldığınızda izin verilmeyen öğeler temizlenir.</small></label>}
    {mode==='preview'&&<article className="rich-editor-preview prose" dangerouslySetInnerHTML={{__html:cleanHtml(value)}}/>}
  </section>;
}
