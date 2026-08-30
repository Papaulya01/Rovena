import { getDb } from './db.js'

/**
 * Единый слой бизнес-логики поверх SQLite. И IPC-хендлеры (сама CRM), и
 * встроенный HTTP-сервер (Staff), и бот — все вызывают одни и те же функции,
 * а не дублируют SQL каждый по-своему (см. ТЗ, раздел "Архитектурные решения").
 *
 * Мультиточечность (27.08.2026): почти все функции ниже принимают venueId
 * первым аргументом и фильтруют/проставляют его явно — venueId передаётся
 * вызывающей стороной (ipcHandlers берёт его из текущей сессии, server.js —
 * из того, какой API-ключ заведения использован в запросе), а не читается
 * из общего изменяемого состояния — так безопаснее при параллельных запросах
 * от разных заведений через встроенный сервер.
 */

export function logAudit(entity, entityId, action, author, details) {
  const db = getDb()
  db.prepare(
    `INSERT INTO audit_log (entity, entity_id, action, author, details) VALUES (?, ?, ?, ?, ?)`
  ).run(entity, entityId ?? null, action, author || 'system', details ? JSON.stringify(details) : null)
}

// ---------- Venues (заведения) ----------

export function listVenues() {
  return getDb().prepare(`SELECT * FROM venues ORDER BY sort_order, name`).all()
}

export function getVenue(id) {
  return getDb().prepare(`SELECT * FROM venues WHERE id = ?`).get(id)
}

export function createVenue(payload) {
  const db = getDb()
  const info = db
    .prepare(`INSERT INTO venues (name, is_active, sort_order) VALUES (@name, @is_active, @sort_order)`)
    .run({ is_active: 1, sort_order: 0, ...payload })
  return db.prepare(`SELECT * FROM venues WHERE id = ?`).get(info.lastInsertRowid)
}

export function updateVenue(id, payload) {
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return getVenue(id)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE venues SET ${setClause} WHERE id = @id`).run({ id, ...payload })
  return getVenue(id)
}

export function getVenueByStaffKey(apiKey) {
  if (!apiKey) return null
  return getDb().prepare(`SELECT * FROM venues WHERE staff_api_key = ? AND is_active = 1`).get(apiKey)
}

// ---------- Employees (сотрудники и график — отдельно от логинов users) ----------

export function listEmployees(venueId) {
  return getDb().prepare(`SELECT * FROM employees WHERE venue_id = ? ORDER BY full_name`).all(venueId)
}

export function createEmployee(venueId, payload) {
  const db = getDb()
  const info = db
    .prepare(`
      INSERT INTO employees (venue_id, full_name, position, phone, salary_type, salary_rate, hired_at, is_active, user_id)
      VALUES (@venue_id, @full_name, @position, @phone, @salary_type, @salary_rate, @hired_at, @is_active, @user_id)
    `)
    .run({
      venue_id: venueId,
      position: 'cashier',
      phone: null,
      salary_type: 'fixed',
      salary_rate: 0,
      hired_at: null,
      is_active: 1,
      user_id: null,
      ...payload
    })
  return db.prepare(`SELECT * FROM employees WHERE id = ?`).get(info.lastInsertRowid)
}

export function updateEmployee(id, payload) {
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE employees SET ${setClause} WHERE id = @id`).run({ id, ...payload })
  return db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id)
}

export function deleteEmployee(id) {
  getDb().prepare(`DELETE FROM employees WHERE id = ?`).run(id)
  return { id }
}

export function listShiftSchedule(venueId, { from, to } = {}) {
  const db = getDb()
  const params = { venue_id: venueId }
  let range = ''
  if (from) {
    range += ' AND s.work_date >= @from'
    params.from = from
  }
  if (to) {
    range += ' AND s.work_date <= @to'
    params.to = to
  }
  return db
    .prepare(`
      SELECT s.*, e.full_name, e.position
      FROM shift_schedule s JOIN employees e ON e.id = s.employee_id
      WHERE s.venue_id = @venue_id ${range}
      ORDER BY s.work_date, s.start_time
    `)
    .all(params)
}

