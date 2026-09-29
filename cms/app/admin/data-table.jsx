'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {AdminButton} from './admin-controls.jsx';

const collator = new Intl.Collator('tr', {numeric: true, sensitivity: 'base'});
export const PAGE_SIZES = [10, 25, 50, 100];
const NO_SORT = {key: '', direction: 'asc'};

// Table state lives in the query string (prefixed per table) so refresh and shared links keep it.
function readUrlState(stateKey) {
  if (!stateKey || typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search), prefix = stateKey + '.';
  const filters = {};
  for (const [name, value] of params) if (name.startsWith(prefix + 'f.')) filters[name.slice(prefix.length + 2)] = value;
  const [sortKey, direction] = (params.get(prefix + 'sort') || '').split(':');
  return {
    query: params.get(prefix + 'q') || '',
    filters,
    sort: sortKey === 'none' ? NO_SORT : sortKey ? {key: sortKey, direction: direction === 'desc' ? 'desc' : 'asc'} : undefined,
    page: Math.max(1, Number.parseInt(params.get(prefix + 'page') || '1', 10) || 1),
    size: Number.parseInt(params.get(prefix + 'size') || '', 10) || undefined
  };
}

function writeUrlState(stateKey, {query, filterValues, sort, page, size}, defaults) {
  const url = new URL(window.location.href), prefix = stateKey + '.';
  for (const name of [...url.searchParams.keys()]) if (name.startsWith(prefix)) url.searchParams.delete(name);
  if (query.trim()) url.searchParams.set(prefix + 'q', query);
  for (const [key, value] of Object.entries(filterValues)) if (value && value !== 'all') url.searchParams.set(prefix + 'f.' + key, value);
  const defaultSort = defaults.sort || NO_SORT;
  if (sort.key !== defaultSort.key || (sort.key && sort.direction !== defaultSort.direction)) url.searchParams.set(prefix + 'sort', sort.key ? sort.key + ':' + sort.direction : 'none');
  if (page > 1) url.searchParams.set(prefix + 'page', String(page));
  if (size !== defaults.size) url.searchParams.set(prefix + 'size', String(size));
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
}

const defaultFilterValue = (row, key) => row[key] === undefined && ['active', 'published'].includes(key) ? 'true' : String(row[key] ?? '');

/**
 * Generic admin table. Entities only pass config:
 *  columns: [{key, label, render?, sortable?, sortValue?, secondary? (hidden on tablet), className?}]
 *  filters: [{key, label, allLabel?, options:[{value,label}], match?(row, value)}]
 *  bulkActions: [{id, label, variant?, run(selectedRows) → false keeps the selection}]
 */
