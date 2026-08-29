import express from 'express'
import { networkInterfaces } from 'os'
import { randomBytes } from 'crypto'
import * as repo from './repo.js'

/**
 * Встроенный HTTP-сервер CRM для Rovena-Staff (см. ТЗ п.2: "единый backend-слой",
 * "разделение доступа по источникам через API-ключи"). CRM — сервер, Staff — клиент
 * со своим токеном и урезанными правами (пишет заказы/брони, не видит бухгалтерию).
 */

let httpServer = null
let currentPort = null

export function generateApiKey() {
  return randomBytes(24).toString('hex')
}

// Radmin VPN по умолчанию выдаёт адреса из диапазона 26.0.0.0/8 — это позволяет
// Staff достучаться до CRM даже когда они не в одной физической сети (ноутбук
// админа дома + Radmin VPN на обеих машинах). Помечаем такие адреса отдельно,
// чтобы в UI было видно, какой давать Staff для удалённой работы.
function isLikelyRadminVpn(ip) {
  return ip.startsWith('26.')
}

export function getLanAddresses() {
  const nets = networkInterfaces()
  const addresses = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ address: net.address, viaRadminVpn: isLikelyRadminVpn(net.address) })
      }
    }
  }
  return addresses
}

function buildApp() {
  const app = express()
  app.use(express.json())

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Device-Name')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'rovena-crm', time: new Date().toISOString() })
  })

  // Токен теперь принадлежит конкретному заведению (venues.staff_api_key), а не
  // общий на всю CRM — один сервер/порт обслуживает все заведения сразу,
  // какое из них видит Staff-устройство определяется тем, чей ключ оно прислало.
  app.use('/api', (req, res, next) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const venue = repo.getVenueByStaffKey(token)
    if (!venue) {
      return res.status(401).json({ ok: false, error: 'invalid_token' })
    }
    req.venueId = venue.id
    req.deviceName = req.get('x-device-name') || 'staff'
    repo.updateConnection('rovena_staff', { status: 'online', last_sync_at: new Date().toISOString() }, req.deviceName)
    next()
  })

  // Каталог и столы — read-only для Staff, ведутся из CRM
  app.get('/api/menu', (req, res) => res.json(repo.listMenuItems(req.venueId, { activeOnly: true })))
  app.get('/api/categories', (req, res) => res.json(repo.listCategories(req.venueId)))
  app.get('/api/tables', (req, res) => res.json(repo.listTables(req.venueId, { activeOnly: true })))
  app.get('/api/tables/status', (req, res) => res.json(repo.tableStatuses(req.venueId)))

  app.get('/api/bookings', (req, res) => res.json(repo.listBookings(req.venueId)))
  app.post('/api/bookings', (req, res) => {
    const booking = repo.createBooking(req.venueId, { ...req.body, source: 'staff' }, req.deviceName)
    res.status(201).json(booking)
  })
  app.patch('/api/bookings/:id', (req, res) => {
    res.json(repo.updateBooking(Number(req.params.id), req.body, req.deviceName))
  })

  app.get('/api/orders', (req, res) => res.json(repo.listOrders(req.venueId)))
  app.post('/api/orders', (req, res) => {
    const order = repo.createOrder(req.venueId, { ...req.body, source: 'staff' }, req.deviceName)
    res.status(201).json(order)
  })
  app.patch('/api/orders/:id', (req, res) => {
    res.json(repo.updateOrder(Number(req.params.id), req.body, req.deviceName))
  })

  // Бухгалтерию Staff намеренно не видит — эндпоинтов finance здесь нет.

  app.use((err, _req, res, _next) => {
    console.error('[rovena-server]', err)
    res.status(500).json({ ok: false, error: 'internal_error' })
  })

  return app
}

export function startServer(port) {
  if (httpServer) return getServerStatus()
  const app = buildApp()
  httpServer = app.listen(port)
  currentPort = port
  repo.updateConnection('rovena_staff', { enabled: 1, port, status: 'unknown' }, 'crm-admin')
  return getServerStatus()
}

export function stopServer() {
  if (!httpServer) return getServerStatus()
  httpServer.close()
  httpServer = null
  currentPort = null
  repo.updateConnection('rovena_staff', { enabled: 0, status: 'offline' }, 'crm-admin')
  return getServerStatus()
}

export function getServerStatus() {
  // Ключ теперь у каждого заведения свой (venues.staff_api_key) — здесь только
  // общий для всех заведений статус самого сервера (запущен/порт/адреса).
  return {
    running: !!httpServer,
    port: currentPort,
    urls: httpServer
      ? getLanAddresses().map((a) => ({
          url: `http://${a.address}:${currentPort}`,
          viaRadminVpn: a.viaRadminVpn
        }))
      : []
  }
}
