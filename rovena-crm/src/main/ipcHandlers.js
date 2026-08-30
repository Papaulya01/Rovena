import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import * as repo from './repo.js'
import * as auth from './auth.js'
import { startServer, stopServer, getServerStatus, generateApiKey } from './server.js'
import { startBot, stopBot, getBotStatus, notifyOrderStatus, notifyBookingStatus } from './bot.js'
import { getUpdaterStatus, checkForUpdates, downloadUpdate, quitAndInstall } from './updater.js'

function currentVenueId() {
  const session = auth.requireSession()
  if (!session.currentVenueId) throw new Error('no_venue_selected')
  return session.currentVenueId
}

function currentAuthor() {
  return auth.getSession()?.username || 'crm'
}

/**
 * Роли (27.08.2026): admin — полный доступ; accountant — бухгалтерия и
 * сотрудники/ЗП; warehouse — склад (экран ещё не сделан, только модель данных);
 * cashier — работает в Rovena-Staff, в CRM ему открывать нечего. Проверка тут,
 * на стороне main-процесса, а не только скрытием пунктов меню в renderer —
 * иначе ограничение можно обойти через devtools.
 */
function requireRole(...roles) {
  const session = auth.requireSession()
  if (!roles.includes(session.role)) throw new Error('forbidden_for_role')
  return session
}

