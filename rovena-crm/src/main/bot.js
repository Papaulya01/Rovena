import * as repo from './repo.js'
import { t } from './botMessages.js'

/**
 * Rovena-Bot (Telegram, long-polling) — полноценный сценарий для гостя:
 * язык → инструкция → регистрация/заказ/бронирование, с корзиной из каталога
 * CRM, выбором стола/времени/доставки и оплатой наличными (задел под QR).
 * Состояние диалога держится в памяти процесса (sessions) — переживает
 * только текущий запуск бота; данные клиента (язык/имя/телефон) и все
 * созданные брони/заказы, конечно, в БД и переживают перезапуск.
 * Бот пока общий на все заведения — работает с первым активным (defaultVenueId).
 */

const TELEGRAM_API = 'https://api.telegram.org/bot'
const REMINDER_CHECK_MS = 60000

let running = false
let botToken = null
let botUsername = null
let lastError = null
let pollAbort = null
let offset = 0
let reminderInterval = null

const sessions = new Map()

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
}

function formatMoney(n) {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0))} сум`
}

function formatTimeLabel(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatShortDateTime(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Кнопка "Связаться с клиентом" для уведомлений персоналу — по телефону, если он есть, иначе через Telegram. */
function contactClientRow(clientContact, chatId) {
  const isPhone = clientContact && /^\+?\d[\d\s()-]{5,}$/.test(clientContact)
  const url = isPhone ? `tel:${clientContact.replace(/[^\d+]/g, '')}` : `tg://user?id=${chatId}`
  return [{ text: t('ru', 'btnContactClient'), url }]
}

