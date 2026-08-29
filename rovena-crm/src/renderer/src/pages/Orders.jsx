import { useEffect, useState } from 'react'
import { formatMoney } from '../utils/format.js'
import { useI18n } from '../i18n/index.jsx'

/**
 * CRM — только контроль: заказы создают Staff и Bot (через встроенный сервер/бота).
 * Здесь можно только смотреть, что заказано на какой стол, и менять статус.
 */
export default function Orders() {
  const { t } = useI18n()
  const [orders, setOrders] = useState([])

  const load = () => window.rovena.orders.list().then(setOrders)

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  async function setStatus(id, status) {
    await window.rovena.orders.update({ id, status })
    load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('orders.title')}</h1>
          <p>{t('orders.subtitle')}</p>
        </div>
      </div>

      <div className="card">
        {orders.length === 0 ? (
          <div className="empty-state">{t('orders.noOrders')}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('common2.id')}</th>
                <th>{t('common2.source')}</th>
                <th>{t('tables.table')}</th>
                <th>{t('common2.client')}</th>
                <th>{t('cashier.items')}</th>
                <th>{t('common2.delivery')}</th>
                <th>{t('common2.amount')}</th>
                <th>{t('cashier.status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>#{o.id}</td>
                  <td>{o.source}</td>
                  <td>{o.table_name || '—'}</td>
                  <td>{o.client_name || '—'}</td>
                  <td style={{ maxWidth: 240 }}>
                    {o.items.length > 0 ? o.items.map((i) => `${i.name} ×${i.qty}`).join(', ') : '—'}
                  </td>
                  <td>{o.delivery ? t('common.yes') : t('common.no')}</td>
                  <td>{formatMoney(o.total_amount)}</td>
                  <td>
                    <span className={`badge status-${o.status}`}>{o.status}</span>
                  </td>
                  <td>
                    {o.status !== 'done' && o.status !== 'cancelled' && (
                      <button className="btn secondary" onClick={() => setStatus(o.id, 'done')}>
                        {t('orders.closeReceipt')}
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
