/** Экранирует значение для CSV (Excel): оборачивает в кавычки, если есть запятая/кавычка/перенос строки. */
function escapeCsvValue(value) {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",;\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Строит CSV-строку (с разделителем ";" — так Excel с русской локалью открывает без плясок с бубном). */
export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCsvValue).join(';')]
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(';'))
  }
  return lines.join('\r\n')
}

/** Отдаёт CSV-контент в главный процесс, который открывает нативный диалог "Сохранить как". */
export async function saveCsv(defaultName, headers, rows) {
  const content = buildCsv(headers, rows)
  return window.rovena.exportFile.save({ defaultName, content })
}