async function callApi(method, params) {
  const res = await fetch(`${TELEGRAM_API}${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
    signal: pollAbort?.signal
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.description || 'telegram_api_error')
  return data.result
}

// По умолчанию без HTML-разметки — большинство сообщений подставляют текст,
// который ввёл сам гость (имя, адрес доставки и т.д.), и Telegram отклонит
// сообщение целиком при "битой" HTML-сущности. parse_mode: 'HTML' указывается
// точечно там, где реально нужна разметка (сейчас — только showMenuReadonly),
// и там весь пользовательский ввод уже пропущен через escapeHtml.
function sendMessage(chatId, text, extra = {}) {
  return callApi('sendMessage', { chat_id: chatId, text, ...extra })
}

function editMessageText(chatId, messageId, text, extra = {}) {
  return callApi('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra }).catch(() => {})
}

function answerCallback(id, text) {
  return callApi('answerCallbackQuery', { callback_query_id: id, text, show_alert: false }).catch(() => {})
}

async function sendPaymentQr(chatId, dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '')
  if (!match) return
  try {
    const buffer = Buffer.from(match[2], 'base64')
    const form = new FormData()
    form.append('chat_id', String(chatId))
    form.append('photo', new Blob([buffer], { type: match[1] }), 'qr.png')
    const res = await fetch(`${TELEGRAM_API}${botToken}/sendPhoto`, { method: 'POST', body: form })
    const data = await res.json()
    if (!data.ok) throw new Error(data.description)
  } catch (e) {
    console.error('[rovena-bot] sendPaymentQr failed', e)
  }
}

function inlineKb(rows) {
  return { inline_keyboard: rows.map((row) => row.map(([text, data]) => ({ text, callback_data: data }))) }
}

function replyKb(rows) {
  return { keyboard: rows.map((row) => row.map((label) => ({ text: label }))), resize_keyboard: true }
}

// Бот пока общий на все заведения (не выбирает конкретное) — показывает первое
// активное; venue-маршрутизация для бота — отдельный вопрос ТЗ (см. Mini App).
function defaultVenueId() {
  const venue = repo.listVenues().find((v) => v.is_active)
  return venue?.id ?? null
}

function freshSession(customer) {
  return {
    step: customer ? 'menu' : 'lang',
    lang: customer?.language || 'ru',
    cart: [],
    orderMode: null, // dinein | delivery
    tableId: null,
    tableName: null,
    deliveryAddress: null,
    bookingOnly: false,
    arrivalIso: null, // null = "сейчас/как можно скорее"
    regName: null,
    currentCategoryId: null,
    menuMessageId: null,
    cancelBookingId: null
  }
}

function getSession(chatId) {
  let s = sessions.get(chatId)
  if (!s) {
    s = freshSession(repo.getBotCustomer(chatId))
    sessions.set(chatId, s)
  }
  return s
}

function tr(session, key, vars) {
  return t(session.lang, key, vars)
}

function cartCount(session) {
  return session.cart.reduce((sum, c) => sum + c.qty, 0)
}

function mainMenuKeyboard(session) {
  return replyKb([
    [tr(session, 'btnOrder'), tr(session, 'btnBook')],
    [tr(session, 'btnTables'), tr(session, 'btnMenu')],
    [tr(session, 'btnHistory'), tr(session, 'btnMyBookings')],
    [tr(session, 'btnMyDeliveries'), tr(session, 'btnRegister')],
    [tr(session, 'btnLang'), tr(session, 'btnHelp')]
  ])
}

function orderStatusLabel(session, status) {
  const key = status === 'processing' ? 'orderStatusProcessing' : status === 'done' ? 'orderStatusDone' : status === 'cancelled' ? 'orderStatusCancelled' : 'orderStatusNew'
  return tr(session, key)
}

async function showMainMenu(chatId, session) {
  session.step = 'menu'
  session.cart = []
  session.orderMode = null
  session.tableId = null
  session.tableName = null
  session.deliveryAddress = null
  session.bookingOnly = false
  session.arrivalIso = null
  session.currentCategoryId = null
  session.menuMessageId = null
  session.cancelBookingId = null
  await sendMessage(chatId, tr(session, 'backToMenu'), { reply_markup: mainMenuKeyboard(session) })
}

async function sendLangPrompt(chatId) {
  await callApi('sendMessage', {
    chat_id: chatId,
    text: t('ru', 'langPrompt'),
    reply_markup: inlineKb([
      [['Русский', 'lang:ru']],
      [["O'zbekcha (lotin)", 'lang:uz-latn']],
      [['Ўзбекча (кирилл)', 'lang:uz-cyrl']]
    ])
  })
}

// ---------- Регистрация ----------

async function startRegistration(chatId, session) {
  const customer = repo.getBotCustomer(chatId)
  if (customer?.full_name && customer?.phone) {
    await sendMessage(chatId, tr(session, 'regAlready', { name: customer.full_name, phone: customer.phone }), {
      reply_markup: inlineKb([
        [[tr(session, 'btnUpdateReg'), 'reg:update']],
        [[tr(session, 'btnCancel'), 'reg:cancel']]
      ])
    })
    return
  }
  session.step = 'reg_name'
  await sendMessage(chatId, tr(session, 'regAskName'), { reply_markup: { remove_keyboard: true } })
}

async function askPhone(chatId, session) {
  session.step = 'reg_phone'
  await sendMessage(chatId, tr(session, 'regAskPhone', { name: session.regName }), {
    reply_markup: {
      keyboard: [[{ text: tr(session, 'btnShareContact'), request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  })
}

async function finishRegistration(chatId, session, phone) {
  repo.upsertBotCustomer(chatId, { full_name: session.regName, phone, language: session.lang })
  await sendMessage(chatId, tr(session, 'regDone', { name: session.regName, phone }), {
    reply_markup: { remove_keyboard: true }
  })
  await showMainMenu(chatId, session)
}

// ---------- Столы / меню (просмотр) ----------

async function showTables(chatId, session) {
  const venueId = defaultVenueId()
  const statuses = venueId ? repo.tableStatuses(venueId) : []
  if (statuses.length === 0) {
    await sendMessage(chatId, tr(session, 'noTables'))
    return
  }
  const lines = statuses
    .map((tb) => {
      const label =
        tb.status === 'free' ? tr(session, 'tableFree') : tb.status === 'reserved' ? tr(session, 'tableReserved') : tr(session, 'tableOccupied')
      return `• ${escapeHtml(tb.name)} (${tb.capacity}) — ${label}`
    })
    .join('\n')
  await sendMessage(chatId, `${tr(session, 'tablesList')}\n${lines}`)
}

async function showMenuReadonly(chatId, session) {
  const venueId = defaultVenueId()
  const items = venueId ? repo.listMenuItems(venueId, { activeOnly: true }) : []
  if (items.length === 0) {
    await sendMessage(chatId, tr(session, 'noMenu'))
    return
  }
  const byCat = new Map()
  for (const item of items) {
    const cat = item.category_name || '—'
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat).push(item)
  }
  let text = ''
  for (const [cat, catItems] of byCat) {
    text += `\n<b>${escapeHtml(cat)}</b>\n`
    for (const item of catItems) text += `• ${escapeHtml(item.name)} — ${formatMoney(item.price)}\n`
  }
  await sendMessage(chatId, text.trim(), { parse_mode: 'HTML' })
}

// ---------- История заказов (повторить прошлый заказ) ----------

async function showOrderHistory(chatId, session) {
  const venueId = defaultVenueId()
  const orders = venueId ? repo.listBotOrderHistory(chatId, venueId) : []
  if (orders.length === 0) {
    await sendMessage(chatId, tr(session, 'noOrderHistory'))
    return
  }
  const rows = orders.map((o) => {
    const summary = o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')
    const label = `${formatShortDateTime(o.created_at)} — ${formatMoney(o.total_amount)} (${summary}`.slice(0, 60) + ')'
    return [[label, `repeat:${o.id}`]]
  })
  await sendMessage(chatId, tr(session, 'orderHistoryTitle'), { reply_markup: inlineKb(rows) })
}

async function repeatOrder(chatId, session, orderId, callbackId) {
  const venueId = defaultVenueId()
  const order = repo.listBotOrderHistory(chatId, venueId, 50).find((o) => o.id === orderId)
  if (!order) {
    await answerCallback(callbackId, tr(session, 'orderHistoryItemGone'))
    return
  }
  const liveItems = repo.listMenuItems(venueId, { activeOnly: true })
  session.cart = order.items
    .map((i) => {
      const live = liveItems.find((li) => li.id === i.menu_item_id)
      return live ? { menu_item_id: live.id, name: live.name, price: live.price, qty: i.qty } : null
    })
    .filter(Boolean)
  await answerCallback(callbackId)
  if (session.cart.length === 0) {
    await sendMessage(chatId, tr(session, 'orderHistoryAllGone'))
    return
  }
  session.bookingOnly = false
  session.tableId = null
  session.deliveryAddress = null
  await sendMessage(chatId, tr(session, 'orderHistoryRepeated', { count: cartCount(session) }))
  session.step = 'order_type'
  await sendMessage(chatId, tr(session, 'orderTypePrompt'), {
    reply_markup: inlineKb([[[tr(session, 'btnDineIn'), 'otype:dinein'], [tr(session, 'btnDelivery'), 'otype:delivery']]])
  })
}

// ---------- Мои брони (просмотр / отмена с причиной) ----------

async function showMyBookings(chatId, session) {
  const venueId = defaultVenueId()
  const bookings = venueId ? repo.listBotBookings(chatId, venueId) : []
  if (bookings.length === 0) {
    await sendMessage(chatId, tr(session, 'noMyBookings'))
    return
  }
  const rows = bookings.map((b) => [[`${formatShortDateTime(b.date_from)} — ${b.table_name || '—'}`, `mybooking:${b.id}`]])
  await sendMessage(chatId, tr(session, 'myBookingsTitle'), { reply_markup: inlineKb(rows) })
}

async function showMyBookingDetail(chatId, session, bookingId, callbackId) {
  const venueId = defaultVenueId()
  const booking = repo.listBotBookings(chatId, venueId).find((b) => b.id === bookingId)
  await answerCallback(callbackId)
  if (!booking) {
    await sendMessage(chatId, tr(session, 'orderHistoryItemGone'))
    return
  }
  await sendMessage(
    chatId,
    tr(session, 'myBookingDetail', { table: booking.table_name || '—', time: formatShortDateTime(booking.date_from) }),
    {
      reply_markup: inlineKb([
        [[tr(session, 'btnCancelBooking'), `cancelbooking:${booking.id}`]],
        [[tr(session, 'btnBackToList'), 'mybookings:list']]
      ])
    }
  )
}

async function askCancelReason(chatId, session, bookingId, callbackId) {
  session.step = 'booking_cancel_reason'
  session.cancelBookingId = bookingId
  await answerCallback(callbackId)
  await sendMessage(chatId, tr(session, 'cancelReasonPrompt'), {
    reply_markup: inlineKb([[[tr(session, 'btnSkipReason'), 'cancelreason:skip']]])
  })
}

async function notifyStaffBookingCancelled(booking, reason) {
  const venueId = defaultVenueId()
  const settings = venueId ? repo.getBotSettings(venueId) : null
  if (!settings?.notify_chat_id || !settings.notify_new_booking) return
  const reasonSuffix = reason ? t('ru', 'staffBookingCancelledReasonSuffix', { reason }) : ''
  await sendMessage(
    settings.notify_chat_id,
    t('ru', 'staffBookingCancelled', {
      table: booking.table_name || '—',
      time: formatTimeLabel(booking.date_from),
      name: booking.client_name || '—',
      contact: booking.client_contact || '—',
      reasonSuffix
    }),
    { reply_markup: { inline_keyboard: [contactClientRow(booking.client_contact, booking.bot_chat_id)] } }
  ).catch((e) => console.error('[rovena-bot] staff notify failed', e))
}

async function finalizeCancelBooking(chatId, session, reason) {
  const bookingId = session.cancelBookingId
  if (!bookingId) {
    await showMainMenu(chatId, session)
    return
  }
  const cleanReason = reason || null
  const booking = repo.updateBooking(bookingId, { status: 'cancelled', comment: cleanReason }, 'bot')
  session.cancelBookingId = null
  await sendMessage(chatId, tr(session, 'bookingCancelledByGuest', { time: formatTimeLabel(booking.date_from) }))
  await notifyStaffBookingCancelled(booking, cleanReason)
  await showMainMenu(chatId, session)
}

// ---------- Мои доставки (история + активные, отмена пока не подтверждена персоналом) ----------

async function showMyDeliveries(chatId, session) {
  const venueId = defaultVenueId()
  const orders = venueId ? repo.listBotDeliveryOrders(chatId, venueId) : []
  if (orders.length === 0) {
    await sendMessage(chatId, tr(session, 'noMyDeliveries'))
    return
  }
  const rows = orders.map((o) => [
    [`${formatShortDateTime(o.created_at)} — ${formatMoney(o.total_amount)} (${orderStatusLabel(session, o.status)})`, `mydelivery:${o.id}`]
  ])
  await sendMessage(chatId, tr(session, 'myDeliveriesTitle'), { reply_markup: inlineKb(rows) })
}

async function showMyDeliveryDetail(chatId, session, orderId, callbackId) {
  const venueId = defaultVenueId()
  const order = repo.listBotDeliveryOrders(chatId, venueId).find((o) => o.id === orderId)
  await answerCallback(callbackId)
  if (!order) {
    await sendMessage(chatId, tr(session, 'orderHistoryItemGone'))
    return
  }
  const items = order.items.map((i) => `${i.name} ×${i.qty}`).join(', ')
  const text = tr(session, 'myDeliveryDetail', {
    address: order.delivery_address || '—',
    items,
    total: formatMoney(order.total_amount),
    status: orderStatusLabel(session, order.status)
  })
  const rows = []
  if (order.status === 'new') rows.push([[tr(session, 'btnCancelOrder'), `cancelorder:${order.id}`]])
  rows.push([[tr(session, 'btnBackToList'), 'mydeliveries:list']])
  await sendMessage(chatId, text, { reply_markup: inlineKb(rows) })
}

async function notifyStaffOrderCancelled(order) {
  const venueId = defaultVenueId()
  const settings = venueId ? repo.getBotSettings(venueId) : null
  if (!settings?.notify_chat_id || !settings.notify_new_order) return
  await sendMessage(
    settings.notify_chat_id,
    t('ru', 'staffOrderCancelledByGuest', { id: order.id, total: formatMoney(order.total_amount), name: order.client_name || '—', contact: order.client_contact || '—' }),
    { reply_markup: { inline_keyboard: [contactClientRow(order.client_contact, order.bot_chat_id)] } }
  ).catch((e) => console.error('[rovena-bot] staff notify failed', e))
}

async function cancelDeliveryOrder(chatId, session, orderId, callbackId) {
  const venueId = defaultVenueId()
  const order = repo.listBotDeliveryOrders(chatId, venueId).find((o) => o.id === orderId)
  if (!order || order.status !== 'new') {
    await answerCallback(callbackId, tr(session, 'orderCancelNotAllowed'))
    return
  }
  const updated = repo.updateOrder(order.id, { status: 'cancelled' }, 'bot')
  await answerCallback(callbackId)
  await sendMessage(chatId, tr(session, 'orderCancelledByGuest', { id: updated.id }))
  await notifyStaffOrderCancelled(updated)
}

// ---------- Выбор стола ----------

async function showTablePicker(chatId, session) {
  const venueId = defaultVenueId()
  const statuses = venueId ? repo.tableStatuses(venueId) : []
  if (statuses.length === 0) {
    await sendMessage(chatId, tr(session, 'noTables'))
    await showMainMenu(chatId, session)
    return
  }
  const rows = statuses.map((tb) => {
    const emoji = tb.status === 'free' ? '🟢' : tb.status === 'reserved' ? '🟡' : '🔴'
    return [[`${emoji} ${tb.name} (${tb.capacity})`, `tbl:${tb.id}`]]
  })
  await sendMessage(chatId, tr(session, 'chooseTable'), { reply_markup: inlineKb(rows) })
}

// ---------- Заказ: тип и корзина ----------

async function startOrder(chatId, session) {
  session.cart = []
  session.tableId = null
  session.deliveryAddress = null
  session.bookingOnly = false
  session.step = 'order_type'
  await sendMessage(chatId, tr(session, 'orderTypePrompt'), {
    reply_markup: inlineKb([[[tr(session, 'btnDineIn'), 'otype:dinein'], [tr(session, 'btnDelivery'), 'otype:delivery']]])
  })
}

async function startBookingEntry(chatId, session) {
  session.cart = []
  session.tableId = null
  session.deliveryAddress = null
  session.step = 'book_choice'
  await sendMessage(chatId, tr(session, 'bookOnlyOrOrderPrompt'), {
    reply_markup: inlineKb([
      [[tr(session, 'btnBookWithOrder'), 'book:withorder'], [tr(session, 'btnBookOnly'), 'book:only']]
    ])
  })
}

function categoryListView(session) {
  const venueId = defaultVenueId()
  const categories = repo.listCategories(venueId)
  const items = repo.listMenuItems(venueId, { activeOnly: true })
  const withItems = categories.filter((c) => items.some((i) => i.category_id === c.id))
  const rows = withItems.map((c) => [[c.name, `cat:${c.id}`]])
  if (session.cart.length) rows.push([[tr(session, 'btnCartDone', { count: cartCount(session) }), 'cart:done']])
  return { text: tr(session, 'menuTitle'), keyboard: inlineKb(rows), empty: withItems.length === 0 }
}

function categoryItemsView(session, categoryId) {
  const venueId = defaultVenueId()
  const cat = repo.listCategories(venueId).find((c) => c.id === categoryId)
  const items = repo.listMenuItems(venueId, { activeOnly: true }).filter((i) => i.category_id === categoryId)
  const rows = items.map((i) => [[`${i.name} — ${formatMoney(i.price)}`, `item:${i.id}`]])
  rows.push([[tr(session, 'btnCategories'), 'cart:categories']])
  if (session.cart.length) rows.push([[tr(session, 'btnCartDone', { count: cartCount(session) }), 'cart:done']])
  return { text: tr(session, 'categoryPrompt', { category: cat?.name || '' }), keyboard: inlineKb(rows) }
}

async function openMenuBrowsing(chatId, session) {
  const view = categoryListView(session)
  if (view.empty) {
    await sendMessage(chatId, tr(session, 'noMenu'))
    await showMainMenu(chatId, session)
    return
  }
  session.currentCategoryId = null
  session.step = 'order_menu'
  const sent = await sendMessage(chatId, view.text, { reply_markup: view.keyboard })
  session.menuMessageId = sent.message_id
}

async function renderCurrentMenuView(chatId, session) {
  const view = session.currentCategoryId ? categoryItemsView(session, session.currentCategoryId) : categoryListView(session)
  await editMessageText(chatId, session.menuMessageId, view.text, { reply_markup: view.keyboard })
}

async function addToCartAndRefresh(chatId, session, itemId, callbackId) {
  const venueId = defaultVenueId()
  const item = repo.listMenuItems(venueId).find((i) => i.id === itemId)
  if (!item) {
    await answerCallback(callbackId)
    return
  }
  const existing = session.cart.find((c) => c.menu_item_id === item.id)
  if (existing) existing.qty += 1
  else session.cart.push({ menu_item_id: item.id, name: item.name, price: item.price, qty: 1 })
  await answerCallback(callbackId, tr(session, 'cartAdded', { name: item.name, qty: existing ? existing.qty : 1 }))
  await renderCurrentMenuView(chatId, session)
}

// ---------- Время прибытия / доставки ----------

async function promptTime(chatId, session) {
  session.step = 'order_time'
  await sendMessage(chatId, tr(session, 'timePrompt'), {
    reply_markup: inlineKb([
      [[tr(session, 'btnTimeNow'), 'time:now']],
      [[tr(session, 'btnTimeIn30'), 'time:30'], [tr(session, 'btnTimeIn60'), 'time:60']],
      [[tr(session, 'btnTimeIn120'), 'time:120']],
      [[tr(session, 'btnTimeCustom'), 'time:custom']]
    ])
  })
}

async function handleCustomTime(chatId, session, text) {
  const m = text.match(/^(\d{1,2}):(\d{2})$/)
  const hh = m ? Number(m[1]) : NaN
  const mm = m ? Number(m[2]) : NaN
  if (!m || hh > 23 || mm > 59) {
    await sendMessage(chatId, tr(session, 'timeCustomBad'))
    return
  }
  const now = new Date()
  const arrival = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm)
  if (arrival < now) arrival.setDate(arrival.getDate() + 1)
  session.arrivalIso = arrival.toISOString()
  await proceedAfterTimeChosen(chatId, session)
}

/**
 * Проверка брони: занят ли выбранный стол на выбранное время (или прямо
 * сейчас, если гость выбрал «Сейчас»). Для доставки/брони без стола не нужна.
 */
async function checkTableConflict(session) {
  if (session.orderMode === 'delivery' || !session.tableId) return null
  if (session.arrivalIso) {
    return repo.findBookingConflict(session.tableId, session.arrivalIso)
  }
  const venueId = defaultVenueId()
  const statuses = repo.tableStatuses(venueId)
  const tb = statuses.find((t) => t.id === session.tableId)
  return tb && tb.status === 'occupied' ? { conflictNow: true } : null
}

async function proceedAfterTimeChosen(chatId, session) {
  const conflict = await checkTableConflict(session)
  if (conflict) {
    const message = conflict.conflictNow
      ? tr(session, 'tableConflictNowMessage')
      : tr(session, 'tableConflictMessage', { time: formatTimeLabel(conflict.date_from) })
    await sendMessage(chatId, message, {
      reply_markup: inlineKb([
        [[tr(session, 'btnPickAnotherTime'), 'conflict:time']],
        [[tr(session, 'btnPickAnotherTable'), 'conflict:table']]
      ])
    })
    return
  }
  await showConfirm(chatId, session)
}

// ---------- Подтверждение и создание брони/заказа ----------

async function showConfirm(chatId, session) {
  session.step = session.bookingOnly ? 'book_confirm' : 'order_confirm'
  const venueId = defaultVenueId()
  const botSettings = venueId ? repo.getBotSettings(venueId) : null

  let text = session.bookingOnly ? tr(session, 'bookingConfirmTitle') : tr(session, 'orderConfirmTitle')
  text +=
    '\n' +
    (session.orderMode === 'delivery'
      ? tr(session, 'orderConfirmDelivery', { address: session.deliveryAddress })
      : tr(session, 'orderConfirmTable', { table: session.tableName }))

  const timeLabel = session.arrivalIso ? formatTimeLabel(session.arrivalIso) : tr(session, 'orderConfirmTimeNow')
  text += '\n' + tr(session, 'orderConfirmTime', { time: timeLabel })

  if (!session.bookingOnly) {
    const lines = session.cart.map((c) => `${c.name} ×${c.qty} — ${formatMoney(c.price * c.qty)}`).join('\n')
    const total = session.cart.reduce((sum, c) => sum + c.price * c.qty, 0)
    text += '\n\n' + tr(session, 'cartSummary', { lines, total: formatMoney(total) })
    text += '\n' + (botSettings?.payment_qr ? tr(session, 'orderConfirmPaymentQr') : tr(session, 'orderConfirmPayment'))
  }

  await sendMessage(chatId, text, {
    reply_markup: inlineKb([[[tr(session, 'btnConfirm'), 'confirm:yes'], [tr(session, 'btnCancel'), 'confirm:no']]])
  })
  if (!session.bookingOnly && botSettings?.payment_qr) {
    await sendPaymentQr(chatId, botSettings.payment_qr)
  }
}

async function notifyStaffNewBooking(booking) {
  const venueId = defaultVenueId()
  const settings = venueId ? repo.getBotSettings(venueId) : null
  if (!settings?.notify_chat_id || !settings.notify_new_booking) return
  const table = repo.listTables(venueId).find((tb) => tb.id === booking.table_id)
  await sendMessage(
    settings.notify_chat_id,
    t('ru', 'staffNewBooking', {
      table: table?.name || '—',
      time: formatTimeLabel(booking.date_from),
      name: booking.client_name || '—',
      contact: booking.client_contact || '—'
    }),
    { reply_markup: { inline_keyboard: [contactClientRow(booking.client_contact, booking.bot_chat_id)] } }
  ).catch((e) => console.error('[rovena-bot] staff notify failed', e))
}

async function notifyStaffNewOrder(order, name, contact) {
  const venueId = defaultVenueId()
  const settings = venueId ? repo.getBotSettings(venueId) : null
  if (!settings?.notify_chat_id || !settings.notify_new_order) return
  await sendMessage(
    settings.notify_chat_id,
    t('ru', 'staffNewOrder', { id: order.id, total: formatMoney(order.total_amount), name: name || '—', contact: contact || '—' }),
    { reply_markup: { inline_keyboard: [contactClientRow(contact, order.bot_chat_id)] } }
  ).catch((e) => console.error('[rovena-bot] staff notify failed', e))
}

async function finalizeConfirm(chatId, session, callbackId) {
  const venueId = defaultVenueId()
  const customer = repo.getBotCustomer(chatId)
  const clientName = customer?.full_name || null
  const clientContact = customer?.phone || String(chatId)

  if (session.bookingOnly) {
    const dateFrom = session.arrivalIso || new Date().toISOString()
    const booking = repo.createBooking(
      venueId,
      {
        source: 'bot',
        client_name: clientName,
        client_contact: clientContact,
        table_id: session.tableId,
        date_from: dateFrom,
        status: 'new',
        bot_chat_id: chatId
      },
      'bot'
    )
    await answerCallback(callbackId)
    await sendMessage(
      chatId,
      tr(session, 'bookingCreated', { time: session.arrivalIso ? formatTimeLabel(session.arrivalIso) : tr(session, 'orderConfirmTimeNow') })
    )
    await notifyStaffNewBooking(booking)
  } else {
    let bookingId = null
    if (session.orderMode === 'dinein' && session.arrivalIso) {
      const booking = repo.createBooking(
        venueId,
        {
          source: 'bot',
          client_name: clientName,
          client_contact: clientContact,
          table_id: session.tableId,
          date_from: session.arrivalIso,
          status: 'new',
          bot_chat_id: chatId
        },
        'bot'
      )
      bookingId = booking.id
      await notifyStaffNewBooking(booking)
    }
    const openShift = repo.getOpenShift(venueId) ?? null
    const order = repo.createOrder(
      venueId,
      {
        shift_id: openShift ? openShift.id : null,
        source: 'bot',
        delivery: session.orderMode === 'delivery' ? 1 : 0,
        delivery_address: session.orderMode === 'delivery' ? session.deliveryAddress : null,
        client_name: clientName,
        client_contact: clientContact,
        table_id: session.orderMode === 'dinein' ? session.tableId : null,
        booking_id: bookingId,
        payment_method: 'cash',
        bot_chat_id: chatId,
        items: session.cart.map((c) => ({ menu_item_id: c.menu_item_id, name: c.name, qty: c.qty, price: c.price }))
      },
      'bot'
    )
    await answerCallback(callbackId)
    const timeLabel = session.arrivalIso ? formatTimeLabel(session.arrivalIso) : tr(session, 'orderConfirmTimeNow')
    await sendMessage(
      chatId,
      bookingId
        ? tr(session, 'bookingWithOrderCreated', { id: order.id, time: timeLabel })
        : tr(session, 'orderCreated', { id: order.id })
    )
    await notifyStaffNewOrder(order, clientName, clientContact)
  }
  await showMainMenu(chatId, session)
}

// ---------- Роутинг сообщений ----------

async function tryHandleQuickButton(chatId, session, text) {
  if (text === tr(session, 'btnOrder')) {
    await startOrder(chatId, session)
    return true
  }
  if (text === tr(session, 'btnBook')) {
    await startBookingEntry(chatId, session)
    return true
  }
  if (text === tr(session, 'btnTables')) {
    await showTables(chatId, session)
    return true
  }
  if (text === tr(session, 'btnMenu')) {
    await showMenuReadonly(chatId, session)
    return true
  }
  if (text === tr(session, 'btnHistory')) {
    await showOrderHistory(chatId, session)
    return true
  }
  if (text === tr(session, 'btnMyBookings')) {
    await showMyBookings(chatId, session)
    return true
  }
  if (text === tr(session, 'btnMyDeliveries')) {
    await showMyDeliveries(chatId, session)
    return true
  }
  if (text === tr(session, 'btnRegister')) {
    await startRegistration(chatId, session)
    return true
  }
  if (text === tr(session, 'btnLang')) {
    session.step = 'lang'
    await sendLangPrompt(chatId)
    return true
  }
  if (text === tr(session, 'btnHelp')) {
    await sendMessage(chatId, tr(session, 'instructions'))
    return true
  }
  return false
}

async function handleMessage(msg) {
  const chatId = String(msg.chat.id)
  const session = getSession(chatId)
  const text = msg.text?.trim()

  if (text === '/start') {
    const customer = repo.getBotCustomer(chatId)
    if (!customer) {
      session.step = 'lang'
      await sendLangPrompt(chatId)
    } else {
      session.lang = customer.language
      await sendMessage(chatId, tr(session, 'instructions'))
      await showMainMenu(chatId, session)
    }
    return
  }
  if (text === '/id') {
    await sendMessage(chatId, t('ru', 'idCommand', { chatId }))
    return
  }
  if (msg.contact && session.step === 'reg_phone') {
    await finishRegistration(chatId, session, msg.contact.phone_number)
    return
  }
  if (msg.location && session.step === 'order_delivery_address') {
    const { latitude, longitude } = msg.location
    session.deliveryAddress = `📍 https://maps.google.com/?q=${latitude},${longitude}`
    await sendMessage(chatId, tr(session, 'locationReceived'))
    await openMenuBrowsing(chatId, session)
    return
  }
  if (!text) return

  // "lang" сознательно НЕ исключён здесь (был баг): если гость нажал "🌐 Язык",
  // это открывает инлайн-выбор языка отдельным сообщением, но старая клавиатура
  // снизу экрана никуда не девается — если гость вместо инлайн-кнопки нажмёт
  // старую кнопку меню, бот должен её выполнить, а не зависнуть в шаге "lang"
  // навсегда, отвечая "не понял" на любое следующее нажатие.
  if (session.step !== 'reg_name' && session.step !== 'reg_phone') {
    if (await tryHandleQuickButton(chatId, session, text)) return
  }

  switch (session.step) {
    case 'reg_name':
      session.regName = text
      await askPhone(chatId, session)
      return
    case 'reg_phone':
      await finishRegistration(chatId, session, text)
      return
    case 'order_delivery_address':
      session.deliveryAddress = text
      await openMenuBrowsing(chatId, session)
      return
    case 'order_time_custom':
      await handleCustomTime(chatId, session, text)
      return
    case 'booking_cancel_reason':
      await finalizeCancelBooking(chatId, session, text)
      return
    default:
      await sendMessage(chatId, tr(session, 'unknownCommand'))
  }
}

async function handleCallback(cb) {
  const chatId = String(cb.message.chat.id)
  const session = getSession(chatId)
  const [prefix, value] = (cb.data || '').split(':')

  if (prefix === 'lang') {
    session.lang = value
    repo.upsertBotCustomer(chatId, { language: value })
    await answerCallback(cb.id, tr(session, 'langSet'))
    await sendMessage(chatId, tr(session, 'instructions'))
    await showMainMenu(chatId, session)
    return
  }

  if (prefix === 'reg') {
    await answerCallback(cb.id)
    if (value === 'update') {
      session.step = 'reg_name'
      await sendMessage(chatId, tr(session, 'regAskName'), { reply_markup: { remove_keyboard: true } })
    } else {
      await showMainMenu(chatId, session)
    }
    return
  }

  if (prefix === 'otype') {
    session.orderMode = value
    await answerCallback(cb.id)
    if (value === 'dinein') {
      session.step = 'order_table'
      await showTablePicker(chatId, session)
    } else {
      session.step = 'order_delivery_address'
      await sendMessage(chatId, tr(session, 'askDeliveryAddress'), {
        reply_markup: {
          keyboard: [[{ text: tr(session, 'btnShareLocation'), request_location: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      })
    }
    return
  }

  if (prefix === 'book') {
    session.orderMode = 'dinein'
    session.bookingOnly = value !== 'withorder'
    session.step = 'order_table'
    await answerCallback(cb.id)
    await showTablePicker(chatId, session)
    return
  }

  if (prefix === 'tbl') {
    const venueId = defaultVenueId()
    const id = Number(value)
    const table = repo.listTables(venueId).find((tb) => tb.id === id)
    session.tableId = id
    session.tableName = table?.name || '—'
    await answerCallback(cb.id)
    if (session.bookingOnly) await promptTime(chatId, session)
    else await openMenuBrowsing(chatId, session)
    return
  }

  if (prefix === 'cat') {
    session.currentCategoryId = Number(value)
    await answerCallback(cb.id)
    await renderCurrentMenuView(chatId, session)
    return
  }

  if (prefix === 'item') {
    await addToCartAndRefresh(chatId, session, Number(value), cb.id)
    return
  }

  if (prefix === 'cart') {
    if (value === 'categories') {
      session.currentCategoryId = null
      await answerCallback(cb.id)
      await renderCurrentMenuView(chatId, session)
    } else if (value === 'done') {
      if (session.cart.length === 0) {
        await answerCallback(cb.id, tr(session, 'emptyCartError'))
        return
      }
      await answerCallback(cb.id)
      if (session.orderMode === 'delivery') {
        session.arrivalIso = null
        await showConfirm(chatId, session)
      } else {
        await promptTime(chatId, session)
      }
    }
    return
  }

  if (prefix === 'time') {
    await answerCallback(cb.id)
    if (value === 'custom') {
      session.step = 'order_time_custom'
      await sendMessage(chatId, tr(session, 'timeCustomAsk'))
      return
    }
    session.arrivalIso = value === 'now' ? null : new Date(Date.now() + Number(value) * 60000).toISOString()
    await proceedAfterTimeChosen(chatId, session)
    return
  }

  if (prefix === 'conflict') {
    await answerCallback(cb.id)
    if (value === 'time') await promptTime(chatId, session)
    else await showTablePicker(chatId, session)
    return
  }

  if (prefix === 'confirm') {
    if (value === 'yes') {
      await finalizeConfirm(chatId, session, cb.id)
    } else {
      await answerCallback(cb.id)
      await sendMessage(chatId, tr(session, 'cancelled'))
      await showMainMenu(chatId, session)
    }
    return
  }

  if (prefix === 'repeat') {
    await repeatOrder(chatId, session, Number(value), cb.id)
    return
  }

  if (prefix === 'mybookings') {
    await answerCallback(cb.id)
    await showMyBookings(chatId, session)
    return
  }

  if (prefix === 'mybooking') {
    await showMyBookingDetail(chatId, session, Number(value), cb.id)
    return
  }

  if (prefix === 'cancelbooking') {
    await askCancelReason(chatId, session, Number(value), cb.id)
    return
  }

  if (prefix === 'cancelreason') {
    await answerCallback(cb.id)
    await finalizeCancelBooking(chatId, session, null)
    return
  }

  if (prefix === 'mydeliveries') {
    await answerCallback(cb.id)
    await showMyDeliveries(chatId, session)
    return
  }

  if (prefix === 'mydelivery') {
    await showMyDeliveryDetail(chatId, session, Number(value), cb.id)
    return
  }

  if (prefix === 'cancelorder') {
    await cancelDeliveryOrder(chatId, session, Number(value), cb.id)
    return
  }

  await answerCallback(cb.id)
}

async function handleUpdate(update) {
  try {
    if (update.callback_query) await handleCallback(update.callback_query)
    else if (update.message) await handleMessage(update.message)
  } catch (e) {
    console.error('[rovena-bot] handleUpdate error', e)
  }
}

// ---------- Напоминания о брони (за N минут до прихода, см. Подключения → Бот) ----------

async function checkReminders() {
  try {
    const venueId = defaultVenueId()
    if (!venueId) return
    const settings = repo.getBotSettings(venueId)
    const minutes = settings?.reminder_minutes_before || 0
    if (!minutes) return
    const due = repo.findBookingsDueForReminder(minutes)
    for (const booking of due) {
      const customer = repo.getBotCustomer(booking.bot_chat_id)
      const lang = customer?.language || 'ru'
      await sendMessage(
        booking.bot_chat_id,
        t(lang, 'reminderMessage', { time: formatTimeLabel(booking.date_from), table: booking.table_name || '—' })
      ).catch(() => {})
      repo.markBookingReminderSent(booking.id)
    }
  } catch (e) {
    console.error('[rovena-bot] reminder check failed', e)
  }
}

// ---------- Уведомление гостя об изменении статуса заказа/брони (вызывается из ipcHandlers) ----------

export async function notifyOrderStatus(order, status) {
  if (!running || !order?.bot_chat_id) return
  const customer = repo.getBotCustomer(order.bot_chat_id)
  const lang = customer?.language || 'ru'
  const key =
    status === 'done'
      ? 'statusUpdateDone'
      : status === 'cancelled'
        ? 'statusUpdateCancelled'
        : status === 'processing'
          ? 'statusUpdateProcessing'
          : null
  if (!key) return
  await sendMessage(order.bot_chat_id, t(lang, key, { id: order.id })).catch((e) =>
    console.error('[rovena-bot] notifyOrderStatus failed', e)
  )
}

export async function notifyBookingStatus(booking, status) {
  if (!running || !booking?.bot_chat_id) return
  const customer = repo.getBotCustomer(booking.bot_chat_id)
  const lang = customer?.language || 'ru'
  const key = status === 'confirmed' ? 'bookingConfirmedNotice' : status === 'cancelled' ? 'bookingCancelledNotice' : null
  if (!key) return
  await sendMessage(booking.bot_chat_id, t(lang, key, { time: formatTimeLabel(booking.date_from) })).catch((e) =>
    console.error('[rovena-bot] notifyBookingStatus failed', e)
  )
}

// ---------- Управление ботом ----------

async function pollLoop() {
  while (running) {
    pollAbort = new AbortController()
    try {
      const updates = await callApi('getUpdates', { offset, timeout: 25 })
      for (const u of updates) {
        offset = u.update_id + 1
        await handleUpdate(u)
      }
      lastError = null
    } catch (e) {
      if (!running) break
      lastError = e.message
      console.error('[rovena-bot] poll error', e)
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
}

export async function startBot(token) {
  if (running) return getBotStatus()
  if (!token) throw new Error('missing_token')
  botToken = token
  const me = await callApi('getMe')
  botUsername = me.username
  running = true
  offset = 0
  lastError = null
  sessions.clear()
  pollLoop()
  reminderInterval = setInterval(checkReminders, REMINDER_CHECK_MS)
  repo.updateConnection('rovena_bot', { enabled: 1, status: 'online' }, 'crm-admin')
  return getBotStatus()
}

export function stopBot() {
  if (!running) return getBotStatus()
  running = false
  pollAbort?.abort()
  if (reminderInterval) clearInterval(reminderInterval)
  reminderInterval = null
  botUsername = null
  repo.updateConnection('rovena_bot', { enabled: 0, status: 'offline' }, 'crm-admin')
  return getBotStatus()
}

export function getBotStatus() {
  return { running, username: botUsername, lastError }
}
