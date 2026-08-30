import { useEffect, useState } from 'react'
import { formatMoney } from '../utils/format.js'
import { useI18n } from '../i18n/index.jsx'

function pad2(n) {
  return String(n).padStart(2, '0')
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function daysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function shortDay(iso) {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

function TopDishes({ rows, t }) {
  if (rows.length === 0) return <div className="empty-state">{t('analytics.noDishData')}</div>
  const max = Math.max(...rows.map((r) => r.total_revenue))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={`${r.menu_item_id}-${r.name}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>
              {r.name}
              {r.category_name ? ` · ${r.category_name}` : ''}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {r.total_qty} шт · {formatMoney(r.total_revenue)}
            </span>
          </div>
          <div style={{ background: '#eee', borderRadius: 4, height: 8 }}>
            <div
              style={{
                width: `${Math.max(4, (r.total_revenue / max) * 100)}%`,
                background: 'var(--accent)',
                height: 8,
                borderRadius: 4
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function DeliveryChart({ days, t }) {
  if (days.length === 0) return null
  const max = Math.max(1, ...days.map((d) => Math.max(d.deliveryCount, d.dineInCount)))
  const barW = 14
  const gap = 8
  const groupW = barW * 2 + 3
  const chartH = 130
  const width = Math.max(300, days.length * (groupW + gap))

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={chartH + 30} role="img" aria-label={t('analytics.deliveryChartTitle')}>
        <line x1={0} y1={chartH} x2={width} y2={chartH} stroke="var(--line)" strokeWidth={1} />
        {days.map((d, i) => {
          const x = i * (groupW + gap)
          const dineInH = (d.dineInCount / max) * (chartH - 8)
          const deliveryH = (d.deliveryCount / max) * (chartH - 8)
          return (
            <g key={d.day}>
              <rect x={x} y={chartH - dineInH} width={barW} height={dineInH} rx={3} fill="var(--income)">
                <title>{`${d.day} · ${t('analytics.dineIn')}: ${d.dineInCount} (${formatMoney(d.dineInTotal)})`}</title>
              </rect>
              <rect x={x + barW + 3} y={chartH - deliveryH} width={barW} height={deliveryH} rx={3} fill="var(--accent)">
                <title>{`${d.day} · ${t('analytics.delivery')}: ${d.deliveryCount} (${formatMoney(d.deliveryTotal)})`}</title>
              </rect>
              <text x={x + groupW / 2} y={chartH + 16} textAnchor="middle" fontSize="9.5" fill="var(--ink-soft)">
                {shortDay(d.day)}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
        <span>
          <span
            style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--income)', marginRight: 6 }}
          />
          {t('analytics.dineIn')}
        </span>
        <span>
          <span
            style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', marginRight: 6 }}
          />
          {t('analytics.delivery')}
        </span>
      </div>
    </div>
  )
}

export function AnalyticsTab() {
  const { t } = useI18n()
  const [dateFrom, setDateFrom] = useState(daysAgoISO(30))
  const [dateTo, setDateTo] = useState(todayISO())
  const [dishes, setDishes] = useState([])
  const [delivery, setDelivery] = useState({ days: [], summary: {} })

  useEffect(() => {
    window.rovena.analytics.dishes({ from: dateFrom, to: dateTo }).then(setDishes)
    window.rovena.analytics.delivery({ from: dateFrom, to: dateTo }).then(setDelivery)
  }, [dateFrom, dateTo])

  const topDishes = dishes.slice(0, 10)
  const summary = delivery.summary || {}
  const hasDeliveryData = (summary.totalDelivery || 0) + (summary.totalDineIn || 0) > 0

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-row">
          <div>
            <label>{t('reports.from')}</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label>{t('reports.to')}</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t('analytics.topDishesTitle')}</h3>
        <TopDishes rows={topDishes} t={t} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('analytics.deliveryChartTitle')}</h3>
        {hasDeliveryData ? (
          <>
            <div className="grid cols-3" style={{ marginBottom: 16 }}>
              <div className="stat-card">
                <div className="label">{t('analytics.deliveryShare')}</div>
                <div className="value">{Math.round((summary.deliveryShare || 0) * 100)}%</div>
              </div>
              <div className="stat-card">
                <div className="label">{t('analytics.deliveryOrders')}</div>
                <div className="value">{summary.totalDelivery}</div>
              </div>
              <div className="stat-card">
                <div className="label">{t('analytics.deliveryRevenue')}</div>
                <div className="value income">{formatMoney(summary.totalDeliveryRevenue)}</div>
              </div>
            </div>
            <DeliveryChart days={delivery.days} t={t} />
          </>
        ) : (
          <div className="empty-state">{t('analytics.noDeliveryData')}</div>
        )}
      </div>
    </div>
  )
}
