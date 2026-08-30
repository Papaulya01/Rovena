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

const POSITION_TO_ROLE = {
  cashier: 'cashier',
  waiter: 'cashier',
  warehouse: 'warehouse',
  accountant: 'accountant',
  other: 'cashier'
}

function transliterate(str) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya', ' ': '.'
  }
  return str
    .toLowerCase()
    .split('')
    .map((ch) => (ch in map ? map[ch] : /[a-z0-9.]/.test(ch) ? ch : ''))
    .join('')
}

function AccessModal({ employee, users, linkedUserIds, venueId, onClose, onChanged }) {
  const { t } = useI18n()
  const ROLES = [
    { value: 'cashier', label: t('venues.roleCashier') },
    { value: 'accountant', label: t('venues.roleAccountant') },
    { value: 'warehouse', label: t('venues.roleWarehouse') },
    { value: 'admin', label: t('venues.roleAdmin') }
  ]
  const linkedUser = users.find((u) => u.id === employee.user_id)
  const freeUsers = users.filter((u) => !linkedUserIds.has(u.id))

  const [linkUserId, setLinkUserId] = useState('')
  const [creating, setCreating] = useState(false)
  const [username, setUsername] = useState(transliterate(employee.full_name))
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(POSITION_TO_ROLE[employee.position] || 'cashier')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleUnlink() {
    setBusy(true)
    await window.rovena.employees.update({ id: employee.id, user_id: null })
    setBusy(false)
    onChanged()
  }

  async function handleLink(e) {
    e.preventDefault()
    if (!linkUserId) return
    setBusy(true)
    await window.rovena.employees.update({ id: employee.id, user_id: Number(linkUserId) })
    setBusy(false)
    onChanged()
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    if (!username || password.length < 6) {
      setError(t('venues.userValidationError'))
      return
    }
    setBusy(true)
    try {
      const user = await window.rovena.auth.createUser({
        username,
        password,
        displayName: employee.full_name,
        role,
        venueIds: [venueId]
      })
      await window.rovena.employees.update({ id: employee.id, user_id: user.id })
      onChanged()
    } catch {
      setError(t('employees.accessError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ maxWidth: 440, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{t('employees.accessModalTitle')}</h3>
        <p className="auth-sub" style={{ marginBottom: 16 }}>
          {t('employees.accessModalHint')}
        </p>

        {linkedUser ? (
          <div className="server-panel" style={{ marginBottom: 16 }}>
            <div className="address-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <span>{t('employees.accessCurrent')}</span>
              <strong>
                {linkedUser.username} · {ROLES.find((r) => r.value === linkedUser.role)?.label || linkedUser.role}
              </strong>
            </div>
            <button className="btn secondary" type="button" onClick={handleUnlink} disabled={busy}>
              {t('employees.accessUnlink')}
            </button>
          </div>
        ) : (
          <>
            {freeUsers.length > 0 && (
              <form onSubmit={handleLink} className="server-panel" style={{ marginBottom: 16 }}>
                <label>{t('employees.accessLinkExisting')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Select
                      value={linkUserId}
                      onChange={setLinkUserId}
                      placeholder={t('employees.choose')}
                      options={freeUsers.map((u) => ({
                        value: String(u.id),
                        label: `${u.username} · ${ROLES.find((r) => r.value === u.role)?.label || u.role}`
                      }))}
                    />
                  </div>
                  <button className="btn secondary" type="submit" disabled={busy || !linkUserId}>
                    {t('employees.accessLinkButton')}
                  </button>
                </div>
              </form>
            )}

            {!creating ? (
              <button className="btn" type="button" style={{ width: '100%' }} onClick={() => setCreating(true)}>
                {t('employees.accessCreateNew')}
              </button>
            ) : (
              <form onSubmit={handleCreate}>
                <div className="form-row">
                  <div>
                    <label>{t('employees.accessUsername')}</label>
                    <input value={username} onChange={(e) => setUsername(e.target.value)} />
                  </div>
                  <div>
                    <label>{t('employees.accessRole')}</label>
                    <Select value={role} onChange={setRole} options={ROLES} />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label>{t('employees.accessPassword')}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('employees.accessPasswordHint')}
                  />
                </div>
                {error && <div className="auth-error">{error}</div>}
                <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
                  {busy ? t('employees.accessCreating') : t('employees.accessCreateButton')}
                </button>
              </form>
            )}
          </>
        )}

        <button
          className="btn secondary"
          type="button"
          onClick={onClose}
          style={{ width: '100%', marginTop: 16 }}
        >
          {t('employees.accessClose')}
        </button>
      </div>
    </div>
  )
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
  const [users, setUsers] = useState([])
  const [venueId, setVenueId] = useState(null)
  const [accessModalEmployee, setAccessModalEmployee] = useState(null)

  const monthCells = useMemo(() => buildMonthCells(viewDate), [viewDate])
  const linkedUserIds = useMemo(
    () => new Set(employees.map((e) => e.user_id).filter(Boolean)),
    [employees]
  )

  const loadEmployees = () => window.rovena.employees.list().then(setEmployees)
  const loadUsers = () => window.rovena.auth.listUsers().then(setUsers)
  const reloadSchedule = () => {
    const from = toISODate(monthCells[0])
    const to = toISODate(monthCells[monthCells.length - 1])
    window.rovena.schedule.list({ from, to }).then(setSchedule)
  }

  useEffect(() => {
    loadEmployees()
    loadUsers()
    window.rovena.auth.me().then((session) => setVenueId(session?.currentVenueId ?? null))
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
                <th>{t('employees.accessColumn')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const linkedUser = users.find((u) => u.id === emp.user_id)
                return (
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
                    <td>
                      <button
                        type="button"
                        className={`badge access-badge ${linkedUser ? 'status-confirmed' : 'status-cancelled'}`}
                        onClick={() => setAccessModalEmployee(emp)}
                        title={t('employees.accessManage')}
                      >
                        {linkedUser ? linkedUser.username : t('employees.noAccess')}
                      </button>
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
                )
              })}
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

      {accessModalEmployee && (
        <AccessModal
          employee={accessModalEmployee}
          users={users}
          linkedUserIds={linkedUserIds}
          venueId={venueId}
          onClose={() => setAccessModalEmployee(null)}
          onChanged={() => {
            loadEmployees()
            loadUsers()
            setAccessModalEmployee(null)
          }}
        />
      )}
    </div>
  )
}
