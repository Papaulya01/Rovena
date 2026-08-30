import { useEffect, useState } from 'react'
import { formatMoney, formatDateTime, formatTime } from '../utils/format.js'
import { useI18n } from '../i18n/index.jsx'

export default function Dashboard() {
  const { t } = useI18n()
  const [summary, setSummary] = useState(null)
  const [orders, setOrders] = useState([])
  const [bookings, setBookings] = useState([])
  const [tableStatuses, setTableStatuses] = useState([])

  const STATUS_LABEL = { free: t('dashboard.statusFree'), reserved: t('dashboard.statusReserved'), occupied: t('dashboard.statusOccupied') }

  useEffect(() => {
    const loadAll = () => {
      window.rovena.finance.summary().then(setSummary)
      window.rovena.orders.list().then((list) => setOrders(list.slice(0, 5)))
      window.rovena.bookings.list().then((list) => setBookings(list.slice(0, 5)))
      window.rovena.tables.statuses().then(setTableStatuses)
    }
    loadAll()
    const interval = setInterval(loadAll, 15000)
    return () => clearInterval(interval)
  }, [])

  function sourceLabel(source) {
    return source === 'bot' ? '🤖 Bot' : source === 'staff' ? '📱 Staff' : t('dashboard.sourceCrm')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <p>{t('dashboard.subtitle')}</p>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 24 }}>
        <div className="card stat-card">
          <div className="label">{t('dashboard.income')}</div>
          <div className="value income">{summary ? formatMoney(summary.income) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="label">{t('dashboard.expense')}</div>
          <div className="value expense">{summary ? formatMoney(summary.expense) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="label">{t('dashboard.balance')}</div>
          <div className="value">{summary ? formatMoney(summary.balance) : '—'}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{t('dashboard.tablesNow')}</h3>
          <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--ink-soft)' }}>
            <span>
              <span className="dot online" style={{ background: 'var(--income)' }} /> {t('dashboard.free')}
            </span>
            <span>
              <span className="dot online" style={{ background: 'var(--accent)' }} /> {t('dashboard.reserved')}
            </span>
            <span>
              <span className="dot online" style={{ background: 'var(--expense)' }} /> {t('dashboard.occupied')}
            </span>
          </div>
        </div>
        {tableStatuses.length === 0 ? (
          <div className="empty-state">{t('dashboard.noTablesYet')}</div>
        ) : (
          <div className="table-status-grid">
            {tableStatuses.map((t2) => {
              const booking = t2.current || t2.next
              const hasOrders = t2.openOrders && t2.openOrders.length > 0
              return (
                <div key={t2.id} className={`table-card ${t2.status}`}>
                  <div className="table-card-name">{t2.name}</div>
                  <div className="table-card-meta">
                    {t2.capacity}
                    {t2.zone ? ` · ${t2.zone}` : ''}
                  </div>
                  <div className="table-card-status">{STATUS_LABEL[t2.status]}</div>

                  {hasOrders && (
                    <div className="table-card-order">
                      {t2.openOrders.map((o) => (
                        <div key={o.id} className="table-card-order-row">
                          <span className={`badge status-${o.status}`}>{t(`cashier.orderStatuses.${o.status}`)}</span>
                          <span className="table-card-order-items">
                            {o.items.map((i) => `${i.name} ×${i.qty}`).join(', ') || t('dashboard.noItems')}
                          </span>
                        </div>
                      ))}
                      <div className="table-card-order-total">
                        {t('dashboard.receipt')}: {formatMoney(t2.orderTotal)}
                      </div>
                    </div>
                  )}

                  {booking && (
                    <div className="table-card-detail">
                      {booking.client_name || t('dashboard.noName')}
                      <br />
                      {t2.current
                        ? `${t('dashboard.until')} ${booking.date_to ? formatTime(booking.date_to) : '?'}`
                        : `${t('dashboard.from')} ${formatTime(booking.date_from)}`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid cols-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('dashboard.recentOrders')}</h3>
          {orders.length === 0 ? (
            <div className="empty-state">{t('dashboard.noOrdersYet')}</div>
          ) : (
            <table>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td>
                      {o.client_name || (o.delivery ? t('dashboard.noName') : '—')}
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                        {sourceLabel(o.source)}
                        {o.delivery ? ` · ${t('common2.delivery')}` : ''}
                      </div>
                    </td>
                    <td>
                      <span className={`badge status-${o.status}`}>{t(`cashier.orderStatuses.${o.status}`)}</span>
                    </td>
                    <td>{formatMoney(o.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('dashboard.upcomingBookings')}</h3>
          {bookings.length === 0 ? (
            <div className="empty-state">{t('dashboard.noBookingsYet')}</div>
          ) : (
            <table>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>#{b.id}</td>
                    <td>
                      {b.client_name || t('dashboard.noName')}
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{sourceLabel(b.source)}</div>
                    </td>
                    <td>{formatDateTime(b.date_from)}</td>
                    <td>
                      <span className={`badge status-${b.status}`}>{t(`cashier.orderStatuses.${b.status}`)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
