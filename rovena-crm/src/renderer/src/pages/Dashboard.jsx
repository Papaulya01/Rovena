import { useEffect, useState } from 'react'
import { formatMoney, formatDateTime, formatTime } from '../utils/format.js'

const STATUS_LABEL = { free: 'Свободен', reserved: 'Бронь', occupied: 'Занят' }

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [orders, setOrders] = useState([])
  const [bookings, setBookings] = useState([])
  const [tableStatuses, setTableStatuses] = useState([])

  useEffect(() => {
    window.rovena.finance.summary().then(setSummary)
    window.rovena.orders.list().then((list) => setOrders(list.slice(0, 5)))
    window.rovena.bookings.list().then((list) => setBookings(list.slice(0, 5)))

    const loadTables = () => window.rovena.tables.statuses().then(setTableStatuses)
    loadTables()
    const interval = setInterval(loadTables, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Обзор</h1>
          <p>Сводка по заказам, броням и бухгалтерии</p>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 24 }}>
        <div className="card stat-card">
          <div className="label">Доход</div>
          <div className="value income">{summary ? formatMoney(summary.income) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Расход</div>
          <div className="value expense">{summary ? formatMoney(summary.expense) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Баланс</div>
          <div className="value">{summary ? formatMoney(summary.balance) : '—'}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Столы сейчас</h3>
          <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--ink-soft)' }}>
            <span>
              <span className="dot online" style={{ background: 'var(--income)' }} /> свободен
            </span>
            <span>
              <span className="dot online" style={{ background: 'var(--accent)' }} /> бронь
            </span>
            <span>
              <span className="dot online" style={{ background: 'var(--expense)' }} /> занят
            </span>
          </div>
        </div>
        {tableStatuses.length === 0 ? (
          <div className="empty-state">Столы ещё не заведены — раздел «Столы»</div>
        ) : (
          <div className="table-status-grid">
            {tableStatuses.map((t) => {
              const booking = t.current || t.next
              const hasOrders = t.openOrders && t.openOrders.length > 0
              return (
                <div key={t.id} className={`table-card ${t.status}`}>
                  <div className="table-card-name">{t.name}</div>
                  <div className="table-card-meta">
                    на {t.capacity}
                    {t.zone ? ` · ${t.zone}` : ''}
                  </div>
                  <div className="table-card-status">{STATUS_LABEL[t.status]}</div>

                  {hasOrders && (
                    <div className="table-card-order">
                      {t.openOrders.map((o) => (
                        <div key={o.id} className="table-card-order-row">
                          <span className={`badge status-${o.status}`}>{o.status}</span>
                          <span className="table-card-order-items">
                            {o.items.map((i) => `${i.name} ×${i.qty}`).join(', ') || 'без позиций'}
                          </span>
                        </div>
                      ))}
                      <div className="table-card-order-total">Чек: {formatMoney(t.orderTotal)}</div>
                    </div>
                  )}

                  {booking && (
                    <div className="table-card-detail">
                      {booking.client_name || 'без имени'}
                      <br />
                      {t.current
                        ? `до ${booking.date_to ? formatTime(booking.date_to) : '?'}`
                        : `с ${formatTime(booking.date_from)}`}
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
          <h3 style={{ marginTop: 0 }}>Последние заказы</h3>
          {orders.length === 0 ? (
            <div className="empty-state">Заказов пока нет</div>
          ) : (
            <table>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td>{o.client_name || '—'}</td>
                    <td>
                      <span className={`badge status-${o.status}`}>{o.status}</span>
                    </td>
                    <td>{formatMoney(o.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ближайшие брони</h3>
          {bookings.length === 0 ? (
            <div className="empty-state">Броней пока нет</div>
          ) : (
            <table>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>#{b.id}</td>
                    <td>{b.client_name || '—'}</td>
                    <td>{formatDateTime(b.date_from)}</td>
                    <td>
                      <span className={`badge status-${b.status}`}>{b.status}</span>
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
