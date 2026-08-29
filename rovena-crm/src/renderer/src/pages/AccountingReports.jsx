import { useEffect, useState } from 'react'
import { formatMoney, formatDateTime, formatPriceInput, unformatPrice } from '../utils/format.js'
import { saveCsv } from '../utils/csv.js'
import Select from '../components/Select.jsx'

const REPORT_TYPES = [
  { value: 'pnl', label: 'Доходы и расходы' },
  { value: 'cash', label: 'Кассовый отчёт (по сменам)' },
  { value: 'tax', label: 'Налоговый расчёт' },
  { value: 'payroll', label: 'ФОТ и налоги с зарплаты' },
  { value: 'summary', label: 'Сводный отчёт' },
  { value: 'full', label: 'Полная бухгалтерия (конструктор)' }
]

const SECTION_LABELS = {
  pnl: 'Доходы и расходы',
  cash: 'Кассовый отчёт по сменам',
  tax: 'Налоговый расчёт',
  payroll: 'ФОТ и налоги с зарплаты'
}

function pad2(n) {
  return String(n).padStart(2, '0')
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function firstOfMonthISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
}
function inRange(dateTimeStr, from, to) {
  const day = dateTimeStr.slice(0, 10)
  return day >= from && day <= to
}
function sum(list, key = 'amount') {
  return list.reduce((s, x) => s + (Number(x[key]) || 0), 0)
}
function groupSum(list, keyFn) {
  const map = new Map()
  for (const item of list) {
    const k = keyFn(item) || 'без категории'
    map.set(k, (map.get(k) || 0) + item.amount)
  }
  return [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total)
}
function hoursBetween(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins / 60
}

function regimeTaxLabel(taxSettings) {
  if (taxSettings?.tax_regime === 'vat') return `НДС к уплате (${taxSettings?.vat_rate || 0}%)`
  return `ЕНП к уплате (${taxSettings?.turnover_tax_rate || 0}%)`
}
function profitTaxLabel(taxSettings) {
  return `Налог на прибыль (${taxSettings?.profit_tax_rate || 0}%)`
}
function socialTaxLabel(taxSettings) {
  return `Социальный налог, работодатель (${taxSettings?.social_tax_rate || 0}%)`
}
function ndflLabel(taxSettings) {
  return `НДФЛ к удержанию из зарплаты (${taxSettings?.ndfl_rate || 0}%)`
}

const SALARY_LABELS = { fixed: 'оклад', hourly: 'почасовая', percent: '% с продаж' }
const POSITION_LABELS = {
  cashier: 'Кассир',
  waiter: 'Официант',
  warehouse: 'Зав. склада',
  accountant: 'Бухгалтер',
  other: 'Другое'
}

function ReportHeader({ title, dateFrom, dateTo, taxSettings, generatedBy }) {
  return (
    <div className="report-header">
      {taxSettings?.logo && <img src={taxSettings.logo} alt="" className="report-logo" />}
      <div className="report-company">{taxSettings?.company_name || 'Название заведения не указано'}</div>
      {taxSettings?.tax_id && <div className="report-meta">ИНН/СТИР: {taxSettings.tax_id}</div>}
      {taxSettings?.address && <div className="report-meta">{taxSettings.address}</div>}
      <h2 className="report-title">{title}</h2>
      <div className="report-meta">
        Период: {formatDateTime(dateFrom).slice(0, 10)} — {formatDateTime(dateTo).slice(0, 10)}
      </div>
      <div className="report-meta">
        Сформировано: {formatDateTime(new Date().toISOString())}
        {generatedBy ? ` · ${generatedBy}` : ''}
      </div>
    </div>
  )
}