export function registerIpcHandlers() {
  // ---------- Auth ----------
  ipcMain.handle('auth:hasUsers', () => auth.hasUsers())
  ipcMain.handle('auth:lastUsername', () => auth.getLocalSetting('last_username'))

  // ---------- Язык интерфейса — локальная настройка устройства, доступна и до входа ----------
  ipcMain.handle('settings:getLanguage', () => auth.getLocalSetting('app_language') || 'ru')
  ipcMain.handle('settings:setLanguage', (_e, lang) => {
    auth.setLocalSetting('app_language', lang)
    return lang
  })
  ipcMain.handle('auth:setup', (_e, payload) => auth.setupFirstAdmin(payload))
  ipcMain.handle('auth:login', (_e, payload) => auth.login(payload))
  ipcMain.handle('auth:logout', () => {
    auth.logout()
    return { ok: true }
  })
  ipcMain.handle('auth:me', () => auth.getSession())
  ipcMain.handle('auth:selectVenue', (_e, venueId) => auth.selectVenue(venueId))
  ipcMain.handle('auth:listUsers', () => {
    requireRole('admin')
    return auth.listUsers()
  })
  ipcMain.handle('auth:createUser', (_e, payload) => {
    requireRole('admin')
    return auth.createUser(payload)
  })
  ipcMain.handle('auth:updateUserVenues', (_e, { userId, venueIds }) => {
    requireRole('admin')
    return auth.updateUserVenues(userId, venueIds)
  })
  ipcMain.handle('auth:setUserActive', (_e, { userId, isActive }) => {
    requireRole('admin')
    return auth.setUserActive(userId, isActive)
  })
  ipcMain.handle('auth:changePassword', (_e, { userId, newPassword }) => {
    requireRole('admin')
    return auth.changePassword(userId, newPassword)
  })

  // ---------- Venues (заведения) — только админ ----------
  ipcMain.handle('venues:list', () => repo.listVenues())
  ipcMain.handle('venues:create', (_e, payload) => {
    requireRole('admin')
    const venue = repo.createVenue(payload)
    auth.grantCurrentUserVenueAccess(venue.id) // иначе создавший не сможет на него переключиться
    return venue
  })
  ipcMain.handle('venues:update', (_e, { id, ...payload }) => {
    requireRole('admin')
    return repo.updateVenue(id, payload)
  })
  ipcMain.handle('venues:regenerateStaffKey', (_e, id) => {
    requireRole('admin')
    return repo.updateVenue(id, { staff_api_key: generateApiKey() })
  })

  // ---------- Employees (сотрудники) и график смен — admin и accountant ----------
  ipcMain.handle('employees:list', () => {
    requireRole('admin', 'accountant')
    return repo.listEmployees(currentVenueId())
  })
  ipcMain.handle('employees:create', (_e, payload) => {
    requireRole('admin')
    return repo.createEmployee(currentVenueId(), payload)
  })
  ipcMain.handle('employees:update', (_e, { id, ...payload }) => {
    requireRole('admin')
    return repo.updateEmployee(id, payload)
  })
  ipcMain.handle('employees:delete', (_e, id) => {
    requireRole('admin')
    return repo.deleteEmployee(id)
  })

  ipcMain.handle('schedule:list', (_e, range) => {
    requireRole('admin', 'accountant')
    return repo.listShiftSchedule(currentVenueId(), range || {})
  })
  ipcMain.handle('schedule:create', (_e, payload) => {
    requireRole('admin')
    return repo.createScheduleEntry(currentVenueId(), payload)
  })
  ipcMain.handle('schedule:update', (_e, { id, ...payload }) => {
    requireRole('admin')
    return repo.updateScheduleEntry(id, payload)
  })
  ipcMain.handle('schedule:delete', (_e, id) => {
    requireRole('admin')
    return repo.deleteScheduleEntry(id)
  })

  // ---------- Shifts (кассир открывает/закрывает; admin/accountant смотрят) ----------
  ipcMain.handle('shift:current', () => repo.getOpenShift(currentVenueId()))
  ipcMain.handle('shift:currentReport', () => {
    const shift = repo.getOpenShift(currentVenueId())
    return shift ? repo.shiftReport(shift.id) : null
  })
  ipcMain.handle('shift:open', (_e, { startingCash }) => {
    const session = requireRole('admin', 'cashier')
    return repo.openShift(currentVenueId(), {
      startingCash,
      userId: session.userId,
      userName: session.displayName
    })
  })
  ipcMain.handle('shift:close', (_e, { shiftId, endingCash }) => {
    const session = requireRole('admin', 'cashier')
    return repo.closeShift(shiftId, { endingCash, userId: session.userId, userName: session.displayName })
  })
  ipcMain.handle('shift:list', () => {
    requireRole('admin', 'accountant')
    return repo.listShifts(currentVenueId())
  })
  ipcMain.handle('shift:report', (_e, shiftId) => {
    requireRole('admin', 'accountant')
    return repo.shiftReport(shiftId)
  })

  // ---------- Cashier: пробить заказ во время открытой смены ----------
  ipcMain.handle('cashier:currentOrders', () => {
    requireRole('admin', 'cashier')
    const shift = repo.getOpenShift(currentVenueId())
    return shift ? repo.listOrdersByShift(shift.id) : []
  })
  ipcMain.handle('cashier:createOrder', (_e, payload) => {
    const session = requireRole('admin', 'cashier')
    const shift = repo.getOpenShift(currentVenueId())
    if (!shift) throw new Error('no_open_shift')
    return repo.createOrder(
      currentVenueId(),
      { ...payload, shift_id: shift.id, source: 'staff' },
      session.displayName
    )
  })

  // ---------- Bookings ----------
  // Брони создаются только из Staff/Bot (через repo.js напрямую — см. server.js/bot.js).
  // CRM — только контроль: список + смена статуса, канала создания намеренно нет.
  ipcMain.handle('bookings:list', () => repo.listBookings(currentVenueId()))
  ipcMain.handle('bookings:update', (_e, { id, ...payload }) => {
    const booking = repo.updateBooking(id, payload, currentAuthor())
    if (payload.status === 'confirmed' || payload.status === 'cancelled') {
      notifyBookingStatus(booking, payload.status).catch(() => {})
    }
    return booking
  })

  // ---------- Tables (зал) ----------
  ipcMain.handle('tables:list', () => repo.listTables(currentVenueId()))
  ipcMain.handle('tables:create', (_e, payload) => repo.createTable(currentVenueId(), payload))
  ipcMain.handle('tables:update', (_e, { id, ...payload }) => repo.updateTable(id, payload))
  ipcMain.handle('tables:delete', (_e, id) => repo.deleteTable(id))
  ipcMain.handle('tables:statuses', () => repo.tableStatuses(currentVenueId()))

  // ---------- Menu (catalog) ----------
  ipcMain.handle('menu:categories:list', () => repo.listCategories(currentVenueId()))
  ipcMain.handle('menu:categories:create', (_e, payload) => repo.createCategory(currentVenueId(), payload))
  ipcMain.handle('menu:categories:update', (_e, { id, ...payload }) => repo.updateCategory(id, payload))
  ipcMain.handle('menu:categories:delete', (_e, { id, generalName }) =>
    repo.deleteCategory(id, currentVenueId(), generalName)
  )
  ipcMain.handle('menu:categories:moveAllItems', (_e, { fromId, toId }) => repo.moveAllItems(fromId, toId))

  ipcMain.handle('menu:items:list', () => repo.listMenuItems(currentVenueId()))
  ipcMain.handle('menu:items:create', (_e, payload) => repo.createMenuItem(currentVenueId(), payload))
  ipcMain.handle('menu:items:update', (_e, { id, ...payload }) => repo.updateMenuItem(id, payload))
  ipcMain.handle('menu:items:delete', (_e, id) => repo.deleteMenuItem(id))

  // ---------- Orders ----------
  // Заказы создаются только из Staff/Bot — CRM их только видит и меняет статус.
  ipcMain.handle('orders:list', () => repo.listOrders(currentVenueId()))
  ipcMain.handle('orders:update', (_e, { id, ...payload }) => {
    const order = repo.updateOrder(id, payload, currentAuthor())
    if (payload.status === 'done' || payload.status === 'cancelled') {
      notifyOrderStatus(order, payload.status).catch(() => {})
    }
    return order
  })

  // ---------- Finance — admin и accountant (у кассира/склада своя зона) ----------
  ipcMain.handle('finance:list', () => {
    requireRole('admin', 'accountant')
    return repo.listFinance(currentVenueId())
  })
  ipcMain.handle('finance:create', (_e, payload) => {
    requireRole('admin', 'accountant')
    return repo.createFinanceEntry(currentVenueId(), payload, currentAuthor())
  })
  ipcMain.handle('finance:summary', () => {
    requireRole('admin', 'accountant')
    return repo.financeSummary(currentVenueId())
  })
  ipcMain.handle('finance:monthly', (_e, months) => {
    requireRole('admin', 'accountant')
    return repo.financeMonthly(currentVenueId(), months)
  })
  ipcMain.handle('finance:categoryBreakdown', (_e, type) => {
    requireRole('admin', 'accountant')
    return repo.financeCategoryBreakdown(currentVenueId(), type)
  })

  // ---------- Налоговые настройки — читает admin+accountant (нужно для отчётов), меняет только admin ----------
  ipcMain.handle('taxSettings:get', () => {
    requireRole('admin', 'accountant')
    return repo.getTaxSettings(currentVenueId())
  })
  ipcMain.handle('taxSettings:update', (_e, payload) => {
    requireRole('admin')
    return repo.updateTaxSettings(currentVenueId(), payload)
  })

  // ---------- Региональные настройки — читают все роли (нужны кассиру для часов), меняет только admin ----------
  ipcMain.handle('regionalSettings:get', () => repo.getRegionalSettings(currentVenueId()))
  ipcMain.handle('regionalSettings:update', (_e, payload) => {
    requireRole('admin')
    return repo.updateRegionalSettings(currentVenueId(), payload)
  })

  // ---------- Настройки и печать чеков (не фискализация, см. db.js) ----------
  ipcMain.handle('printerSettings:get', () => repo.getPrinterSettings(currentVenueId()))
  ipcMain.handle('printerSettings:update', (_e, payload) => {
    requireRole('admin')
    return repo.updatePrinterSettings(currentVenueId(), payload)
  })
  ipcMain.handle('printer:list', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) return []
    return win.webContents.getPrintersAsync()
  })
  ipcMain.handle('printer:print', async (_e, { html, printerName, silent }) => {
    requireRole('admin', 'cashier')
    const printWin = new BrowserWindow({ show: false })
    try {
      await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      return await new Promise((resolve) => {
        printWin.webContents.print(
          { silent: !!silent, printBackground: true, deviceName: printerName || undefined },
          (success, reason) => resolve({ success, reason })
        )
      })
    } finally {
      if (!printWin.isDestroyed()) printWin.close()
    }
  })

  // ---------- Настройки Rovena-Bot (QR для оплаты, уведомления, напоминания) ----------
  ipcMain.handle('botSettings:get', () => repo.getBotSettings(currentVenueId()))
  ipcMain.handle('botSettings:update', (_e, payload) => {
    requireRole('admin')
    return repo.updateBotSettings(currentVenueId(), payload)
  })

  // ---------- Экспорт отчёта в файл (CSV/Excel) через нативный диалог "Сохранить как" ----------
  ipcMain.handle('export:saveFile', async (_e, { defaultName, content }) => {
    requireRole('admin', 'accountant')
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [
        { name: 'CSV (Excel)', extensions: ['csv'] },
        { name: 'Все файлы', extensions: ['*'] }
      ]
    })
    if (canceled || !filePath) return { saved: false }
    // BOM в начале — чтобы Excel сразу открыл файл в UTF-8, а не в кракозябрах
    writeFileSync(filePath, '﻿' + content, 'utf8')
    return { saved: true, filePath }
  })

  // ---------- Connections (Radmin API / Bot; Staff-ключ теперь на заведении) — только админ ----------
  ipcMain.handle('connections:list', () => repo.listConnections())
  ipcMain.handle('connections:update', (_e, { name, ...payload }) => {
    requireRole('admin')
    return repo.updateConnection(name, payload, currentAuthor())
  })
  ipcMain.handle('connections:regenerateKey', (_e, name) => {
    requireRole('admin')
    return repo.updateConnection(name, { api_key: generateApiKey() }, currentAuthor())
  })
  ipcMain.handle('connections:testRadmin', async () => {
    requireRole('admin')
    const conn = repo.getConnection('radmin_api')
    if (!conn?.base_url) return { ok: false, error: 'no_base_url' }
    try {
      const res = await fetch(conn.base_url, { method: 'GET', signal: AbortSignal.timeout(5000) })
      const ok = res.ok
      repo.updateConnection(
        'radmin_api',
        { status: ok ? 'online' : 'offline', last_sync_at: new Date().toISOString() },
        currentAuthor()
      )
      return { ok, statusCode: res.status }
    } catch (e) {
      repo.updateConnection('radmin_api', { status: 'offline' }, currentAuthor())
      return { ok: false, error: e.message }
    }
  })

  // ---------- Embedded server for Staff — только админ ----------
  ipcMain.handle('server:start', (_e, port) => {
    requireRole('admin')
    return startServer(port)
  })
  ipcMain.handle('server:stop', () => {
    requireRole('admin')
    return stopServer()
  })
  ipcMain.handle('server:status', () => getServerStatus())

  // ---------- Bot lifecycle — только админ ----------
  ipcMain.handle('bot:start', async (_e, token) => {
    requireRole('admin')
    try {
      return await startBot(token)
    } catch (e) {
      return { running: false, username: null, lastError: e.message }
    }
  })
  ipcMain.handle('bot:stop', () => stopBot())
  ipcMain.handle('bot:status', () => getBotStatus())

  // ---------- Обновления приложения (electron-updater + GitHub Releases) — только админ ----------
  ipcMain.handle('updater:status', () => getUpdaterStatus())
  ipcMain.handle('updater:check', () => {
    requireRole('admin')
    return checkForUpdates()
  })
  ipcMain.handle('updater:download', () => {
    requireRole('admin')
    return downloadUpdate()
  })
  ipcMain.handle('updater:install', () => {
    requireRole('admin')
    quitAndInstall()
  })

  // ---------- Audit log ----------
  ipcMain.handle('audit:list', () => repo.listAudit())
}
