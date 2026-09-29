// Measurement ID formats and the event taxonomy. Pure: shared by the server
// (validation, config) and the admin UI (hints, reference table).
export const ANALYTICS_IDS = {
  ga4: {env: 'GA4_MEASUREMENT_ID', pattern: /^G-[A-Z0-9]{4,20}$/, example: 'G-XXXXXXXXXX', label: 'GA4 ölçüm kimliği'},
  gtm: {env: 'GTM_CONTAINER_ID', pattern: /^GTM-[A-Z0-9]{4,12}$/, example: 'GTM-XXXXXXX', label: 'GTM kapsayıcı kimliği'},
  googleAds: {env: 'GOOGLE_ADS_ID', pattern: /^AW-\d{6,15}$/, example: 'AW-123456789', label: 'Google Ads kimliği'},
  googleAdsLeadLabel: {env: 'GOOGLE_ADS_LEAD_LABEL', pattern: /^[A-Za-z0-9_-]{4,64}$/, example: 'AbCdEfGhIjk', label: 'Google Ads talep dönüşüm etiketi'},
  metaPixel: {env: 'META_PIXEL_ID', pattern: /^\d{8,20}$/, example: '123456789012345', label: 'Meta Pixel kimliği'},
  linkedinPartner: {env: 'LINKEDIN_PARTNER_ID', pattern: /^\d{3,12}$/, example: '1234567', label: 'LinkedIn partner kimliği'},
  linkedinLeadConversion: {env: 'LINKEDIN_LEAD_CONVERSION_ID', pattern: /^\d{3,15}$/, example: '12345678', label: 'LinkedIn talep dönüşüm kimliği'}
};
export const ANALYTICS_MODES = ['none', 'gtag', 'gtm'];

export function validAnalyticsId(key, value) {
  const raw = String(value ?? '').trim();
  return !raw || Boolean(ANALYTICS_IDS[key]?.pattern.test(raw));
}

// What the public runtime (assets/js/hp-analytics.js) sends. conversion: mark as key event in GA4.
export const EVENT_TAXONOMY = [
  {name: 'page_view', trigger: 'Her sayfa açılışı (GA4 yapılandırması / GTM Google etiketi)', params: 'content_group=page_type', conversion: false, source: 'GA4'},
  {name: 'product_view', trigger: 'Ürün detay sayfası', params: 'product_id, product_name, product_type, product_category', conversion: false},
  {name: 'article_view', trigger: 'Blog yazısı', params: 'article_id, article_category, published_date', conversion: false},
  {name: 'form_start', trigger: 'Teklif / numune / iletişim formuna ilk odaklanma', params: 'form_type', conversion: false},
  {name: 'form_submit', trigger: 'Form tarayıcı doğrulamasını geçip gönderildi', params: 'form_type', conversion: false},
  {name: 'form_success', trigger: 'Sunucu /api/lead talebi kaydettiğini onayladı', params: 'form_type', conversion: true},
  {name: 'form_error', trigger: 'Doğrulama, sunucu veya ağ hatası', params: 'form_type, error_type', conversion: false},
  {name: 'catalog_download', trigger: 'Kataloglar sayfasında PDF aç/indir', params: 'catalog_name, file_name', conversion: true},
  {name: 'product_document_download', trigger: 'Ürün detayında teknik PDF', params: 'product_id, file_name', conversion: false},
  {name: 'phone_click', trigger: 'tel: bağlantısı', params: 'link_location', conversion: true},
  {name: 'email_click', trigger: 'mailto: bağlantısı', params: 'link_location', conversion: true},
  {name: 'whatsapp_click', trigger: 'WhatsApp bağlantısı', params: 'link_location', conversion: true},
  {name: 'cta_click', trigger: 'İçerikteki birincil düğmeler ve teklif/iletişim bağlantıları', params: 'cta_text, cta_url, cta_location', conversion: false},
  {name: 'navigation_click', trigger: 'Header, mobil menü ve footer bağlantıları', params: 'nav_location, link_text, link_url', conversion: false},
  {name: 'article_related_click', trigger: 'Blog yazısından başka yazıya bağlantı', params: 'article_id, link_url', conversion: false},
  {name: 'site_search', trigger: 'Ürün kataloğu, katalog arşivi ve blog araması (1,2 sn bekleme, e-posta/numara ayıklanır)', params: 'search_term, search_location, results_count', conversion: false}
];
