import {allHtmlPages,scanPages} from '../lib/content.js';
import {renderSitemap,sitemapEntries} from '../lib/seo.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// Built from the live content model: only published, indexable, canonical URLs,
// with the same hreflang pairs the pages themselves declare.
export async function GET(){
  const data=scanPages({includeDrafts:false});
  const xml=renderSitemap(sitemapEntries({...data,pages:data.publishedPages||{}},allHtmlPages()));
  return new Response(xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
}