export function createScheduleEntry(venueId, payload) {
  const db = getDb()
  const info = db
    .prepare(`
      INSERT INTO shift_schedule (venue_id, employee_id, work_date, start_time, end_time, note)
      VALUES (@venue_id, @employee_id, @work_date, @start_time, @end_time, @note)
    `)
    .run({ venue_id: venueId, start_time: null, end_time: null, note: null, ...payload })
  return db.prepare(`SELECT * FROM shift_schedule WHERE id = ?`).get(info.lastInsertRowid)
}

export function updateScheduleEntry(id, payload) {
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return db.prepare(`SELECT * FROM shift_schedule WHERE id = ?`).get(id)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE shift_schedule SET ${setClause} WHERE id = @id`).run({ id, ...payload })
  return db.prepare(`SELECT * FROM shift_schedule WHERE id = ?`).get(id)
}

export function deleteScheduleEntry(id) {
  getDb().prepare(`DELETE FROM shift_schedule WHERE id = ?`).run(id)
  return { id }
}

// ---------- Bookings ----------

export function listBookings(venueId) {
  return getDb()
    .prepare(
      `SELECT b.*, t.name as table_name, t.capacity as table_capacity
       FROM bookings b LEFT JOIN tables t ON t.id = b.table_id
       WHERE b.venue_id = ?
       ORDER BY b.date_from DESC`
    )
    .all(venueId)
}

/**
 * Брони от бота (bot_chat_id заполнен), время которых уже попало в окно
 * напоминания, но напоминание ещё не отправлялось — для периодической
 * проверки в bot.js. Сравнение дат в JS по той же причине, что и в tableStatuses.
 */
export function findBookingsDueForReminder(minutesBefore) {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT b.*, t.name as table_name
       FROM bookings b LEFT JOIN tables t ON t.id = b.table_id
       WHERE b.bot_chat_id IS NOT NULL AND b.reminder_sent = 0 AND b.status IN ('new', 'confirmed')`
    )
    .all()
  const now = Date.now()
  return rows.filter((b) => {
    const from = new Date(b.date_from).getTime()
    if (Number.isNaN(from)) return false
    const minutesLeft = (from - now) / 60000
    return minutesLeft > 0 && minutesLeft <= minutesBefore
  })
}

export function markBookingReminderSent(id) {
  getDb().prepare(`UPDATE bookings SET reminder_sent = 1 WHERE id = ?`).run(id)
}

/**
 * Есть ли на этом столе уже бронь, чьё условное окно (durationMinutes от
 * date_from, если date_to не указан) пересекается с запрошенным временем —
 * для проверки перед созданием новой брони в боте. Возвращает конфликтующую
 * бронь или null.
 */
export function findBookingConflict(tableId, dateFromIso, durationMinutes = 120) {
  if (!tableId) return null
  const db = getDb()
  const candidates = db
    .prepare(`SELECT * FROM bookings WHERE table_id = ? AND status IN ('new', 'confirmed')`)
    .all(tableId)
  const start = new Date(dateFromIso).getTime()
  if (Number.isNaN(start)) return null
  const end = start + durationMinutes * 60000
  for (const b of candidates) {
    const bStart = new Date(b.date_from).getTime()
    if (Number.isNaN(bStart)) continue
    const bEnd = b.date_to ? new Date(b.date_to).getTime() : bStart + durationMinutes * 60000
    if (start < bEnd && bStart < end) return b
  }
  return null
}

/** Активные (не отменённые/не прошедшие) брони этого гостя бота — для «Мои брони» и отмены. */
export function listBotBookings(chatId, venueId) {
  const db = getDb()
  return db
    .prepare(
      `SELECT b.*, t.name as table_name
       FROM bookings b LEFT JOIN tables t ON t.id = b.table_id
       WHERE b.bot_chat_id = ? AND b.venue_id = ? AND b.status IN ('new', 'confirmed')
       ORDER BY b.date_from ASC`
    )
    .all(String(chatId), venueId)
}

