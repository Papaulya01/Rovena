import { useEffect, useState } from 'react'
import Select from '../components/Select.jsx'
import { useI18n } from '../i18n/index.jsx'

function CopyChip({ value, placeholder }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="copy-chip empty">{placeholder}</span>
  return (
    <button
      type="button"
      className="copy-chip"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // буфер обмена недоступен
        }
      }}
    >
      <span className="copy-chip-value">{value}</span>
      <span className="copy-chip-icon">{copied ? '✓' : '⧉'}</span>
    </button>
  )
}

const EMPTY_USER = { username: '', password: '', displayName: '', role: 'admin', venueIds: [] }

export default function Venues({ onVenuesChanged }) {
  const { t } = useI18n()
  const ROLES = [
    { value: 'admin', label: t('venues.roleAdmin') },
    { value: 'accountant', label: t('venues.roleAccountant') },
    { value: 'warehouse', label: t('venues.roleWarehouse') },
    { value: 'cashier', label: t('venues.roleCashier') }
  ]
  const [venues, setVenues] = useState([])
  const [users, setUsers] = useState([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [userForm, setUserForm] = useState(EMPTY_USER)
  const [userError, setUserError] = useState('')

  const load = () => {
    window.rovena.venues.list().then(setVenues)
    window.rovena.auth.listUsers().then(setUsers)
  }

  useEffect(() => {
    load()
  }, [])

  function toggleUserVenue(venueId) {
    setUserForm((f) => ({
      ...f,
      venueIds: f.venueIds.includes(venueId) ? f.venueIds.filter((id) => id !== venueId) : [...f.venueIds, venueId]
    }))
  }

  async function addUser(e) {
    e.preventDefault()
    setUserError('')
    if (!userForm.username || userForm.password.length < 6 || userForm.venueIds.length === 0) {
      setUserError(t('venues.userValidationError'))
      return
    }
    try {
      await window.rovena.auth.createUser(userForm)
      setUserForm(EMPTY_USER)
      setShowUserForm(false)
      load()
    } catch {
      setUserError(t('venues.userCreateError'))
    }
  }

  async function toggleUserActive(u) {
    await window.rovena.auth.setUserActive({ userId: u.id, isActive: u.is_active ? 0 : 1 })
    load()
  }

  async function addVenue(e) {
    e.preventDefault()
    if (!name.trim()) return
    await window.rovena.venues.create({ name: name.trim() })
    setName('')
    load()
    onVenuesChanged?.()
  }

  async function toggleActive(v) {
    await window.rovena.venues.update({ id: v.id, is_active: v.is_active ? 0 : 1 })
    load()
    onVenuesChanged?.()
  }

  async function regenerateKey(id) {
    setBusy(true)
    await window.rovena.venues.regenerateStaffKey(id)
    setBusy(false)
    load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('venues.title')}</h1>
          <p>{t('venues.subtitle')}</p>
        </div>
      </div>

      <form className="card" style={{ marginBottom: 20, display: 'flex', gap: 10 }} onSubmit={addVenue}>
        <input placeholder={t('venues.newVenuePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">
          {t('venues.add')}
        </button>
      </form>

      <div className="accordion">
        {venues.map((v) => (
          <div className="accordion-item open" key={v.id}>
            <div className="accordion-header" style={{ cursor: 'default' }}>
              <div className="accordion-title">
                <span className={`dot ${v.is_active ? 'online' : 'offline'}`} />
                <div>
                  {v.name}
                  <div className="accordion-sub">{v.is_active ? t('venues.active') : t('venues.hidden')}</div>
                </div>
              </div>
              <button className="btn secondary" onClick={() => toggleActive(v)}>
                {v.is_active ? t('common.hide') : t('common.show')}
              </button>
            </div>
            <div className="accordion-body">
              <div className="server-panel">
                <label>{t('venues.apiKeyLabel')}</label>
                <div className="address-row">
                  <CopyChip value={v.staff_api_key} placeholder={t('venues.keyNotGenerated')} />
                  <button className="btn secondary" disabled={busy} onClick={() => regenerateKey(v.id)}>
                    {t('venues.regenerateKey')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="page-header" style={{ marginTop: 32 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>{t('venues.usersTitle')}</h1>
          <p>{t('venues.usersSubtitle')}</p>
        </div>
        <button className="btn" onClick={() => setShowUserForm((v) => !v)}>
          {showUserForm ? t('common.cancel') : t('venues.addUser')}
        </button>
      </div>

      {showUserForm && (
        <form className="card" style={{ marginBottom: 20 }} onSubmit={addUser}>
          <div className="form-row">
            <div>
              <label>{t('login.username')}</label>
              <input
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                required
              />
            </div>
            <div>
              <label>{t('login.password')}</label>
              <input
                type="password"
                minLength={6}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                required
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>{t('venues.displayName')}</label>
            <input
              value={userForm.displayName}
              onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>{t('venues.role')}</label>
            <Select value={userForm.role} onChange={(v) => setUserForm({ ...userForm, role: v })} options={ROLES} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>{t('venues.venueAccess')}</label>
            <div className="radio-group">
              {venues.map((v) => (
                <label className="checkbox-label" key={v.id}>
                  <input
                    type="checkbox"
                    checked={userForm.venueIds.includes(v.id)}
                    onChange={() => toggleUserVenue(v.id)}
                  />
                  {v.name}
                </label>
              ))}
            </div>
          </div>
          {userError && <div className="auth-error">{userError}</div>}
          <button className="btn" type="submit">
            {t('venues.createUser')}
          </button>
        </form>
      )}

      <div className="card">
        {users.length === 0 ? (
          <div className="empty-state">{t('venues.noUsers')}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('login.username')}</th>
                <th>{t('venues.displayName')}</th>
                <th>{t('venues.role')}</th>
                <th>{t('venues.venuesColumn')}</th>
                <th>{t('cashier.status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.display_name || '—'}</td>
                  <td>{ROLES.find((r) => r.value === u.role)?.label.split(' —')[0] || u.role}</td>
                  <td>{u.venues.map((v) => v.name).join(', ') || '—'}</td>
                  <td>
                    <span className={`badge ${u.is_active ? 'status-confirmed' : 'status-cancelled'}`}>
                      {u.is_active ? t('venues.activeUser') : t('venues.disabledUser')}
                    </span>
                  </td>
                  <td>
                    <button className="btn secondary" onClick={() => toggleUserActive(u)}>
                      {u.is_active ? t('venues.disable') : t('venues.enable')}
                    </button>
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
