import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sanitizeHtml from 'sanitize-html';

const blogRoute = /^(tr|en)\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$/;
const excludedSlugs = new Set(['index', 'blog-post-template']);
const categoryTranslations = new Map([
  ['Brand Compatibility','Marka Uyumluluğu'],['Casting & Forging','Döküm & Dövme'],['Company','Kurumsal'],
  ['Contract Manufacturing','Fason Üretim'],['Cylinder Sizing','Silindir Hesaplama'],['Maintenance','Bakım'],
  ['Product Guide','Ürün Rehberi'],['FAQ','SSS']
]);

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] || '';
}

function markedElement(html, section, field, tagName) {
  const opening = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  let match;
  while ((match = opening.exec(html))) {
    if (attribute(match[0], 'data-section') !== section || attribute(match[0], 'data-field') !== field) continue;
    const tag = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
    tag.lastIndex = opening.lastIndex;
    let depth = 1;
    let closing;
    while ((closing = tag.exec(html))) {
      depth += closing[0].startsWith('</') ? -1 : 1;
      if (depth === 0) return {outer: html.slice(match.index, tag.lastIndex), inner: html.slice(opening.lastIndex, closing.index)};
    }
    throw new Error(`Unclosed ${tagName} element: ${section}.${field}`);
  }
  return null;
}

function plainText(value) {
  return sanitizeHtml(String(value || ''), {allowedTags: [], allowedAttributes: {}, disallowedTagsMode: 'discard'})
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    .replace(/\s+/g, ' ').trim();
}

function metaContent(html, attributeName, value) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  return plainText(attribute(tags.find(tag => attribute(tag, attributeName) === value) || '', 'content'));
}

function localAssetUrl(route, value) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith('/')) return source;
  if (/^(?:javascript|data|vbscript):/i.test(source)) return '';
  return path.posix.normalize(path.posix.join('/', path.posix.dirname(route), source));
}

export function isLegacyBlogRoute(route) {
  const match = String(route || '').match(blogRoute);
  return !!match && !excludedSlugs.has(match[2]);
}

/** Extracts the current article fields. The HTML file remains the immutable source backup. */
export function parseLegacyBlogPost(html, route) {
  if (!isLegacyBlogRoute(route)) throw new Error(`Unsupported legacy blog path: ${route}`);
  const [, lang, slug] = route.match(blogRoute);
  const titleNode = markedElement(html, 'post-header', 'title', 'h1');
  const categoryNode = markedElement(html, 'post-header', 'category', 'span');
  const dateNode = markedElement(html, 'post-header', 'date', 'p');
  const imageNode = markedElement(html, 'post-header', 'image', 'div');
  const bodyNode = markedElement(html, 'post-body', 'content', 'div');
  if (!titleNode || !categoryNode || !dateNode || !imageNode || !bodyNode) {
    throw new Error(`Required blog fields missing in ${route}`);
  }

  const title = plainText(titleNode.inner);
  const category = plainText(categoryNode.inner);
  const date = attribute(dateNode.inner.match(/<time\b[^>]*>/i)?.[0] || '', 'datetime');
  const image = localAssetUrl(route, attribute(imageNode.inner.match(/<img\b[^>]*>/i)?.[0] || '', 'src'));
  const excerpt = metaContent(html, 'name', 'description');
  const seoTitle = (plainText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || title).replace(/\s*\|\s*HydroPascal(?: Blog)?$/i,'').trim())||title;
  const ogImage = metaContent(html, 'property', 'og:image');
  const canonical = attribute(html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || '', 'href');
  const content = sanitizeHtml(bodyNode.inner.trim(), {
    allowedTags: ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'b', 'i', 'u', 'a', 'img', 'br', 'hr', 'div', 'pre', 'code'],
    allowedAttributes: {'*':['class'],a: ['href', 'target', 'rel', 'class'], img: ['src', 'alt', 'loading', 'width', 'height', 'class'],div:['class'],p:['class'],h2:['class'],h3:['class'],h4:['class'],ul:['class'],ol:['class'],li:['class'],blockquote:['class'],pre:['class'],code:['class']},
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false
  }).trim();

  if (!title || !date || !image || !content || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Blog content incomplete in ${route}`);
  }
  if (title.length > 200 || category.length > 100 || excerpt.length > 1000 || content.length > 100000) {
    throw new Error(`Blog field exceeds CMS limits in ${route}`);
  }

  return {
    id: `legacy-blog-${lang}-${createHash('sha256').update(route).digest('hex').slice(0,16)}`,
    legacy: true,
    legacyPath: route,
    sourceHash: createHash('sha256').update(html).digest('hex'),
    legacySourceContentHash:createHash('sha256').update(content).digest('hex'),
    lang,
    slug,
    title,
    category:lang==='en'?(categoryTranslations.get(category)||category):category,
    ...(lang === 'en' ? {categoryEn: category} : {}),
    excerpt,
    content,
    image,
    date,
    seoTitle,
    seoDescription: excerpt,
    ogImage,
    canonical,
    published: true
  };
}

/** Read all TR/EN articles without changing the CMS data file or source HTML. */
export function readLegacyBlogPosts(siteRoot = path.resolve(process.cwd(), '..')) {
  const posts = [];
  for (const lang of ['tr', 'en']) {
    const directory = path.join(siteRoot, lang, 'blog');
    for (const name of fs.readdirSync(directory).sort()) {
      const route = `${lang}/blog/${name}`;
      if (!isLegacyBlogRoute(route)) continue;
      posts.push(parseLegacyBlogPost(fs.readFileSync(path.join(directory, name), 'utf8'), route));
    }
  }
  return posts;
}

/** Existing CMS records win, and a conflicting route stops the import. */
export function mergeLegacyBlogPosts(existing, imported) {
  const posts = Array.isArray(existing) ? [...existing] : [];
  const byRoute = new Map(posts.map((post,index) => [`${post.lang || 'tr'}/blog/${post.slug}.html`, index]));
  for (const source of imported) {
    const priorIndex = byRoute.get(source.legacyPath);
    if (priorIndex!==undefined) {
      const prior=posts[priorIndex];
      if (prior.legacyPath !== source.legacyPath) throw new Error(`Blog route collision: ${source.legacyPath}`);
      if(prior.sourceHash===source.sourceHash){
        const decodedPrior=String(prior.category||'').replace(/&amp;/g,'&');
        const importedEnglish=String(source.categoryEn||'');
        const safeCategoryUpdate=prior.lang==='en'&&prior.category===prior.categoryEn&&source.category!==source.categoryEn;
        if(safeCategoryUpdate||decodedPrior===source.category){
          posts[priorIndex]={...prior,category:source.category,categoryEn:source.categoryEn||prior.categoryEn||''};
        }
        if(!posts[priorIndex].legacySourceContentHash){posts[priorIndex]={...posts[priorIndex],legacySourceContentHash:createHash('sha256').update(String(prior.content||'')).digest('hex')};}
        if(prior.seoTitle===`${source.seoTitle} | HydroPascal Blog`||prior.seoTitle===`${source.seoTitle} | HydroPascal`){posts[priorIndex]={...posts[priorIndex],seoTitle:source.seoTitle};}
      }
      continue;
    }
    posts.push(source);
    byRoute.set(source.legacyPath, posts.length-1);
  }
  return posts;
}
