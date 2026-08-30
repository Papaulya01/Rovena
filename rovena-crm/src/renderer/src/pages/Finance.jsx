import { useEffect, useMemo, useState } from 'react'
import { formatMoney, formatMonthLabel, formatPriceInput, unformatPrice } from '../utils/format.js'
import Select from '../components/Select.jsx'
import { ReportsTab, SettingsTab } from './AccountingReports.jsx'
import { AnalyticsTab } from './Analytics.jsx'
import { useI18n } from '../i18n/index.jsx'

const EMPTY_FORM = { type: 'expense', amount: '', category: '', comment: '' }

function MonthlyChart({ data, t }) {
  if (data.length === 0) return null
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)))
  const barW = 22
  const gap = 10
  const groupW = barW * 2 + 4
  const chartH = 140
  const width = data.length * (groupW + gap)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={chartH + 34} role="img" aria-label={t('financeLedger.monthlyChart')}>
        <line x1={0} y1={chartH} x2={width} y2={chartH} stroke="var(--line)" strokeWidth={1} />
        {data.map((d, i) => {
          const x = i * (groupW + gap)
          const incomeH = (d.income / max) * (chartH - 8)
          const expenseH = (d.expense / max) * (chartH - 8)
          return (
            <g key={d.month}>
              <rect
                x={x}
                y={chartH - incomeH}
                width={barW}
                height={incomeH}
                rx={4}
                fill="var(--income)"
              >
                <title>{`${formatMonthLabel(d.month)} · ${t('financeLedger.income')} ${formatMoney(d.income)}`}</title>
              </rect>
              <rect
                x={x + barW + 4}
                y={chartH - expenseH}
                width={barW}
                height={expenseH}
                rx={4}
                fill="var(--expense)"
              >
                <title>{`${formatMonthLabel(d.month)} · ${t('financeLedger.expense')} ${formatMoney(d.expense)}`}</title>
              </rect>
              <text
                x={x + groupW / 2}
                y={chartH + 18}
                textAnchor="middle"
                fontSize="10.5"
                fill="var(--ink-soft)"
              >
                {formatMonthLabel(d.month).split(' ')[0].slice(0, 3)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function CategoryBars({ rows, t }) {
  if (rows.length === 0) return <div className="empty-state">{t('financeLedger.noExpensesThisMonth')}</div>
  const max = Math.max(...rows.map((r) => r.total))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.category}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span>{r.category}</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(r.total)}</span>
          </div>
          <div style={{ background: '#eee', borderRadius: 4, height: 8 }}>
            <div
              style={{
                width: `${Math.max(4, (r.total / max) * 100)}%`,
                background: 'var(--expense)',
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

export default function Finance() {
  const { t } = useI18n()
  const TABS = [
    { value: 'ledger', label: t('financeLedger.tabLedger') },
    { value: 'reports', label: t('financeLedger.tabReports') },
    { value: 'analytics', label: t('financeLedger.tabAnalytics') },
    { value: 'settings', label: t('financeLedger.tabSettings') }
  ]
  const [tab, setTab] = useState('ledger')
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [categoryBreakdown, setCategoryBreakdown] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)

  const load = () => {
    window.rovena.finance.list().then(setEntries)
    window.rovena.finance.summary().then(setSummary)
    window.rovena.finance.monthly(6).then(setMonthly)
    window.rovena.finance.categoryBreakdown('expense').then(setCategoryBreakdown)
  }

  useEffect(() => {
    load()
  }, [])

  const currentMonth = useMemo(() => monthly[monthly.length - 1] || null, [monthly])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount) return
    await window.rovena.finance.create({ ...form, amount: unformatPrice(form.amount) })
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('financeLedger.title')}</h1>
          <p>{t('financeLedger.subtitle')}</p>
        </div>
        {tab === 'ledger' && (
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? t('common.cancel') : t('financeLedger.addEntry')}
          </button>
        )}
      </div>

      <div className="tab-bar">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.value}
            type="button"
            className={`tab-btn ${tab === tabItem.value ? 'active' : ''}`}
            onClick={() => setTab(tabItem.value)}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'reports' && <ReportsTab />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'settings' && <SettingsTab />}

      {tab === 'ledger' && (
        <>
          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <div className="card stat-card">
              <div className="label">{t('financeLedger.incomeTotal')}</div>
              <div className="value income">{summary ? formatMoney(summary.income) : '—'}</div>
            </div>
            <div className="card stat-card">
              <div className="label">{t('financeLedger.expenseTotal')}</div>
              <div className="value expense">{summary ? formatMoney(summary.expense) : '—'}</div>
            </div>
            <div className="card stat-card">
              <div className="label">{t('financeLedger.balance')}</div>
              <div className="value">{summary ? formatMoney(summary.balance) : '—'}</div>
            </div>
          </div>

          <div className="grid cols-3" style={{ marginBottom: 20 }}>
            <div className="card stat-card">
              <div className="label">{t('financeLedger.incomeThisMonth')}</div>
              <div className="value income">{currentMonth ? formatMoney(currentMonth.income) : '—'}</div>
            </div>
            <div className="card stat-card">
              <div className="label">{t('financeLedger.expenseThisMonth')}</div>
              <div className="value expense">{currentMonth ? formatMoney(currentMonth.expense) : '—'}</div>
            </div>
            <div className="card stat-card">
              <div className="label">{t('financeLedger.balanceThisMonth')}</div>
              <div className="value">{currentMonth ? formatMoney(currentMonth.balance) : '—'}</div>
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginBottom: 20, alignItems: 'start' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{t('financeLedger.monthlyChart')}</h3>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-soft)' }}>
                  <span>
                    <span className="dot online" style={{ background: 'var(--income)' }} /> {t('financeLedger.income')}
                  </span>
                  <span>
                    <span className="dot online" style={{ background: 'var(--expense)' }} /> {t('financeLedger.expense')}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <MonthlyChart data={monthly} t={t} />
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>{t('financeLedger.expenseByCategory')}</h3>
              <CategoryBars rows={categoryBreakdown} t={t} />
            </div>
          </div>

          {showForm && (
            <form className="card" style={{ marginBottom: 20 }} onSubmit={handleSubmit}>
              <div className="form-row">
                <div>
                  <label>{t('financeLedger.type')}</label>
                  <Select
                    value={form.type}
                    onChange={(v) => setForm({ ...form, type: v })}
                    options={[
                      { value: 'expense', label: t('financeLedger.typeExpense') },
                      { value: 'income', label: t('financeLedger.typeIncome') }
                    ]}
                  />
                </div>
                <div>
                  <label>{t('common2.amount')}</label>
                  <input
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: formatPriceInput(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>{t('financeLedger.category')}</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder={t('financeLedger.categoryPlaceholder')}
                  />
                </div>
                <div>
                  <label>{t('financeLedger.comment')}</label>
                  <input
                    value={form.comment}
                    onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  />
                </div>
              </div>
              <button className="btn" type="submit">
                {t('financeLedger.saveEntry')}
              </button>
            </form>
          )}

          <div className="card">
            {entries.length === 0 ? (
              <div className="empty-state">{t('financeLedger.noEntries')}</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t('financeLedger.date')}</th>
                    <th>{t('financeLedger.type')}</th>
                    <th>{t('common2.amount')}</th>
                    <th>{t('financeLedger.category')}</th>
                    <th>{t('common2.source')}</th>
                    <th>{t('financeLedger.author')}</th>
                    <th>{t('financeLedger.comment')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.created_at}</td>
                      <td>
                        <span className={e.type === 'income' ? 'badge status-confirmed' : 'badge status-cancelled'}>
                          {e.type === 'income' ? t('financeLedger.income') : t('financeLedger.expense')}
                        </span>
                      </td>
                      <td style={{ color: e.type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                        {e.type === 'income' ? '+' : '-'}
                        {formatMoney(e.amount)}
                      </td>
                      <td>{e.category || '—'}</td>
                      <td>{e.source}</td>
                      <td>{e.author || '—'}</td>
                      <td>{e.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
