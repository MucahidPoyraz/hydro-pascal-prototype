'use client';
import {useEffect,useRef,useState} from 'react';
import AdminDashboard from './admin-dashboard.jsx';
import {AdminButton,useConfirm} from './admin-controls.jsx';
import AdminActivity from './admin-activity.jsx';
import AdminPageEditor from './admin-page-editor.jsx';
import AdminRecords from './admin-records.jsx';
import AdminCatalogDocuments from './admin-catalog-documents.jsx';
import AdminShowcase from './admin-showcase.jsx';
import AdminMediaLibrary from './admin-media.jsx';
import AdminSiteSettings from './admin-site-settings.jsx';
import AdminTemplates from './admin-templates.jsx';
import AdminTasks from './admin-tasks.jsx';
import AdminCategories from './admin-categories.jsx';
import AdminSeoSettings from './admin-seo-settings.jsx';
import {categoryRenamePatch} from '../lib/category-utils.js';
const adminTabs=[['genel','▦','Genel bakış'],['site','☷','Header ve footer'],['sayfalar','▤','Sayfa içerikleri'],['urunler','⬡','Ürünler'],['kataloglar','▥','Kataloglar'],['vitrin','▧','Referanslar ve vitrin'],['medya','▧','Medya dosyaları'],['blog','▣','Blog yazıları'],['kategoriler','◫','Kategoriler'],['seo','⌕','SEO ve ölçüm'],['talepler','↗','Talepler'],['isAtamalari','✓','İş atamaları'],['sablonlar','✉','E-posta şablonları']];
const cmsSnapshot=data=>JSON.stringify({settings:data.settings,pages:data.pages,pageDrafts:data.pageDrafts||{},products:data.products,posts:data.posts,categories:data.categories||[],references:data.references||[],mediaItems:data.mediaItems||[],catalogues:data.catalogues||[],templates:data.templates,tasks:data.tasks||[]});
const snapshotPage=(snapshot,route)=>{try{return JSON.parse(snapshot||'{}').pages?.[route]||{}}catch{return {}}};
export default function Admin(){
  const [db,setDb]=useState(null),[savedSnapshot,setSavedSnapshot]=useState(''),[err,setErr]=useState(''),[pass,setPass]=useState(''),[loginPending,setLoginPending]=useState(false),[logged,setLogged]=useState(false),[tab,setTab]=useState('genel'),[page,setPage]=useState('tr/index.html'),[saved,setSaved]=useState(false),[saving,setSaving]=useState(false),[notificationPermission,setNotificationPermission]=useState('checking'),[notificationsEnabled,setNotificationsEnabled]=useState(false),[lastUpdated,setLastUpdated]=useState(null),[selection,setSelection]=useState({});
 const selectRecord=(kind,id)=>setSelection(current=>({...current,[kind]:id||''}));
 const [publishing,setPublishing]=useState(false),[lastFailure,setLastFailure]=useState(''),[publishedFlash,setPublishedFlash]=useState(false);
 const [confirmDialog,confirm]=useConfirm();
 const knownLeadIds=useRef(new Set());
 const isDirty=!!db&&cmsSnapshot(db)!==savedSnapshot;
 const menuSnapshot=settings=>JSON.stringify([settings?.navigation||[],settings?.footerLinks||[]]);
 const menuDirty=isDirty&&(()=>{try{return menuSnapshot(db.settings)!==menuSnapshot(JSON.parse(savedSnapshot).settings)}catch{return true}})();
 const notificationsSupported=notificationPermission!=='unsupported';
 const load=async()=>{try{const r=await fetch('/api/cms',{cache:'no-store'});if(!r.ok){setLogged(false);if(r.status!==401)setErr('Yönetim bilgileri yüklenemedi.');return false}const payload=await r.json();setDb(payload);setSavedSnapshot(cmsSnapshot(payload));knownLeadIds.current=new Set((payload.leads||[]).map(lead=>lead.id));setLastUpdated(new Date());setLogged(true);return true}catch{setLogged(false);setErr('Sunucuya bağlanılamadı.');return false}};
  useEffect(()=>{load()},[]);
  useEffect(()=>{const restore=()=>{const id=window.location.hash.replace('#admin-','');if(adminTabs.some(item=>item[0]===id))setTab(id);};restore();window.addEventListener('hashchange',restore);return()=>window.removeEventListener('hashchange',restore);},[]);
  useEffect(()=>{
    if(!logged)return;
    const warnBeforeLeaving=event=>{if(!isDirty)return;event.preventDefault();event.returnValue=''};
    const saveShortcut=event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save()}};
    window.addEventListener('beforeunload',warnBeforeLeaving);
    window.addEventListener('keydown',saveShortcut);
    return()=>{window.removeEventListener('beforeunload',warnBeforeLeaving);window.removeEventListener('keydown',saveShortcut)};
  },[logged,isDirty,saving,db]);
  useEffect(()=>{if(typeof window==='undefined')return;if(!('Notification'in window)){setNotificationPermission('unsupported');return}setNotificationPermission(window.Notification.permission);setNotificationsEnabled(window.localStorage.getItem('hydropascal-admin-notifications')==='on'&&window.Notification.permission==='granted')},[]);
  useEffect(()=>{if(!logged)return;const refreshLeads=async()=>{try{const r=await fetch('/api/leads',{cache:'no-store'});if(!r.ok)return;const next=await r.json();const known=knownLeadIds.current;const fresh=next.filter(lead=>!known.has(lead.id));next.forEach(lead=>known.add(lead.id));setDb(current=>current?{...current,leads:next}:current);setLastUpdated(new Date());if(notificationsEnabled&&document.hidden&&window.Notification?.permission==='granted'){fresh.slice(0,3).forEach(lead=>{const title=lead.type==='quote'?'Yeni teklif talebi':'Yeni web sitesi talebi';const notification=new window.Notification(title,{body:(lead.name||'Ziyaretçi')+(lead.company?' · '+lead.company:'')});notification.onclick=()=>{window.focus();changeTab('talepler');notification.close()}})}}catch{}};refreshLeads();const timer=window.setInterval(refreshLeads,25000);return()=>window.clearInterval(timer)},[logged,notificationsEnabled]);
  useEffect(()=>{const initial=window.location.hash.slice(7);if(adminTabs.some(item=>item[0]===initial))setTab(initial)},[]);
  const toggleNotifications=async()=>{if(!('Notification'in window)){setErr('Bu tarayıcı bildirimleri desteklemiyor.');return}if(notificationsEnabled){window.localStorage.removeItem('hydropascal-admin-notifications');setNotificationsEnabled(false);return}let permission=window.Notification.permission;if(permission==='default')permission=await window.Notification.requestPermission();setNotificationPermission(permission);if(permission==='granted'){window.localStorage.setItem('hydropascal-admin-notifications','on');setNotificationsEnabled(true);setErr('')}else setErr('Bildirim izni verilmedi. İzni tarayıcı ayarlarından açabilirsiniz.')};
 const login=async e=>{
   e.preventDefault();
   if(loginPending)return;
   setErr('');
   setLoginPending(true);
   try{
     const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass})});
     const result=await r.json().catch(()=>({}));
     if(!r.ok){setErr(result.error||'Giriş yapılamadı. Şifrenizi kontrol edip yeniden deneyin.');return}
     setPass('');
     await load();
   }catch{setErr('Sunucuya bağlanılamadı.')}
   finally{setLoginPending(false)}
 };
 const save=async()=>{
   if(!db||saving)return {ok:false};
   if(!isDirty)return {ok:true,revision:db._revision};
   setSaved(false);setErr('');setSaving(true);
   try{
     const response=await fetch('/api/cms',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':String(db._revision||'')},body:JSON.stringify(db)});
     const result=await response.json().catch(()=>({}));
     if(!response.ok){setErr(result.error||'Değişiklikler kaydedilemedi.');setLastFailure('save');return {ok:false,error:result.error};}
     const savedDb={...db,_revision:result.revision??db._revision,pageDrafts:result.pageDrafts||db.pageDrafts||{},contentDrafts:result.contentDrafts||db.contentDrafts||{},products:result.products||db.products,posts:result.posts||db.posts,catalogues:result.catalogues||db.catalogues,hasNavigationDraft:Boolean(result.hasNavigationDraft)};
     setDb(current=>current&&cmsSnapshot(current)!==cmsSnapshot(db)?{...current,_revision:savedDb._revision,hasNavigationDraft:savedDb.hasNavigationDraft}:savedDb);
     setSavedSnapshot(cmsSnapshot(savedDb));setSaved(true);setLastFailure('');setTimeout(()=>setSaved(false),2400);
     return {ok:true,revision:savedDb._revision};
   }catch{setErr('Sunucuya bağlanılamadı.');setLastFailure('save');return {ok:false,error:'Sunucuya bağlanılamadı.'};}
   finally{setSaving(false);}
 };
 // Every publish/unpublish/delete goes through /api/content-publish; unsaved edits are saved first.
 const publishContent=async(type,id,mode='publish',extra={})=>{
   if(!db||saving||publishing)return false;
   let revision=db._revision;
   setPublishing(true);setLastFailure('');
   try{
     if(isDirty){const savedDraft=await save();if(!savedDraft.ok){setLastFailure('publish');return false;}revision=savedDraft.revision;}
     const response=await fetch('/api/content-publish',{method:'POST',headers:{'Content-Type':'application/json','If-Match':String(revision||'')},body:JSON.stringify({type,mode,...extra,...(id===undefined?{}:Array.isArray(id)?{ids:id}:{id})})});
     const result=await response.json().catch(()=>({}));
     if(!response.ok){setErr(result.error||'İçerik yayımlanamadı. Sayfayı yenileyip yeniden deneyin.');setLastFailure('publish');return false;}
     setErr('');await load();setPublishedFlash(true);setTimeout(()=>setPublishedFlash(false),2400);return result;
   }catch{setErr('Sunucuya bağlanılamadı. İçerik yayımlanamadı.');setLastFailure('publish');return false;}
   finally{setPublishing(false);}
 };
 const publishNavigation=mode=>publishContent('navigation',undefined,mode);
 const discardChanges=async()=>{
   if(!isDirty)return;
   const choice=await confirm({eyebrow:'KAYDEDİLMEMİŞ DEĞİŞİKLİKLER',title:'Değişiklikler atılsın mı?',message:'Son kayıttan sonra yaptığınız tüm düzenlemeler silinir. Kaydedilmiş taslaklar ve canlı site etkilenmez.',actions:[{id:'cancel',label:'Vazgeç'},{id:'discard',label:'Değişiklikleri at',variant:'danger'}]});
   if(choice==='discard'){await load();setErr('');}
 };
 const bulkLeadStatus=async(ids,status)=>{
   try{
     const response=await fetch('/api/leads',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,status})});
     const result=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(result.error);
     const wanted=new Set(ids);setDb(prev=>({...prev,leads:prev.leads.map(lead=>wanted.has(lead.id)?{...lead,status}:lead)}));return true;
   }catch(error){setErr(error.message||'Talep durumları kaydedilemedi.');return false;}
 };
  const logout=async()=>{
    if(isDirty){
      const choice=await confirm({eyebrow:'KAYDEDİLMEMİŞ DEĞİŞİKLİKLER',title:'Çıkmadan önce kaydedilsin mi?',message:'Kaydetmeden çıkarsanız son kayıttan sonraki düzenlemeler kaybolur.',actions:[{id:'cancel',label:'Vazgeç'},{id:'discard',label:'Değişiklikleri at',variant:'danger'},{id:'save',label:'Kaydet ve çık',variant:'primary'}]});
      if(choice==='cancel')return;
      if(choice==='save'){const result=await save();if(!result.ok)return;}
    }
    await fetch('/api/login-out',{method:'POST'});setLogged(false);
  };
  const changeTab=next=>{setTab(next);if(typeof window!=='undefined')window.history.replaceState(null,'','#admin-'+next)};
  const handleTabKeyDown=event=>{const currentIndex=adminTabs.findIndex(item=>item[0]===tab);let nextIndex=currentIndex;if(['ArrowDown','ArrowRight'].includes(event.key))nextIndex=(currentIndex+1)%adminTabs.length;else if(['ArrowUp','ArrowLeft'].includes(event.key))nextIndex=(currentIndex-1+adminTabs.length)%adminTabs.length;else if(event.key==='Home')nextIndex=0;else if(event.key==='End')nextIndex=adminTabs.length-1;else return;event.preventDefault();const next=adminTabs[nextIndex][0];changeTab(next);requestAnimationFrame(()=>document.getElementById('admin-tab-'+next)?.focus())};
  const setSetting=(k,v)=>setDb(prev=>({...prev,settings:{...prev.settings,[k]:v}}));
 const updateReferences=references=>setDb(prev=>({...prev,references}));
 const updateMediaItems=mediaItems=>setDb(prev=>({...prev,mediaItems}));
 const addCatalogue=()=>{const item={id:crypto.randomUUID(),title:'Yeni katalog',titleEn:'',category:(db.categories||[]).find(item=>item.scope==='catalog')?.name||'',categoryEn:'',description:'',descriptionEn:'',file:'',fileEn:'',active:false,sortOrder:(db.catalogues||[]).length};setDb(prev=>({...prev,catalogues:[...(prev.catalogues||[]),item]}));return item};
 const updateCatalogue=(id,key,value)=>setDb(prev=>({...prev,catalogues:(prev.catalogues||[]).map(item=>item.id===id?{...item,...(typeof key==='object'?key:{[key]:value})}:item)}));
 const deleteCatalogue=id=>setDb(prev=>({...prev,catalogues:(prev.catalogues||[]).filter(item=>item.id!==id)}));
 const changeField=(section,field,value)=>setDb(prev=>{const pageData=prev.pages[page]||{};const sectionData=pageData[section]||{};const nextSection=section==='__visual'?{...sectionData,[field]:{...(sectionData[field]||{}),...value}}:{...sectionData,[field]:value};const nextPage={...pageData,[section]:nextSection};if(section==='__blocks'&&field==='items'&&Array.isArray(value)){const active=new Set(value.map(item=>item.id));for(const old of sectionData.items||[])if(!active.has(old.id))delete nextPage[old.id];}return {...prev,pages:{...prev.pages,[page]:nextPage}}});
 const setPageContent=(route,content)=>setDb(prev=>({...prev,pages:{...prev.pages,[route]:content}}));
 const commitPageDraftState=(route,draft,revision)=>{
   setDb(prev=>{const pageDrafts={...(prev.pageDrafts||{})};if(draft)pageDrafts[route]=draft;else delete pageDrafts[route];return {...prev,_revision:revision??prev._revision,pageDrafts}});
   setSavedSnapshot(previous=>{let baseline={};try{baseline=JSON.parse(previous||'{}')}catch{}const pageDrafts={...(baseline.pageDrafts||{})};if(draft)pageDrafts[route]=draft;else delete pageDrafts[route];return cmsSnapshot({...baseline,pages:{...(baseline.pages||{}),[route]:db.pages?.[route]||{}},pageDrafts})});
 };
 const savePageDraft=async route=>{if(!db?.pages?.[route])return {ok:false,error:'Sayfa içeriği bulunamadı.'};try{const response=await fetch('/api/page-draft',{method:'POST',headers:{'Content-Type':'application/json','If-Match':String(db._revision||'')},body:JSON.stringify({page:route,content:db.pages[route]})});const result=await response.json().catch(()=>({}));if(!response.ok){setErr(result.error||'Sayfa taslağı kaydedilemedi.');return {ok:false,error:result.error}}commitPageDraftState(route,result.draft||null,result.revision);setErr('');return {ok:true,...result}}catch{setErr('Sunucuya bağlanılamadı.');return {ok:false,error:'Sunucuya bağlanılamadı.'}}};
 const publishPage=async route=>{const savedDraft=await savePageDraft(route);if(!savedDraft.ok)return savedDraft;try{const response=await fetch('/api/page-publish',{method:'POST',headers:{'Content-Type':'application/json','If-Match':String(savedDraft.revision||db._revision||'')},body:JSON.stringify({page:route})});const result=await response.json().catch(()=>({}));if(!response.ok){setErr(result.error||'Sayfa yayımlanamadı.');return {ok:false,error:result.error}}commitPageDraftState(route,null,result.revision);setErr('');setSaved(true);setTimeout(()=>setSaved(false),2400);return {ok:true,...result}}catch{setErr('Sunucuya bağlanılamadı.');return {ok:false,error:'Sunucuya bağlanılamadı.'}}};
 const products=db?.products||[];const leads=db?.leads||[];const categories=db?.categories||[];
 const addProduct=(type='hydraulic')=>{const prefix={hydraulic:'HPL',oem:'OEM',cast:'PC',forge:'PF'}[type]||'HPL';const category=(db.categories||[]).find(item=>item.scope==='product')?.name||'';const product={id:crypto.randomUUID(),type,name:'Yeni ürün',nameEn:'',detailTitle:'',detailTitleEn:'',slug:'yeni-urun-'+Date.now().toString().slice(-5),code:prefix+'-'+Date.now().toString().slice(-6),category,categoryEn:'',description:'',descriptionEn:'',image:'/assets/images/hero-hydraulic-cylinder.webp',gallery:[],pdf:'',compatibleBrands:[],dimensionRows:[],dimensionGroups:[],attachments:[],active:false,sortOrder:(db.products||[]).length};setDb(prev=>({...prev,products:[product,...(prev.products||[])]}));return product.id};
  const deleteProduct=id=>setDb(prev=>({...prev,products:prev.products.filter(item=>item.id!==id)}));
 const updateProduct=(id,k,v)=>setDb(prev=>({...prev,products:prev.products.map(x=>x.id===id?{...x,...(typeof k==='object'?k:{[k]:v})}:x)}));
 const posts=db?.posts||[];
 const legacyPosts=Object.keys(db?.pages||{}).filter(p=>p.includes('/blog/')&&p.endsWith('.html')&&!p.endsWith('index.html')&&!p.endsWith('template.html'));
 const addPost=()=>{const post={id:crypto.randomUUID(),slug:'yeni-yazi-'+Date.now(),lang:'tr',title:'Yeni blog yazısı',category:(db.categories||[]).find(item=>item.scope==='blog')?.name||'',excerpt:'',content:'<h2>Yazınızın girişini buraya yazın</h2><p>İlk paragrafta konuyu ve okuyucuya sağlayacağı faydayı anlatın. Üstteki araçlarla başlık, liste, bağlantı veya görsel ekleyebilirsiniz.</p><h3>İçerik başlığı</h3><p>Devamını bu alanda tasarlayın. Hazır başlangıç şablonlarından birini seçerek metni kolayca oluşturabilirsiniz.</p>',image:'/assets/images/hero-hydraulic-cylinder.webp',published:false};setDb(prev=>({...prev,posts:[post,...prev.posts]}));return post.id};
  const deletePost=id=>setDb(prev=>({...prev,posts:prev.posts.filter(item=>item.id!==id)}));
 const updatePost=(id,k,v)=>setDb(prev=>({...prev,posts:prev.posts.map(p=>p.id===id?{...p,...(typeof k==='object'?k:{[k]:v})}:p)}));
  const addTask=task=>{const item={id:crypto.randomUUID(),...task};setDb(prev=>({...prev,tasks:[item,...(prev.tasks||[])]}));return item.id};
  const updateTask=(id,key,value)=>setDb(prev=>({...prev,tasks:(prev.tasks||[]).map(item=>item.id===id?{...item,...(typeof key==='object'?key:{[key]:value})}:item)}));
  const deleteTask=id=>setDb(prev=>({...prev,tasks:(prev.tasks||[]).filter(item=>item.id!==id)}));
  const addCategory=category=>setDb(prev=>({...prev,categories:[category,...(prev.categories||[])]}));
 const updateCategory=(id,patch)=>setDb(prev=>{
    const old=(prev.categories||[]).find(item=>item.id===id);if(!old)return prev;
    const next={...old,...patch};
    const type={product:'products',blog:'posts',catalog:'catalogues'}[old.scope];
    const records=(prev[type]||[]).map(item=>{const change=categoryRenamePatch(item,old,next);return Object.keys(change).length?{...item,...change}:item;});
    return {...prev,[type]:records,categories:(prev.categories||[]).map(item=>item.id===id?next:item)};
  });
 const saveContextCategory=async category=>{
   if(saving)throw new Error('Devam eden kayıt işlemini bekleyin.');
   setSaving(true);
   try{
     const response=await fetch('/api/categories',{method:'POST',headers:{'Content-Type':'application/json','If-Match':String(db._revision||'')},body:JSON.stringify(category)});
     const result=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(result.error||'Kategori kaydedilemedi.');
     if(category.id)updateCategory(category.id,result.category);
     setDb(current=>({...current,_revision:result.revision,categories:[result.category,...current.categories.filter(item=>item.id!==result.category.id)]}));
     setSavedSnapshot(previous=>{let baseline={};try{baseline=JSON.parse(previous||'{}')}catch{}return cmsSnapshot({...baseline,categories:result.categories});});
     return result.category;
   }finally{setSaving(false);}
 };
  const deleteCategory=id=>setDb(prev=>({...prev,categories:(prev.categories||[]).filter(item=>item.id!==id)}));
 const upload=async(file,onUrl)=>{if(!file)return;setErr('');try{const fd=new FormData();fd.set('file',file);const r=await fetch('/api/upload',{method:'POST',body:fd});const x=await r.json().catch(()=>({}));if(!r.ok){setErr(x.error||'Dosya yüklenemedi. Dosya türünü ve boyutunu kontrol edin.');return}onUrl(x.url)}catch{setErr('Görsel yüklenemedi. Sunucu bağlantısını kontrol edin.')}};
 const setLead=async(id,status)=>{const old=leads.find(l=>l.id===id)?.status;setDb(prev=>({...prev,leads:prev.leads.map(l=>l.id===id?{...l,status}:l)}));try{const r=await fetch('/api/leads/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});if(!r.ok)throw new Error();}catch{setDb(prev=>({...prev,leads:prev.leads.map(l=>l.id===id?{...l,status:old}:l)}));setErr('Talep durumu kaydedilemedi. Bağlantınızı kontrol edip yeniden deneyin.');}};
 const updateTemplate=(type,k,v)=>setDb(prev=>({...prev,templates:{...prev.templates,[type]:{...prev.templates[type],[k]:v}}}));
 const reply=(lead,type)=>{
   const isEnglish=lead.lang==='en';
   const templateType=['quote','sample'].includes(type)?type:'contact';
   const t=db.templates[templateType]||db.templates.contact;
   const suffix=isEnglish?'En':'';
   const replace=x=>String(x||'').replaceAll('{{name}}',lead.name||'').replaceAll('{{company}}',lead.company||'').replaceAll('{{subject}}',lead.subject||'');
   const fields=Object.entries(lead.fields||{}).map(([key,value])=>key+': '+value).join('\n');
   const files=(lead.attachments||[]).map(file=>file.name).filter(Boolean);
   const extra=(isEnglish?'\n\nSubmitted fields:\n':'\n\nForm yanıtları:\n')+fields+(files.length?(isEnglish?'\n\nCustomer files to attach: ':'\n\nEklenecek müşteri dosyaları: ')+files.join(', '):'');
   const email=encodeURIComponent(String(lead.email||'').replace(/[\r\n]/g,'')).replace(/%40/gi,'@');
   const subject=replace(t['subject'+suffix]||t.subject);
   const body=replace(t['body'+suffix]||t.body)+(isEnglish?'\n\n--- Request ---\n':'\n\n--- Talep ---\n')+(lead.message||'')+extra;
   location.href='mailto:'+email+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 };
 if(!logged)return <main className="login"><form onSubmit={login}><img className="admin-login-logo" src="/assets/images/logo/hpl-logo-yatay.svg" alt="HydroPascal"/><p className="eyebrow">HYDROPASCAL / CMS</p><h1>Yönetim paneli</h1><p>Devam etmek için yönetici şifrenizle giriş yapın.</p><label>Yönetici şifresi<input autoFocus type="password" value={pass} onChange={e=>setPass(e.target.value)} required /></label>{err&&<p className="error">{err}</p>}<button className="primary" disabled={loginPending}>{loginPending?'Giriş yapılıyor…':'Giriş yap'} <span>→</span></button><a className="back" href="/tr/index.html">← Siteye dön</a></form></main>;
 if(!db)return <main className="loading">İçerik yükleniyor…</main>;
 return <div className="admin"><aside className="sidebar"><a className="brand" href="/tr/index.html"><img className="admin-sidebar-logo" src="/assets/images/logo/hpl-logo-yatay-dark.svg" alt="HydroPascal"/></a><div className="mobile-admin-nav"><select aria-label="Yönetim bölümü" value={tab} onChange={event=>changeTab(event.target.value)}>{adminTabs.map(([id,,title])=><option key={id} value={id}>{title}</option>)}</select></div><AdminButton className="mobile-admin-logout" variant="ghost" onClick={logout}>Çıkış</AdminButton><div className="side-label">YÖNETİM</div><div className="sidebar-nav" role="tablist" aria-label="Yönetim bölümleri" aria-orientation="vertical">{adminTabs.map(([id,icon,title])=><button type="button" key={id} id={'admin-tab-'+id} data-admin-tab={id} role="tab" aria-selected={tab===id} aria-controls="admin-content" tabIndex={tab===id?0:-1} className={'navitem '+(tab===id?'active':'')} onKeyDown={handleTabKeyDown} onClick={()=>changeTab(id)}><span aria-hidden="true">{icon}</span>{title}{id==='talepler'&&leads.filter(item=>item.status==='Yeni').length>0&&<i>{leads.filter(item=>item.status==='Yeni').length}</i>}</button>)}</div><div className="sidebottom"><a href="/tr/index.html" target="_blank" rel="noreferrer">↗ Siteyi görüntüle</a><button type="button" onClick={logout}>Çıkış yap</button></div></aside><main className="workspace"><header className="topbar"><div><span className="eyebrow">HYDROPASCAL / YÖNETİM</span><h1>{adminTabs.find(item=>item[0]===tab)?.[2]}</h1></div><div className="top-actions"><span className="live"><i/>Site aktif</span><span className={'save-state '+(isDirty?'unsaved':'clean')+(saving||publishing?' is-busy':lastFailure?' is-failed':publishedFlash?' is-published':'')} role="status">{saving?'Kaydediliyor…':publishing?'Yayınlanıyor…':lastFailure==='publish'?'Yayınlanamadı':lastFailure==='save'?'Kaydedilemedi':isDirty?'Kaydedilmemiş değişiklikler':publishedFlash?'Yayınlandı':'Kaydedildi'}</span>{isDirty&&<AdminButton variant="ghost" className="discard-changes" disabled={saving||publishing} onClick={discardChanges}>Değişiklikleri at</AdminButton>}<AdminButton className="save" variant="primary" disabled={saving||publishing||!isDirty} aria-busy={saving} onClick={save}>{saving?'Kaydediliyor…':isDirty?'Kaydet':'Kaydedildi'}<span>→</span></AdminButton></div></header>{confirmDialog}
 {saved&&<div className="toast" role="status" aria-live="polite">Değişiklikler kaydedildi ✓</div>}{err&&<div className="toast warn" role="alert">{err}<button type="button" aria-label="Bildirimi kapat" onClick={()=>setErr('')}>×</button></div>}<div id="admin-content" role="tabpanel" aria-labelledby={'admin-tab-'+tab} tabIndex={0} aria-busy={publishing} inert={publishing||undefined}>
 {tab==='genel'&&<><section className="welcome"><div><span className="eyebrow">HYDROPASCAL / YÖNETİM</span><h2>İşlerinizi tek yerden yönetin.</h2><p>Son talepleri izleyin, içerikleri güncelleyin, değişiklikleri kaydedin.</p></div><img className="welcome-logo" src="/assets/images/logo/hpl-logo-yatay-dark.svg" alt="HydroPascal"/></section><div className="stats"><article><span>SAYFALAR</span><b>{Object.keys(db.pages).length}</b><small>Türkçe ve İngilizce</small></article><article><span>ÜRÜNLER</span><b>{products.length}</b><small>Katalog kayıtları</small></article><article><span>BLOG YAZILARI</span><b>{posts.length}</b><small>Yayında ve taslak</small></article><article><span>YANIT BEKLEYEN</span><b>{leads.filter(item=>item.status==='Yeni').length}</b><small>{leads.length} toplam talep</small></article></div><section className="panel"><div className="panelhead"><div><span className="eyebrow">HIZLI BAŞLANGIÇ</span><h3>Ne yapmak istiyorsunuz?</h3></div></div><div className="quick">{[['site','Header ve footer','Logo, menü ve alt bölüm'],['sayfalar','Sayfa içeriği','Önizlemede tıklayarak düzenle'],['urunler','Ürün ekle','Katalog kayıtlarını yönet'],['talepler','Taleplere bak','Yeni müşteri mesajlarını gör']].map(item=><button key={item[0]} onClick={()=>changeTab(item[0])}><span>→</span><b>{item[1]}</b><small>{item[2]}</small></button>)}</div></section><AdminDashboard leads={leads} onOpenLeads={()=>changeTab('talepler')} notificationsEnabled={notificationsEnabled} notificationsSupported={notificationsSupported} notificationPermission={notificationPermission} onToggleNotifications={toggleNotifications} lastUpdated={lastUpdated}/><AdminActivity/></>}{tab==='site'&&<AdminSiteSettings db={db} setSetting={setSetting} upload={upload} isDirty={menuDirty} busy={saving||publishing} onPublishNavigation={publishNavigation} confirm={confirm}/>}
 {tab==='sayfalar'&&<AdminPageEditor db={db} page={page} savedPage={snapshotPage(savedSnapshot,page)} onSetPage={setPage} onChange={changeField} onSetPageContent={setPageContent} onSavePageDraft={savePageDraft} onPublishPage={publishPage} onUpdateProduct={updateProduct} onUpdatePost={updatePost}/>}
 {tab==='kataloglar'&&<AdminCatalogDocuments selectedId={selection.catalog||''} onSelect={id=>selectRecord('catalog',id)} catalogues={db.catalogues||[]} categories={categories} onSaveCategory={saveContextCategory} onManageCategories={()=>changeTab('kategoriler')} onAdd={addCatalogue} onUpdate={updateCatalogue} onDelete={deleteCatalogue} onPublishContent={publishContent} onSave={save} confirm={confirm} onUpload={upload}/>}
 {tab==='kategoriler'&&<AdminCategories onSaveCategory={saveContextCategory} categories={categories} posts={db.posts||[]} products={products} catalogues={db.catalogues||[]} onAdd={addCategory} onUpdate={updateCategory} onDelete={deleteCategory} confirm={confirm}/>}
 {tab==='vitrin'&&<AdminShowcase references={db.references||[]} mediaItems={db.mediaItems||[]} onUpdateReferences={updateReferences} onUpdateMedia={updateMediaItems} onUpload={upload}/>}{tab==='medya'&&<AdminMediaLibrary/>}
 {['urunler','blog','talepler'].includes(tab)&&<AdminRecords tab={tab} seoSettings={db.settings} selection={selection} onSelect={selectRecord} products={products} posts={posts} categories={categories} onSaveCategory={saveContextCategory} legacyPosts={legacyPosts} sitePages={db.pages} leads={leads} onManageCategories={()=>changeTab('kategoriler')} onAddProduct={addProduct} onUpdateProduct={updateProduct} onDeleteProduct={deleteProduct} onAddPost={addPost} onUpdatePost={updatePost} onDeletePost={deletePost} onPublishContent={publishContent} onSave={save} confirm={confirm} onBulkLeadStatus={bulkLeadStatus} onSetLead={setLead} onReply={lead=>reply(lead,lead.type==='quote'?'quote':lead.type==='sample'?'sample':'contact')} onUpload={upload} onOpenLegacy={path=>{setPage(path);changeTab('sayfalar')}}/>}
 {tab==='isAtamalari'&&<AdminTasks tasks={db.tasks||[]} pages={Object.keys(db.pages||{}).sort((a,b)=>a.localeCompare(b,'tr'))} onAdd={addTask} onUpdate={updateTask} onDelete={deleteTask} confirm={confirm} onOpenPage={path=>{setPage(path);changeTab('sayfalar')}}/>}
 {tab==='sablonlar'&&<AdminTemplates db={db} updateTemplate={updateTemplate}/>}
 {tab==='seo'&&<AdminSeoSettings db={db} setSetting={setSetting}/>}
 </div>
 <footer className="foot">HydroPascal İçerik Stüdyosu <span>•</span> Ürün, blog, katalog, sayfa ve menü değişiklikleri önce taslak kaydedilir, Yayınla ile canlıya yansır. Şirket ve iletişim bilgileri kayıtta uygulanır.</footer></main></div>;
}
