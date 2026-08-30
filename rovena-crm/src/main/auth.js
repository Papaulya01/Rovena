import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'
import { getDb } from './db.js'

/**
 * Логин/пароль для CRM. Пароль хранится только хэшем (scrypt, встроен в Node —
 * без внешних зависимостей). Сессия — в памяти главного процесса: это
 * desktop-приложение для одного оператора за раз, полноценные токены/сроки
 * действия не нужны, реального выхода из процесса достаточно, чтобы выйти.
 */

let session = null // { userId, username, displayName, role, venueIds: number[], currentVenueId }

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

export function hasUsers() {
  const db = getDb()
  return db.prepare(`SELECT COUNT(*) as n FROM users WHERE is_active = 1`).get().n > 0
}

function venueIdsForUser(userId) {
  return getDb()
    .prepare(`SELECT venue_id FROM user_venues WHERE user_id = ?`)
    .all(userId)
    .map((r) => r.venue_id)
}

/** Первичная настройка: создаёт первого админа и заведение (с указанным названием). */
export function setupFirstAdmin({ username, password, displayName, venueName }) {
  if (hasUsers()) throw new Error('already_set_up')
  if (!username || !password || password.length < 6) throw new Error('invalid_input')

  const db = getDb()
  const trimmedVenueName = (venueName || '').trim() || 'Моё заведение'
  // Миграция (см. db.js) на каждом старте гарантирует хотя бы одно заведение —
  // на чистой базе оно уже существует как заглушка "Заведение 1" ещё до того,
  // как пользователь дошёл до этого экрана. hasUsers() выше гарантирует, что
  // это точно первый запуск, поэтому здесь безопасно переименовать заглушку
  // в то, что пользователь реально ввёл, а не тихо её игнорировать.
  const venue = db.prepare(`SELECT id FROM venues ORDER BY id LIMIT 1`).get()
  let venueId
  if (venue) {
    db.prepare(`UPDATE venues SET name = ? WHERE id = ?`).run(trimmedVenueName, venue.id)
    venueId = venue.id
  } else {
    venueId = db.prepare(`INSERT INTO venues (name) VALUES (?)`).run(trimmedVenueName).lastInsertRowid
  }

  const info = db
    .prepare(`INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'admin')`)
    .run(username.trim(), hashPassword(password), displayName || username.trim())
  db.prepare(`INSERT OR IGNORE INTO user_venues (user_id, venue_id) VALUES (?, ?)`).run(info.lastInsertRowid, venueId)

  return login({ username, password })
}

export function login({ username, password }) {
  const db = getDb()
  const user = db
    .prepare(`SELECT * FROM users WHERE username = ? AND is_active = 1`)
    .get((username || '').trim())
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    throw new Error('invalid_credentials')
  }

  const venueIds = venueIdsForUser(user.id)
  session = {
    userId: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    role: user.role,
    venueIds,
    currentVenueId: venueIds[0] ?? null
  }
  setLocalSetting('last_username', user.username)
  return getSession()
}

export function logout() {
  session = null
}

export function getSession() {
  if (!session) return null
  return { ...session }
}

export function requireSession() {
  if (!session) throw new Error('not_authenticated')
  return session
}

export function getCurrentVenueId() {
  return session?.currentVenueId ?? null
}

/** Даёт текущему пользователю доступ к заведению и сразу обновляет сессию —
 * без этого админ, создавший новое заведение, не смог бы на него переключиться
 * до следующего входа. */
export function grantCurrentUserVenueAccess(venueId) {
  const s = requireSession()
  getDb().prepare(`INSERT OR IGNORE INTO user_venues (user_id, venue_id) VALUES (?, ?)`).run(s.userId, venueId)
  if (!s.venueIds.includes(venueId)) s.venueIds.push(venueId)
}

export function selectVenue(venueId) {
  const s = requireSession()
  if (!s.venueIds.includes(venueId)) throw new Error('no_access_to_venue')
  s.currentVenueId = venueId
  return getSession()
}

export function getLocalSetting(key) {
  const row = getDb().prepare(`SELECT value FROM local_settings WHERE key = ?`).get(key)
  return row?.value ?? null
}

export function setLocalSetting(key, value) {
  getDb()
    .prepare(`INSERT INTO local_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, value)
}

// ---------- Управление пользователями (доступно только уже вошедшим админам) ----------

export function listUsers() {
  const db = getDb()
  const users = db.prepare(`SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY id`).all()
  const venuesStmt = db.prepare(`
    SELECT v.id, v.name FROM user_venues uv JOIN venues v ON v.id = uv.venue_id WHERE uv.user_id = ?
  `)
  return users.map((u) => ({ ...u, venues: venuesStmt.all(u.id) }))
}

export function createUser({ username, password, displayName, role, venueIds }) {
  if (!username || !password || password.length < 6) throw new Error('invalid_input')
  const db = getDb()
  const info = db
    .prepare(`INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`)
    .run(username.trim(), hashPassword(password), displayName || username.trim(), role || 'admin')
  const userId = info.lastInsertRowid
  const insertVenue = db.prepare(`INSERT OR IGNORE INTO user_venues (user_id, venue_id) VALUES (?, ?)`)
  for (const venueId of venueIds || []) insertVenue.run(userId, venueId)
  return userId
}

export function updateUserVenues(userId, venueIds) {
  const db = getDb()
  db.prepare(`DELETE FROM user_venues WHERE user_id = ?`).run(userId)
  const insertVenue = db.prepare(`INSERT OR IGNORE INTO user_venues (user_id, venue_id) VALUES (?, ?)`)
  for (const venueId of venueIds || []) insertVenue.run(userId, venueId)
}

export function setUserActive(userId, isActive) {
  getDb().prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, userId)
}

export function changePassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('invalid_input')
  getDb().prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(newPassword), userId)
}
