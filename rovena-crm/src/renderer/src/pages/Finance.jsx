import { useEffect, useMemo, useState } from 'react'
import { formatMoney, formatMonthLabel, formatPriceInput, unformatPrice } from '../utils/format.js'
import Select from '../components/Select.jsx'
import { ReportsTab, SettingsTab } from './AccountingReports.jsx'

const EMPTY_FORM = { type: 'expense', amount: '', category: '', comment: '' }

function MonthlyChart({ data }) {
  if (data.length === 0) return null
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)))
  const barW = 22
  const gap = 10
  const groupW = barW * 2 + 4
  const chartH = 140
  const width = data.length * (groupW + gap)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={chartH + 34} role="img" aria-label="Доход и расход по месяцам">
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
                <title>{`${formatMonthLabel(d.month)} · доход ${formatMoney(d.income)}`}</title>
              </rect>
              <rect
                x={x + barW + 4}
                y={chartH - expenseH}
                width={barW}
                height={expenseH}
                rx={4}
                fill="var(--expense)"
              >
                <title>{`${formatMonthLabel(d.month)} · расход ${formatMoney(d.expense)}`}</title>
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

function CategoryBars({ rows }) {
  if (rows.length === 0) return <div className="empty-state">Пока нет расходов в этом месяце</div>
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

const TABS = [
  { value: 'ledger', label: 'Операции' },
  { value: 'reports', label: 'Отчёты' },
  { value: 'settings', label: 'Налоги и документация' }
]

export default function Finance() {
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
          <h1>Бухгалтерия</h1>
          <p>Единая лента движений денег: приход по заказам + ручные расходы</p>
        </div>
        {tab === 'ledger' && (
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Отмена' : '+ Запись'}
          </button>
        )}
      </div>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`tab-btn ${tab === t.value ? 'active' : ''}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'reports' && <ReportsTab />}
      {tab === 'settings' && <SettingsTab />}

      {tab === 'ledger' && (
        <>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="label">Доход всего</div>
          <div className="value income">{summary ? formatMoney(summary.income) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Расход всего</div>
          <div className="value expense">{summary ? formatMoney(summary.expense) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Баланс</div>
          <div className="value">{summary ? formatMoney(summary.balance) : '—'}</div>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 20 }}>
        <div className="card stat-card">
          <div className="label">Доход за текущий месяц</div>
          <div className="value income">{currentMonth ? formatMoney(currentMonth.income) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Расход за текущий месяц</div>
          <div className="value expense">{currentMonth ? formatMoney(currentMonth.expense) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="label">Баланс за текущий месяц</div>
          <div className="value">{currentMonth ? formatMoney(currentMonth.balance) : '—'}</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginBottom: 20, alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Доход / расход по месяцам</h3>
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-soft)' }}>
              <span>
                <span className="dot online" style={{ background: 'var(--income)' }} /> доход
              </span>
              <span>
                <span className="dot online" style={{ background: 'var(--expense)' }} /> расход
              </span>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <MonthlyChart data={monthly} />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Расходы по категориям (этот месяц)</h3>
          <CategoryBars rows={categoryBreakdown} />
        </div>
      </div>

      {showForm && (
        <form className="card" style={{ marginBottom: 20 }} onSubmit={handleSubmit}>
          <div className="form-row">
            <div>
              <label>Тип</label>
              <Select
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={[
                  { value: 'expense', label: 'Расход' },
                  { value: 'income', label: 'Доход' }
                ]}
              />
            </div>
            <div>
              <label>Сумма</label>
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
              <label>Категория</label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="напр. аренда, закупка, зарплата"
              />
            </div>
            <div>
              <label>Комментарий</label>
              <input
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
              />
            </div>
          </div>
          <button className="btn" type="submit">
            Сохранить запись
          </button>
        </form>
      )}

      <div className="card">
        {entries.length === 0 ? (
          <div className="empty-state">Записей пока нет</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Сумма</th>
                <th>Категория</th>
                <th>Источник</th>
                <th>Автор</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.created_at}</td>
                  <td>
                    <span className={e.type === 'income' ? 'badge status-confirmed' : 'badge status-cancelled'}>
                      {e.type === 'income' ? 'доход' : 'расход'}
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
