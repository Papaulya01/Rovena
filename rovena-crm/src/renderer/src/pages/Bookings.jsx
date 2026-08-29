import { useEffect, useState } from 'react'
import { formatDateTime } from '../utils/format.js'

/**
 * CRM — только контроль: брони создают Staff и Bot. Здесь можно только смотреть,
 * кто и на какой стол забронировал, и менять статус (подтвердить/отменить).
 */
export default function Bookings() {
  const [bookings, setBookings] = useState([])

  const load = () => window.rovena.bookings.list().then(setBookings)

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  async function setStatus(id, status) {
    await window.rovena.bookings.update({ id, status })
    load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Брони</h1>
          <p>Брони создаются в Staff и Bot — здесь только просмотр и контроль статуса</p>
        </div>
      </div>

      <div className="card">
        {bookings.length === 0 ? (
          <div className="empty-state">
            Броней пока нет — они появятся здесь, когда Staff или бот примут первую бронь
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Источник</th>
                <th>Клиент</th>
                <th>Стол</th>
                <th>Цель</th>
                <th>С</th>
                <th>По</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>#{b.id}</td>
                  <td>{b.source}</td>
                  <td>{b.client_name || '—'}</td>
                  <td>{b.table_name ? `${b.table_name} (на ${b.table_capacity})` : '—'}</td>
                  <td>{b.purpose || '—'}</td>
                  <td>{formatDateTime(b.date_from)}</td>
                  <td>{formatDateTime(b.date_to)}</td>
                  <td>
                    <span className={`badge status-${b.status}`}>{b.status}</span>
                  </td>
                  <td>
                    {b.status !== 'confirmed' && b.status !== 'cancelled' && (
                      <button className="btn secondary" onClick={() => setStatus(b.id, 'confirmed')}>
                        Подтвердить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