/** История заказов этого гостя бота (для «Повторить заказ»), последние — первыми. */
export function listBotOrderHistory(chatId, venueId, limit = 10) {
  const db = getDb()
  const orders = db
    .prepare(
      `SELECT o.*, t.name as table_name
       FROM orders o LEFT JOIN tables t ON t.id = o.table_id
       WHERE o.bot_chat_id = ? AND o.venue_id = ? AND o.status != 'cancelled'
       ORDER BY o.created_at DESC
       LIMIT ?`
    )
    .all(String(chatId), venueId, limit)
  const itemsStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`)
  return orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) }))
}

// ---------- Tables (зал) ----------

export function listTables(venueId, { activeOnly = false } = {}) {
  const db = getDb()
  const activeClause = activeOnly ? 'AND is_active = 1' : ''
  return db.prepare(`SELECT * FROM tables WHERE venue_id = ? ${activeClause} ORDER BY sort_order, name`).all(venueId)
}

export function createTable(venueId, payload) {
  const db = getDb()
  const info = db
    .prepare(`
      INSERT INTO tables (venue_id, name, capacity, zone, is_active, sort_order)
      VALUES (@venue_id, @name, @capacity, @zone, @is_active, @sort_order)
    `)
    .run({ venue_id: venueId, capacity: 2, zone: null, is_active: 1, sort_order: 0, ...payload })
  return db.prepare(`SELECT * FROM tables WHERE id = ?`).get(info.lastInsertRowid)
}

export function updateTable(id, payload) {
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return db.prepare(`SELECT * FROM tables WHERE id = ?`).get(id)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE tables SET ${setClause} WHERE id = @id`).run({ id, ...payload })
  return db.prepare(`SELECT * FROM tables WHERE id = ?`).get(id)
}

export function deleteTable(id) {
  getDb().prepare(`DELETE FROM tables WHERE id = ?`).run(id)
  return { id }
}

/**
 * Живой статус каждого стола прямо сейчас: свободен / забронирован (сегодня
 * позже) / занят (бронь идёт прямо сейчас, или на столе открыт заказ).
 * Сравнение дат делается в JS — date_from/date_to хранятся в формате
 * <input type="datetime-local"> ("2026-09-01T18:00"), а не в формате,
 * который SQLite сравнивает нативно.
 */
export function tableStatuses(venueId) {
  const db = getDb()
  const tables = db.prepare(`SELECT * FROM tables WHERE venue_id = ? AND is_active = 1 ORDER BY sort_order, name`).all(venueId)
  const bookingsStmt = db.prepare(`
    SELECT * FROM bookings
    WHERE table_id = ? AND status IN ('new', 'confirmed')
    ORDER BY date_from ASC
  `)
  // Открытые заказы на стол — то, что «готовится»/подано и ещё не закрыто (не done/cancelled).
  const openOrdersStmt = db.prepare(`
    SELECT * FROM orders
    WHERE table_id = ? AND status IN ('new', 'processing')
    ORDER BY created_at ASC
  `)
  const itemsStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`)

  const now = new Date()
  const soonCutoff = new Date(now.getTime() + 6 * 3600000) // «скоро» — в пределах ближайших 6 часов

  return tables.map((table) => {
    const bookings = bookingsStmt.all(table.id)
    let current = null
    let next = null
    for (const b of bookings) {
      const from = new Date(b.date_from)
      const to = b.date_to ? new Date(b.date_to) : null
      if (Number.isNaN(from.getTime())) continue
      if (from <= now && (!to || to >= now)) {
        current = current || b
      } else if (from > now && from <= soonCutoff && !next) {
        next = b
      }
    }

    const openOrders = openOrdersStmt.all(table.id).map((o) => ({ ...o, items: itemsStmt.all(o.id) }))
    const orderTotal = openOrders.reduce((sum, o) => sum + o.total_amount, 0)

    // Открытый заказ на столе — тоже «занят», даже если формальной брони не было
    // (гость сел без предварительной брони, Staff сразу пробил заказ).
    const status = current || openOrders.length > 0 ? 'occupied' : next ? 'reserved' : 'free'
    return { ...table, status, current, next, openOrders, orderTotal }
  })
}

export function createBooking(venueId, payload, author) {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO bookings (venue_id, source, client_name, client_contact, table_id, purpose, date_from, date_to, status, comment, bot_chat_id)
    VALUES (@venue_id, @source, @client_name, @client_contact, @table_id, @purpose, @date_from, @date_to, @status, @comment, @bot_chat_id)
  `)
  const info = stmt.run({
    venue_id: venueId,
    source: 'crm',
    status: 'new',
    comment: null,
    purpose: null,
    date_to: null,
    client_name: null,
    client_contact: null,
    table_id: null,
    bot_chat_id: null,
    ...payload
  })
  logAudit('booking', info.lastInsertRowid, 'create', author, payload)
  return db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(info.lastInsertRowid)
}

