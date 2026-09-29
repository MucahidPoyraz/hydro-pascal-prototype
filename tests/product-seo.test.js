const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

test('published product metadata and sitemap use the canonical detail URL', async () => {
  const originalCwd = process.cwd();
  const originalDataDir = process.env.CMS_DATA_DIR;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydropascal-product-seo-'));
  const cms = path.resolve(__dirname, '../cms');
  process.chdir(cms);
  process.env.CMS_DATA_DIR = temp;
  try {
    const {applyProductSeo,productDetailUrl} = await import(pathToFileURL(path.join(cms, 'app/lib/product-seo.js')));
    const {GET} = await import(pathToFileURL(path.join(cms, 'app/sitemap.xml/route.js')));
    const product = {id:'one',slug:'sample-cylinder',type:'hydraulic',name:'Hydraulic Cylinder',nameEn:'Cylinder & Link',description:'<b>Technical details</b> & specifications',image:'/assets/images/HPL-1.webp',active:true};
    const template = fs.readFileSync(path.join(cms, '../tr/urun-detay.html'), 'utf8');
    const rendered = applyProductSeo(template, product, 'en');
    assert.match(rendered, /<title>Cylinder &amp; Link \| HydroPascal<\/title>/);
    assert.match(rendered, /<meta name="description" content="Technical details &amp; specifications">/);
    assert.match(rendered, /<meta name="robots" content="index, follow">/);
    assert.match(rendered, /<link rel="canonical" href="https:\/\/www\.hydropascal\.com\.tr\/en\/urun-detay\.html\?id=sample-cylinder">/);
    assert.match(rendered, /<meta property="og:image" content="https:\/\/www\.hydropascal\.com\.tr\/assets\/images\/HPL-1\.webp">/);
    assert.equal(productDetailUrl(product,'tr'), 'https://www.hydropascal.com.tr/tr/urun-detay.html?id=sample-cylinder');

    fs.writeFileSync(path.join(temp, 'content.json'), JSON.stringify({catalogInitialized:true,products:[product,{id:'two',slug:'hidden-cylinder',type:'oem',name:'Hidden',active:false},{id:'three',slug:'casting',type:'cast',name:'Casting',active:true}],posts:[{id:'draft',slug:'draft-article',lang:'tr',published:false}]}));
    const sitemap = await (await GET()).text();
    assert.match(sitemap, /\/tr\/urun-detay\.html\?id=sample-cylinder/);
    assert.match(sitemap, /\/en\/urun-detay\.html\?id=sample-cylinder/);
    assert.equal(/id=hidden-cylinder|id=casting|\/blog\/draft-article\.html/.test(sitemap), false, 'Unpublished products and posts must not appear in the sitemap.');
  } finally {
    process.chdir(originalCwd);
    if (originalDataDir === undefined) delete process.env.CMS_DATA_DIR;
    else process.env.CMS_DATA_DIR = originalDataDir;
    fs.rmSync(temp, {recursive:true,force:true});
  }
});
