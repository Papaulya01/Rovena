// Небольшие форматтеры для полей ввода (телефон/цена) и вывода (деньги, даты).
// Это мягкие маски: они не валидируют строго, а помогают набирать данные
// в читаемом виде, реальное значение всегда можно восстановить обратно.

export function digitsOnly(value) {
  return (value || '').replace(/\D/g, '')
}

/**
 * Форматирует номер телефона по мере набора: определяет код страны по
 * распространённым префиксам (998 — Узбекистан, 7/8 — Россия/Казахстан),
 * остальное группирует под соответствующий формат национального номера.
 */
export function formatPhoneInput(value) {
  const digits = digitsOnly(value).slice(0, 15)
  if (!digits) return ''

  let cc, rest
  if (digits.startsWith('998')) {
    cc = '998'
    rest = digits.slice(3, 12)
  } else if (digits.startsWith('7') || digits.startsWith('8')) {
    cc = '7'
    rest = digits.slice(1, 11)
  } else {
    cc = digits.slice(0, 1)
    rest = digits.slice(1, 11)
  }

  const chunkSizes = rest.length <= 9 ? [2, 3, 2, 2] : [3, 3, 2, 2]
  const groups = []
  let i = 0
  for (const size of chunkSizes) {
    if (i >= rest.length) break
    groups.push(rest.slice(i, i + size))
    i += size
  }

  let out = '+' + cc
  if (groups.length > 0) {
    out += ' (' + groups[0]
    if (groups[0].length === chunkSizes[0] || groups.length > 1) out += ')'
  }
  if (groups.length > 1) out += ' ' + groups[1]
  if (groups.length > 2) out += '-' + groups[2]
  if (groups.length > 3) out += '-' + groups[3]
  return out
}

/** Форматирует сумму по мере набора: группирует тысячи пробелом, до 2 знаков после запятой. */
export function formatPriceInput(value) {
  const raw = String(value ?? '').replace(/[^\d.,]/g, '').replace(',', '.')
  if (!raw) return ''
  const [intRaw, ...fracParts] = raw.split('.')
  const intPart = (intRaw || '').replace(/^0+(?=\d)/, '')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  let result = grouped
  if (fracParts.length > 0) result += '.' + fracParts.join('').slice(0, 2)
  return result
}

/** Достаёт число из отформатированной строки цены. */
export function unformatPrice(value) {
  const cleaned = String(value ?? '').replace(/\s/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return Number.isFinite(num) ? num : 0
}

/** Денежное значение для вывода (таблицы, сводки) — с разрядностью пробелом. */
export function formatMoney(n) {
  const num = Number(n) || 0
  return num.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

/** Человеко-читаемая дата/время из значения <input type="datetime-local"> или ISO-строки. */
export function formatDateTime(value) {
  if (!value) return '—'
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Только время "18:00" из значения <input type="datetime-local"> или ISO-строки. */
export function formatTime(value) {
  if (!value) return ''
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

/** "2026-08" -> "Август 2026" */
export function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return `${MONTH_NAMES[(m || 1) - 1]} ${y}`
}