export function updateBooking(id, payload, author) {
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(id)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE bookings SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
    id,
    ...payload
  })
  logAudit('booking', id, 'update', author, payload)
  return db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(id)
}

// ---------- Menu (catalog): категории и позиции, которые CRM отдаёт Staff/Bot ----------

export function listCategories(venueId) {
  return getDb().prepare(`SELECT * FROM categories WHERE venue_id = ? ORDER BY sort_order, name`).all(venueId)
}

export function createCategory(venueId, payload) {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO categories (venue_id, name, color, sort_order) VALUES (@venue_id, @name, @color, @sort_order)`
    )
    .run({ venue_id: venueId, color: null, sort_order: 0, ...payload })
  return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(info.lastInsertRowid)
}

export function updateCategory(id, payload) {
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE categories SET ${setClause} WHERE id = @id`).run({ id, ...payload })
  return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id)
}

export function getGeneralCategory(venueId) {
  return getDb().prepare(`SELECT * FROM categories WHERE venue_id = ? AND is_general = 1`).get(venueId)
}

export function getOrCreateGeneralCategory(venueId, name) {
  const existing = getGeneralCategory(venueId)
  if (existing) return existing
  const db = getDb()
  const info = db
    .prepare(`INSERT INTO categories (venue_id, name, is_general, sort_order) VALUES (?, ?, 1, -1)`)
    .run(venueId, name)
  return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(info.lastInsertRowid)
}

export function moveAllItems(fromCategoryId, toCategoryId) {
  const db = getDb()
  const info = db
    .prepare(`UPDATE menu_items SET category_id = ? WHERE category_id = ?`)
    .run(toCategoryId, fromCategoryId)
  return { moved: info.changes }
}

/**
 * Удаляет категорию. Если в ней есть позиции — сначала переносит их в "Общую"
 * категорию (создаёт при первой необходимости), а не оставляет "без категории".
 * "Общую" категорию, пока в ней есть позиции, удалить нельзя.
 */
export function deleteCategory(id, venueId, generalName) {
  const db = getDb()
  const cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id)
  if (!cat) return { id, movedCount: 0 }
  const itemCount = db.prepare(`SELECT COUNT(*) as c FROM menu_items WHERE category_id = ?`).get(id).c
  if (itemCount > 0) {
    if (cat.is_general) {
      throw new Error('general_category_not_empty')
    }
    const general = getOrCreateGeneralCategory(venueId, generalName)
    moveAllItems(id, general.id)
  }
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(id)
  return { id, movedCount: itemCount }
}

export function listMenuItems(venueId, { activeOnly = false } = {}) {
  const db = getDb()
  const activeClause = activeOnly ? 'AND m.is_active = 1' : ''
  return db
    .prepare(
      `SELECT m.*, c.name as category_name FROM menu_items m
       LEFT JOIN categories c ON c.id = m.category_id
       WHERE m.venue_id = ? ${activeClause}
       ORDER BY c.sort_order, m.sort_order, m.name`
    )
    .all(venueId)
}

export function createMenuItem(venueId, payload) {
  const db = getDb()
  const info = db
    .prepare(`
      INSERT INTO menu_items (venue_id, category_id, name, price, description, image, is_active, sort_order)
      VALUES (@venue_id, @category_id, @name, @price, @description, @image, @is_active, @sort_order)
    `)
    .run({
      venue_id: venueId,
      category_id: null,
      description: null,
      image: null,
      is_active: 1,
      sort_order: 0,
      ...payload
    })
  return db.prepare(`SELECT * FROM menu_items WHERE id = ?`).get(info.lastInsertRowid)
}

