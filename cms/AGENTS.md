<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HydroPascal Admin — shared rules for every agent

These apply to all humans and agents working in `cms/`. Several sessions (Claude, Codex) may work here at the same time: back up what you touch, re-read a file right before editing it, make targeted edits, and never test against the real `data/content.json` (use `CMS_DATA_DIR` copies and `CMS_BUILD_DIR=.next-xxx`).

1. **Keep the theme.** The admin look lives in `app/style.css` (palette, radii 6/8/9/12px, IBM Plex + Big Shoulders, breakpoints 1100/800/620). New shared styles go in `app/admin/admin-system.css`; no arbitrary colors, spacing, radii or breakpoints; no pixel hacks (`top:-2px`, `translateY`) — align with flex/grid.
2. **Don't rewrite working features** (page editor, structure editor, rich editor, media picker, tree editor). Extend them.
3. **One of each shared component** — all in `app/admin/`:
   - `admin-controls.jsx`: `AdminButton` (the only button), `PageHeader`, `ContentCard`, `RowActions` (primary action + ••• menu), `AdminStatusBadge`, `AdminOrderButtons`, `useConfirm` (dialogs incl. Save / Discard / Cancel), `useAfterRender`.
   - `data-table.jsx`: the only table. Entities pass config only (`columns`, `filters`, `bulkActions`, `emptyState`, `stateKey`, `defaultSort`, `secondary` columns). Never build a second table, toolbar, pagination or page-size control.
   - `relation-select.jsx`: `RelationSelect` / `RelationInlineSelect` / `QuickCategoryDialog` / `BulkCategoryDialog` for every category relation (search, select, ＋ Yeni, ✎ edit — without leaving the parent form).
   - `admin-media.jsx` `MediaPicker`: the only media chooser; `tree-editor.jsx`: the only menu tree.
4. **No mock completion.** A feature is done only when UI → API → validation → auth → persistence → draft → publish → public render → test all pass. A toast is not proof; check the stored JSON and the public HTML.
5. **No client-only persistence.** `localStorage`/React state are never the source of truth; everything goes through `/api/*` and `app/lib/content.js` (`updateContent` = lock + If-Match revision + atomic write + gzip backup).
6. **Never trust the frontend for auth.** Every mutating route checks `isAdminRequest`; state-changing writes take an `If-Match` revision and must return 409 on conflict, never overwrite silently.
7. **Data-driven, not hard-coded.** Categories, menus, cards, products and posts come from the content store; no `if (category === '…')`, no literal option lists for user content.
8. **Draft → publish is real.** Products, posts, catalogues (`contentDrafts`), pages (`pageDrafts`) and header/footer menus (`navigationDraft`) are staged on save and only reach the public site through `/api/content-publish` or `/api/page-publish`. Public rendering reads `scanPages({includeDrafts:false})` / `getLegacyPage(route)` without the draft flag; admin preview is `?cmsPreview=view` (read-only) or `=1` (editor iframe).
9. **Keep the user in context.** Related data is created/edited where it is used (`[Select] [＋ Yeni]`), unsaved parent state is preserved, and the global manager (e.g. Kategoriler) stays available for bulk work.
10. **Changing a shared component means re-testing every screen that uses it**: `cd ../tests && npm run test:cms` and the browser suites `admin-system.browser.cjs` / `contextual-cms.browser.cjs` / `site-duzenle.browser.cjs` against an isolated server.
11. **Audit what matters.** Publish, delete, visibility, menu publish/discard, category create/update and lead status changes call `audit()` (`app/lib/audit.js`); keep new mutating actions audited.
12. **TR/EN parity.** Anything user-facing on the public site exists in both languages (`*En` fields); see the repo-level `CLAUDE.md`.
