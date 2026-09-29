'use client';

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Tarih bilgisi yok'
    : new Intl.DateTimeFormat('tr-TR', {dateStyle: 'medium', timeStyle: 'short'}).format(date);
}

export default function AdminDashboard({
  leads,
  onOpenLeads,
  notificationsEnabled,
  notificationsSupported,
  notificationPermission,
  onToggleNotifications,
  lastUpdated
}) {
  const newLeadCount = leads.filter(lead => lead.status === 'Yeni').length;
  const latestLeads = [...leads]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="dashboard-activity-grid">
      <section className="panel dashboard-inbox" aria-labelledby="dashboard-inbox-title">
        <div className="panelhead">
          <div>
            <span className="eyebrow">CANLI GELEN KUTUSU</span>
            <h3 id="dashboard-inbox-title">Son talepler</h3>
          </div>
          <div className="dashboard-inbox-meta">
            <span className="live"><i />Canlı</span>
            <span className="count">{lastUpdated ? 'Güncellendi ' + formatDate(lastUpdated) : 'Yükleniyor'}</span>
          </div>
        </div>

        {latestLeads.length === 0 ? (
          <div className="dashboard-empty">
            <span aria-hidden="true">✉</span>
            <b>Yeni talep geldiğinde burada görünecek.</b>
            <p>Liste yaklaşık 25 saniyede bir yenilenir.</p>
          </div>
        ) : (
          <div className="dashboard-lead-list">
            {latestLeads.map(lead => (
              <button className="dashboard-lead" key={lead.id} onClick={onOpenLeads}>
                <span className="dashboard-lead-icon" aria-hidden="true">{lead.type === 'quote' ? '↗' : lead.type === 'sample' ? '◇' : '✉'}</span>
                <span className="dashboard-lead-main">
                  <b>{lead.name || 'İsimsiz ziyaretçi'} <small>{lead.company}</small></b>
                  <span>{lead.message || lead.subject || 'Form talebi'}</span>
                </span>
                <span className="dashboard-lead-meta">
                  <span className={'status ' + (lead.status === 'Yeni' ? 'new' : '')}>{lead.status || 'Yeni'}</span>
                  <small>{formatDate(lead.createdAt)}</small>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="dashboard-inbox-footer">
          <span>{newLeadCount ? newLeadCount + ' yeni talep yanıt bekliyor' : leads.length + ' toplam kayıt'}</span>
          <button className="text-action" onClick={onOpenLeads}>Tüm talepleri aç <span aria-hidden="true">→</span></button>
        </div>
      </section>

      <section className="panel notification-panel" aria-labelledby="notification-title">
        <div className="panelhead">
          <div>
            <span className="eyebrow">BİLDİRİMLER</span>
            <h3 id="notification-title">Yeni talepleri kaçırmayın</h3>
          </div>
          <span className="notification-glyph" aria-hidden="true">♧</span>
        </div>
        <p>Yeni bir form talebi geldiğinde tarayıcı bildirimi alın. Bildirim izni yalnızca siz açmayı seçtiğinizde istenir.</p>

        {!notificationsSupported ? (
          <p className="notification-note">Bu tarayıcı bildirimleri desteklemiyor. Paneldeki talep sayacı ve canlı liste çalışmaya devam eder.</p>
        ) : notificationPermission === 'denied' ? (
          <p className="notification-note">Bildirim izni tarayıcı ayarlarından kapalı. İzni tarayıcı ayarlarından açabilirsiniz.</p>
        ) : (
          <button className={'notification-toggle ' + (notificationsEnabled ? 'enabled' : '')} onClick={onToggleNotifications}>
            <span aria-hidden="true">{notificationsEnabled ? '✓' : '♧'}</span>
            {notificationsEnabled ? 'Bildirimler açık' : 'Tarayıcı bildirimlerini aç'}
          </button>
        )}
        <small className="notification-footnote">Bildirimler yalnızca yeni talepler için gösterilir.</small>
      </section>
    </div>
  );
}
