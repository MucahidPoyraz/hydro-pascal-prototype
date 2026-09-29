'use client';
import TreeEditor from './tree-editor.jsx';
import {normalizeNavigation} from '../lib/navigation-tree.js';

import {useState} from 'react';
import {handleTabKeyDown} from './tab-keyboard.js';
import {AdminButton, PageHeader} from './admin-controls.jsx';

const settingTabs = [
  {id: 'header', label: 'Header'},
  {id: 'footer', label: 'Footer'},
  {id: 'email', label: 'E-posta'}
];

function LogoManager({title, value, fallback, onChange, onUpload, dark = false}) {
  return (
    <section className={'logo-manager-card' + (dark ? ' dark' : '')}>
      <div className="logo-manager-heading">
        <div><b>{title}</b><small>Header alanında kullanılır</small></div>
        <span className="logo-manager-badge">{dark ? 'Koyu zemin' : 'Açık zemin'}</span>
      </div>
      <div className="logo-manager-body">
        <div className="logo-manager-preview" aria-label={title + ' önizlemesi'}>
          <img src={value || fallback} alt={title} />
        </div>
        <div className="logo-manager-actions">
          <label className="logo-upload-control">
            <span>{value ? 'Logoyu değiştir' : 'Logo yükle'}</span>
            <small>PNG, JPG veya WebP</small>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if (file) onUpload(file, url => onChange(url));}} />
          </label>
          <details className="logo-address-settings">
            <summary>Görsel adresini elle gir</summary>
            <label>Logo adresi<input value={value || ''} onChange={event => onChange(event.target.value)} placeholder={fallback} /></label>
          </details>
        </div>
      </div>
    </section>
  );
}

// Menus are staged: Save stores a draft, "Menüyü yayınla" makes it the public header/footer.
function NavigationDraftBanner({hasDraft, isDirty, busy, onPublish, confirm}) {
  if (!hasDraft && !isDirty) return null;
  const discard = async () => {
    const choice = await confirm({eyebrow: 'MENÜ TASLAĞI', title: 'Menü taslağı atılsın mı?', message: 'Header ve footer menüsü canlı sitedeki haline döner.', actions: [{id: 'cancel', label: 'Vazgeç'}, {id: 'discard', label: 'Taslağı at', variant: 'danger'}]});
    if (choice === 'discard') onPublish('discard');
  };
  return <div className="draft-banner" role="status">
    <div><b>{hasDraft ? 'Yayınlanmamış menü değişiklikleri var' : 'Menü değişiklikleri henüz kaydedilmedi'}</b>{hasDraft ? 'Canlı site eski menüyü gösteriyor. Önizleyip yayınlayın.' : 'Kaydet ile taslak oluşur; “Menüyü yayınla” önce kaydeder, sonra canlıya alır.'}</div>
    <div className="admin-heading-actions">
      {hasDraft && <AdminButton size="compact" onClick={() => window.open('/tr/index.html?cmsPreview=view', '_blank', 'noopener')}>Önizle ↗</AdminButton>}
      {hasDraft && <AdminButton size="compact" variant="ghost" disabled={busy} onClick={discard}>Taslağı at</AdminButton>}
      <AdminButton size="compact" variant="primary" disabled={busy} onClick={() => onPublish('publish')}>Menüyü yayınla</AdminButton>
    </div>
  </div>;
}