export function updateMenuItem(id, payload) {
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return db.prepare(`SELECT * FROM menu_items WHERE id = ?`).get(id)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE menu_items SET ${setClause} WHERE id = @id`).run({ id, ...payload })
  return db.prepare(`SELECT * FROM menu_items WHERE id = ?`).get(id)
}

export function deleteMenuItem(id) {
  getDb().prepare(`DELETE FROM menu_items WHERE id = ?`).run(id)
  return { id }
}

// ---------- Orders ----------

export function listOrdersByShift(shiftId) {
  const db = getDb()
  const orders = db
    .prepare(
      `SELECT o.*, t.name as table_name
       FROM orders o LEFT JOIN tables t ON t.id = o.table_id
       WHERE o.shift_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(shiftId)
  const itemsStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`)
  return orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) }))
}

export function listOrders(venueId) {
  const db = getDb()
  const orders = db
    .prepare(
      `SELECT o.*, t.name as table_name
       FROM orders o LEFT JOIN tables t ON t.id = o.table_id
       WHERE o.venue_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(venueId)
  const itemsStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`)
  return orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) }))
}

export function createOrder(venueId, payload, author) {
  const db = getDb()
  const { items = [], ...orderData } = payload
  const insertOrder = db.prepare(`
    INSERT INTO orders (venue_id, shift_id, source, delivery, client_name, client_contact, status, total_amount, comment, booking_id, table_id, payment_method, delivery_address, bot_chat_id)
    VALUES (@venue_id, @shift_id, @source, @delivery, @client_name, @client_contact, @status, @total_amount, @comment, @booking_id, @table_id, @payment_method, @delivery_address, @bot_chat_id)
  `)
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, name, qty, price) VALUES (?, ?, ?, ?, ?)
  `)
  const insertFinance = db.prepare(`
    INSERT INTO finance_entries (venue_id, type, amount, category, source, order_id, author, comment)
    VALUES (@venue_id, 'income', @amount, 'Заказы', @source, @order_id, @author, @comment)
  `)

  const runTx = db.transaction(() => {
    const info = insertOrder.run({
      venue_id: venueId,
      shift_id: null,
      source: 'crm',
      delivery: 0,
      status: 'new',
      total_amount: 0,
      comment: null,
      booking_id: null,
      table_id: null,
      client_name: null,
      client_contact: null,
      payment_method: 'cash',
      delivery_address: null,
      bot_chat_id: null,
      ...orderData
    })
    const orderId = info.lastInsertRowid
    let total = 0
    for (const item of items) {
      insertItem.run(orderId, item.menu_item_id ?? null, item.name, item.qty ?? 1, item.price ?? 0)
      total += (item.qty ?? 1) * (item.price ?? 0)
    }
    if (total > 0) {
      db.prepare(`UPDATE orders SET total_amount = ? WHERE id = ?`).run(total, orderId)
      insertFinance.run({
        venue_id: venueId,
        amount: total,
        source: orderData.source ?? 'crm',
        order_id: orderId,
        author: author || 'system',
        comment: 'Автосписание по заказу'
      })
    }
    return orderId
  })

  const orderId = runTx()
  logAudit('order', orderId, 'create', author, payload)
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId)
  order.items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId)
  return order
}

export function updateOrder(id, payload, author) {
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE orders SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
    id,
    ...payload
  })
  logAudit('order', id, 'update', author, payload)
  return db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id)
}

// ---------- Аналитика: продажи по блюдам и доставка (см. «Бухгалтерия → Аналитика») ----------

