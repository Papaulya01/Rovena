import { useEffect, useMemo, useState } from 'react'
import { formatPhoneInput, formatMoney, formatPriceInput, unformatPrice } from '../utils/format.js'
import Select from '../components/Select.jsx'
import { useI18n } from '../i18n/index.jsx'

const EMPLOYEE_COLORS = ['#c98a3e', '#3a6a8f', '#2f7d5f', '#b5493f', '#7d5fb5', '#5f7db5', '#a67c2e', '#4f9d8f']

const EMPTY_EMPLOYEE = { full_name: '', position: 'cashier', phone: '', salary_type: 'fixed', salary_rate: '' }

function pad2(n) {
  return String(n).padStart(2, '0')
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatShortDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function buildMonthCells(viewDate) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // 0 = понедельник
  const start = new Date(year, month, 1 - startOffset)
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push(d)
  }
  return cells
}

function employeeColor(id) {
  return EMPLOYEE_COLORS[id % EMPLOYEE_COLORS.length]
}

function ShiftModal({ date, entry, employees, onClose, onSaved, onDeleted }) {
  const { t } = useI18n()
  const [employeeId, setEmployeeId] = useState(entry ? String(entry.employee_id) : '')
  const [startTime, setStartTime] = useState(entry?.start_time || '')
  const [endTime, setEndTime] = useState(entry?.end_time || '')
  const [note, setNote] = useState(entry?.note || '')
  const [busy, setBusy] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    if (!employeeId) return
    setBusy(true)
    try {
      const payload = {
        employee_id: Number(employeeId),
        start_time: startTime || null,
        end_time: endTime || null,
        note: note || null
      }
      if (entry) {
        await window.rovena.schedule.update({ id: entry.id, ...payload })
      } else {
        await window.rovena.schedule.create({ ...payload, work_date: date })
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    await window.rovena.schedule.delete(entry.id)
    onDeleted()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>
          {entry ? t('employees.shiftModalTitleEdit') : t('employees.shiftModalTitleNew')} · {formatShortDate(date)}
        </h3>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 14 }}>
            <label>{t('employees.employee')}</label>
            <Select
              value={employeeId}
              onChange={setEmployeeId}
              placeholder={t('employees.choose')}
              options={employees.filter((e) => e.is_active).map((e) => ({ value: String(e.id), label: e.full_name }))}
            />
          </div>
          <div className="form-row">
            <div>
              <label>{t('employees.start')}</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label>{t('employees.end')}</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>{t('employees.note')}</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('employees.notePlaceholder')} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="submit" disabled={busy || !employeeId}>
              {busy ? t('employees.saving') : entry ? t('common.save') : t('common.add')}
            </button>
            {entry && (
              <button className="btn secondary" type="button" onClick={handleDelete} disabled={busy}>
                {t('common.delete')}
              </button>
            )}
            <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Employees() {
  const { t } = useI18n()
  const POSITIONS = [
    { value: 'cashier', label: t('employees.positionCashier') },
    { value: 'waiter', label: t('employees.positionWaiter') },
    { value: 'warehouse', label: t('employees.positionWarehouse') },
    { value: 'accountant', label: t('employees.positionAccountant') },
    { value: 'other', label: t('employees.positionOther') }
  ]
  const SALARY_TYPES = [
    { value: 'fixed', label: t('employees.salaryFixed') },
    { value: 'hourly', label: t('employees.salaryHourly') },
    { value: 'percent', label: t('employees.salaryPercent') }
  ]
  const MONTHS = t('employees.months')
  const WEEKDAYS = t('employees.weekdaysShort')

  function positionLabel(value) {
    return POSITIONS.find((p) => p.value === value)?.label || value
  }
  function monthLabel(date) {
    const label = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  const [employees, setEmployees] = useState([])
  const [schedule, setSchedule] = useState([])
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE)
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()))
  const [shiftModal, setShiftModal] = useState(null) // { date: 'YYYY-MM-DD', entry: entry|null }

  const monthCells = useMemo(() => buildMonthCells(viewDate), [viewDate])

  const loadEmployees = () => window.rovena.employees.list().then(setEmployees)
  const reloadSchedule = () => {
    const from = toISODate(monthCells[0])
    const to = toISODate(monthCells[monthCells.length - 1])
    window.rovena.schedule.list({ from, to }).then(setSchedule)
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  useEffect(() => {
    reloadSchedule()
  }, [viewDate])

  const scheduleByDate = useMemo(() => {
    const map = {}
    for (const s of schedule) {
      ;(map[s.work_date] ??= []).push(s)
    }
    return map
  }, [schedule])

  async function addEmployee(e) {
    e.preventDefault()
    if (!employeeForm.full_name) return
    await window.rovena.employees.create({
      ...employeeForm,
      salary_rate: unformatPrice(employeeForm.salary_rate)
    })
    setEmployeeForm(EMPTY_EMPLOYEE)
    setShowEmployeeForm(false)
    loadEmployees()
  }

  async function toggleActive(emp) {
    await window.rovena.employees.update({ id: emp.id, is_active: emp.is_active ? 0 : 1 })
    loadEmployees()
  }

  async function removeEmployee(id) {
    await window.rovena.employees.delete(id)
    loadEmployees()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('employees.title')}</h1>
          <p>{t('employees.subtitle')}</p>
        </div>
        <button className="btn" onClick={() => setShowEmployeeForm((v) => !v)}>
          {showEmployeeForm ? t('common.cancel') : t('employees.addEmployee')}
        </button>
      </div>

      {showEmployeeForm && (
        <form className="card" style={{ marginBottom: 20 }} onSubmit={addEmployee}>
          <div className="form-row">
            <div>
              <label>{t('employees.fullName')}</label>
              <input
                value={employeeForm.full_name}
                onChange={(e) => setEmployeeForm({ ...employeeForm, full_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label>{t('employees.position')}</label>
              <Select
                value={employeeForm.position}
                onChange={(v) => setEmployeeForm({ ...employeeForm, position: v })}
                options={POSITIONS}
              />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>{t('common2.phone')}</label>
              <input
                inputMode="tel"
                placeholder="+998 (__) ___-__-__"
                value={employeeForm.phone}
                onChange={(e) => setEmployeeForm({ ...employeeForm, phone: formatPhoneInput(e.target.value) })}
              />
            </div>
            <div />
          </div>
          <div className="form-row">
            <div>
              <label>{t('employees.payment')}</label>
              <Select
                value={employeeForm.salary_type}
                onChange={(v) => setEmployeeForm({ ...employeeForm, salary_type: v })}
                options={SALARY_TYPES}
              />
            </div>
            <div>
              <label>{t('common2.price')}</label>
              <input
                inputMode="decimal"
                value={employeeForm.salary_rate}
                onChange={(e) =>
                  setEmployeeForm({ ...employeeForm, salary_rate: formatPriceInput(e.target.value) })
                }
                placeholder="0"
              />
            </div>
          </div>
          <button className="btn" type="submit">
            {t('employees.addSubmit')}
          </button>
        </form>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        {employees.length === 0 ? (
          <div className="empty-state">{t('employees.noEmployees')}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('employees.fullName')}</th>
                <th>{t('employees.position')}</th>
                <th>{t('common2.phone')}</th>
                <th>{t('employees.payment')}</th>
                <th>{t('cashier.status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <span className="calendar-legend-dot" style={{ background: employeeColor(emp.id) }} />
                    {emp.full_name}
                  </td>
                  <td>{positionLabel(emp.position)}</td>
                  <td>{emp.phone || '—'}</td>
                  <td>
                    {SALARY_TYPES.find((s) => s.value === emp.salary_type)?.label} · {formatMoney(emp.salary_rate)}
                  </td>
                  <td>
                    <span className={`badge ${emp.is_active ? 'status-confirmed' : 'status-cancelled'}`}>
                      {emp.is_active ? t('common.active') : t('common.hidden')}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn secondary" onClick={() => toggleActive(emp)}>
                      {emp.is_active ? t('common.hide') : t('common.show')}
                    </button>
                    <button className="btn secondary" onClick={() => removeEmployee(emp.id)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="page-header">
        <div>
          <h1 style={{ fontSize: 20 }}>{t('employees.scheduleTitle')}</h1>
          <p>{t('employees.scheduleSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn secondary icon-btn" onClick={() => setViewDate(shiftMonth(viewDate, -1))}>
            ‹
          </button>
          <div className="calendar-month-label">{monthLabel(viewDate)}</div>
          <button className="btn secondary icon-btn" onClick={() => setViewDate(shiftMonth(viewDate, 1))}>
            ›
          </button>
          <button className="btn secondary" onClick={() => setViewDate(startOfMonth(new Date()))}>
            {t('employees.today')}
          </button>
        </div>
      </div>

      <div className="card">
        {employees.filter((e) => e.is_active).length === 0 ? (
          <div className="empty-state">{t('employees.addFirstEmployeesHint')}</div>
        ) : (
          <>
            <div className="calendar-weekdays">
              {WEEKDAYS.map((w, i) => (
                <div key={i} className="calendar-weekday">
                  {w}
                </div>
              ))}
            </div>
            <div className="calendar-grid">
              {monthCells.map((cellDate) => {
                const iso = toISODate(cellDate)
                const outside = cellDate.getMonth() !== viewDate.getMonth()
                const today = isSameDay(cellDate, new Date())
                const dayShifts = scheduleByDate[iso] || []
                return (
                  <div key={iso} className={`calendar-cell ${outside ? 'outside' : ''} ${today ? 'today' : ''}`}>
                    <div className="calendar-cell-header">
                      <span className="calendar-cell-day">{cellDate.getDate()}</span>
                      <button
                        type="button"
                        className="calendar-add-btn"
                        title={t('employees.assignShift')}
                        onClick={() => setShiftModal({ date: iso, entry: null })}
                      >
                        +
                      </button>
                    </div>
                    <div className="calendar-cell-shifts">
                      {dayShifts.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="calendar-shift-pill"
                          style={{ borderLeftColor: employeeColor(s.employee_id) }}
                          onClick={() => setShiftModal({ date: iso, entry: s })}
                        >
                          <span className="calendar-shift-name">{s.full_name}</span>
                          <span className="calendar-shift-time">
                            {s.start_time || '?'}–{s.end_time || '?'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {shiftModal && (
        <ShiftModal
          date={shiftModal.date}
          entry={shiftModal.entry}
          employees={employees}
          onClose={() => setShiftModal(null)}
          onSaved={() => {
            setShiftModal(null)
            reloadSchedule()
          }}
          onDeleted={() => {
            setShiftModal(null)
            reloadSchedule()
          }}
        />
      )}
    </div>
  )
}
