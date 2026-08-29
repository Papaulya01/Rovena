import { useEffect, useState } from 'react'
import { formatDateTime } from '../utils/format.js'
import { useI18n } from '../i18n/index.jsx'

/**
 * CRM — только контроль: брони создают Staff и Bot. Здесь можно только смотреть,
 * кто и на какой стол забронировал, и менять статус (подтвердить/отменить).
 */
export default function Bookings() {
  const { t } = useI18n()
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
          <h1>{t('bookings.title')}</h1>
          <p>{t('bookings.subtitle')}</p>
        </div>
      </div>

      <div className="card">
        {bookings.length === 0 ? (
          <div className="empty-state">{t('bookings.noBookings')}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('common2.id')}</th>
                <th>{t('common2.source')}</th>
                <th>{t('common2.client')}</th>
                <th>{t('tables.table')}</th>
                <th>{t('bookings.purpose')}</th>
                <th>{t('bookings.from')}</th>
                <th>{t('bookings.to')}</th>
                <th>{t('cashier.status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>#{b.id}</td>
                  <td>{b.source}</td>
                  <td>{b.client_name || '—'}</td>
                  <td>{b.table_name ? `${b.table_name} (${b.table_capacity})` : '—'}</td>
                  <td>{b.purpose || '—'}</td>
                  <td>{formatDateTime(b.date_from)}</td>
                  <td>{formatDateTime(b.date_to)}</td>
                  <td>
                    <span className={`badge status-${b.status}`}>{b.status}</span>
                  </td>
                  <td>
                    {b.status !== 'confirmed' && b.status !== 'cancelled' && (
                      <button className="btn secondary" onClick={() => setStatus(b.id, 'confirmed')}>
                        {t('bookings.confirm')}
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
