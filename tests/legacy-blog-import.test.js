const assert = require('node:assert/strict');
const path = require('node:path');
const {test} = require('node:test');

test('legacy TR/EN blog articles parse as 120 complete, distinct CMS records', async () => {
  const {readLegacyBlogPosts, mergeLegacyBlogPosts} = await import('../cms/app/lib/legacy-blog-import.js');
  const posts = readLegacyBlogPosts(path.resolve(__dirname, '..'));
  assert.equal(posts.length, 120);
  assert.equal(posts.filter(post => post.lang === 'tr').length, 60);
  assert.equal(posts.filter(post => post.lang === 'en').length, 60);
  assert.equal(new Set(posts.map(post => post.id)).size, posts.length);
  assert.equal(new Set(posts.map(post => post.legacyPath)).size, posts.length);
  for (const post of posts) {
    assert.match(post.legacyPath, /^(tr|en)\/blog\/[a-z0-9-]+\.html$/);
    assert.ok(post.title && post.category && post.date && post.image && post.excerpt && post.content);
    assert.ok(post.seoTitle && post.seoDescription && post.ogImage && post.canonical);
    assert.equal(post.published, true);
    assert.equal(post.legacy, true);
    assert.ok(post.content.includes('<p>'));
  }
  assert.equal(mergeLegacyBlogPosts(posts, posts).length, 120);
  assert.throws(() => mergeLegacyBlogPosts([{id:'other',lang:'tr',slug:posts[0].slug}], [posts[0]]), /collision/);
});