export function ReportsTab() {
  const [reportType, setReportType] = useState('pnl')
  const [dateFrom, setDateFrom] = useState(firstOfMonthISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [entries, setEntries] = useState([])
  const [shifts, setShifts] = useState([])
  const [shiftReports, setShiftReports] = useState({})
  const [employees, setEmployees] = useState([])
  const [scheduleEntries, setScheduleEntries] = useState([])
  const [taxSettings, setTaxSettings] = useState(null)
  const [session, setSession] = useState(null)
  const [sections, setSections] = useState({ pnl: true, cash: true, tax: true, payroll: true })

  function toggleSection(key) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  function showSection(key) {
    return reportType === key || (reportType === 'full' && sections[key])
  }

  useEffect(() => {
    window.rovena.finance.list().then(setEntries)
    window.rovena.shift.list().then(setShifts)
    window.rovena.employees.list().then(setEmployees)
    window.rovena.taxSettings.get().then(setTaxSettings)
    window.rovena.auth.me().then(setSession)
  }, [])

  useEffect(() => {
    window.rovena.schedule.list({ from: dateFrom, to: dateTo }).then(setScheduleEntries)
  }, [dateFrom, dateTo])

  const filteredEntries = entries.filter((e) => inRange(e.created_at, dateFrom, dateTo))
  const filteredShifts = shifts.filter((s) => inRange(s.opened_at, dateFrom, dateTo))
  const shiftIdsKey = filteredShifts.map((s) => s.id).join(',')

  useEffect(() => {
    const needsShiftReports = reportType === 'cash' || (reportType === 'full' && sections.cash)
    if (!needsShiftReports || filteredShifts.length === 0) return
    Promise.all(filteredShifts.map((s) => window.rovena.shift.report(s.id))).then((reports) => {
      const map = {}
      filteredShifts.forEach((s, i) => {
        map[s.id] = reports[i]
      })
      setShiftReports(map)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, shiftIdsKey, sections.cash])

  const income = filteredEntries.filter((e) => e.type === 'income')
  const expense = filteredEntries.filter((e) => e.type === 'expense')
  const incomeByCategory = groupSum(income, (e) => e.category)
  const expenseByCategory = groupSum(expense, (e) => e.category)
  const totalIncome = sum(income)
  const totalExpense = sum(expense)
  const netProfit = totalIncome - totalExpense

  const turnoverTaxDue = totalIncome * ((taxSettings?.turnover_tax_rate || 0) / 100)
  const vatDue = totalIncome * ((taxSettings?.vat_rate || 0) / 100)
  const profitTaxDue = netProfit > 0 ? netProfit * ((taxSettings?.profit_tax_rate || 0) / 100) : 0
  const regimeTaxDue = taxSettings?.tax_regime === 'vat' ? vatDue : turnoverTaxDue

  const payrollRows = employees
    .filter((e) => e.is_active)
    .map((emp) => {
      if (emp.salary_type === 'hourly') {
        const hours = scheduleEntries
          .filter((s) => s.employee_id === emp.id && s.start_time && s.end_time)
          .reduce((s, sc) => s + hoursBetween(sc.start_time, sc.end_time), 0)
        return { emp, base: hours * emp.salary_rate, note: `${hours.toFixed(1)} ч по графику × ${formatMoney(emp.salary_rate)}` }
      }
      if (emp.salary_type === 'percent') {
        return { emp, base: totalIncome * (emp.salary_rate / 100), note: `${emp.salary_rate}% от выручки за период` }
      }
      return { emp, base: emp.salary_rate, note: 'оклад/мес (не пересчитывается по дням периода)' }
    })
  const totalPayroll = sum(payrollRows, 'base')
  const socialTaxDue = totalPayroll * ((taxSettings?.social_tax_rate || 0) / 100)
  const ndflWithheld = totalPayroll * ((taxSettings?.ndfl_rate || 0) / 100)

  function handlePrint() {
    window.print()
  }

  async function handleExport() {
    const name = REPORT_TYPES.find((r) => r.value === reportType)?.label || 'report'
    const fileBase = `Rovena_${name.replace(/\s+/g, '_')}_${dateFrom}_${dateTo}`
    if (reportType === 'pnl') {
      const rows = [
        ...income.map((e) => ['Доход', e.created_at, e.category || '', e.amount, e.author || '', e.comment || '']),
        ...expense.map((e) => ['Расход', e.created_at, e.category || '', e.amount, e.author || '', e.comment || ''])
      ]
      await saveCsv(`${fileBase}.csv`, ['Тип', 'Дата', 'Категория', 'Сумма', 'Автор', 'Комментарий'], rows)
    } else if (reportType === 'cash') {
      const rows = filteredShifts.map((s) => {
        const r = shiftReports[s.id]
        return [
          s.id,
          s.opened_at,
          s.closed_at || '',
          s.opened_by_name || '',
          s.starting_cash,
          s.ending_cash ?? '',
          r ? r.ordersCount : '',
          r ? r.total : ''
        ]
      })
      await saveCsv(
        `${fileBase}.csv`,
        ['Смена', 'Открыта', 'Закрыта', 'Кассир', 'Касса на начало', 'Касса на конец', 'Заказов', 'Сумма продаж'],
        rows
      )
    } else if (reportType === 'tax') {
      const rows = [
        ['Выручка за период', totalIncome],
        ['Расходы за период', totalExpense],
        ['Прибыль за период', netProfit],
        [regimeTaxLabel(taxSettings), regimeTaxDue],
        [profitTaxLabel(taxSettings), profitTaxDue]
      ]
      await saveCsv(`${fileBase}.csv`, ['Показатель', 'Сумма'], rows)
    } else if (reportType === 'payroll') {
      const rows = payrollRows.map((r) => [
        r.emp.full_name,
        POSITION_LABELS[r.emp.position] || r.emp.position,
        SALARY_LABELS[r.emp.salary_type] || r.emp.salary_type,
        r.note,
        r.base
      ])
      rows.push(['Итого ФОТ', '', '', '', totalPayroll])
      rows.push([socialTaxLabel(taxSettings), '', '', '', socialTaxDue])
      rows.push([ndflLabel(taxSettings), '', '', '', ndflWithheld])
      await saveCsv(`${fileBase}.csv`, ['Сотрудник', 'Должность', 'Тип оплаты', 'Расчёт', 'Сумма'], rows)
    } else if (reportType === 'summary' || reportType === 'full') {
      const rows = [
        ['Выручка', totalIncome],
        ['Расходы', totalExpense],
        ['Чистая прибыль', netProfit],
        ['ФОТ (начислено)', totalPayroll],
        [socialTaxLabel(taxSettings), socialTaxDue],
        [regimeTaxLabel(taxSettings), regimeTaxDue],
        [profitTaxLabel(taxSettings), profitTaxDue]
      ]
      await saveCsv(`${fileBase}.csv`, ['Показатель', 'Сумма'], rows)
    }
  }

  return (
    <div>
      <div className="report-controls">
        <div>
          <label>Тип отчёта</label>
          <Select value={reportType} onChange={setReportType} options={REPORT_TYPES} />
        </div>
        <div>
          <label>С</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label>По</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="report-controls-actions">
          <button className="btn secondary" onClick={handlePrint}>
            Печать
          </button>
          <button className="btn" onClick={handleExport}>
            Скачать в Excel
          </button>
        </div>
      </div>

      {reportType === 'full' && (
        <div className="card section-toggles">
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Разделы в отчёте</label>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                <input type="checkbox" checked={sections[key]} onChange={() => toggleSection(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card report-printable">
        <ReportHeader
          title={REPORT_TYPES.find((r) => r.value === reportType)?.label}
          dateFrom={dateFrom}
          dateTo={dateTo}
          taxSettings={taxSettings}
          generatedBy={session?.displayName}
        />

        {showSection('pnl') && (
          <>
            {reportType === 'full' && <h3>{SECTION_LABELS.pnl}</h3>}
            <div className="grid cols-3" style={{ marginBottom: 20 }}>
              <div className="card stat-card">
                <div className="label">Доход</div>
                <div className="value income">{formatMoney(totalIncome)}</div>
              </div>
              <div className="card stat-card">
                <div className="label">Расход</div>
                <div className="value expense">{formatMoney(totalExpense)}</div>
              </div>
              <div className="card stat-card">
                <div className="label">Чистая прибыль</div>
                <div className="value">{formatMoney(netProfit)}</div>
              </div>
            </div>
            <h4>Доход по категориям</h4>
            <ReportTable
              rows={incomeByCategory}
              columns={[
                { key: 'category', label: 'Категория' },
                { key: 'total', label: 'Сумма', format: formatMoney }
              ]}
              empty="Доходов за период нет"
            />
            <h4>Расход по категориям</h4>
            <ReportTable
              rows={expenseByCategory}
              columns={[
                { key: 'category', label: 'Категория' },
                { key: 'total', label: 'Сумма', format: formatMoney }
              ]}
              empty="Расходов за период нет"
            />
          </>
        )}

        {showSection('cash') && (
          <>
            {reportType === 'full' && <h3>{SECTION_LABELS.cash}</h3>}
            <ReportTable
              rows={filteredShifts.map((s) => ({ ...s, report: shiftReports[s.id] }))}
              columns={[
                { key: 'id', label: '№' },
                { key: 'opened_at', label: 'Открыта', format: formatDateTime },
                { key: 'closed_at', label: 'Закрыта', format: (v) => (v ? formatDateTime(v) : '—') },
                { key: 'opened_by_name', label: 'Кассир' },
                { key: 'starting_cash', label: 'Касса на начало', format: formatMoney },
                { key: 'ending_cash', label: 'Касса на конец', format: (v) => (v == null ? '—' : formatMoney(v)) },
                { key: 'report', label: 'Заказов', format: (v) => (v ? v.ordersCount : '…') },
                { key: 'report', label: 'Сумма продаж', format: (v) => (v ? formatMoney(v.total) : '…') }
              ]}
              empty="Смен за период нет"
            />
          </>
        )}

        {showSection('tax') && (
          <>
            {reportType === 'full' && <h3>{SECTION_LABELS.tax}</h3>}
            <div className="instructions" style={{ marginBottom: 16 }}>
              Это внутренний предварительный расчёт по ставкам, указанным в разделе «Налоги и документация», а
              не официальная налоговая декларация. Сверяйте фактические ставки и формы отчётности с soliq.uz
              или вашим бухгалтером.
            </div>
            <ReportTable
              rows={[
                { label: 'Выручка за период', value: totalIncome },
                { label: 'Расходы за период', value: totalExpense },
                { label: 'Прибыль за период', value: netProfit },
                { label: regimeTaxLabel(taxSettings), value: regimeTaxDue },
                { label: profitTaxLabel(taxSettings), value: profitTaxDue }
              ]}
              columns={[
                { key: 'label', label: 'Показатель' },
                { key: 'value', label: 'Сумма', format: formatMoney }
              ]}
            />
          </>
        )}

        {showSection('payroll') && (
          <>
            {reportType === 'full' && <h3>{SECTION_LABELS.payroll}</h3>}
            <ReportTable
              rows={payrollRows}
              columns={[
                { key: 'emp', label: 'Сотрудник', format: (e) => e.full_name },
                { key: 'emp', label: 'Должность', format: (e) => POSITION_LABELS[e.position] || e.position },
                { key: 'note', label: 'Расчёт' },
                { key: 'base', label: 'Сумма', format: formatMoney }
              ]}
              empty="Активных сотрудников нет"
            />
            <div className="instructions" style={{ marginTop: 12 }}>
              Предварительный расчёт: почасовая оплата — по плановому графику смен за период (факт открытия
              смены кассиром здесь не учитывается), % с продаж — от выручки за период, оклад показан «как
              есть» без пересчёта по дням. Итоги ниже — оценка, не бухгалтерская проводка.
            </div>
            <ReportTable
              rows={[
                { label: 'Итого ФОТ (начислено)', value: totalPayroll },
                { label: socialTaxLabel(taxSettings), value: socialTaxDue },
                { label: ndflLabel(taxSettings), value: ndflWithheld }
              ]}
              columns={[
                { key: 'label', label: 'Показатель' },
                { key: 'value', label: 'Сумма', format: formatMoney }
              ]}
            />
          </>
        )}

        {reportType === 'summary' && (
          <ReportTable
            rows={[
              { label: 'Выручка', value: totalIncome },
              { label: 'Расходы', value: totalExpense },
              { label: 'Чистая прибыль', value: netProfit },
              { label: 'ФОТ (начислено)', value: totalPayroll },
              { label: socialTaxLabel(taxSettings), value: socialTaxDue },
              { label: regimeTaxLabel(taxSettings), value: regimeTaxDue },
              { label: profitTaxLabel(taxSettings), value: profitTaxDue }
            ]}
            columns={[
              { key: 'label', label: 'Показатель' },
              { key: 'value', label: 'Сумма', format: formatMoney }
            ]}
          />
        )}

        {reportType === 'full' && (
          <>
            <h3>Итоговая сводка</h3>
            <ReportTable
              rows={[
                { label: 'Выручка', value: totalIncome },
                { label: 'Расходы', value: totalExpense },
                { label: 'Чистая прибыль', value: netProfit },
                { label: 'ФОТ (начислено)', value: totalPayroll },
                { label: socialTaxLabel(taxSettings), value: socialTaxDue },
                { label: regimeTaxLabel(taxSettings), value: regimeTaxDue },
                { label: profitTaxLabel(taxSettings), value: profitTaxDue }
              ]}
              columns={[
                { key: 'label', label: 'Показатель' },
                { key: 'value', label: 'Сумма', format: formatMoney }
              ]}
            />
          </>
        )}
      </div>
    </div>
  )
}

function ReportTable({ rows, columns, empty }) {
  if (rows.length === 0) {
    return <div className="empty-state">{empty || 'Нет данных'}</div>
  }
  return (
    <table style={{ marginBottom: 20 }}>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c, j) => (
              <td key={j}>{c.format ? c.format(row[c.key]) : row[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const TAX_REGIMES = [
  { value: 'turnover', label: 'Оборотный (ЕНП) — для малого бизнеса' },
  { value: 'vat', label: 'Общий режим с НДС' }
]

export function SettingsTab() {
  const [settings, setSettings] = useState(null)
  const [rateInputs, setRateInputs] = useState({})

  const load = () => window.rovena.taxSettings.get().then(setSettings)

  useEffect(() => {
    load()
  }, [])

  async function save(field, value) {
    setSettings((prev) => ({ ...prev, [field]: value }))
    await window.rovena.taxSettings.update({ [field]: value })
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => save('logo', reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function rateField(field, label) {
    const shown = rateInputs[field] ?? (settings?.[field] ? String(settings[field]) : '')
    return (
      <div>
        <label>{label}</label>
        <input
          inputMode="decimal"
          value={shown}
          onChange={(e) => setRateInputs((prev) => ({ ...prev, [field]: e.target.value }))}
          onBlur={() => {
            const num = parseFloat(String(rateInputs[field] ?? '').replace(',', '.')) || 0
            setRateInputs((prev) => ({ ...prev, [field]: undefined }))
            save(field, num)
          }}
          placeholder="0"
        />
      </div>
    )
  }

  if (!settings) return null

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Реквизиты для отчётов и чеков</h3>
        <div style={{ marginBottom: 16 }}>
          <label>Логотип</label>
          <div className="photo-picker">
            {settings.logo ? (
              <img src={settings.logo} alt="" className="photo-preview" />
            ) : (
              <div className="photo-preview photo-preview-empty">нет лого</div>
            )}
            <div className="photo-picker-actions">
              <label className="btn secondary photo-upload-btn">
                Выбрать файл
                <input type="file" accept="image/*" onChange={handleLogoChange} />
              </label>
              {settings.logo && (
                <button type="button" className="btn secondary" onClick={() => save('logo', '')}>
                  Убрать лого
                </button>
              )}
            </div>
          </div>
          <p style={{ color: 'var(--ink-soft)', fontSize: 11.5, marginTop: 6, marginBottom: 0 }}>
            Показывается в шапке печатных отчётов и на чеке из панели кассира.
          </p>
        </div>
        <div className="form-row">
          <div>
            <label>Название организации</label>
            <input
              value={settings.company_name || ''}
              onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
              onBlur={(e) => save('company_name', e.target.value)}
              placeholder="ООО «Rovena»"
            />
          </div>
          <div>
            <label>ИНН / СТИР</label>
            <input
              value={settings.tax_id || ''}
              onChange={(e) => setSettings({ ...settings, tax_id: e.target.value })}
              onBlur={(e) => save('tax_id', e.target.value)}
            />
          </div>
        </div>
        <div className="form-row">
          <div>
            <label>Адрес</label>
            <input
              value={settings.address || ''}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              onBlur={(e) => save('address', e.target.value)}
            />
          </div>
          <div />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Налоговый режим и ставки</h3>
        <p style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginTop: -6, marginBottom: 16 }}>
          Ставки не заданы CRM по умолчанию — укажите свои актуальные значения. Отчёты используют их только
          для внутреннего предварительного расчёта.
        </p>
        <div className="form-row">
          <div>
            <label>Режим налогообложения</label>
            <Select value={settings.tax_regime} onChange={(v) => save('tax_regime', v)} options={TAX_REGIMES} />
          </div>
          <div />
        </div>
        <div className="form-row">
          {rateField('turnover_tax_rate', 'ЕНП — налог с оборота, %')}
          {rateField('vat_rate', 'НДС / QQS, %')}
        </div>
        <div className="form-row">
          {rateField('profit_tax_rate', 'Налог на прибыль, %')}
          {rateField('social_tax_rate', 'Социальный налог с ФОТ, %')}
        </div>
        <div className="form-row">
          {rateField('ndfl_rate', 'НДФЛ с зарплаты сотрудника, %')}
          <div />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Документация по бухгалтерии</h3>
        <div className="instructions">
          <h4>Какие отчёты доступны</h4>
          <ol>
            <li><strong>Доходы и расходы</strong> — приход по заказам и ручные записи расходов за период, с разбивкой по категориям.</li>
            <li><strong>Кассовый отчёт</strong> — по каждой открытой/закрытой смене кассира: сумма в кассе на начало/конец, число заказов, выручка за смену.</li>
            <li><strong>Налоговый расчёт</strong> — предварительная оценка суммы налога с оборота/НДС и налога на прибыль по ставкам ниже.</li>
            <li><strong>ФОТ и налоги с зарплаты</strong> — оценка фонда оплаты труда за период по данным сотрудников и планового графика смен, плюс расчёт социального налога и НДФЛ.</li>
            <li><strong>Сводный отчёт</strong> — все ключевые цифры на одной странице.</li>
          </ol>
          Каждый отчёт можно распечатать («Печать» открывает системный диалог печати) или сохранить в CSV —
          такой файл открывается в Excel как обычная таблица (разделитель «;», кодировка UTF-8 с BOM, чтобы
          кириллица отображалась корректно сразу).
          <h4>Общие типы налогов в Узбекистане для HoReCa (кафе/рестораны/бары)</h4>
          <ul>
            <li><strong>ЕНП (единый налоговый платёж)</strong> — оборотный налог для малого бизнеса ниже порога обязательной регистрации по НДС.</li>
            <li><strong>НДС / QQS</strong> — при превышении порога оборота или добровольном переходе на общий режим.</li>
            <li><strong>Налог на прибыль</strong> — для юрлиц на общем режиме налогообложения.</li>
            <li><strong>Социальный налог</strong> — начисляется работодателем на фонд оплаты труда.</li>
            <li><strong>НДФЛ</strong> — удерживается из зарплаты каждого сотрудника.</li>
          </ul>
          <p style={{ fontWeight: 600 }}>
            Важно: конкретные ставки, пороги и формы отчётности регулярно меняются и здесь намеренно не
            зашиты как «истина» — указывайте свои актуальные значения выше и сверяйтесь с soliq.uz или
            вашим бухгалтером. Отчёты CRM — инструмент внутреннего контроля, а не официальная налоговая
            декларация и не замена бухгалтера.
          </p>
        </div>
      </div>
    </div>
  )
}
