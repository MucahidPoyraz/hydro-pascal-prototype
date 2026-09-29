/*
  HydroPascal — public measurement runtime
  =========================================
  Loaded only when the server rendered window.hpAnalyticsConfig (an integration
  is configured, or ANALYTICS_DEBUG is on). Never loaded in the admin or its previews.

  - One entry point: window.hpTrack(name, params). Components never call gtag,
    fbq or dataLayer directly; they emit DOM events (e.g. "hp:form") or are
    picked up by the single delegated click listener below.
  - Consent: with consentRequired, no vendor script is requested until the visitor
    accepts (separately for analytics and marketing). Interaction events before
    consent are dropped; the page's own view event waits for the decision.
  - Privacy: parameters are content metadata only. Link targets are sent as a
    path; e-mail addresses and phone-like numbers are scrubbed from any text.
  - Isolation: every handler is wrapped; a blocked or failing vendor script can
    never break the page.

  Event names (snake_case): form_start, form_submit, form_success, form_error,
  product_view, article_view, navigation_click, cta_click, phone_click,
  email_click, whatsapp_click, catalog_download, product_document_download,
  article_related_click, site_search. page_view, scrolls, outbound clicks and
  generic file downloads come from GA4 enhanced measurement (not duplicated here).
*/
(function () {
  'use strict';
  var cfg = window.hpAnalyticsConfig;
  if (!cfg || window.hpAnalytics) { return; }

  var CONSENT_KEY = 'hp-consent-v1';
  var dataLayer = window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  if (typeof window.gtag !== 'function') { window.gtag = gtag; }

  var state = {consent: null, loaded: {google: false, meta: false, linkedin: false}, pending: []};
  var api = window.hpAnalytics = {sent: [], config: cfg};

  function log() {
    if (cfg.debug && window.console && console.info) {
      try { console.info.apply(console, ['[hp-analytics]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
    }
  }

  /* ---------------- helpers ---------------- */
  var EMAIL = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g;
  var PHONE = /\+?\d[\d\s().-]{6,}\d/g;
  function clean(value, max) {
    return String(value == null ? '' : value).replace(EMAIL, '[email]').replace(PHONE, '[number]').replace(/\s+/g, ' ').trim().slice(0, max || 100);
  }
  function toUrl(href) {
    try { return href ? new URL(href, window.location.href) : null; } catch (e) { return null; }
  }
  function linkPath(url) {
    if (!url) { return ''; }
    return url.origin === window.location.origin ? url.pathname : url.origin + url.pathname;
  }
  function labelOf(el) {
    return clean(el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '', 80);
  }
  function locationOf(el) {
    if (el.closest('footer')) { return 'footer'; }
    var header = el.closest('header');
    if (header) { return el.closest('[x-show="open"], .lg\\:hidden') ? 'mobile_menu' : 'header'; }
    var section = el.closest('[data-section], section[id]');
    return clean(section ? (section.getAttribute('data-section') || section.id) : 'content', 60);
  }
  function merge(base, extra) {
    var out = {}, key;
    for (key in base) { if (Object.prototype.hasOwnProperty.call(base, key)) { out[key] = base[key]; } }
    for (key in extra) { if (Object.prototype.hasOwnProperty.call(extra, key) && extra[key] !== undefined && extra[key] !== '') { out[key] = extra[key]; } }
    return out;
  }
  function loadScript(src) {
    if (document.querySelector('script[src="' + src + '"]')) { return; }
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    s.onerror = function () { log('script blocked or failed:', src); };
    document.head.appendChild(s);
  }

  /* ---------------- consent ---------------- */
  function readConsent() {
    try {
      var value = JSON.parse(window.localStorage.getItem(CONSENT_KEY) || 'null');
      return value && typeof value === 'object' ? {analytics: value.analytics === true, marketing: value.marketing === true} : null;
    } catch (e) { return null; }
  }
  function writeConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify({analytics: value.analytics, marketing: value.marketing, v: 1, at: new Date().toISOString()})); } catch (e) {}
  }
  function granted(category) {
    if (!cfg.consentRequired) { return true; }
    return Boolean(state.consent && state.consent[category]);
  }
  function consentSignals() {
    var ad = granted('marketing') ? 'granted' : 'denied';
    return {analytics_storage: granted('analytics') ? 'granted' : 'denied', ad_storage: ad, ad_user_data: ad, ad_personalization: ad};
  }

  /* ---------------- vendors ---------------- */
  function loadVendors() {
    if (!cfg.active) { return; }
    var google = cfg.google;
    if (google && !state.loaded.google && (granted('analytics') || granted('marketing'))) {
      state.loaded.google = true;
      gtag('consent', 'default', {analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
      gtag('consent', 'update', consentSignals());
      if (google.type === 'gtm') {
        dataLayer.push({page_type: cfg.pageType, page_language: cfg.lang});
        dataLayer.push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
        loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(google.id));
      } else {
        gtag('js', new Date());
        if (google.ga4 && granted('analytics')) {
          var config = {content_group: cfg.pageType, page_language: cfg.lang};
          if (cfg.debug) { config.debug_mode = true; }
          gtag('config', google.ga4, config);
        }
        if (google.ads && granted('marketing')) { gtag('config', google.ads); }
        loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(google.ga4 || google.ads));
      }
    }
    if (cfg.meta && !state.loaded.meta && granted('marketing')) {
      state.loaded.meta = true;
      if (!window.fbq) {
        var n = window.fbq = function () { if (n.callMethod) { n.callMethod.apply(n, arguments); } else { n.queue.push(arguments); } };
        if (!window._fbq) { window._fbq = n; }
        n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      }
      window.fbq('init', cfg.meta);
      window.fbq('track', 'PageView');
      loadScript('https://connect.facebook.net/en_US/fbevents.js');
    }
    if (cfg.linkedin && !state.loaded.linkedin && granted('marketing')) {
      state.loaded.linkedin = true;
      window._linkedin_partner_id = cfg.linkedin.partner;
      window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
      window._linkedin_data_partner_ids.push(cfg.linkedin.partner);
      if (!window.lintrk) {
        window.lintrk = function (a, b) { window.lintrk.q.push([a, b]); };
        window.lintrk.q = [];
      }
      loadScript('https://snap.licdn.com/li.lms-analytics/insight.min.js');
    }
  }

  /* ---------------- tracking ---------------- */
  function dispatch(name, payload) {
    var google = cfg.google;
    if (google && state.loaded.google) {
      if (google.type === 'gtm') {
        dataLayer.push(merge({event: name}, payload));
      } else {
        if (google.ga4 && granted('analytics')) { gtag('event', name, merge(payload, {send_to: google.ga4})); }
        if (name === 'form_success' && google.ads && google.adsLeadLabel && granted('marketing')) {
          gtag('event', 'conversion', {send_to: google.ads + '/' + google.adsLeadLabel});
        }
      }
    }
    if (state.loaded.meta && window.fbq) {
      if (name === 'form_success') { window.fbq('track', 'Lead', {content_name: payload.form_type}); }
      if (name === 'product_view') { window.fbq('track', 'ViewContent', {content_ids: [payload.product_id], content_type: 'product'}); }
    }
    if (state.loaded.linkedin && window.lintrk && name === 'form_success' && cfg.linkedin.leadConversion) {
      window.lintrk('track', {conversion_id: Number(cfg.linkedin.leadConversion)});
    }
  }

  function track(name, params, options) {
    try {
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(name)) { return; }
      var payload = merge({page_type: cfg.pageType, language: cfg.lang}, params || {});
      api.sent.push({name: name, params: payload, at: Date.now()});
      log(name, payload);
      if (!cfg.active) { return; }
      if (cfg.consentRequired && !state.consent) {
        if (options && options.queue) { state.pending.push([name, payload]); }
        return;
      }
      dispatch(name, payload);
    } catch (e) { log('track failed', e); }
  }
  window.hpTrack = track;
  api.track = track;

  function flushPending() {
    var queue = state.pending;
    state.pending = [];
    for (var i = 0; i < queue.length; i++) { dispatch(queue[i][0], queue[i][1]); }
  }

  /* ---------------- consent banner ---------------- */
  var banner = document.getElementById('hp-consent');
  function syncBoxes() {
    if (!banner) { return; }
    var boxes = banner.querySelectorAll('[data-hp-consent-category]');
    for (var i = 0; i < boxes.length; i++) {
      var category = boxes[i].getAttribute('data-hp-consent-category');
      boxes[i].checked = Boolean(state.consent && state.consent[category]);
    }
  }
  function showBanner(withOptions) {
    if (!banner) { return; }
    syncBoxes();
    var options = banner.querySelector('[data-hp-consent-options]');
    var save = banner.querySelector('[data-hp-consent="save"]');
    var customize = banner.querySelector('[data-hp-consent="customize"]');
    if (options) { options.hidden = !withOptions; }
    if (save) { save.hidden = !withOptions; }
    if (customize) { customize.hidden = Boolean(withOptions); }
    banner.hidden = false;
  }
  function decide(value) {
    var previous = state.consent;
    state.consent = {analytics: Boolean(value.analytics && cfg.categories.analytics), marketing: Boolean(value.marketing && cfg.categories.marketing)};
    writeConsent(state.consent);
    if (banner) { banner.hidden = true; }
    log('consent', state.consent);
    // A withdrawn consent cannot unload scripts already running: reload without them.
    if (previous && ((previous.analytics && !state.consent.analytics) || (previous.marketing && !state.consent.marketing)) && (state.loaded.google || state.loaded.meta || state.loaded.linkedin)) {
      window.location.reload();
      return;
    }
    if (state.loaded.google) { gtag('consent', 'update', consentSignals()); }
    loadVendors();
    flushPending();
  }
  if (banner) {
    banner.addEventListener('click', function (event) {
      try {
        var button = event.target.closest('[data-hp-consent]');
        if (!button) { return; }
        var action = button.getAttribute('data-hp-consent');
        if (action === 'accept') { decide({analytics: true, marketing: true}); }
        else if (action === 'reject') { decide({analytics: false, marketing: false}); }
        else if (action === 'customize') { showBanner(true); }
        else if (action === 'save') {
          var chosen = {analytics: false, marketing: false};
          var boxes = banner.querySelectorAll('[data-hp-consent-category]');
          for (var i = 0; i < boxes.length; i++) { chosen[boxes[i].getAttribute('data-hp-consent-category')] = boxes[i].checked; }
          decide(chosen);
        }
      } catch (e) { log('consent failed', e); }
    });
  }

  /* ---------------- delegated interaction tracking (one listener) ---------------- */
  var CONVERSION_PAGES = /\/(teklif-al|contact)\.html$/;
  function isCta(el, url) {
    if (!el.closest('main')) { return false; }
    if (el.getAttribute('data-track') === 'cta') { return true; }
    var field = el.getAttribute('data-field') || '';
    var section = el.getAttribute('data-section') || '';
    if (/^cta/.test(field) || /_btn-\d+$/.test(section)) { return true; }
    var cls = el.getAttribute('class') || '';
    if (/bg-\[#fb923c\]|catalog-primary/.test(cls)) { return true; }
    return Boolean(url && url.origin === window.location.origin && CONVERSION_PAGES.test(url.pathname));
  }
  function catalogName(el) {
    var card = el.closest('article, .catalog-card');
    var heading = card && card.querySelector('h3, h2');
    return clean(heading ? heading.textContent : '', 100);
  }
  document.addEventListener('click', function (event) {
    try {
      var el = event.target && event.target.closest ? event.target.closest('a, button') : null;
      if (!el || el.closest('#hp-consent')) { return; }
      if (el.hasAttribute('data-hp-consent-open')) { showBanner(true); return; }
      var href = el.tagName === 'A' ? (el.getAttribute('href') || '') : '';
      var where = locationOf(el);
      if (/^tel:/i.test(href)) { track('phone_click', {link_location: where}); return; }
      if (/^mailto:/i.test(href)) { track('email_click', {link_location: where}); return; }
      if (/(?:^|\/\/)(?:wa\.me|api\.whatsapp\.com)\b|^whatsapp:/i.test(href)) { track('whatsapp_click', {link_location: where}); return; }
      var url = toUrl(href);
      if (url && /\.pdf$/i.test(url.pathname)) {
        var file = decodeURIComponent(url.pathname.split('/').pop() || '').slice(0, 100);
        if (cfg.pageType === 'catalogs') { track('catalog_download', {catalog_name: catalogName(el), file_name: file, link_location: where}); return; }
        if (cfg.pageType === 'product' && cfg.pageEvent && cfg.pageEvent.params) { track('product_document_download', {product_id: cfg.pageEvent.params.product_id, file_name: file}); return; }
        return; // other PDFs: GA4 enhanced measurement file_download
      }
      if (where === 'header' || where === 'mobile_menu' || where === 'footer') {
        if (el.tagName === 'A' && url && !/^#/.test(href)) { track('navigation_click', {nav_location: where, link_text: labelOf(el), link_url: linkPath(url)}); }
        return;
      }
      if (cfg.pageType === 'article' && url && url.origin === window.location.origin && /\/blog\/(?!index\.html$)[^/]+\.html$/.test(url.pathname) && url.pathname !== window.location.pathname) {
        track('article_related_click', {article_id: cfg.pageEvent && cfg.pageEvent.params ? cfg.pageEvent.params.article_id : '', link_url: linkPath(url)});
        return;
      }
      if (isCta(el, url)) { track('cta_click', {cta_text: labelOf(el), cta_url: linkPath(url), cta_location: where}); }
    } catch (e) { log('click tracking failed', e); }
  }, true);

  /* ---------------- forms (events come from assets/js/form-submit.js) ---------------- */
  var FORM_EVENTS = {start: 'form_start', submit: 'form_submit', success: 'form_success', error: 'form_error'};
  document.addEventListener('hp:form', function (event) {
    try {
      var detail = event.detail || {};
      var name = FORM_EVENTS[detail.stage];
      if (name) { track(name, {form_type: clean(detail.formType, 24), error_type: clean(detail.errorType, 24)}); }
    } catch (e) { log('form tracking failed', e); }
  });

  /* ---------------- site search (catalog, catalogues, blog) ---------------- */
  var searchTimers = {};
  var lastTerms = {};
  document.addEventListener('input', function (event) {
    try {
      var input = event.target;
      if (!input || !input.matches || !input.matches('main input[type="search"], main [data-track-search]')) { return; }
      var key = input.name || input.getAttribute('placeholder') || 'search';
      clearTimeout(searchTimers[key]);
      searchTimers[key] = setTimeout(function () {
        var term = clean(input.value, 60).toLocaleLowerCase(cfg.lang === 'tr' ? 'tr' : 'en');
        if (term.length < 2 || term === lastTerms[key] || /\[(email|number)\]/.test(term)) { return; }
        lastTerms[key] = term;
        var scope = input.closest('.catalog-workspace, [x-data], section');
        var countEl = scope && scope.querySelector('[x-text="filtered.length"]');
        var count = countEl ? parseInt(countEl.textContent, 10) : NaN;
        track('site_search', {search_term: term, search_location: cfg.pageType, results_count: isNaN(count) ? undefined : count});
      }, 1200);
    } catch (e) { log('search tracking failed', e); }
  }, true);

  /* ---------------- start ---------------- */
  state.consent = cfg.consentRequired ? readConsent() : {analytics: true, marketing: true};
  if (cfg.active && state.consent) { loadVendors(); }
  if (cfg.pageEvent && cfg.pageEvent.name) { track(cfg.pageEvent.name, cfg.pageEvent.params, {queue: true}); }
  if (cfg.active && cfg.consentRequired && !state.consent) { showBanner(false); }
})();
