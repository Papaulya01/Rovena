import { useEffect, useState } from 'react'
import { formatMoney, formatDateTime, formatPriceInput, unformatPrice } from '../utils/format.js'
import { saveCsv } from '../utils/csv.js'
import Select from '../components/Select.jsx'
import { useI18n } from '../i18n/index.jsx'

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
function groupSum(list, keyFn, noCategoryLabel) {
  const map = new Map()
  for (const item of list) {
    const k = keyFn(item) || noCategoryLabel
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

function regimeTaxLabel(taxSettings, t) {
  if (taxSettings?.tax_regime === 'vat') return `${t('reports.regimeTaxLabelVat')} (${taxSettings?.vat_rate || 0}%)`
  return `${t('reports.regimeTaxLabelTurnover')} (${taxSettings?.turnover_tax_rate || 0}%)`
}
function profitTaxLabel(taxSettings, t) {
  return `${t('reports.profitTaxLabel')} (${taxSettings?.profit_tax_rate || 0}%)`
}
function socialTaxLabel(taxSettings, t) {
  return `${t('reports.socialTaxLabel')} (${taxSettings?.social_tax_rate || 0}%)`
}
function ndflLabel(taxSettings, t) {
  return `${t('reports.ndflLabel')} (${taxSettings?.ndfl_rate || 0}%)`
}

function ReportHeader({ title, dateFrom, dateTo, taxSettings, generatedBy, t }) {
  return (
    <div className="report-header">
      {taxSettings?.logo && <img src={taxSettings.logo} alt="" className="report-logo" />}
      <div className="report-company">{taxSettings?.company_name || t('reports.companyNameMissing')}</div>
      {taxSettings?.tax_id && <div className="report-meta">{t('reports.taxIdLabel')}: {taxSettings.tax_id}</div>}
      {taxSettings?.address && <div className="report-meta">{taxSettings.address}</div>}
      <h2 className="report-title">{title}</h2>
      <div className="report-meta">
        {t('reports.period')}: {formatDateTime(dateFrom).slice(0, 10)} — {formatDateTime(dateTo).slice(0, 10)}
      </div>
      <div className="report-meta">
        {t('reports.generatedAt')}: {formatDateTime(new Date().toISOString())}
        {generatedBy ? ` · ${generatedBy}` : ''}
      </div>
    </div>
  )
}

export function ReportsTab() {
  const { t } = useI18n()
  const REPORT_TYPES = [
    { value: 'pnl', label: t('reports.typePnl') },
    { value: 'cash', label: t('reports.typeCash') },
    { value: 'tax', label: t('reports.typeTax') },
    { value: 'payroll', label: t('reports.typePayroll') },
    { value: 'summary', label: t('reports.typeSummary') },
    { value: 'full', label: t('reports.typeFull') }
  ]
  const SECTION_LABELS = {
    pnl: t('reports.sectionPnl'),
    cash: t('reports.sectionCash'),
    tax: t('reports.sectionTax'),
    payroll: t('reports.sectionPayroll')
  }
  const SALARY_LABELS = { fixed: t('employees.salaryFixed'), hourly: t('employees.salaryHourly'), percent: t('employees.salaryPercent') }
  const POSITION_LABELS = {
    cashier: t('employees.positionCashier'),
    waiter: t('employees.positionWaiter'),
    warehouse: t('employees.positionWarehouse'),
    accountant: t('employees.positionAccountant'),
    other: t('employees.positionOther')
  }

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
  const incomeByCategory = groupSum(income, (e) => e.category, t('common2.category'))
  const expenseByCategory = groupSum(expense, (e) => e.category, t('common2.category'))
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
        return { emp, base: hours * emp.salary_rate, note: `${hours.toFixed(1)} ${t('reports.hoursScheduleNote')} ${formatMoney(emp.salary_rate)}` }
      }
      if (emp.salary_type === 'percent') {
        return { emp, base: totalIncome * (emp.salary_rate / 100), note: `${emp.salary_rate}${t('reports.percentOfRevenueNote')}` }
      }
      return { emp, base: emp.salary_rate, note: t('reports.fixedSalaryNote') }
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
        ...income.map((e) => [t('reports.income'), e.created_at, e.category || '', e.amount, e.author || '', e.comment || '']),
        ...expense.map((e) => [t('reports.expense'), e.created_at, e.category || '', e.amount, e.author || '', e.comment || ''])
      ]
      await saveCsv(`${fileBase}.csv`, [t('financeLedger.type'), t('financeLedger.date'), t('common2.category'), t('common2.amount'), t('financeLedger.author'), t('financeLedger.comment')], rows)
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
        [t('reports.typeCash'), t('reports.opened'), t('reports.closed'), t('reports.cashierCol'), t('reports.cashStart'), t('reports.cashEnd'), t('reports.ordersCount'), t('reports.salesSum')],
        rows
      )
    } else if (reportType === 'tax') {
      const rows = [
        [t('reports.revenueForPeriod'), totalIncome],
        [t('reports.expensesForPeriod'), totalExpense],
        [t('reports.profitForPeriod'), netProfit],
        [regimeTaxLabel(taxSettings, t), regimeTaxDue],
        [profitTaxLabel(taxSettings, t), profitTaxDue]
      ]
      await saveCsv(`${fileBase}.csv`, [t('reports.indicator'), t('reports.sum')], rows)
    } else if (reportType === 'payroll') {
      const rows = payrollRows.map((r) => [
        r.emp.full_name,
        POSITION_LABELS[r.emp.position] || r.emp.position,
        SALARY_LABELS[r.emp.salary_type] || r.emp.salary_type,
        r.note,
        r.base
      ])
      rows.push([t('reports.totalPayrollAccrued'), '', '', '', totalPayroll])
      rows.push([socialTaxLabel(taxSettings, t), '', '', '', socialTaxDue])
      rows.push([ndflLabel(taxSettings, t), '', '', '', ndflWithheld])
      await saveCsv(`${fileBase}.csv`, [t('reports.employeeCol'), t('reports.positionCol'), t('financeLedger.type'), t('reports.calcCol'), t('reports.sum')], rows)
    } else if (reportType === 'summary' || reportType === 'full') {
      const rows = [
        [t('reports.revenue'), totalIncome],
        [t('reports.expenses'), totalExpense],
        [t('reports.netProfit'), netProfit],
        [t('reports.payrollAccrued'), totalPayroll],
        [socialTaxLabel(taxSettings, t), socialTaxDue],
        [regimeTaxLabel(taxSettings, t), regimeTaxDue],
        [profitTaxLabel(taxSettings, t), profitTaxDue]
      ]
      await saveCsv(`${fileBase}.csv`, [t('reports.indicator'), t('reports.sum')], rows)
    }
  }

  return (
    <div>
      <div className="report-controls">
        <div>
          <label>{t('reports.reportType')}</label>
          <Select value={reportType} onChange={setReportType} options={REPORT_TYPES} />
        </div>
        <div>
          <label>{t('reports.from')}</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label>{t('reports.to')}</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="report-controls-actions">
          <button className="btn secondary" onClick={handlePrint}>
            {t('reports.print')}
          </button>
          <button className="btn" onClick={handleExport}>
            {t('reports.downloadExcel')}
          </button>
        </div>
      </div>

      {reportType === 'full' && (
        <div className="card section-toggles">
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>{t('reports.sectionsInReport')}</label>
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
          t={t}
        />

        {showSection('pnl') && (
          <>
            {reportType === 'full' && <h3>{SECTION_LABELS.pnl}</h3>}
            <div className="grid cols-3" style={{ marginBottom: 20 }}>
              <div className="card stat-card">
                <div className="label">{t('reports.income')}</div>
                <div className="value income">{formatMoney(totalIncome)}</div>
              </div>
              <div className="card stat-card">
                <div className="label">{t('reports.expense')}</div>
                <div className="value expense">{formatMoney(totalExpense)}</div>
              </div>
              <div className="card stat-card">
                <div className="label">{t('reports.netProfit')}</div>
                <div className="value">{formatMoney(netProfit)}</div>
              </div>
            </div>
            <h4>{t('reports.incomeByCategory')}</h4>
            <ReportTable
              rows={incomeByCategory}
              columns={[
                { key: 'category', label: t('common2.category') },
                { key: 'total', label: t('reports.sum'), format: formatMoney }
              ]}
              empty={t('reports.noIncomeInPeriod')}
              noDataText={t('reports.noData')}
            />
            <h4>{t('reports.expenseByCategory')}</h4>
            <ReportTable
              rows={expenseByCategory}
              columns={[
                { key: 'category', label: t('common2.category') },
                { key: 'total', label: t('reports.sum'), format: formatMoney }
              ]}
              empty={t('reports.noExpenseInPeriod')}
              noDataText={t('reports.noData')}
            />
          </>
        )}

        {showSection('cash') && (
          <>
            {reportType === 'full' && <h3>{SECTION_LABELS.cash}</h3>}
            <ReportTable
              rows={filteredShifts.map((s) => ({ ...s, report: shiftReports[s.id] }))}
              columns={[
                { key: 'id', label: t('reports.shiftNum') },
                { key: 'opened_at', label: t('reports.opened'), format: formatDateTime },
                { key: 'closed_at', label: t('reports.closed'), format: (v) => (v ? formatDateTime(v) : '—') },
                { key: 'opened_by_name', label: t('reports.cashierCol') },
                { key: 'starting_cash', label: t('reports.cashStart'), format: formatMoney },
                { key: 'ending_cash', label: t('reports.cashEnd'), format: (v) => (v == null ? '—' : formatMoney(v)) },
                { key: 'report', label: t('reports.ordersCount'), format: (v) => (v ? v.ordersCount : '…') },
                { key: 'report', label: t('reports.salesSum'), format: (v) => (v ? formatMoney(v.total) : '…') }
              ]}
              empty={t('reports.noShiftsInPeriod')}
              noDataText={t('reports.noData')}
            />
          </>
        )}

        {showSection('tax') && (
          <>
            {reportType === 'full' && <h3>{SECTION_LABELS.tax}</h3>}
            <div className="instructions" style={{ marginBottom: 16 }}>
              {t('reports.taxDisclaimer')}
            </div>
            <ReportTable
              rows={[
                { label: t('reports.revenueForPeriod'), value: totalIncome },
                { label: t('reports.expensesForPeriod'), value: totalExpense },
                { label: t('reports.profitForPeriod'), value: netProfit },
                { label: regimeTaxLabel(taxSettings, t), value: regimeTaxDue },
                { label: profitTaxLabel(taxSettings, t), value: profitTaxDue }
              ]}
              columns={[
                { key: 'label', label: t('reports.indicator') },
                { key: 'value', label: t('reports.sum'), format: formatMoney }
              ]}
              noDataText={t('reports.noData')}
            />
          </>
        )}

        {showSection('payroll') && (
          <>
            {reportType === 'full' && <h3>{SECTION_LABELS.payroll}</h3>}
            <ReportTable
              rows={payrollRows}
              columns={[
                { key: 'emp', label: t('reports.employeeCol'), format: (e) => e.full_name },
                { key: 'emp', label: t('reports.positionCol'), format: (e) => POSITION_LABELS[e.position] || e.position },
                { key: 'note', label: t('reports.calcCol') },
                { key: 'base', label: t('reports.sum'), format: formatMoney }
              ]}
              empty={t('reports.noActiveEmployees')}
              noDataText={t('reports.noData')}
            />
            <div className="instructions" style={{ marginTop: 12 }}>
              {t('reports.payrollDisclaimer')}
            </div>
            <ReportTable
              rows={[
                { label: t('reports.totalPayrollAccrued'), value: totalPayroll },
                { label: socialTaxLabel(taxSettings, t), value: socialTaxDue },
                { label: ndflLabel(taxSettings, t), value: ndflWithheld }
              ]}
              columns={[
                { key: 'label', label: t('reports.indicator') },
                { key: 'value', label: t('reports.sum'), format: formatMoney }
              ]}
              noDataText={t('reports.noData')}
            />
          </>
        )}

        {reportType === 'summary' && (
          <ReportTable
            rows={[
              { label: t('reports.revenue'), value: totalIncome },
              { label: t('reports.expenses'), value: totalExpense },
              { label: t('reports.netProfit'), value: netProfit },
              { label: t('reports.payrollAccrued'), value: totalPayroll },
              { label: socialTaxLabel(taxSettings, t), value: socialTaxDue },
              { label: regimeTaxLabel(taxSettings, t), value: regimeTaxDue },
              { label: profitTaxLabel(taxSettings, t), value: profitTaxDue }
            ]}
            columns={[
              { key: 'label', label: t('reports.indicator') },
              { key: 'value', label: t('reports.sum'), format: formatMoney }
            ]}
            noDataText={t('reports.noData')}
          />
        )}

        {reportType === 'full' && (
          <>
            <h3>{t('reports.finalSummary')}</h3>
            <ReportTable
              rows={[
                { label: t('reports.revenue'), value: totalIncome },
                { label: t('reports.expenses'), value: totalExpense },
                { label: t('reports.netProfit'), value: netProfit },
                { label: t('reports.payrollAccrued'), value: totalPayroll },
                { label: socialTaxLabel(taxSettings, t), value: socialTaxDue },
                { label: regimeTaxLabel(taxSettings, t), value: regimeTaxDue },
                { label: profitTaxLabel(taxSettings, t), value: profitTaxDue }
              ]}
              columns={[
                { key: 'label', label: t('reports.indicator') },
                { key: 'value', label: t('reports.sum'), format: formatMoney }
              ]}
              noDataText={t('reports.noData')}
            />
          </>
        )}
      </div>
    </div>
  )
}

function ReportTable({ rows, columns, empty, noDataText }) {
  if (rows.length === 0) {
    return <div className="empty-state">{empty || noDataText || 'No data'}</div>
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

export function SettingsTab() {
  const { t } = useI18n()
  const TAX_REGIMES = [
    { value: 'turnover', label: t('reports.regimeTurnover') },
    { value: 'vat', label: t('reports.regimeVat') }
  ]
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
        <h3 style={{ marginTop: 0 }}>{t('reports.requisitesTitle')}</h3>
        <div style={{ marginBottom: 16 }}>
          <label>{t('reports.logo')}</label>
          <div className="photo-picker">
            {settings.logo ? (
              <img src={settings.logo} alt="" className="photo-preview" />
            ) : (
              <div className="photo-preview photo-preview-empty">{t('reports.noLogo')}</div>
            )}
            <div className="photo-picker-actions">
              <label className="btn secondary photo-upload-btn">
                {t('menuPage.chooseFile')}
                <input type="file" accept="image/*" onChange={handleLogoChange} />
              </label>
              {settings.logo && (
                <button type="button" className="btn secondary" onClick={() => save('logo', '')}>
                  {t('reports.removeLogo')}
                </button>
              )}
            </div>
          </div>
          <p style={{ color: 'var(--ink-soft)', fontSize: 11.5, marginTop: 6, marginBottom: 0 }}>
            {t('reports.logoHint')}
          </p>
        </div>
        <div className="form-row">
          <div>
            <label>{t('reports.companyName')}</label>
            <input
              value={settings.company_name || ''}
              onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
              onBlur={(e) => save('company_name', e.target.value)}
              placeholder={t('reports.companyNamePlaceholder')}
            />
          </div>
          <div>
            <label>{t('reports.taxIdLabel')}</label>
            <input
              value={settings.tax_id || ''}
              onChange={(e) => setSettings({ ...settings, tax_id: e.target.value })}
              onBlur={(e) => save('tax_id', e.target.value)}
            />
          </div>
        </div>
        <div className="form-row">
          <div>
            <label>{t('reports.addressLabel')}</label>
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
        <h3 style={{ marginTop: 0 }}>{t('reports.taxRegimeTitle')}</h3>
        <p style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginTop: -6, marginBottom: 16 }}>
          {t('reports.taxRegimeHint')}
        </p>
        <div className="form-row">
          <div>
            <label>{t('reports.taxRegime')}</label>
            <Select value={settings.tax_regime} onChange={(v) => save('tax_regime', v)} options={TAX_REGIMES} />
          </div>
          <div />
        </div>
        <div className="form-row">
          {rateField('turnover_tax_rate', t('reports.rateTurnover'))}
          {rateField('vat_rate', t('reports.rateVat'))}
        </div>
        <div className="form-row">
          {rateField('profit_tax_rate', t('reports.rateProfit'))}
          {rateField('social_tax_rate', t('reports.rateSocial'))}
        </div>
        <div className="form-row">
          {rateField('ndfl_rate', t('reports.rateNdfl'))}
          <div />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('reports.docsTitle')}</h3>
        <div className="instructions">
          <h4>{t('reports.docsAvailableReports')}</h4>
          <ol>
            <li><strong>{t('reports.docPnlTerm')}</strong> — {t('reports.docPnlDesc')}</li>
            <li><strong>{t('reports.docCashTerm')}</strong> — {t('reports.docCashDesc')}</li>
            <li><strong>{t('reports.docTaxTerm')}</strong> — {t('reports.docTaxDesc')}</li>
            <li><strong>{t('reports.docPayrollTerm')}</strong> — {t('reports.docPayrollDesc')}</li>
            <li><strong>{t('reports.docSummaryTerm')}</strong> — {t('reports.docSummaryDesc')}</li>
          </ol>
          {t('reports.docExportNote')}
          <h4>{t('reports.docTaxTypesTitle')}</h4>
          <ul>
            <li><strong>{t('reports.docEnpTerm')}</strong> — {t('reports.docEnpDesc')}</li>
            <li><strong>{t('reports.docVatTerm')}</strong> — {t('reports.docVatDesc')}</li>
            <li><strong>{t('reports.docProfitTerm')}</strong> — {t('reports.docProfitDesc')}</li>
            <li><strong>{t('reports.docSocialTerm')}</strong> — {t('reports.docSocialDesc')}</li>
            <li><strong>{t('reports.docNdflTerm')}</strong> — {t('reports.docNdflDesc')}</li>
          </ul>
          <p style={{ fontWeight: 600 }}>{t('reports.docImportant')}</p>
        </div>
      </div>
    </div>
  )
}
