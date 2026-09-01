import { useEffect, useState } from 'react'
import { formatMoney, formatPriceInput, unformatPrice, formatDateTime } from '../utils/format.js'
import Select from '../components/Select.jsx'
import LiveClock from '../components/LiveClock.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import LanguageButtons from '../components/LanguageButtons.jsx'
import { buildReceiptHtml } from '../utils/receipt.js'
import { useI18n } from '../i18n/index.jsx'

function OpenShiftScreen({ onOpened, onLogout }) {
  const { t } = useI18n()
  const [startingCash, setStartingCash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleOpen(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const shift = await window.rovena.shift.open({ startingCash: unformatPrice(startingCash) })
      onOpened(shift)
    } catch {
      setError(t('cashier.openError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <LanguageButtons />
        <h2>{t('cashier.openShiftTitle')}</h2>
        <p className="auth-sub">{t('cashier.openShiftSubtitle')}</p>
        <form onSubmit={handleOpen}>
          <div style={{ marginBottom: 16 }}>
            <label>{t('cashier.startingCash')}</label>
            <input
              inputMode="decimal"
              autoFocus
              value={startingCash}
              onChange={(e) => setStartingCash(formatPriceInput(e.target.value))}
              placeholder="0"
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? t('cashier.opening') : t('cashier.openShift')}
          </button>
        </form>
        <button className="logout-link" onClick={onLogout} style={{ display: 'block', margin: '14px auto 0' }}>
          {t('common.logout')}
        </button>
      </div>
    </div>
  )
}

function CloseShiftModal({ shift, onClosed, onCancel }) {
  const { t } = useI18n()
  const [report, setReport] = useState(null)
  const [endingCash, setEndingCash] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.rovena.shift.currentReport().then(setReport)
  }, [])

  async function handleClose(e) {
    e.preventDefault()
    setBusy(true)
    await window.rovena.shift.close({ shiftId: shift.id, endingCash: unformatPrice(endingCash) })
    setBusy(false)
    onClosed()
  }

  return (
    <div className="modal-overlay">
      <div className="card" style={{ maxWidth: 420, width: '100%' }}>
        <h3 style={{ marginTop: 0 }}>{t('cashier.closeShiftTitle')}</h3>
        <div className="server-panel" style={{ marginBottom: 16 }}>
          <div className="address-row" style={{ justifyContent: 'space-between' }}>
            <span>{t('cashier.opened')}</span>
            <strong>{formatDateTime(shift.opened_at)}</strong>
          </div>
          <div className="address-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span>{t('cashier.startCash')}</span>
            <strong>{formatMoney(shift.starting_cash)}</strong>
          </div>
          <div className="address-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span>{t('cashier.ordersInShift')}</span>
            <strong>{report ? report.ordersCount : '…'}</strong>
          </div>
          <div className="address-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span>{t('cashier.salesTotal')}</span>
            <strong>{report ? formatMoney(report.total) : '…'}</strong>
          </div>
        </div>
        <form onSubmit={handleClose}>
          <div style={{ marginBottom: 16 }}>
            <label>{t('cashier.endingCash')}</label>
            <input
              inputMode="decimal"
              autoFocus
              value={endingCash}
              onChange={(e) => setEndingCash(formatPriceInput(e.target.value))}
              placeholder="0"
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? t('cashier.closing') : t('cashier.closeShift')}
            </button>
            <button className="btn secondary" type="button" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CashierPanel({ session, onLogout }) {
  const { t } = useI18n()
  const [shift, setShift] = useState(undefined) // undefined = загрузка, null = нет открытой
  const [tableStatuses, setTableStatuses] = useState([])
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [shiftOrders, setShiftOrders] = useState([])
  const [selectedTableId, setSelectedTableId] = useState('')
  const [cart, setCart] = useState([])
  const [showClose, setShowClose] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [regionalSettings, setRegionalSettings] = useState(null)
  const [printerSettings, setPrinterSettings] = useState(null)
  const [taxSettings, setTaxSettings] = useState(null)
  const [printingId, setPrintingId] = useState(null)

  const loadAll = () => {
    window.rovena.shift.current().then((s) => setShift(s ?? null))
    window.rovena.tables.statuses().then(setTableStatuses)
    window.rovena.menu.categories.list().then(setCategories)
    window.rovena.menu.items.list().then((items) => setMenuItems(items.filter((i) => i.is_active)))
    window.rovena.cashier.currentOrders().then(setShiftOrders)
  }

  useEffect(() => {
    loadAll()
    window.rovena.regionalSettings.get().then(setRegionalSettings)
    window.rovena.printerSettings.get().then(setPrinterSettings)
    window.rovena.taxSettings.get().then(setTaxSettings)
    const interval = setInterval(loadAll, 15000)
    return () => clearInterval(interval)
  }, [])

  async function printReceipt(order) {
    setPrintingId(order.id)
    try {
      const html = buildReceiptHtml(order, {
        companyName: taxSettings?.company_name,
        taxId: taxSettings?.tax_id,
        address: taxSettings?.address,
        cashierName: session.displayName,
        receiptWidth: printerSettings?.receipt_width,
        logo: taxSettings?.logo
      })
      await window.rovena.printer.print({
        html,
        printerName: printerSettings?.printer_name || undefined,
        silent: !!printerSettings?.silent_print
      })
    } finally {
      setPrintingId(null)
    }
  }

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id)
      if (existing) {
        return prev.map((c) => (c.menu_item_id === item.id ? { ...c, qty: c.qty + 1 } : c))
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, qty: 1 }]
    })
  }

  function changeQty(menuItemId, delta) {
    setCart((prev) =>
      prev
        .map((c) => (c.menu_item_id === menuItemId ? { ...c, qty: Math.max(0, c.qty + delta) } : c))
        .filter((c) => c.qty > 0)
    )
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.qty * c.price, 0)

  async function submitOrder() {
    if (cart.length === 0) return
    setSubmitting(true)
    try {
      const table = tableStatuses.find((t) => String(t.id) === String(selectedTableId))
      const order = await window.rovena.cashier.createOrder({
        table_id: selectedTableId ? Number(selectedTableId) : null,
        delivery: 0,
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, name: c.name, qty: c.qty, price: c.price }))
      })
      setCart([])
      setSelectedTableId('')
      loadAll()
      if (printerSettings?.auto_print) {
        printReceipt({ ...order, table_name: table?.name })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function markOrderDone(id) {
    await window.rovena.orders.update({ id, status: 'done' })
    loadAll()
  }

  async function confirmDeliveryOrder(id) {
    await window.rovena.orders.update({ id, status: 'processing' })
    loadAll()
  }

  async function closeTable(id) {
    await window.rovena.tables.close(id)
    if (String(id) === String(selectedTableId)) setSelectedTableId('')
    loadAll()
  }

  if (shift === undefined) return null
  if (!shift) return <OpenShiftScreen onOpened={setShift} onLogout={onLogout} />

  return (
    <div className="cashier-shell">
      <header className="cashier-topbar">
        <div className="brand" style={{ borderBottom: 'none', padding: 0, marginBottom: 0 }}>
          <img src="./logo.png" alt="" className="brand-mark" />
          <span>
            Rovena
            <small>
              {t('roles.cashier')} · {session.displayName}
            </small>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <LiveClock
            timezone={regionalSettings?.timezone}
            timeFormat={regionalSettings?.time_format}
            offsetMs={regionalSettings?.time_offset_ms || 0}
            className="cashier-clock"
          />
          <span className="tag tag-lan">
            {t('cashier.shiftSince')} {formatDateTime(shift.opened_at)}
          </span>
          <LanguageSwitcher />
          <button className="btn secondary" onClick={() => setShowClose(true)}>
            {t('cashier.closeShift')}
          </button>
          <button className="logout-link" onClick={onLogout}>
            {t('common.logout')}
          </button>
        </div>
      </header>

      <div className="cashier-body">
        <section className="cashier-col">
          <h3 style={{ marginTop: 0 }}>{t('cashier.tables')}</h3>
          <div className="table-status-grid">
            {tableStatuses.map((tb) => (
              <div
                key={tb.id}
                className={`table-card ${tb.status} ${String(tb.id) === String(selectedTableId) ? 'selected' : ''}`}
                onClick={() => setSelectedTableId(String(tb.id))}
                style={{ cursor: 'pointer' }}
              >
                <div className="table-card-name">{tb.name}</div>
                <div className="table-card-meta">
                  {tb.capacity} {t('cashier.peopleShort')}
                  {tb.zone ? ` · ${tb.zone}` : ''}
                </div>
                {(tb.current || tb.next) && (
                  <div className="table-card-booking">
                    {(tb.current || tb.next).client_name || t('cashier.bookingNoName')} ·{' '}
                    {formatDateTime((tb.current || tb.next).date_from)}
                  </div>
                )}
                {tb.status !== 'free' && (
                  <button
                    type="button"
                    className="table-card-close-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTable(tb.id)
                    }}
                  >
                    {t('cashier.closeTable')}
                  </button>
                )}
              </div>
            ))}
          </div>

          <h3>{t('cashier.shiftOrders')}</h3>
          {shiftOrders.length === 0 ? (
            <div className="empty-state">{t('cashier.noOrders')}</div>
          ) : (
            <div className="shift-order-list">
              {shiftOrders.map((o) => (
                <div className="shift-order-card" key={o.id}>
                  <div className="shift-order-card-top">
                    <span className="shift-order-card-table">
                      {o.delivery ? t('cashier.deliveryLabel') : o.table_name || t('cashier.noTable')}
                    </span>
                    <span className={`badge status-${o.status}`}>
                      {t(`cashier.orderStatuses.${o.status}`)}
                    </span>
                  </div>
                  {o.delivery === 1 && (
                    <div className="shift-order-card-delivery">
                      {o.delivery_address || '—'}
                      {o.client_contact ? ` · ${o.client_contact}` : ''}
                    </div>
                  )}
                  <div className="shift-order-card-items">
                    {o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}
                  </div>
                  <div className="shift-order-card-bottom">
                    <span className="shift-order-card-total">{formatMoney(o.total_amount)}</span>
                    <div className="shift-order-card-actions">
                      {o.delivery === 1 && o.status === 'new' && (
                        <button className="btn secondary" onClick={() => confirmDeliveryOrder(o.id)}>
                          {t('cashier.confirmDelivery')}
                        </button>
                      )}
                      {o.status !== 'done' && o.status !== 'cancelled' && (
                        <button className="btn secondary" onClick={() => markOrderDone(o.id)}>
                          {t('cashier.done')}
                        </button>
                      )}
                      <button
                        className="btn secondary"
                        disabled={printingId === o.id}
                        onClick={() => printReceipt(o)}
                      >
                        {printingId === o.id ? t('cashier.printing') : t('cashier.receipt')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="cashier-col cashier-menu-col">
          <h3 style={{ marginTop: 0 }}>{t('cashier.menu')}</h3>
          <div className="menu-pick-list">
            {categories.map((cat) => {
              const items = menuItems.filter((i) => i.category_id === cat.id)
              if (items.length === 0) return null
              return (
                <div key={cat.id} style={{ marginBottom: 14 }}>
                  <div className="menu-pick-category">{cat.name}</div>
                  {items.map((item) => (
                    <button key={item.id} type="button" className="menu-pick-item" onClick={() => addToCart(item)}>
                      <span className="menu-pick-item-main">
                        {item.image && <img src={item.image} alt="" className="menu-pick-item-thumb" />}
                        <span>{item.name}</span>
                      </span>
                      <span>{formatMoney(item.price)}</span>
                    </button>
                  ))}
                </div>
              )
            })}
            {menuItems.filter((i) => !i.category_id).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="menu-pick-category">{t('cashier.noCategoryLabel')}</div>
                {menuItems
                  .filter((i) => !i.category_id)
                  .map((item) => (
                    <button key={item.id} type="button" className="menu-pick-item" onClick={() => addToCart(item)}>
                      <span className="menu-pick-item-main">
                        {item.image && <img src={item.image} alt="" className="menu-pick-item-thumb" />}
                        <span>{item.name}</span>
                      </span>
                      <span>{formatMoney(item.price)}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </section>

        <section className="cashier-col cashier-cart-col">
          <h3 style={{ marginTop: 0 }}>{t('cashier.currentOrder')}</h3>
          <div style={{ marginBottom: 12 }}>
            <label>{t('cashier.table')}</label>
            <Select
              value={selectedTableId}
              onChange={setSelectedTableId}
              placeholder={t('cashier.noTable')}
              options={tableStatuses.map((t) => ({ value: String(t.id), label: t.name }))}
            />
          </div>
          {cart.length === 0 ? (
            <div className="empty-state">{t('cashier.addItemsHint')}</div>
          ) : (
            <div className="cart-list">
              {cart.map((c) => (
                <div className="cart-row" key={c.menu_item_id}>
                  <span className="cart-row-name">{c.name}</span>
                  <div className="cart-row-qty">
                    <button type="button" className="btn secondary icon-btn" onClick={() => changeQty(c.menu_item_id, -1)}>
                      −
                    </button>
                    <span>{c.qty}</span>
                    <button type="button" className="btn secondary icon-btn" onClick={() => changeQty(c.menu_item_id, 1)}>
                      +
                    </button>
                  </div>
                  <span className="cart-row-sum">{formatMoney(c.qty * c.price)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="cart-total">
            {t('cashier.orderTotal')}: {formatMoney(cartTotal)}
          </div>
          <button className="btn" style={{ width: '100%' }} disabled={cart.length === 0 || submitting} onClick={submitOrder}>
            {submitting ? t('cashier.submitting') : t('cashier.submitOrder')}
          </button>
        </section>
      </div>

      {showClose && (
        <CloseShiftModal
          shift={shift}
          onCancel={() => setShowClose(false)}
          onClosed={() => {
            setShowClose(false)
            setShift(null)
          }}
        />
      )}
    </div>
  )
}
