export function normalizeCategoryName(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase();
}

// Records reference a category by its Turkish name (EN-only records by the English name).
export function recordBelongsToCategory(record, category) {
  const key = normalizeCategoryName;
  if (record?.category) return key(record.category) === key(category.name);
  return Boolean(category.nameEn) && key(record?.categoryEn) === key(category.nameEn);
}

// Fields to rewrite on one record when its category is renamed. English copies that were
// customised per record (not equal to the old English name) are left alone.
export function categoryRenamePatch(record, before, after) {
  if (!recordBelongsToCategory(record, before)) return {};
  const key = normalizeCategoryName, patch = {};
  if (record.category && record.category !== after.name) patch.category = after.name;
  const englishFollows = !record.categoryEn || (before.nameEn && key(record.categoryEn) === key(before.nameEn));
  if (englishFollows && (after.nameEn || '') !== (record.categoryEn || '')) patch.categoryEn = after.nameEn || '';
  return patch;
}
