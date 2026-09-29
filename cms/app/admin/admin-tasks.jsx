'use client';

import {useState} from 'react';
import DataTable from './data-table.jsx';
import {AdminButton,ContentCard,PageHeader,RowActions} from './admin-controls.jsx';

const taskStatuses = ['Yeni', 'Devam ediyor', 'İncelemede', 'Tamamlandı'];

function taskPageName(path) {
  const home = path === 'tr/index.html' ? 'Ana sayfa' : path === 'en/index.html' ? 'Home page' : '';
  if (home) return home;
  const language = path.startsWith('en/') ? 'English' : 'Türkçe';
  const title = path.split('/').pop().replace('.html', '').replace(/^\d+-/, '').replaceAll('-', ' ');
  return title + ' · ' + language;
}

function TaskForm({task, pages, members = [], onSave, onCancel, onDelete}) {
  const [draft, setDraft] = useState(task || {title: '', page: pages[0] || 'tr/index.html', section: '', assignee: '', dueDate: '', status: 'Yeni', note: ''});
  const update = (key, value) => setDraft(current => ({...current, [key]: value}));

  return (
    <ContentCard className="editor-panel task-editor">
      <div className="panelhead editor-heading"><div><span className="eyebrow">İŞ ATAMASI</span><h3>{task ? task.title : 'Yeni görev'}</h3></div><AdminButton variant="ghost" onClick={onCancel}>Kapat ×</AdminButton></div>
      <div className="formgrid">
        <label>Görev adı<input autoFocus value={draft.title} onChange={event => update('title', event.target.value)} placeholder="Örnek: Ana sayfa metinlerini güncelle" /></label>
        <label>Sorumlu kişi<input value={draft.assignee} onChange={event => update('assignee', event.target.value)} list="task-assignees" placeholder="Kişinin adı" /><datalist id="task-assignees">{members.map(member => <option key={member} value={member} />)}</datalist></label>
        <label>İlgili sayfa<select value={draft.page} onChange={event => update('page', event.target.value)}>{pages.map(page => <option key={page} value={page}>{taskPageName(page)}</option>)}</select></label>
        <label>Bölüm adı<input value={draft.section} onChange={event => update('section', event.target.value)} placeholder="İsteğe bağlı" /></label>
        <label>Son tarih<input type="date" value={draft.dueDate || ''} onChange={event => update('dueDate', event.target.value)} /></label>
        <label>Durum<select value={draft.status || 'Yeni'} onChange={event => update('status', event.target.value)}>{taskStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
        <label className="wide">Kısa açıklama<textarea rows="3" value={draft.note || ''} onChange={event => update('note', event.target.value)} placeholder="Yapılacak işi kısaca yazın" /></label>
      </div>
      <p className="hint">Değişiklikler taslakta tutulur; kalıcı olması için üstteki Kaydet düğmesine basın.</p>
      <div className="editor-actions">
        {task && <AdminButton variant="danger" onClick={() => onDelete(task.id)}>Görevi sil</AdminButton>}
        <span />
        <AdminButton variant="primary" disabled={!draft.title.trim() || !draft.assignee.trim()} onClick={() => onSave({...draft, title: draft.title.trim(), assignee: draft.assignee.trim()})}>{task ? 'Değişiklikleri uygula' : 'Görevi oluştur'}</AdminButton>
      </div>
    </ContentCard>
  );
}

export default function AdminTasks({tasks = [], pages = [], onAdd, onUpdate, onDelete, onOpenPage, confirm}) {
  const ask = async (title, message) => (confirm ? await confirm({eyebrow: 'SİLME ONAYI', title, message, actions: [{id: 'cancel', label: 'Vazgeç'}, {id: 'confirm', label: 'Sil', variant: 'danger'}]}) : (window.confirm(title) ? 'confirm' : 'cancel')) === 'confirm';
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const members = [...new Set(tasks.map(task => task.assignee).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'tr'));
  const selectedTask = tasks.find(task => task.id === selectedId);
  const columns = [
    {key: 'title', label: 'Görev', render: task => <span className="table-customer"><b>{task.title}</b><small>{task.section || task.note || 'Açıklama eklenmemiş'}</small></span>},
    {key: 'page', label: 'Sayfa', secondary: true, render: task => <AdminButton size="compact" variant="ghost" onClick={() => onOpenPage(task.page)}>{taskPageName(task.page)} ↗</AdminButton>},
    {key: 'assignee', label: 'Sorumlu'},
    {key: 'dueDate', label: 'Son tarih', sortValue: task => task.dueDate || '9999-12-31', render: task => task.dueDate || 'Belirtilmedi'},
    {key: 'status', label: 'Durum', render: task => <select aria-label={task.title + ' durumu'} value={task.status || 'Yeni'} onChange={event => onUpdate(task.id, 'status', event.target.value)}>{taskStatuses.map(status => <option key={status}>{status}</option>)}</select>},
    {key: 'actions', label: 'İşlemler', sortable: false, render: task => <RowActions label={`“${task.title}” için diğer işlemler`} items={[{label: 'Sayfayı aç', onClick: () => onOpenPage(task.page)}, {label: 'Sil', variant: 'danger', onClick: () => deleteMany([task])}]}><AdminButton size="compact" onClick={() => {setShowNewTask(false);setSelectedId(task.id)}}>Düzenle</AdminButton></RowActions>}
  ];

  const saveNew = values => {
    onAdd({...values, createdAt: new Date().toISOString()});
    setSelectedId('');
    setShowNewTask(false);
  };
  const saveEdit = values => {
    onUpdate(selectedTask.id, values);
    setSelectedId('');
  };
  const deleteMany = async rows => {
    if (!await ask(rows.length > 1 ? `${rows.length} görev silinsin mi?` : 'Bu görev silinsin mi?', 'Silme, üstteki Kaydet ile kalıcı olur.')) return false;
    rows.forEach(row => onDelete(row.id));
    setSelectedId('');
    return true;
  };
  const deleteSelected = id => deleteMany(tasks.filter(task => task.id === id));

  return (
    <div className="record-workspace">
      {!showNewTask && !selectedTask && <ContentCard>
        <PageHeader eyebrow="EKİP İŞ TAKİBİ" title="Sayfa görevleri" count={tasks.length} description="Bir sayfa seçin, işi yapacak kişiyi yazın ve durumunu takip edin." actions={<AdminButton variant="primary" onClick={() => {setSelectedId('');setShowNewTask(true)}}>＋ Görev ata</AdminButton>} />
        <DataTable
          stateKey="gorev"
          defaultSort={{key: 'dueDate', direction: 'asc'}}
          selectable
          bulkActions={[...taskStatuses.map(status => ({id: 'status-' + status, label: `“${status}” yap`, run: rows => {rows.forEach(row => onUpdate(row.id, 'status', status)); return true;}})), {id: 'delete', label: 'Sil', variant: 'danger', run: deleteMany}]}
          emptyState={{title: 'Henüz görev yok.', description: 'Sayfa işlerini ekibinizle paylaşmak için görev atayın.', action: {label: '＋ Görev ata', onClick: () => setShowNewTask(true)}}}
          rows={tasks}
          columns={columns}
          searchKeys={['title', 'page', 'section', 'assignee', 'note']}
          searchLabel="Görev veya kişi ara"
          filters={[
            {key: 'status', label: 'Görev durumu', allLabel: 'Tüm durumlar', options: taskStatuses.map(status => ({value: status, label: status}))},
            ...(members.length ? [{key: 'assignee', label: 'Sorumlu kişi', allLabel: 'Tüm kişiler', options: members.map(name => ({value: name, label: name}))}] : [])
          ]}
        />
      </ContentCard>}

      {showNewTask && <TaskForm pages={pages} members={members} onSave={saveNew} onCancel={() => setShowNewTask(false)} />}
      {selectedTask && <TaskForm key={selectedTask.id} task={selectedTask} pages={pages} members={members} onSave={saveEdit} onCancel={() => setSelectedId('')} onDelete={deleteSelected} />}
    </div>
  );
}
