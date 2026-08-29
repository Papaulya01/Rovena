import { useEffect, useState } from 'react'

const EMPTY_FORM = { name: '', capacity: 2, zone: '' }

export default function Tables() {
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
          <h1>Столы</h1>
          <p>Зал, на который ссылаются брони — тот же список видят Staff и бот (команда /tables)</p>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Отмена' : '+ Стол'}
        </button>
      </div>

      {showForm && (
        <form className="card" style={{ marginBottom: 20 }} onSubmit={addTable}>
          <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <div>
              <label>Название</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="напр. Стол 5"
                required
              />
            </div>
            <div>
              <label>Вместимость</label>
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </div>
            <div>
              <label>Зона</label>
              <input
                value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
                placeholder="зал, терраса, vip..."
              />
            </div>
          </div>
          <button className="btn" type="submit">
            Добавить стол
          </button>
        </form>
      )}

      <div className="card">
        {tables.length === 0 ? (
          <div className="empty-state">Столов пока нет — добавьте первый</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Стол</th>
                <th>Вместимость</th>
                <th>Зона</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.capacity}</td>
                  <td>{t.zone || '—'}</td>
                  <td>
                    <span className={`badge ${t.is_active ? 'status-confirmed' : 'status-cancelled'}`}>
                      {t.is_active ? 'активен' : 'скрыт'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn secondary" onClick={() => toggleActive(t)}>
                      {t.is_active ? 'Скрыть' : 'Показать'}
                    </button>
                    <button className="btn secondary" onClick={() => removeTable(t.id)}>
                      Удалить
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
