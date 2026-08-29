import { useEffect, useState } from 'react'
import { formatMoney, formatPriceInput, unformatPrice } from '../utils/format.js'
import Select from '../components/Select.jsx'

const EMPTY_ITEM = { category_id: '', name: '', price: '', description: '', image: '' }
const CATEGORY_COLORS = ['#c98a3e', '#3a6a8f', '#2f7d5f', '#b5493f', '#7d5fb5', '#a67c2e', '#4f9d8f', '#8a5fb5']

function categoryColor(cat) {
  return cat.color || CATEGORY_COLORS[cat.id % CATEGORY_COLORS.length]
}

function CategoryForm({ onAdded }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    await window.rovena.menu.categories.create({ name: name.trim(), color })
    setName('')
    setBusy(false)
    onAdded()
  }

  return (
    <form onSubmit={submit} className="category-add-form">
      <input placeholder="Название категории" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="color-swatches">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-swatch ${color === c ? 'selected' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            title={c}
          />
        ))}
      </div>
      <button className="btn" type="submit" disabled={busy || !name.trim()} style={{ width: '100%' }}>
        + Добавить категорию
      </button>
    </form>
  )
}

export default function Menu() {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [itemForm, setItemForm] = useState(EMPTY_ITEM)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const load = () => {
    window.rovena.menu.categories.list().then(setCategories)
    window.rovena.menu.items.list().then(setItems)
  }

  useEffect(() => {
    load()
  }, [])

  async function removeCategory(id) {
    await window.rovena.menu.categories.delete(id)
    load()
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setItemForm((f) => ({ ...f, image: reader.result }))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function openAddItemForm() {
    setEditingItem(null)
    setItemForm(EMPTY_ITEM)
    setShowItemForm(true)
  }

  function closeItemForm() {
    setShowItemForm(false)
    setEditingItem(null)
    setItemForm(EMPTY_ITEM)
  }

  function startEdit(item) {
    setEditingItem(item)
    setItemForm({
      category_id: item.category_id ? String(item.category_id) : '',
      name: item.name,
      price: formatPriceInput(String(item.price)),
      description: item.description || '',
      image: item.image || ''
    })
    setShowItemForm(true)
  }

  async function submitItem(e) {
    e.preventDefault()
    if (!itemForm.name || !itemForm.price) return
    const payload = {
      category_id: itemForm.category_id ? Number(itemForm.category_id) : null,
      name: itemForm.name,
      price: unformatPrice(itemForm.price),
      description: itemForm.description || null,
      image: itemForm.image || null
    }
    if (editingItem) {
      await window.rovena.menu.items.update({ id: editingItem.id, ...payload })
    } else {
      await window.rovena.menu.items.create(payload)
    }
    closeItemForm()
    load()
  }

  async function toggleActive(item) {
    await window.rovena.menu.items.update({ id: item.id, is_active: item.is_active ? 0 : 1 })
    load()
  }

  async function removeItem(id) {
    await window.rovena.menu.items.delete(id)
    load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Меню</h1>
          <p>Категории и позиции — единый каталог, который видят Staff и Bot через сервер CRM</p>
        </div>
        <button className="btn" onClick={showItemForm ? closeItemForm : openAddItemForm}>
          {showItemForm ? 'Отмена' : '+ Позиция'}
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '280px 1fr', alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Категории</h3>
          {categories.length === 0 ? (
            <div className="empty-state" style={{ padding: '16px 0' }}>
              Категорий пока нет
            </div>
          ) : (
            <div className="category-list">
              {categories.map((c) => {
                const count = items.filter((i) => i.category_id === c.id).length
                return (
                  <div key={c.id} className="category-row">
                    <span className="category-row-dot" style={{ background: categoryColor(c) }} />
                    <span className="category-row-name">{c.name}</span>
                    <span className="category-row-count">{count}</span>
                    <button
                      type="button"
                      className="category-row-delete"
                      title="Удалить категорию"
                      onClick={() => removeCategory(c.id)}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <CategoryForm onAdded={load} />
        </div>

        <div>
          {showItemForm && (
            <form className="card" style={{ marginBottom: 20 }} onSubmit={submitItem}>
              <div className="form-row">
                <div>
                  <label>Категория</label>
                  <Select
                    value={itemForm.category_id}
                    onChange={(v) => setItemForm({ ...itemForm, category_id: v })}
                    options={[
                      { value: '', label: 'Без категории' },
                      ...categories.map((c) => ({ value: c.id, label: c.name }))
                    ]}
                  />
                </div>
                <div>
                  <label>Название</label>
                  <input
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Цена</label>
                  <input
                    inputMode="decimal"
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: formatPriceInput(e.target.value) })}
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label>Описание</label>
                  <input
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>Фото блюда</label>
                <div className="photo-picker">
                  {itemForm.image ? (
                    <img src={itemForm.image} alt="" className="photo-preview" />
                  ) : (
                    <div className="photo-preview photo-preview-empty">нет фото</div>
                  )}
                  <div className="photo-picker-actions">
                    <label className="btn secondary photo-upload-btn">
                      Выбрать файл
                      <input type="file" accept="image/*" onChange={handlePhotoChange} />
                    </label>
                    {itemForm.image && (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setItemForm({ ...itemForm, image: '' })}
                      >
                        Убрать фото
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <button className="btn" type="submit">
                {editingItem ? 'Сохранить изменения' : 'Добавить в меню'}
              </button>
            </form>
          )}

          <div className="card">
            {items.length === 0 ? (
              <div className="empty-state">Позиций пока нет — добавьте первую</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Название</th>
                    <th>Категория</th>
                    <th>Цена</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.image ? (
                          <img src={item.image} alt="" className="menu-item-thumb" />
                        ) : (
                          <div className="menu-item-thumb menu-item-thumb-empty" />
                        )}
                      </td>
                      <td>
                        {item.name}
                        {item.description && (
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{item.description}</div>
                        )}
                      </td>
                      <td>{item.category_name || '—'}</td>
                      <td>{formatMoney(item.price)}</td>
                      <td>
                        <span className={`badge ${item.is_active ? 'status-confirmed' : 'status-cancelled'}`}>
                          {item.is_active ? 'активна' : 'скрыта'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button className="btn secondary" onClick={() => startEdit(item)}>
                          Изменить
                        </button>
                        <button className="btn secondary" onClick={() => toggleActive(item)}>
                          {item.is_active ? 'Скрыть' : 'Показать'}
                        </button>
                        <button className="btn secondary" onClick={() => removeItem(item.id)}>
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
      </div>
    </div>
  )
}