export default function AdminSiteSettings({db, setSetting, upload, isDirty = false, busy = false, onPublishNavigation, confirm}) {
  const [section, setSection] = useState('header');
  const [footerLanguage, setFooterLanguage] = useState('tr');
  const [footerGroup, setFooterGroup] = useState('pages');
  const navigation = db.settings.navigation || [];
  const navigationGroups = db.settings.navigationGroups || {};
  const footerLinks = db.settings.footerLinks || [];
  const english = footerLanguage === 'en';
  const footerHeadings = {
    pages: english ? db.settings.footerPageTitleEn || 'Pages' : db.settings.footerPageTitle || 'Sayfalar',
    quick: english ? db.settings.footerQuickTitleEn || 'Quick Links' : db.settings.footerQuickTitle || 'Hızlı Bağlantılar'
  };


  return (
    <section className="panel settings-panel">
      <PageHeader eyebrow="ORTAK SİTE AYARLARI" title="Header ve footer" description="Menü ağacı taslak olarak kaydedilir ve yayınlandığında tüm sayfalarda görünür. Şirket ve iletişim bilgileri kayıtta uygulanır." />
      {section !== 'email' && onPublishNavigation && <NavigationDraftBanner hasDraft={Boolean(db.hasNavigationDraft)} isDirty={isDirty} busy={busy} onPublish={onPublishNavigation} confirm={confirm} />}
      <div className="subtabs settings-tabs" role="tablist" aria-label="Header ve footer ayarları">
        {settingTabs.map(item => (
          <button type="button" key={item.id} role="tab" id={'settings-tab-' + item.id} aria-selected={section === item.id} aria-controls="settings-panel" tabIndex={section === item.id ? 0 : -1} onKeyDown={event => handleTabKeyDown(event, settingTabs, section, setSection, 'settings-tab-')} onClick={() => setSection(item.id)}>{item.label}</button>
        ))}
      </div>

      <div role="tabpanel" id="settings-panel" aria-labelledby={'settings-tab-' + section} className="settings-content">
        {section === 'header' && (
          <div className="settings-stack">
            <section className="settings-block brand-settings-card">
              <div className="settings-block-heading">
                <div><h4>Marka kimliği</h4><p>Şirket adını ve header’da görünecek logoları buradan yönetin.</p></div>
              </div>
              <label className="company-name-field">Şirket adı<input value={db.settings.companyName || ''} onChange={event => setSetting('companyName', event.target.value)} placeholder="Şirket adı" /></label>
              <div className="logo-manager-grid">
                <LogoManager title="Açık zemin logosu" value={db.settings.logo} fallback="/assets/images/logo/hpl-logo-yatay.svg" onChange={value => setSetting('logo', value)} onUpload={upload} />
                <LogoManager title="Koyu zemin logosu" value={db.settings.logoDark} fallback="/assets/images/logo/hpl-logo-yatay-dark.svg" onChange={value => setSetting('logoDark', value)} onUpload={upload} dark />
              </div>
            </section>

            <section className="settings-block navigation-block">
              <div className="settings-block-heading navigation-list-heading">
                <div><h4>Header menüsü</h4><p>Menünün tamamı tek ağaçta: alt menüler üst bağlantısının altında görünür. “＋ Alt menü” ile ekleyin, sürükleyerek veya oklarla taşıyın.</p></div>
              </div>
              <TreeEditor title="Header menüsü" allowButton items={normalizeNavigation(navigation,navigationGroups)} onChange={items=>setSetting('navigation',items)}/>
            </section>
          </div>
        )}

        {section === 'footer' && (
          <div className="settings-stack">
            <section className="settings-block footer-contact-card">
              <div className="settings-block-heading">
                <div><h4>{english ? 'Contact details' : 'İletişim bilgileri'}</h4><p>{english ? 'These details appear in the footer on every page.' : 'Bu bilgiler sitenin tüm sayfalarındaki footer alanında görünür.'}</p></div>
              </div>
              <div className="footer-contact-grid">
                <label>{english ? 'Email address' : 'E-posta'}<input type="email" value={db.settings.email || ''} onChange={event => setSetting('email', event.target.value)} /></label>
                <label>{english ? 'Phone' : 'Telefon'}<input value={db.settings.phone || ''} onChange={event => setSetting('phone', event.target.value)} /></label>
                <label className="footer-address-field">{english ? 'Address' : 'Adres'}<input value={db.settings.address || ''} onChange={event => setSetting('address', event.target.value)} /></label>
              </div>
            </section>

            <section className="settings-block footer-copy-card">
              <div className="settings-block-heading footer-copy-heading">
                <div><h4>{english ? 'Footer text' : 'Footer metinleri'}</h4><p>{english ? 'Switch languages to edit the matching website text.' : 'Sitede görünecek metinleri dil sekmesinden düzenleyin.'}</p></div>
                <div className="subtabs language-tabs" role="tablist" aria-label="Footer dili">
                  <button type="button" role="tab" id="footer-tab-tr" aria-selected={!english} aria-controls="footer-panel" tabIndex={english ? -1 : 0} onKeyDown={event => handleTabKeyDown(event, [{id: 'tr'}, {id: 'en'}], footerLanguage, setFooterLanguage, 'footer-tab-')} onClick={() => setFooterLanguage('tr')}>Türkçe</button>
                  <button type="button" role="tab" id="footer-tab-en" aria-selected={english} aria-controls="footer-panel" tabIndex={english ? 0 : -1} onKeyDown={event => handleTabKeyDown(event, [{id: 'tr'}, {id: 'en'}], footerLanguage, setFooterLanguage, 'footer-tab-')} onClick={() => setFooterLanguage('en')}>English</button>
                </div>
              </div>
              <div id="footer-panel" role="tabpanel" aria-labelledby={english ? 'footer-tab-en' : 'footer-tab-tr'}>
                <div className="footer-copy-grid">
                  <label className="footer-description-field">{english ? 'Short company introduction' : 'Kısa şirket tanıtımı'}<textarea rows="3" value={english ? db.settings.footerDescriptionEn || '' : db.settings.footerDescription || ''} onChange={event => setSetting(english ? 'footerDescriptionEn' : 'footerDescription', event.target.value)} /></label>
                  <label>{english ? 'Page links heading' : 'Sayfa bağlantıları başlığı'}<input value={english ? db.settings.footerPageTitleEn || '' : db.settings.footerPageTitle || ''} onChange={event => setSetting(english ? 'footerPageTitleEn' : 'footerPageTitle', event.target.value)} /></label>
                  <label>{english ? 'Quick links heading' : 'Hızlı bağlantılar başlığı'}<input value={english ? db.settings.footerQuickTitleEn || '' : db.settings.footerQuickTitle || ''} onChange={event => setSetting(english ? 'footerQuickTitleEn' : 'footerQuickTitle', event.target.value)} /></label>
                  <label>{english ? 'Business hours' : 'Çalışma saatleri'}<input value={english ? db.settings.footerHoursEn || '' : db.settings.footerHours || ''} onChange={event => setSetting(english ? 'footerHoursEn' : 'footerHours', event.target.value)} /></label>
                  <label>{english ? 'Copyright text' : 'Telif hakkı metni'}<input value={english ? db.settings.footerCopyrightEn || '' : db.settings.footerCopyright || ''} onChange={event => setSetting(english ? 'footerCopyrightEn' : 'footerCopyright', event.target.value)} /></label>
                </div>

                <div className="footer-link-groups">
                  <div className="settings-block-heading footer-links-heading">
                    <div><h4>{english ? 'Footer links' : 'Footer bağlantıları'}</h4><p>{english ? 'Choose the footer heading where each link should appear.' : 'Her bağlantının hangi footer başlığı altında görüneceğini satırından seçin.'}</p></div>
                  </div>
                  <div className="footer-group-tabs" role="tablist" aria-label={english ? 'Footer link heading' : 'Footer bağlantı başlığı'}>
                    {['pages', 'quick'].map(group => {
                      const count = footerLinks.filter(item => item.group === group).length;
                      return <button type="button" key={group} role="tab" id={'footer-group-tab-' + group} aria-selected={footerGroup === group} aria-controls="footer-group-panel" tabIndex={footerGroup === group ? 0 : -1} onKeyDown={event => handleTabKeyDown(event, [{id: 'pages'}, {id: 'quick'}], footerGroup, setFooterGroup, 'footer-group-tab-')} onClick={() => setFooterGroup(group)}>{footerHeadings[group]}<span>{count}</span></button>;
                    })}
                  </div>
                  <TreeEditor key={footerGroup} title={footerHeadings[footerGroup]} items={normalizeNavigation(footerLinks.filter(item=>item.group===footerGroup))} defaults={{group:footerGroup}} onChange={items=>setSetting('footerLinks',[...footerLinks.filter(item=>item.group!==footerGroup),...items])}/>

                </div>
              </div>
            </section>
            <p className="hint">{english ? 'Footer changes are used across the entire website.' : 'Footer değişiklikleri sitenin tamamında kullanılır. Bağlantılar Kaydet ile taslak olur, “Menüyü yayınla” ile canlıya alınır.'}</p>
          </div>
        )}

        {section === 'email' && (
          <section className="settings-block email-settings-card">
            <div className="settings-block-heading"><div><h4>Form e-postaları</h4><p>Teklif ve iletişim taleplerinin e-posta ile gönderilmesi için kullanılır.</p></div></div>
            <div className="formgrid">
              <label>SMTP sunucusu<input value={db.settings.smtpHost || ''} onChange={event => setSetting('smtpHost', event.target.value)} placeholder="smtp.ornek.com" /></label>
              <label>SMTP portu<input type="number" value={db.settings.smtpPort || ''} onChange={event => setSetting('smtpPort', event.target.value)} placeholder="587" /></label>
              <label>SMTP kullanıcı adı<input value={db.settings.smtpUser || ''} onChange={event => setSetting('smtpUser', event.target.value)} /></label>
              <p className="smtp-password-note">SMTP şifresi sunucuda <code>SMTP_PASSWORD</code> ortam değişkeniyle yönetilir. Şifre bu panelde gösterilmez.</p>
              <label className="wide">Gönderen e-posta adresi<input type="email" value={db.settings.smtpFrom || ''} onChange={event => setSetting('smtpFrom', event.target.value)} /></label>
            </div>
            <p className="hint">Ayarlar tamamlanmamışsa talepler yönetim paneline kaydedilir.</p>
          </section>
        )}
      </div>
    </section>
  );
}
