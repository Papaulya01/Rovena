import * as repo from './repo.js'

/**
 * Управление Rovena-Bot из CRM: long-polling клиент к Telegram Bot API.
 * MVP: /start приветствие, /menu — каталог из CRM (та же таблица menu_items,
 * что видит и Staff). Приём заказов/броней через бота — открытый вопрос ТЗ
 * (обычный бот vs Mini App), сюда добавится после решения.
 */

const TELEGRAM_API = 'https://api.telegram.org/bot'

let running = false
let botToken = null
let botUsername = null
let lastError = null
let pollAbort = null
let offset = 0

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
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

// Бот пока общий на все заведения (не выбирает конкретное) — показывает первое
// активное; венue-маршрутизация для бота — отдельный вопрос ТЗ (см. Mini App).
function defaultVenueId() {
  const venue = repo.listVenues().find((v) => v.is_active)
  return venue?.id ?? null
}

function formatTablesMessage() {
  const venueId = defaultVenueId()
  const tables = venueId ? repo.listTables(venueId, { activeOnly: true }) : []
  if (tables.length === 0) return 'Столы пока не заведены — загляните позже.'
  return tables
    .map((t) => `• ${escapeHtml(t.name)} — на ${t.capacity}${t.zone ? `, ${escapeHtml(t.zone)}` : ''}`)
    .join('\n')
}

function formatMenuMessage() {
  const venueId = defaultVenueId()
  const items = venueId ? repo.listMenuItems(venueId, { activeOnly: true }) : []
  if (items.length === 0) return 'Меню пока не заполнено — загляните позже.'
  const byCategory = new Map()
  for (const item of items) {
    const cat = item.category_name || 'Без категории'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat).push(item)
  }
  let text = ''
  for (const [cat, catItems] of byCategory) {
    text += `\n<b>${escapeHtml(cat)}</b>\n`
    for (const item of catItems) {
      text += `• ${escapeHtml(item.name)} — ${item.price}\n`
    }
  }
  return text.trim()
}

async function handleUpdate(update) {
  const msg = update.message
  if (!msg || !msg.text) return
  const chatId = msg.chat.id
  const text = msg.text.trim()
  try {
    if (text.startsWith('/start')) {
      await callApi('sendMessage', {
        chat_id: chatId,
        text: 'Добро пожаловать в Rovena! /menu — меню, /tables — столы, /help — список команд.'
      })
    } else if (text.startsWith('/menu')) {
      await callApi('sendMessage', { chat_id: chatId, text: formatMenuMessage(), parse_mode: 'HTML' })
    } else if (text.startsWith('/tables')) {
      await callApi('sendMessage', { chat_id: chatId, text: formatTablesMessage(), parse_mode: 'HTML' })
    } else if (text.startsWith('/help')) {
      await callApi('sendMessage', {
        chat_id: chatId,
        text: '/menu — посмотреть меню\n/tables — свободные столы\n/help — список команд'
      })
    }
  } catch (e) {
    console.error('[rovena-bot] handleUpdate error', e)
  }
}

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
  pollLoop()
  repo.updateConnection('rovena_bot', { enabled: 1, status: 'online' }, 'crm-admin')
  return getBotStatus()
}

export function stopBot() {
  if (!running) return getBotStatus()
  running = false
  pollAbort?.abort()
  botUsername = null
  repo.updateConnection('rovena_bot', { enabled: 0, status: 'offline' }, 'crm-admin')
  return getBotStatus()
}

export function getBotStatus() {
  return { running, username: botUsername, lastError }
}