/** Сколько продано и на какую сумму по каждому блюду (по позициям заказов, не считая отменённых заказов). */
export function getDishAnalytics(venueId, { from, to } = {}) {
  const db = getDb()
  const params = { venue_id: venueId }
  let range = ''
  if (from) {
    range += ' AND o.created_at >= @from'
    params.from = from
  }
  if (to) {
    range += ' AND o.created_at <= @to'
    params.to = to + ' 23:59:59'
  }
  return db
    .prepare(
      `SELECT oi.menu_item_id, oi.name, c.name as category_name,
              SUM(oi.qty) as total_qty, SUM(oi.qty * oi.price) as total_revenue,
              COUNT(DISTINCT oi.order_id) as order_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN categories c ON c.id = mi.category_id
       WHERE o.venue_id = @venue_id AND o.status != 'cancelled' ${range}
       GROUP BY oi.menu_item_id, oi.name
       ORDER BY total_revenue DESC`
    )
    .all(params)
}

/** Заказы в зале vs доставка по дням — для графика и сводки доли доставки. */
export function getDeliveryAnalytics(venueId, { from, to } = {}) {
  const db = getDb()
  const params = { venue_id: venueId }
  let range = ''
  if (from) {
    range += ' AND created_at >= @from'
    params.from = from
  }
  if (to) {
    range += ' AND created_at <= @to'
    params.to = to + ' 23:59:59'
  }
  const rows = db
    .prepare(
      `SELECT date(created_at) as day, delivery, COUNT(*) as cnt, SUM(total_amount) as total
       FROM orders
       WHERE venue_id = @venue_id AND status != 'cancelled' ${range}
       GROUP BY day, delivery
       ORDER BY day`
    )
    .all(params)

  const byDay = new Map()
  for (const r of rows) {
    if (!byDay.has(r.day)) {
      byDay.set(r.day, { day: r.day, deliveryCount: 0, deliveryTotal: 0, dineInCount: 0, dineInTotal: 0 })
    }
    const entry = byDay.get(r.day)
    if (r.delivery) {
      entry.deliveryCount = r.cnt
      entry.deliveryTotal = r.total
    } else {
      entry.dineInCount = r.cnt
      entry.dineInTotal = r.total
    }
  }
  const days = Array.from(byDay.values())
  const totalDelivery = days.reduce((s, d) => s + d.deliveryCount, 0)
  const totalDineIn = days.reduce((s, d) => s + d.dineInCount, 0)
  const totalDeliveryRevenue = days.reduce((s, d) => s + d.deliveryTotal, 0)
  const totalDineInRevenue = days.reduce((s, d) => s + d.dineInTotal, 0)
  return {
    days,
    summary: {
      totalDelivery,
      totalDineIn,
      totalDeliveryRevenue,
      totalDineInRevenue,
      deliveryShare: totalDelivery + totalDineIn > 0 ? totalDelivery / (totalDelivery + totalDineIn) : 0
    }
  }
}

// ---------- Shifts (кассир: открыть/закрыть смену) ----------

export function getOpenShift(venueId) {
  return getDb()
    .prepare(`SELECT * FROM shifts WHERE venue_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`)
    .get(venueId)
}

export function openShift(venueId, { startingCash, userId, userName }) {
  if (getOpenShift(venueId)) throw new Error('shift_already_open')
  const db = getDb()
  const info = db
    .prepare(`
      INSERT INTO shifts (venue_id, opened_by, opened_by_name, starting_cash)
      VALUES (@venue_id, @opened_by, @opened_by_name, @starting_cash)
    `)
    .run({ venue_id: venueId, opened_by: userId, opened_by_name: userName, starting_cash: startingCash || 0 })
  logAudit('shift', info.lastInsertRowid, 'open', userName, { startingCash })
  return db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(info.lastInsertRowid)
}

/** Сводка смены: сколько заказов и на какую сумму пробито за время её работы. */
export function shiftReport(shiftId) {
  const db = getDb()
  const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(shiftId)
  if (!shift) return null
  const orders = db
    .prepare(`SELECT * FROM orders WHERE shift_id = ? AND status != 'cancelled' ORDER BY created_at`)
    .all(shiftId)
  const total = orders.reduce((sum, o) => sum + o.total_amount, 0)
  return { shift, ordersCount: orders.length, total, orders }
}

