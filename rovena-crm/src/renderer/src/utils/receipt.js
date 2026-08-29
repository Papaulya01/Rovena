import { formatMoney, formatDateTime } from './format.js'

const WIDTH_MM = { '58mm': 58, '80mm': 80, a4: 210 }

/**
 * HTML чека-копии заказа для печати (обычный принтер/термопринтер через его Windows-драйвер).
 * Это не фискальный чек — фискализация требует отдельного сертифицированного модуля/ККМ.
 */
export function buildReceiptHtml(order, { companyName, taxId, address, cashierName, receiptWidth = '80mm' } = {}) {
  const widthMm = WIDTH_MM[receiptWidth] || 80
  const isNarrow = widthMm <= 80
  const itemsRows = order.items
    .map(
      (i) => `
      <tr>
        <td class="name">${escapeHtml(i.name)}</td>
        <td class="qty">${i.qty}</td>
        <td class="sum">${formatMoney(i.qty * i.price)}</td>
      </tr>`
    )
    .join('')

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${widthMm}mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: ${isNarrow ? '12px' : '14px'};
    color: #000;
    width: 100%;
    margin: 0;
  }
  .center { text-align: center; }
  h1 { font-size: ${isNarrow ? '14px' : '18px'}; margin: 0 0 2px; }
  .muted { color: #333; font-size: ${isNarrow ? '10px' : '12px'}; }
  hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  td.name { width: 55%; }
  td.qty { width: 15%; text-align: center; }
  td.sum { width: 30%; text-align: right; }
  .total-row td { font-weight: bold; font-size: ${isNarrow ? '13px' : '16px'}; padding-top: 6px; }
  .footer { margin-top: 10px; font-size: ${isNarrow ? '10px' : '12px'}; }
</style>
</head>
<body>
  <div class="center">
    <h1>${escapeHtml(companyName || 'Rovena')}</h1>
    ${taxId ? `<div class="muted">ИНН/СТИР: ${escapeHtml(taxId)}</div>` : ''}
    ${address ? `<div class="muted">${escapeHtml(address)}</div>` : ''}
  </div>
  <hr />
  <div>
    <div>Заказ №${order.id}${order.table_name ? ` · стол ${escapeHtml(order.table_name)}` : ''}</div>
    <div class="muted">${formatDateTime(order.created_at)}${cashierName ? ` · кассир: ${escapeHtml(cashierName)}` : ''}</div>
  </div>
  <hr />
  <table>
    <tbody>
      ${itemsRows}
      <tr class="total-row">
        <td>Итого</td>
        <td></td>
        <td class="sum">${formatMoney(order.total_amount)}</td>
      </tr>
    </tbody>
  </table>
  <hr />
  <div class="footer center">
    Это копия заказа, не фискальный чек.<br />
    Спасибо, ждём вас снова!
  </div>
</body>
</html>`
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