export default function DataTable({
  rows = [],
  columns = [],
  searchKeys = [],
  searchLabel = 'Kayıtlarda ara',
  filters = [],
  pageSize = 10,
  pageSizes = PAGE_SIZES,
  defaultSort = null,
  stateKey = '',
  selectable = false,
  bulkActions = [],
  getRowId = row => row.id ?? row.key,
  getRowLabel = row => row.title || row.name || row.id || '',
  emptyState = null,
  emptyMessage = 'Gösterilecek kayıt bulunamadı.',
  loading = false,
  error = '',
  onRetry,
  toolbarExtra = null
}) {
  const initial = useMemo(() => readUrlState(stateKey), [stateKey]);
  const [query, setQuery] = useState(initial.query || '');
  const [filterValues, setFilterValues] = useState(initial.filters || {});
  const [sort, setSort] = useState(initial.sort || defaultSort || NO_SORT);
  const [page, setPage] = useState(initial.page || 1);
  const [rowsPerPage, setRowsPerPage] = useState(pageSizes.includes(initial.size) ? initial.size : pageSize);
  const [selected, setSelected] = useState(() => new Set());
  const [busyAction, setBusyAction] = useState('');
  const headerCheckbox = useRef(null);
  const idOf = row => String(getRowId(row));

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr');
    const filtered = rows.filter(row => {
      const matchesQuery = !needle || searchKeys.some(key => {
        const value = typeof key === 'function' ? key(row) : row[key];
        return String(value ?? '').toLocaleLowerCase('tr').includes(needle);
      });
      const matchesFilters = filters.every(filter => {
        const chosen = filterValues[filter.key] ?? 'all';
        if (chosen === 'all') return true;
        return filter.match ? filter.match(row, chosen) : defaultFilterValue(row, filter.key) === chosen;
      });
      return matchesQuery && matchesFilters;
    });
    const column = columns.find(item => item.key === sort.key);
    if (!column || column.sortable === false) return filtered;
    return filtered.sort((left, right) => {
      const leftValue = column.sortValue ? column.sortValue(left) : left[column.key];
      const rightValue = column.sortValue ? column.sortValue(right) : right[column.key];
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : collator.compare(String(leftValue ?? ''), String(rightValue ?? ''));
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [rows, columns, searchKeys, filters, filterValues, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const activePage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((activePage - 1) * rowsPerPage, activePage * rowsPerPage);
  const activeFilters = filters.filter(filter => (filterValues[filter.key] ?? 'all') !== 'all').length + (query.trim() ? 1 : 0);

  useEffect(() => {
    if (stateKey) writeUrlState(stateKey, {query, filterValues, sort, page: activePage, size: rowsPerPage}, {sort: defaultSort, size: pageSize});
  }, [stateKey, query, filterValues, sort, activePage, rowsPerPage, defaultSort, pageSize]);

  // Selection only keeps rows that still exist (e.g. after a delete).
  const rowIds = useMemo(() => new Set(rows.map(row => String(getRowId(row)))), [rows, getRowId]);
  useEffect(() => {
    setSelected(current => {
      const next = new Set([...current].filter(id => rowIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rowIds]);

  const pageIds = pageRows.map(idOf);
  const pageSelectedCount = pageIds.filter(id => selected.has(id)).length;
  const allPageSelected = pageIds.length > 0 && pageSelectedCount === pageIds.length;
  useEffect(() => {if (headerCheckbox.current) headerCheckbox.current.indeterminate = pageSelectedCount > 0 && !allPageSelected;}, [pageSelectedCount, allPageSelected]);
  // Bulk actions only ever touch rows visible under the current search/filters.
  const selectedRows = filteredRows.filter(row => selected.has(idOf(row)));

  const resetPage = () => setPage(1);
  const clearSelection = () => setSelected(current => current.size ? new Set() : current);
  const updateQuery = value => {setQuery(value); resetPage(); clearSelection();};
  const updateFilter = (key, value) => {setFilterValues(current => ({...current, [key]: value})); resetPage(); clearSelection();};
  const clearFilters = () => {setQuery(''); setFilterValues({}); resetPage(); clearSelection();};
  const toggleSort = key => {
    setSort(current => current.key !== key ? {key, direction: 'asc'} : current.direction === 'asc' ? {key, direction: 'desc'} : NO_SORT);
    resetPage();
  };
  const toggleRow = id => setSelected(current => {const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;});
  const togglePage = () => setSelected(current => {const next = new Set(current); for (const id of pageIds) {if (allPageSelected) next.delete(id); else next.add(id);} return next;});
  const selectAllFiltered = () => setSelected(new Set(filteredRows.map(idOf)));
  const runBulk = async action => {
    if (busyAction) return;
    setBusyAction(action.id);
    try {
      const result = await action.run(selectedRows);
      if (result !== false) setSelected(new Set());
    } finally {setBusyAction('');}
  };

  const firstItem = filteredRows.length ? (activePage - 1) * rowsPerPage + 1 : 0;
  const lastItem = Math.min(activePage * rowsPerPage, filteredRows.length);
  const columnCount = columns.length + (selectable ? 1 : 0);
  const cellClass = column => [column.secondary ? 'dt-secondary' : '', column.key === 'actions' ? 'dt-actions' : '', column.className || ''].filter(Boolean).join(' ') || undefined;

  let emptyRow = null;
  if (loading) emptyRow = <div className="dt-state" role="status">Kayıtlar yükleniyor…</div>;
  else if (error) emptyRow = <div className="dt-state is-error" role="alert"><b>{error}</b>{onRetry && <AdminButton size="compact" onClick={onRetry}>Yeniden dene</AdminButton>}</div>;
  else if (!rows.length) emptyRow = <div className="dt-state"><b>{emptyState?.title || emptyMessage}</b>{emptyState?.description && <span>{emptyState.description}</span>}{emptyState?.action && <AdminButton size="compact" variant="primary" onClick={emptyState.action.onClick}>{emptyState.action.label}</AdminButton>}</div>;
  else if (!filteredRows.length) emptyRow = <div className="dt-state"><b>Bu filtrelerle sonuç bulunamadı.</b><AdminButton size="compact" onClick={clearFilters}>Filtreleri temizle</AdminButton></div>;

  return (
    <div className="data-table">
      <div className="table-toolbar">
        <div className="table-filters">
          <label className="table-search">
            <span className="sr-only">{searchLabel}</span>
            <span aria-hidden="true">⌕</span>
            <input type="search" value={query} onChange={event => updateQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} />
            {query && <button type="button" aria-label="Aramayı temizle" onClick={() => updateQuery('')}>×</button>}
          </label>
          {filters.map(filter => (
            <label className="table-filter" key={filter.key}>
              <span className="sr-only">{filter.label}</span>
              <select aria-label={filter.label} value={filterValues[filter.key] ?? 'all'} onChange={event => updateFilter(filter.key, event.target.value)}>
                <option value="all">{filter.allLabel || `Tüm ${filter.label.toLocaleLowerCase('tr')}`}</option>
                {filter.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
          <label className="table-filter table-page-size"><span className="sr-only">Sayfa başına gösterilecek kayıt</span><select aria-label="Sayfa başına gösterilecek kayıt" value={rowsPerPage} onChange={event => {setRowsPerPage(Number(event.target.value)); resetPage();}}>{pageSizes.map(size => <option key={size} value={size}>{size} / sayfa</option>)}</select></label>
          {toolbarExtra}
        </div>
        <div className="dt-toolbar-meta">
          {activeFilters > 0 && <AdminButton variant="ghost" onClick={clearFilters}>Filtreleri temizle ({activeFilters})</AdminButton>}
          <span className="table-count" aria-live="polite">{filteredRows.length === rows.length ? `${rows.length} kayıt` : `${filteredRows.length} / ${rows.length} kayıt`}</span>
        </div>
      </div>

      {selectable && selectedRows.length > 0 && <div className="dt-bulkbar" role="region" aria-label="Toplu işlemler">
        <b aria-live="polite">{selectedRows.length} kayıt seçildi</b>
        {allPageSelected && selectedRows.length < filteredRows.length && <button type="button" className="dt-link" onClick={selectAllFiltered}>Listedeki {filteredRows.length} kaydın tümünü seç</button>}
        <div className="dt-bulk-actions">{bulkActions.filter(action => !action.hidden).map(action => <AdminButton key={action.id} size="compact" variant={action.variant || 'secondary'} disabled={Boolean(busyAction)} aria-busy={busyAction === action.id} onClick={() => runBulk(action)}>{busyAction === action.id ? 'İşleniyor…' : action.label}</AdminButton>)}</div>
        <AdminButton size="compact" variant="ghost" className="dt-bulk-clear" onClick={() => setSelected(new Set())}>Seçimi temizle</AdminButton>
      </div>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {selectable && <th scope="col" className="dt-select"><input ref={headerCheckbox} type="checkbox" aria-label="Bu sayfadaki tüm kayıtları seç" checked={allPageSelected} disabled={!pageRows.length} onChange={togglePage} /></th>}
              {columns.map(column => {
                const isSorted = sort.key === column.key;
                const direction = isSorted ? sort.direction : undefined;
                return (
                  <th key={column.key} scope="col" className={cellClass(column)} aria-sort={column.sortable === false ? undefined : direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
                    {column.sortable === false
                      ? column.label
                      : <button type="button" className="sort-button" onClick={() => toggleSort(column.key)} title={isSorted ? (sort.direction === 'asc' ? 'Azalan sırala' : 'Sıralamayı kaldır') : 'Artan sırala'}>{column.label}<span aria-hidden="true">{isSorted ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></button>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!emptyRow && pageRows.map((row, index) => {
              const id = idOf(row);
              const isSelected = selected.has(id);
              return (
                <tr key={id ?? index} className={isSelected ? 'is-selected' : undefined}>
                  {selectable && <td className="dt-select"><input type="checkbox" aria-label={`“${getRowLabel(row) || 'Kayıt'}” seç`} checked={isSelected} onChange={() => toggleRow(id)} /></td>}
                  {columns.map(column => (
                    <td key={column.key} data-label={column.label} className={cellClass(column)}>
                      {column.render ? column.render(row, {sorted: Boolean(sort.key), filtered: activeFilters > 0}) : String(row[column.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}
            {emptyRow && <tr className="dt-empty-row"><td className="table-empty" colSpan={columnCount}>{emptyRow}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <span>{firstItem}–{lastItem} / {filteredRows.length} kayıt</span>
        <div>
          <AdminButton size="compact" variant="ghost" onClick={() => setPage(1)} disabled={activePage <= 1} aria-label="İlk sayfa">«</AdminButton>
          <AdminButton size="compact" variant="ghost" onClick={() => setPage(activePage - 1)} disabled={activePage <= 1}>Önceki</AdminButton>
          <span>Sayfa {activePage} / {pageCount}</span>
          <AdminButton size="compact" variant="ghost" onClick={() => setPage(activePage + 1)} disabled={activePage >= pageCount}>Sonraki</AdminButton>
          <AdminButton size="compact" variant="ghost" onClick={() => setPage(pageCount)} disabled={activePage >= pageCount} aria-label="Son sayfa">»</AdminButton>
        </div>
      </div>
    </div>
  );
}
