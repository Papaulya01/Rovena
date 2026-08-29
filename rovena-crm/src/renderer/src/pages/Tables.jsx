import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/index.jsx'

const EMPTY_FORM = { name: '', capacity: 2, zone: '' }

export default function Tables() {
  const { t } = useI18n()
  const [tables, setTables] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)

  const load = () => window.rovena.tables.list().then(setTables)

  useEffect(() => {
    load()
  }, [])

  async function addTable(e) {
    e.preventDefault()
    if (!form.name) return
    await window.rovena.tables.create({
      name: form.name,
      capacity: Number(form.capacity) || 1,
      zone: form.zone || null
    })
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  async function toggleActive(table) {
    await window.rovena.tables.update({ id: table.id, is_active: table.is_active ? 0 : 1 })
    load()
  }

  async function removeTable(id) {
    await window.rovena.tables.delete(id)
    load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('tables.title')}</h1>
          <p>{t('tables.subtitle')}</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? t('common.cancel') : t('tables.addTable')}
        </button>
      </div>

      {showForm && (
        <form className="card" style={{ marginBottom: 20 }} onSubmit={addTable}>
          <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <div>
              <label>{t('tables.tableName')}</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('tables.tableNamePlaceholder')}
                required
              />
            </div>
            <div>
              <label>{t('common2.capacity')}</label>
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </div>
            <div>
              <label>{t('common2.zone')}</label>
              <input
                value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
                placeholder={t('tables.zonePlaceholder')}
              />
            </div>
          </div>
          <button className="btn" type="submit">
            {t('tables.addSubmit')}
          </button>
        </form>
      )}

      <div className="card">
        {tables.length === 0 ? (
          <div className="empty-state">{t('tables.noTables')}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('tables.table')}</th>
                <th>{t('common2.capacity')}</th>
                <th>{t('common2.zone')}</th>
                <th>{t('cashier.status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t2) => (
                <tr key={t2.id}>
                  <td>{t2.name}</td>
                  <td>{t2.capacity}</td>
                  <td>{t2.zone || '—'}</td>
                  <td>
                    <span className={`badge ${t2.is_active ? 'status-confirmed' : 'status-cancelled'}`}>
                      {t2.is_active ? t('common.active') : t('common.hidden')}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn secondary" onClick={() => toggleActive(t2)}>
                      {t2.is_active ? t('common.hide') : t('common.show')}
                    </button>
                    <button className="btn secondary" onClick={() => removeTable(t2.id)}>
                      {t('common.delete')}
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
