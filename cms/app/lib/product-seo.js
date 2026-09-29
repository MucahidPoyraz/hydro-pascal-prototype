// Product URL helpers. Metadata itself is produced by the central SEO pipeline:
// seo-model.js (mapping) + seo.js (head/JSON-LD). Kept as a stable import path.
import {applySeoHead} from './seo.js';
export {DETAIL_PAGE_TYPES, isPublicProduct, productDetailUrl, findProduct} from './seo-model.js';

/** Applies the product page head exactly as the public renderer does. */
export function applyProductSeo(html, product, language = 'tr', data = {}) {
  const route = `${language === 'en' ? 'en' : 'tr'}/urun-detay.html`;
  return applySeoHead(html, {route, data, product}).html;
}
