import { useEffect, useState } from 'react'
import { formatMoney } from '../utils/format.js'

/**
 * CRM — только контроль: заказы создают Staff и Bot (через встроенный сервер/бота).
 * Здесь можно только смотреть, что заказано на какой стол, и менять статус.
 */
export default function Orders() {
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
          <h1>Заказы</h1>
          <p>Заказы создаются в Staff и Bot — здесь только просмотр и контроль статуса</p>
        </div>
      </div>

      <div className="card">
        {orders.length === 0 ? (
          <div className="empty-state">
            Заказов пока нет — они появятся здесь, когда Staff или бот примут первый заказ
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Источник</th>
                <th>Стол</th>
                <th>Клиент</th>
                <th>Позиции</th>
                <th>Доставка</th>
                <th>Сумма</th>
                <th>Статус</th>
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
                  <td>{o.delivery ? 'Да' : 'Нет'}</td>
                  <td>{formatMoney(o.total_amount)}</td>
                  <td>
                    <span className={`badge status-${o.status}`}>{o.status}</span>
                  </td>
                  <td>
                    {o.status !== 'done' && o.status !== 'cancelled' && (
                      <button className="btn secondary" onClick={() => setStatus(o.id, 'done')}>
                        Закрыть чек
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
