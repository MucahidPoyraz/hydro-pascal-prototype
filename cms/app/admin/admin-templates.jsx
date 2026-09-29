'use client';

import {useState} from 'react';
import {handleTabKeyDown} from './tab-keyboard.js';

const templates = [
  ['quote', 'Teklif talebine yanıt', 'Quote request reply'],
  ['sample', 'Numune talebine yanıt', 'Sample request reply'],
  ['contact', 'İletişim talebine yanıt', 'Contact request reply']
];

export default function AdminTemplates({db, updateTemplate}) {
  const [language, setLanguage] = useState('tr');
  const english = language === 'en';
  const suffix = english ? 'En' : '';

  return (
    <section className="panel templates-panel">
      <div className="panelhead">
        <div><span className="eyebrow">E-POSTA YANITLARI</span><h3>Yanıt dilini seçin</h3></div>
      </div>
      <div className="subtabs language-tabs" role="tablist" aria-label="E-posta şablonu dili">
        <button type="button" role="tab" id="template-tab-tr" aria-selected={!english} aria-controls="template-panel" tabIndex={english ? -1 : 0} onKeyDown={event => handleTabKeyDown(event, [{id: 'tr'}, {id: 'en'}], language, setLanguage, 'template-tab-')} onClick={() => setLanguage('tr')}>Türkçe</button>
        <button type="button" role="tab" id="template-tab-en" aria-selected={english} aria-controls="template-panel" tabIndex={english ? 0 : -1} onKeyDown={event => handleTabKeyDown(event, [{id: 'tr'}, {id: 'en'}], language, setLanguage, 'template-tab-')} onClick={() => setLanguage('en')}>English</button>
      </div>
      <div id="template-panel" role="tabpanel" aria-labelledby={english ? 'template-tab-en' : 'template-tab-tr'}>
        <p className="hint">Taleplere hazır yanıt hazırlarken seçilen dildeki şablon kullanılır.</p>
        <div className="template-list">
          {templates.map(([type, turkishTitle, englishTitle], index) => {
            const template = db.templates[type];
            const subjectKey = 'subject' + suffix;
            const bodyKey = 'body' + suffix;
            return (
              <details className="template-item" key={type} open={index === 0}>
                <summary><b>{english ? englishTitle : turkishTitle}</b><span>{english ? 'Subject and message' : 'Konu ve mesaj'}</span></summary>
                <div className="template-fields">
                  <label>{english ? 'Email subject' : 'E-posta konusu'}<input value={template[subjectKey] || ''} onChange={event => updateTemplate(type, subjectKey, event.target.value)} /></label>
                  <label>{english ? 'Email message' : 'E-posta mesajı'}<textarea rows="7" value={template[bodyKey] || ''} onChange={event => updateTemplate(type, bodyKey, event.target.value)} /></label>
                  <p className="hint">{english ? 'Available details: {{name}}, {{company}}, {{subject}}.' : 'Kullanabileceğiniz bilgiler: {{name}}, {{company}}, {{subject}}.'}</p>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
