import { useEffect, useState } from 'react'
import { formatMoney, formatPriceInput, unformatPrice } from '../utils/format.js'
import Select from '../components/Select.jsx'
import { useI18n } from '../i18n/index.jsx'

const EMPTY_ITEM = { category_id: '', name: '', price: '', description: '', image: '' }
const CATEGORY_COLORS = ['#c98a3e', '#3a6a8f', '#2f7d5f', '#b5493f', '#7d5fb5', '#a67c2e', '#4f9d8f', '#8a5fb5']

function categoryColor(cat) {
  return cat.color || CATEGORY_COLORS[cat.id % CATEGORY_COLORS.length]
}

/** Подставляет {токены} в шаблон перевода — для строк вида "В категории «{category}»...". */
function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

function CategoryForm({ editing, onSaved, onCancelEdit }) {
  const { t } = useI18n()
  const [name, setName] = useState(editing?.name || '')
  const [color, setColor] = useState(editing?.color || CATEGORY_COLORS[0])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(editing?.name || '')
    setColor(editing?.color || CATEGORY_COLORS[0])
  }, [editing])

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    let saved
    if (editing) {
      saved = await window.rovena.menu.categories.update({ id: editing.id, name: name.trim(), color })
    } else {
      saved = await window.rovena.menu.categories.create({ name: name.trim(), color })
    }
    setName('')
    setBusy(false)
    onSaved(saved)
  }

  return (
    <form onSubmit={submit} className="category-add-form">
      <input placeholder={t('menuPage.categoryNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn" type="submit" disabled={busy || !name.trim()} style={{ width: '100%' }}>
          {editing ? t('menuPage.saveCategory') : t('menuPage.addCategory')}
        </button>
        {editing && (
          <button className="btn secondary" type="button" onClick={onCancelEdit} disabled={busy} style={{ width: '100%' }}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  )
}

export default function Menu() {
  const { t } = useI18n()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [itemForm, setItemForm] = useState(EMPTY_ITEM)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { category, count }
  const [moveOffer, setMoveOffer] = useState(null) // { general, target, count }

  const load = async () => {
    const [freshCategories, freshItems] = await Promise.all([
      window.rovena.menu.categories.list(),
      window.rovena.menu.items.list()
    ])
    setCategories(freshCategories)
    setItems(freshItems)
    return { freshCategories, freshItems }
  }

  useEffect(() => {
    load()
  }, [])

  async function performDeleteCategory(id) {
    await window.rovena.menu.categories.delete(id, t('menuPage.generalCategoryName'))
    load()
  }

  function requestRemoveCategory(cat) {
    const count = items.filter((i) => i.category_id === cat.id).length
    if (count > 0) {
      setDeleteConfirm({ category: cat, count })
      return
    }
    performDeleteCategory(cat.id)
  }

  async function handleCategorySaved(savedCategory) {
    setEditingCategory(null)
    const { freshCategories, freshItems } = await load()
    if (editingCategory) return // редактирование — переносить нечего
    const general = freshCategories.find((c) => c.is_general && c.id !== savedCategory.id)
    if (!general) return
    const count = freshItems.filter((i) => i.category_id === general.id).length
    if (count > 0) {
      setMoveOffer({ general, target: savedCategory, count })
    }
  }

  async function confirmMoveOffer() {
    await window.rovena.menu.categories.moveAllItems(moveOffer.general.id, moveOffer.target.id)
    setMoveOffer(null)
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
          <h1>{t('menuPage.title')}</h1>
          <p>{t('menuPage.subtitle')}</p>
        </div>
        <button className="btn" onClick={showItemForm ? closeItemForm : openAddItemForm}>
          {showItemForm ? t('common.cancel') : t('menuPage.addItem')}
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '280px 1fr', alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('menuPage.categories')}</h3>
          {categories.length === 0 ? (
            <div className="empty-state" style={{ padding: '16px 0' }}>
              {t('menuPage.noCategories')}
            </div>
          ) : (
            <div className="category-list">
              {categories.map((c) => {
                const count = items.filter((i) => i.category_id === c.id).length
                const deleteBlocked = c.is_general && count > 0
                return (
                  <div key={c.id} className="category-row">
                    <span className="category-row-dot" style={{ background: categoryColor(c) }} />
                    <span className="category-row-name">{c.name}</span>
                    <span className="category-row-count">{count}</span>
                    <button
                      type="button"
                      className="category-row-edit"
                      title={t('menuPage.editCategory')}
                      onClick={() => setEditingCategory(c)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="category-row-delete"
                      title={deleteBlocked ? t('menuPage.generalCategoryProtected') : t('menuPage.deleteCategory')}
                      disabled={deleteBlocked}
                      onClick={() => requestRemoveCategory(c)}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <CategoryForm
            editing={editingCategory}
            onSaved={handleCategorySaved}
            onCancelEdit={() => setEditingCategory(null)}
          />
        </div>

        <div>
          {showItemForm && (
            <form className="card" style={{ marginBottom: 20 }} onSubmit={submitItem}>
              <div className="form-row">
                <div>
                  <label>{t('common2.category')}</label>
                  <Select
                    value={itemForm.category_id}
                    onChange={(v) => setItemForm({ ...itemForm, category_id: v })}
                    options={[
                      { value: '', label: t('menuPage.noCategory') },
                      ...categories.map((c) => ({ value: c.id, label: c.name }))
                    ]}
                  />
                </div>
                <div>
                  <label>{t('common2.name')}</label>
                  <input
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>{t('common2.price')}</label>
                  <input
                    inputMode="decimal"
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: formatPriceInput(e.target.value) })}
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label>{t('common2.description')}</label>
                  <input
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>{t('menuPage.photo')}</label>
                <div className="photo-picker">
                  {itemForm.image ? (
                    <img src={itemForm.image} alt="" className="photo-preview" />
                  ) : (
                    <div className="photo-preview photo-preview-empty">{t('menuPage.noPhoto')}</div>
                  )}
                  <div className="photo-picker-actions">
                    <label className="btn secondary photo-upload-btn">
                      {t('menuPage.chooseFile')}
                      <input type="file" accept="image/*" onChange={handlePhotoChange} />
                    </label>
                    {itemForm.image && (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setItemForm({ ...itemForm, image: '' })}
                      >
                        {t('menuPage.removePhoto')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <button className="btn" type="submit">
                {editingItem ? t('menuPage.saveChanges') : t('menuPage.addToMenu')}
              </button>
            </form>
          )}

          <div className="card">
            {items.length === 0 ? (
              <div className="empty-state">{t('menuPage.noItems')}</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>{t('common2.name')}</th>
                    <th>{t('common2.category')}</th>
                    <th>{t('common2.price')}</th>
                    <th>{t('cashier.status')}</th>
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
                          {item.is_active ? t('menuPage.activeStatus') : t('menuPage.hiddenStatus')}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button className="btn secondary" onClick={() => startEdit(item)}>
                          {t('common.edit')}
                        </button>
                        <button className="btn secondary" onClick={() => toggleActive(item)}>
                          {item.is_active ? t('common.hide') : t('common.show')}
                        </button>
                        <button className="btn secondary" onClick={() => removeItem(item.id)}>
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
      </div>

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="card" style={{ maxWidth: 400, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t('menuPage.deleteConfirmTitle')}</h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>
              {fillTemplate(t('menuPage.deleteConfirmText'), {
                category: deleteConfirm.category.name,
                count: deleteConfirm.count,
                general: t('menuPage.generalCategoryName')
              })}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn"
                onClick={async () => {
                  await performDeleteCategory(deleteConfirm.category.id)
                  setDeleteConfirm(null)
                }}
              >
                {t('menuPage.deleteConfirmButton')}
              </button>
              <button className="btn secondary" onClick={() => setDeleteConfirm(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {moveOffer && (
        <div className="modal-overlay" onClick={() => setMoveOffer(null)}>
          <div className="card" style={{ maxWidth: 400, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t('menuPage.moveOfferTitle')}</h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>
              {fillTemplate(t('menuPage.moveOfferText'), {
                general: t('menuPage.generalCategoryName'),
                count: moveOffer.count,
                target: moveOffer.target.name
              })}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={confirmMoveOffer}>
                {t('menuPage.moveOfferConfirm')}
              </button>
              <button className="btn secondary" onClick={() => setMoveOffer(null)}>
                {t('menuPage.moveOfferSkip')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