export function closeShift(shiftId, { endingCash, userId, userName }) {
  const db = getDb()
  const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(shiftId)
  if (!shift || shift.status !== 'open') throw new Error('shift_not_open')
  db.prepare(`
    UPDATE shifts SET status = 'closed', closed_by = @closed_by, closed_by_name = @closed_by_name,
      closed_at = datetime('now'), ending_cash = @ending_cash
    WHERE id = @id
  `).run({ id: shiftId, closed_by: userId, closed_by_name: userName, ending_cash: endingCash || 0 })
  logAudit('shift', shiftId, 'close', userName, { endingCash })
  return shiftReport(shiftId)
}

export function listShifts(venueId) {
  return getDb()
    .prepare(`SELECT * FROM shifts WHERE venue_id = ? ORDER BY opened_at DESC LIMIT 100`)
    .all(venueId)
}

// ---------- Finance ----------

export function listFinance(venueId) {
  return getDb().prepare(`SELECT * FROM finance_entries WHERE venue_id = ? ORDER BY created_at DESC`).all(venueId)
}

export function createFinanceEntry(venueId, payload, author) {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO finance_entries (venue_id, type, amount, category, source, order_id, author, comment)
    VALUES (@venue_id, @type, @amount, @category, @source, @order_id, @author, @comment)
  `)
  const info = stmt.run({
    venue_id: venueId,
    source: 'crm',
    order_id: null,
    author: author || 'crm-admin',
    category: null,
    comment: null,
    ...payload
  })
  logAudit('finance_entry', info.lastInsertRowid, 'create', author, payload)
  return db.prepare(`SELECT * FROM finance_entries WHERE id = ?`).get(info.lastInsertRowid)
}

export function financeSummary(venueId) {
  const db = getDb()
  const income = db
    .prepare(`SELECT COALESCE(SUM(amount),0) as total FROM finance_entries WHERE venue_id = ? AND type = 'income'`)
    .get(venueId).total
  const expense = db
    .prepare(`SELECT COALESCE(SUM(amount),0) as total FROM finance_entries WHERE venue_id = ? AND type = 'expense'`)
    .get(venueId).total
  return { income, expense, balance: income - expense }
}

/** Помесячная сводка доход/расход/баланс за последние `months` месяцев (по умолчанию 12). */
export function financeMonthly(venueId, months = 12) {
  const db = getDb()
  const rows = db
    .prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
      FROM finance_entries
      WHERE venue_id = @venue_id
      GROUP BY month
      ORDER BY month DESC
      LIMIT @months
    `)
    .all({ venue_id: venueId, months })
  return rows.map((r) => ({ ...r, balance: r.income - r.expense })).reverse()
}

/** Разбивка расходов/доходов по категориям за текущий календарный месяц. */
export function financeCategoryBreakdown(venueId, type = 'expense') {
  const db = getDb()
  return db
    .prepare(`
      SELECT COALESCE(category, 'без категории') as category, SUM(amount) as total
      FROM finance_entries
      WHERE venue_id = @venue_id AND type = @type AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
      GROUP BY category
      ORDER BY total DESC
    `)
    .all({ venue_id: venueId, type })
}

// ---------- Налоговые настройки заведения (для отчётов бухгалтерии) ----------

export function getTaxSettings(venueId) {
  const db = getDb()
  let row = db.prepare(`SELECT * FROM tax_settings WHERE venue_id = ?`).get(venueId)
  if (!row) {
    db.prepare(`INSERT INTO tax_settings (venue_id) VALUES (?)`).run(venueId)
    row = db.prepare(`SELECT * FROM tax_settings WHERE venue_id = ?`).get(venueId)
  }
  return row
}

