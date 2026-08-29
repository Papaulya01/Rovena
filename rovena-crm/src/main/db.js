import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

let db

/**
 * Схема БД покрывает то, чего нет в статическом API Radmin:
 * локальную бухгалтерию, историю изменений и связь заказов с источником
 * (Staff / Bot / CRM), как обсуждалось в архитектуре.
 */
const SCHEMA = `
-- Заведения: CRM ведёт несколько точек (рестораны/кафе/бар) из одного приложения.
-- Почти все операционные сущности ниже привязаны к конкретному venue_id.
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  staff_api_key TEXT,                -- ключ для встроенного сервера — свой на заведение
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Пользователи CRM (логин/пароль) и их доступ к заведениям (многие-ко-многим).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,       -- "scryptSalt:hex$hash:hex"
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin', -- admin | manager — задел на будущее разделение прав
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_venues (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, venue_id)
);

-- Локальные настройки этого устройства (не бизнес-данные) — напр. "последний логин".
CREATE TABLE IF NOT EXISTS local_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Сотрудники заведения для отчётности/ЗП — НЕ то же самое, что users (логины
-- в CRM/Staff): не у каждого сотрудника обязательно есть логин, а у логина
-- не обязательно есть карточка сотрудника (пример: единственный админ-владелец).
-- user_id — необязательная связь, если у сотрудника всё же есть свой логин.
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT 'cashier', -- cashier | waiter | warehouse | accountant | other
  phone TEXT,
  salary_type TEXT NOT NULL DEFAULT 'fixed', -- fixed | hourly | percent
  salary_rate REAL NOT NULL DEFAULT 0,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  hired_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Плановый график смен (кто когда должен работать) — не путать с фактическим
-- открытием/закрытием смены в Staff (это отдельная сущность, появится вместе
-- со Staff, т.к. её открывает кассир на месте).
CREATE TABLE IF NOT EXISTS shift_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time TEXT,                  -- "10:00"
  end_time TEXT,                    -- "22:00"
  note TEXT
);

-- Столы (зал), которые CRM ведёт централизованно — на них ссылаются брони,
-- их же видят Staff (через сервер) и бот (список для выбора при брони).
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,               -- напр. "Стол 5"
  capacity INTEGER NOT NULL DEFAULT 2,
  zone TEXT,                        -- напр. "зал", "терраса", "vip"
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  external_id TEXT,               -- id брони в Radmin, если синхронизировано
  source TEXT NOT NULL DEFAULT 'crm', -- staff | bot | crm
  client_name TEXT,
  client_contact TEXT,
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  purpose TEXT,                    -- цель брони (свободный текст, если не стол: зал целиком, оборудование и т.п.)
  date_from TEXT NOT NULL,         -- ISO datetime, начало
  date_to TEXT,                    -- ISO datetime, окончание
  status TEXT NOT NULL DEFAULT 'new', -- new | confirmed | cancelled | done
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Каталог, который CRM ведёт централизованно и отдаёт Staff/Bot через сервер
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,                       -- цвет метки категории в UI, необязательно
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  description TEXT,
  image TEXT,                       -- data URL (base64) фото блюда, необязательно
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Фактическая смена кассира: открыл(а) → работает (заказы) → закрыл(а) с суммой
-- в кассе. Одна открытая смена на заведение одновременно — этого достаточно
-- для одной кассы; несколько параллельных касс на заведение можно добавить
-- позже через отдельную привязку смены к конкретному кассовому месту.
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  opened_by INTEGER REFERENCES users(id),
  opened_by_name TEXT,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  starting_cash REAL NOT NULL DEFAULT 0,
  closed_by INTEGER REFERENCES users(id),
  closed_by_name TEXT,
  closed_at TEXT,
  ending_cash REAL,
  status TEXT NOT NULL DEFAULT 'open', -- open | closed
  notes TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  external_id TEXT,
  booking_id INTEGER REFERENCES bookings(id),
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'crm', -- staff | bot | crm
  delivery INTEGER NOT NULL DEFAULT 0, -- 0/1: доставка или нет
  client_name TEXT,
  client_contact TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new | processing | done | cancelled
  total_amount REAL NOT NULL DEFAULT 0,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,               -- снимок названия на момент заказа
  qty REAL NOT NULL DEFAULT 1,
  price REAL NOT NULL DEFAULT 0     -- снимок цены на момент заказа
);

-- Единая сущность "движение денег": и приход (заказ), и расход (закупки и т.п.)
CREATE TABLE IF NOT EXISTS finance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
  type TEXT NOT NULL,               -- income | expense
  amount REAL NOT NULL,
  category TEXT,
  source TEXT NOT NULL DEFAULT 'crm', -- staff | bot | crm
  order_id INTEGER REFERENCES orders(id),
  author TEXT,                       -- кто внёс запись (сотрудник/система)
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Настройки подключений к Staff / Bot / Radmin API (ключи, статус, sync).
-- Для radmin_api это исходящее подключение CRM к внешнему API.
-- Для rovena_staff и rovena_bot CRM сама выступает сервером/держателем токена:
-- enabled/port описывают встроенный HTTP-сервер (staff) или процесс бота (bot).
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- radmin_api | rovena_staff | rovena_bot
  base_url TEXT,
  api_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  port INTEGER,
  status TEXT NOT NULL DEFAULT 'unknown', -- online | offline | unknown
  last_sync_at TEXT
);

-- Настройки для бухгалтерской отчётности заведения: реквизиты + ставки,
-- которые бухгалтер/админ вводит и поддерживает сам (CRM их не диктует —
-- ставки и пороги по законодательству РУз меняются, здесь только то, что
-- вручную указал пользователь для расчёта внутренних отчётов).
CREATE TABLE IF NOT EXISTS tax_settings (
  venue_id INTEGER PRIMARY KEY REFERENCES venues(id) ON DELETE CASCADE,
  tax_regime TEXT NOT NULL DEFAULT 'turnover', -- turnover (ЕНП/оборот) | vat (НДС/общий режим)
  turnover_tax_rate REAL NOT NULL DEFAULT 0,   -- % с оборота (ЕНП)
  vat_rate REAL NOT NULL DEFAULT 0,            -- % НДС/QQS
  profit_tax_rate REAL NOT NULL DEFAULT 0,     -- % налог на прибыль
  social_tax_rate REAL NOT NULL DEFAULT 0,     -- % социальный налог с ФОТ (работодатель)
  ndfl_rate REAL NOT NULL DEFAULT 0,           -- % НДФЛ, удерживаемый с зарплаты сотрудника
  company_name TEXT,
  tax_id TEXT,                                  -- ИНН/СТИР
  address TEXT,
  logo TEXT,                                    -- data URL (base64) логотипа для отчётов/чеков
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Региональные настройки заведения (часовой пояс/формат времени и даты) —
-- единый источник правды, который читают и CRM, и панель кассира (Staff),
-- чтобы часы и отметки времени смен были согласованы, а не на усмотрение
-- локальных часов конкретного устройства.
CREATE TABLE IF NOT EXISTS regional_settings (
  venue_id INTEGER PRIMARY KEY REFERENCES venues(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tashkent',
  time_format TEXT NOT NULL DEFAULT '24h', -- 24h | 12h
  date_format TEXT NOT NULL DEFAULT 'dmy'  -- dmy (31.12.2026) | ymd (2026-12-31)
);

-- Настройки печати чеков. Важно: это печать чека как копии заказа на обычном
-- принтере (в т.ч. чековом/термопринтере через его Windows-драйвер) — НЕ
-- фискализация. Для соответствия требованиям онлайн-ККМ Узбекистана (передача
-- данных в ОФД) нужен отдельный сертифицированный фискальный модуль/кассовый
-- аппарат от лицензированного поставщика — CRM сама фискальные чеки не пробивает.
CREATE TABLE IF NOT EXISTS printer_settings (
  venue_id INTEGER PRIMARY KEY REFERENCES venues(id) ON DELETE CASCADE,
  printer_name TEXT,                            -- '' / NULL = принтер по умолчанию в системе
  receipt_width TEXT NOT NULL DEFAULT '80mm',    -- 58mm | 80mm | a4
  auto_print INTEGER NOT NULL DEFAULT 0,         -- печатать чек сразу при пробитии заказа
  silent_print INTEGER NOT NULL DEFAULT 0        -- печатать без диалога подтверждения ОС
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,             -- order | booking | finance_entry | connection
  entity_id INTEGER,
  action TEXT NOT NULL,             -- create | update | delete
  author TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

/** Добавляет колонку, если её ещё нет — для эволюции схемы у уже существующих БД. */
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!existing.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function migrate() {
  ensureColumn('connections', 'enabled', "INTEGER NOT NULL DEFAULT 0")
  ensureColumn('connections', 'port', 'INTEGER')
  ensureColumn('bookings', 'purpose', 'TEXT')
  ensureColumn('bookings', 'table_id', 'INTEGER REFERENCES tables(id) ON DELETE SET NULL')
  ensureColumn('orders', 'table_id', 'INTEGER REFERENCES tables(id) ON DELETE SET NULL')
  ensureColumn('order_items', 'menu_item_id', 'INTEGER REFERENCES menu_items(id) ON DELETE SET NULL')

  ensureColumn('tables', 'venue_id', 'INTEGER REFERENCES venues(id) ON DELETE CASCADE')
  ensureColumn('bookings', 'venue_id', 'INTEGER REFERENCES venues(id) ON DELETE CASCADE')
  ensureColumn('categories', 'venue_id', 'INTEGER REFERENCES venues(id) ON DELETE CASCADE')
  ensureColumn('menu_items', 'venue_id', 'INTEGER REFERENCES venues(id) ON DELETE CASCADE')
  ensureColumn('orders', 'venue_id', 'INTEGER REFERENCES venues(id) ON DELETE CASCADE')
  ensureColumn('orders', 'shift_id', 'INTEGER REFERENCES shifts(id) ON DELETE SET NULL')
  ensureColumn('finance_entries', 'venue_id', 'INTEGER REFERENCES venues(id) ON DELETE CASCADE')
  ensureColumn('menu_items', 'image', 'TEXT')
  ensureColumn('categories', 'color', 'TEXT')
  ensureColumn('tax_settings', 'logo', 'TEXT')

  // Мультиточечность добавлена 27.08.2026 поверх уже работавшей однoточечной
  // модели: гарантируем хотя бы одно заведение и переносим на него все записи,
  // у которых venue_id ещё не проставлен (старые данные до этой миграции).
  let defaultVenue = db.prepare(`SELECT id FROM venues ORDER BY id LIMIT 1`).get()
  if (!defaultVenue) {
    const info = db.prepare(`INSERT INTO venues (name) VALUES ('Заведение 1')`).run()
    defaultVenue = { id: info.lastInsertRowid }
  }
  for (const table of ['tables', 'bookings', 'categories', 'menu_items', 'orders', 'finance_entries']) {
    db.prepare(`UPDATE ${table} SET venue_id = ? WHERE venue_id IS NULL`).run(defaultVenue.id)
  }
}

export function initDatabase() {
  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'rovena-crm.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  migrate()

  // Дефолтные записи подключений, чтобы в UI сразу было что настраивать
  const seedConnections = db.prepare(
    `INSERT OR IGNORE INTO connections (name, base_url, port, status) VALUES (?, ?, ?, 'unknown')`
  )
  seedConnections.run('radmin_api', '', null)
  seedConnections.run('rovena_staff', '', 4780)
  seedConnections.run('rovena_bot', '', null)

  return db
}

export function getDb() {
  if (!db) throw new Error('Database is not initialized yet')
  return db
}