export function updateTaxSettings(venueId, payload) {
  getTaxSettings(venueId) // гарантирует, что строка уже существует
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return getTaxSettings(venueId)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE tax_settings SET ${setClause}, updated_at = datetime('now') WHERE venue_id = @venue_id`).run({
    venue_id: venueId,
    ...payload
  })
  return getTaxSettings(venueId)
}

// ---------- Региональные настройки (часовой пояс/формат времени — для CRM и панели кассира) ----------

export function getRegionalSettings(venueId) {
  const db = getDb()
  let row = db.prepare(`SELECT * FROM regional_settings WHERE venue_id = ?`).get(venueId)
  if (!row) {
    db.prepare(`INSERT INTO regional_settings (venue_id) VALUES (?)`).run(venueId)
    row = db.prepare(`SELECT * FROM regional_settings WHERE venue_id = ?`).get(venueId)
  }
  return row
}

export function updateRegionalSettings(venueId, payload) {
  getRegionalSettings(venueId)
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return getRegionalSettings(venueId)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE regional_settings SET ${setClause} WHERE venue_id = @venue_id`).run({
    venue_id: venueId,
    ...payload
  })
  return getRegionalSettings(venueId)
}

// ---------- Настройки печати чеков (не фискализация — см. комментарий в db.js) ----------

export function getPrinterSettings(venueId) {
  const db = getDb()
  let row = db.prepare(`SELECT * FROM printer_settings WHERE venue_id = ?`).get(venueId)
  if (!row) {
    db.prepare(`INSERT INTO printer_settings (venue_id) VALUES (?)`).run(venueId)
    row = db.prepare(`SELECT * FROM printer_settings WHERE venue_id = ?`).get(venueId)
  }
  return row
}

export function updatePrinterSettings(venueId, payload) {
  getPrinterSettings(venueId)
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return getPrinterSettings(venueId)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE printer_settings SET ${setClause} WHERE venue_id = @venue_id`).run({
    venue_id: venueId,
    ...payload
  })
  return getPrinterSettings(venueId)
}

// ---------- Настройки Rovena-Bot (QR для будущей онлайн-оплаты, уведомления, напоминания) ----------

export function getBotSettings(venueId) {
  const db = getDb()
  let row = db.prepare(`SELECT * FROM bot_settings WHERE venue_id = ?`).get(venueId)
  if (!row) {
    db.prepare(`INSERT INTO bot_settings (venue_id) VALUES (?)`).run(venueId)
    row = db.prepare(`SELECT * FROM bot_settings WHERE venue_id = ?`).get(venueId)
  }
  return row
}

export function updateBotSettings(venueId, payload) {
  getBotSettings(venueId)
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return getBotSettings(venueId)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE bot_settings SET ${setClause} WHERE venue_id = @venue_id`).run({
    venue_id: venueId,
    ...payload
  })
  return getBotSettings(venueId)
}

// ---------- Клиенты бота (гости Telegram — регистрация языка/имени/телефона) ----------

export function getBotCustomer(chatId) {
  return getDb().prepare(`SELECT * FROM bot_customers WHERE chat_id = ?`).get(String(chatId))
}

export function upsertBotCustomer(chatId, payload) {
  const db = getDb()
  const existing = getBotCustomer(chatId)
  if (existing) {
    const fields = Object.keys(payload)
    if (fields.length === 0) return existing
    const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
    db.prepare(`UPDATE bot_customers SET ${setClause} WHERE chat_id = @chat_id`).run({
      chat_id: String(chatId),
      ...payload
    })
  } else {
    db.prepare(
      `INSERT INTO bot_customers (chat_id, full_name, phone, language) VALUES (@chat_id, @full_name, @phone, @language)`
    ).run({ chat_id: String(chatId), full_name: null, phone: null, language: 'ru', ...payload })
  }
  return getBotCustomer(chatId)
}

// ---------- Connections (Radmin API / Bot — не привязаны к заведению; Staff-ключ теперь у venues) ----------

export function listConnections() {
  return getDb().prepare(`SELECT * FROM connections`).all()
}

export function getConnection(name) {
  return getDb().prepare(`SELECT * FROM connections WHERE name = ?`).get(name)
}

export function updateConnection(name, payload, author) {
  const db = getDb()
  const fields = Object.keys(payload)
  if (fields.length === 0) return getConnection(name)
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE connections SET ${setClause} WHERE name = @name`).run({ name, ...payload })
  logAudit('connection', null, 'update', author, { name, ...payload })
  return getConnection(name)
}

// ---------- Audit log ----------

export function listAudit() {
  return getDb().prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200`).all()
}
