import { useEffect, useState } from 'react'
import Select from '../components/Select.jsx'
import LiveClock from '../components/LiveClock.jsx'
import { buildReceiptHtml } from '../utils/receipt.js'

const LABELS = {
  radmin_api: 'Radmin API',
  rovena_staff: 'Rovena-Staff',
  rovena_bot: 'Rovena-Bot',
  regional: 'Дата и время',
  printing: 'Печать чеков',
  updates: 'Обновления',
  modules: 'Модули'
}

const DESCRIPTIONS = {
  radmin_api: 'Внешний статический API — источник данных по товарам/остаткам.',
  rovena_staff: 'CRM выступает сервером: моноблок в точке подключается сюда по сети.',
  rovena_bot: 'Телеграм-бот, которым управляет CRM: брони, заказы и меню для клиентов.',
  regional: 'Часовой пояс и формат времени/даты — единые для CRM и панели кассира.',
  printing: 'Принтер и параметры печати чека-копии заказа для панели кассира.',
  updates: 'Проверка новых версий и установка обновлений CRM.',
  modules: 'Подключаемые дополнения к CRM — раздел зарезервирован на будущее.'
}

const TIMEZONES = [
  { value: 'Asia/Tashkent', label: 'Ташкент (UTC+5)' },
  { value: 'Asia/Almaty', label: 'Алматы (UTC+6)' },
  { value: 'Asia/Bishkek', label: 'Бишкек (UTC+6)' },
  { value: 'Asia/Dushanbe', label: 'Душанбе (UTC+5)' },
  { value: 'Asia/Ashgabat', label: 'Ашхабад (UTC+5)' },
  { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { value: 'UTC', label: 'UTC' }
]

function CopyChip({ value, placeholder }) {
  const [copied, setCopied] = useState(false)
  if (!value) {
    return <span className="copy-chip empty">{placeholder}</span>
  }
  return (
    <button
      type="button"
      className="copy-chip"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // буфер обмена недоступен — молча игнорируем, значение и так видно
        }
      }}
    >
      <span className="copy-chip-value">{value}</span>
      <span className="copy-chip-icon">{copied ? '✓' : '⧉'}</span>
    </button>
  )
}

function AccordionItem({ name, statusDot, badge, children, open, onToggle }) {
  return (
    <div className={`accordion-item ${open ? 'open' : ''}`}>
      <button className="accordion-header" onClick={onToggle} type="button">
        <div className="accordion-title">
          <span className={`dot ${statusDot}`} />
          <div>
            {LABELS[name] || name}
            {badge && <span className="tag tag-soon">{badge}</span>}
            <div className="accordion-sub">{DESCRIPTIONS[name]}</div>
          </div>
        </div>
        <span className="accordion-chevron">▾</span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  )
}

export default function Connections() {
  const [connections, setConnections] = useState([])
  const [openName, setOpenName] = useState('rovena_staff')
  const [drafts, setDrafts] = useState({})
  const [serverStatus, setServerStatus] = useState({ running: false, port: null, urls: [] })
  const [botStatus, setBotStatus] = useState({ running: false, username: null, lastError: null })
  const [radminTest, setRadminTest] = useState(null)
  const [busy, setBusy] = useState(false)
  const [regionalSettings, setRegionalSettings] = useState(null)
  const [printerSettings, setPrinterSettings] = useState(null)
  const [printers, setPrinters] = useState([])
  const [testPrintResult, setTestPrintResult] = useState(null)
  const [updater, setUpdater] = useState({ state: 'idle', currentVersion: '', info: null })
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  useEffect(() => {
    window.rovena.updater.status().then(setUpdater)
    const unsubscribe = window.rovena.updater.onState((payload) =>
      setUpdater((prev) => ({ ...prev, ...payload }))
    )
    return unsubscribe
  }, [])

  async function checkUpdates() {
    setCheckingUpdate(true)
    await window.rovena.updater.check()
    setCheckingUpdate(false)
  }

  const byName = (name) => connections.find((c) => c.name === name) || {}

  const load = () => {
    window.rovena.connections.list().then((list) => {
      setConnections(list)
      setDrafts((prev) => {
        const next = { ...prev }
        for (const c of list) {
          if (!next[c.name]) {
            next[c.name] = { base_url: c.base_url || '', port: c.port || '' }
          }
        }
        return next
      })
    })
    window.rovena.server.status().then(setServerStatus)
    window.rovena.bot.status().then(setBotStatus)
    window.rovena.regionalSettings.get().then(setRegionalSettings)
    window.rovena.printerSettings.get().then(setPrinterSettings)
    window.rovena.printer.list().then(setPrinters).catch(() => setPrinters([]))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  function setDraft(name, field, value) {
    setDrafts((prev) => ({ ...prev, [name]: { ...prev[name], [field]: value } }))
  }

  async function saveBaseUrl(name) {
    await window.rovena.connections.update({ name, base_url: drafts[name]?.base_url || '' })
    load()
  }

  async function testRadmin() {
    setBusy(true)
    const result = await window.rovena.connections.testRadmin()
    setRadminTest(result)
    setBusy(false)
    load()
  }

  async function toggleServer() {
    setBusy(true)
    if (serverStatus.running) {
      setServerStatus(await window.rovena.server.stop())
    } else {
      const port = Number(drafts.rovena_staff?.port) || 4780
      setServerStatus(await window.rovena.server.start(port))
    }
    setBusy(false)
    load()
  }

  async function toggleBot() {
    setBusy(true)
    if (botStatus.running) {
      setBotStatus(await window.rovena.bot.stop())
    } else {
      const token = byName('rovena_bot').api_key
      setBotStatus(await window.rovena.bot.start(token))
    }
    setBusy(false)
    load()
  }

  async function saveRegionalSetting(field, value) {
    setRegionalSettings((prev) => ({ ...prev, [field]: value }))
    await window.rovena.regionalSettings.update({ [field]: value })
    load()
  }

  async function savePrinterSetting(field, value) {
    setPrinterSettings((prev) => ({ ...prev, [field]: value }))
    await window.rovena.printerSettings.update({ [field]: value })
    load()
  }

  async function testPrint() {
    setBusy(true)
    setTestPrintResult(null)
    try {
      const html = buildReceiptHtml(
        {
          id: '0000',
          created_at: new Date().toISOString(),
          table_name: 'Тест',
          total_amount: 25000,
          items: [
            { name: 'Тестовая позиция', qty: 1, price: 25000 }
          ]
        },
        {
          companyName: 'Rovena — тестовая печать',
          receiptWidth: printerSettings?.receipt_width
        }
      )
      const result = await window.rovena.printer.print({
        html,
        printerName: printerSettings?.printer_name || undefined,
        silent: !!printerSettings?.silent_print
      })
      setTestPrintResult(result)
    } finally {
      setBusy(false)
    }
  }

  const radminConn = byName('radmin_api')
  const staffConn = byName('rovena_staff')
  const botConn = byName('rovena_bot')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Подключения</h1>
          <p>Radmin API как источник данных, CRM как сервер для Staff, и управление ботом — всё в одном месте</p>
        </div>
      </div>

      <div className="accordion">
        <AccordionItem
          name="radmin_api"
          statusDot={radminConn.status || 'unknown'}
          open={openName === 'radmin_api'}
          onToggle={() => setOpenName(openName === 'radmin_api' ? null : 'radmin_api')}
        >
          <div className="form-row">
            <div>
              <label>Base URL</label>
              <input
                value={drafts.radmin_api?.base_url ?? ''}
                onChange={(e) => setDraft('radmin_api', 'base_url', e.target.value)}
                placeholder="https://api.radmin..."
                onBlur={() => saveBaseUrl('radmin_api')}
              />
            </div>
            <div>
              <label>API-ключ / токен</label>
              <input
                type="password"
                value={radminConn.api_key || ''}
                onChange={async (e) => {
                  await window.rovena.connections.update({ name: 'radmin_api', api_key: e.target.value })
                  load()
                }}
              />
            </div>
          </div>
          <div className="field-row">
            <button className="btn secondary" disabled={busy} onClick={testRadmin}>
              Проверить подключение
            </button>
            {radminTest && (
              <span style={{ fontSize: 12.5, color: radminTest.ok ? 'var(--income)' : 'var(--expense)' }}>
                {radminTest.ok ? 'Отвечает' : `Не отвечает${radminTest.error ? ' — ' + radminTest.error : ''}`}
              </span>
            )}
          </div>
          <div className="instructions">
            <h4>Логика подключения</h4>
            Если это отдельный внешний источник данных (например, товары/остатки из другой системы) — CRM
            ходит к нему как клиент: укажите базовый адрес и ключ, «Проверить подключение» делает контрольный
            GET-запрос и обновляет статус. Если под «Radmin» имелся в виду Radmin VPN — это не API, а
            программа удалённого доступа: она не настраивается здесь, а просто обеспечивает сетевой адрес,
            который автоматически появляется в карточке «Rovena-Staff» ниже, когда запущена на этом
            компьютере.
          </div>
        </AccordionItem>

        <AccordionItem
          name="rovena_staff"
          statusDot={serverStatus.running ? 'online' : 'offline'}
          open={openName === 'rovena_staff'}
          onToggle={() => setOpenName(openName === 'rovena_staff' ? null : 'rovena_staff')}
        >
          <div className="server-panel">
            <div className="server-panel-row">
              <button className="btn" disabled={busy} onClick={toggleServer}>
                {serverStatus.running ? 'Остановить сервер' : 'Запустить сервер'}
              </button>
              <div className="server-panel-field">
                <label>Порт</label>
                <input
                  type="number"
                  disabled={serverStatus.running}
                  value={drafts.rovena_staff?.port ?? staffConn.port ?? 4780}
                  onChange={(e) => setDraft('rovena_staff', 'port', e.target.value)}
                />
              </div>
            </div>

            {serverStatus.running && (
              <div className="server-panel-section">
                <label>Адрес для Staff</label>
                <div className="address-list">
                  {serverStatus.urls.length > 0 ? (
                    serverStatus.urls.map((u) => (
                      <div className="address-row" key={u.url}>
                        <CopyChip value={u.url} />
                        <span className={`tag ${u.viaRadminVpn ? 'tag-vpn' : 'tag-lan'}`}>
                          {u.viaRadminVpn ? 'Radmin VPN · из любой сети' : 'локальная сеть'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="empty-hint">Не найден сетевой адрес — проверьте, что устройство в сети</span>
                  )}
                </div>
              </div>
            )}

            <div className="server-panel-section">
              <span className="empty-hint">
                API-ключ теперь свой у каждого заведения — смотрите и перевыпускайте в разделе «Заведения».
              </span>
            </div>
          </div>

          <div className="instructions">
            <h4>Как подключить Rovena-Staff</h4>
            <ol>
              <li>
                В одной локальной сети (Wi-Fi/кабель) — просто нажмите «Запустить сервер» и используйте
                локальный адрес. В разных сетях (например, этот компьютер — не в точке продаж) — установите
                Radmin VPN на оба устройства и подключите их к одной виртуальной сети; тогда появится
                адрес с пометкой «через Radmin VPN», который работает откуда угодно, пока CRM открыта.
              </li>
              <li>В настройках Staff укажите нужный адрес и вставьте API-ключ заведения из раздела «Заведения».</li>
              <li>
                Сервер и ключ сохраняются — при следующем запуске CRM сервер поднимется сам, ничего
                нажимать заново не нужно.
              </li>
              <li>
                После первого запроса от Staff статус подключения станет «online» — это видно по индикатору
                слева от названия.
              </li>
              <li>
                Если адрес через Radmin VPN не отвечает — проверьте брандмауэр Windows: при первом запуске
                сервера он может спросить разрешение, важно разрешить доступ и для «частных», и для
                «общественных» сетей.
              </li>
            </ol>
          </div>
        </AccordionItem>

        <AccordionItem
          name="rovena_bot"
          statusDot={botStatus.running ? 'online' : 'offline'}
          open={openName === 'rovena_bot'}
          onToggle={() => setOpenName(openName === 'rovena_bot' ? null : 'rovena_bot')}
        >
          <div className="form-row">
            <div>
              <label>Токен бота (от @BotFather)</label>
              <input
                type="password"
                disabled={botStatus.running}
                value={botConn.api_key || ''}
                onChange={async (e) => {
                  await window.rovena.connections.update({ name: 'rovena_bot', api_key: e.target.value })
                  load()
                }}
                placeholder="123456789:AA..."
              />
            </div>
          </div>

          <div className="field-row">
            <button className="btn" disabled={busy} onClick={toggleBot}>
              {botStatus.running ? 'Остановить бота' : 'Запустить бота'}
            </button>
            {botStatus.running && botStatus.username && (
              <span style={{ fontSize: 12.5, color: 'var(--income)' }}>
                Работает как @{botStatus.username}
              </span>
            )}
            {botStatus.lastError && (
              <span style={{ fontSize: 12.5, color: 'var(--expense)' }}>Ошибка: {botStatus.lastError}</span>
            )}
          </div>

          <div className="instructions">
            <h4>Как получить токен и запустить бота</h4>
            <ol>
              <li>
                В Telegram откройте <code>@BotFather</code>, отправьте <code>/newbot</code> и следуйте
                подсказкам (имя и username бота).
              </li>
              <li>BotFather пришлёт токен вида <code>123456789:AA...</code> — вставьте его в поле выше.</li>
              <li>Нажмите «Запустить бота» — CRM подключится к Telegram и начнёт отвечать на сообщения.</li>
              <li>
                Проверьте в Telegram: напишите боту <code>/start</code>, затем <code>/menu</code> — придёт
                список позиций из раздела «Меню».
              </li>
            </ol>
            Приём заказов и броней прямо через бота — следующий шаг (зависит от решения: обычный бот или
            Mini App, см. открытые вопросы ТЗ). Сейчас бот отвечает на команды и показывает меню.
          </div>
        </AccordionItem>

        <AccordionItem
          name="regional"
          statusDot="unknown"
          open={openName === 'regional'}
          onToggle={() => setOpenName(openName === 'regional' ? null : 'regional')}
        >
          {regionalSettings && (
            <>
              <div className="form-row">
                <div>
                  <label>Часовой пояс</label>
                  <Select
                    value={regionalSettings.timezone}
                    onChange={(v) => saveRegionalSetting('timezone', v)}
                    options={TIMEZONES}
                  />
                </div>
                <div>
                  <label>Формат времени</label>
                  <Select
                    value={regionalSettings.time_format}
                    onChange={(v) => saveRegionalSetting('time_format', v)}
                    options={[
                      { value: '24h', label: '24-часовой (14:30)' },
                      { value: '12h', label: '12-часовой (2:30 PM)' }
                    ]}
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Формат даты</label>
                  <Select
                    value={regionalSettings.date_format}
                    onChange={(v) => saveRegionalSetting('date_format', v)}
                    options={[
                      { value: 'dmy', label: 'ДД.ММ.ГГГГ (31.12.2026)' },
                      { value: 'ymd', label: 'ГГГГ-ММ-ДД (2026-12-31)' }
                    ]}
                  />
                </div>
                <div>
                  <label>Сейчас</label>
                  <div className="server-panel" style={{ padding: '10px 14px' }}>
                    <LiveClock timezone={regionalSettings.timezone} timeFormat={regionalSettings.time_format} />
                  </div>
                </div>
              </div>
              <div className="instructions">
                <h4>Как это используется</h4>
                Часовой пояс и формат задаются один раз здесь и применяются во всей CRM и в панели кассира
                (Rovena-Staff) — открытие/закрытие смены, отметки времени заказов и часы в панели кассира
                используют эти настройки, а не часы конкретного устройства.
              </div>
            </>
          )}
        </AccordionItem>

        <AccordionItem
          name="printing"
          statusDot="unknown"
          open={openName === 'printing'}
          onToggle={() => setOpenName(openName === 'printing' ? null : 'printing')}
        >
          {printerSettings && (
            <>
              <div className="form-row">
                <div>
                  <label>Принтер</label>
                  <Select
                    value={printerSettings.printer_name || ''}
                    onChange={(v) => savePrinterSetting('printer_name', v)}
                    placeholder="По умолчанию в системе"
                    options={printers.map((p) => ({
                      value: p.name,
                      label: p.displayName || p.name
                    }))}
                  />
                </div>
                <div>
                  <label>Ширина чека</label>
                  <Select
                    value={printerSettings.receipt_width}
                    onChange={(v) => savePrinterSetting('receipt_width', v)}
                    options={[
                      { value: '58mm', label: '58 мм (термопринтер)' },
                      { value: '80mm', label: '80 мм (термопринтер)' },
                      { value: 'a4', label: 'A4 (обычный принтер)' }
                    ]}
                  />
                </div>
              </div>
              <div className="field-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={!!printerSettings.auto_print}
                    onChange={(e) => savePrinterSetting('auto_print', e.target.checked ? 1 : 0)}
                  />
                  Печатать чек автоматически при пробитии заказа
                </label>
              </div>
              <div className="field-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={!!printerSettings.silent_print}
                    onChange={(e) => savePrinterSetting('silent_print', e.target.checked ? 1 : 0)}
                  />
                  Печатать без диалога подтверждения Windows
                </label>
              </div>
              <div className="field-row">
                <button className="btn secondary" disabled={busy} onClick={testPrint}>
                  Тестовая печать
                </button>
                {testPrintResult && (
                  <span style={{ fontSize: 12.5, color: testPrintResult.success ? 'var(--income)' : 'var(--expense)' }}>
                    {testPrintResult.success ? 'Отправлено на печать' : `Не удалось: ${testPrintResult.reason || '—'}`}
                  </span>
                )}
              </div>
              <div className="instructions">
                <h4>Важно: это не фискальный чек</h4>
                Кнопка «Чек» в панели кассира печатает копию заказа на обычном принтере — в том числе на
                чековом термопринтере, если для него установлен Windows-драйвер (тогда он появится в списке
                выше как обычный принтер). Это не фискализация: для соответствия требованиям онлайн-ККМ
                (передача данных в ОФД — оператор фискальных данных) нужен отдельный сертифицированный
                фискальный модуль или кассовый аппарат от лицензированного поставщика в Узбекистане. CRM
                фискальные чеки не формирует и данные в ОФД не передаёт.
              </div>
            </>
          )}
        </AccordionItem>

        <AccordionItem
          name="updates"
          statusDot={updater.state === 'available' || updater.state === 'downloaded' ? 'online' : 'unknown'}
          open={openName === 'updates'}
          onToggle={() => setOpenName(openName === 'updates' ? null : 'updates')}
        >
          <div className="server-panel-row" style={{ marginBottom: 12 }}>
            <div>
              Текущая версия: <strong>{updater.currentVersion || '—'}</strong>
            </div>
            <button className="btn secondary" disabled={checkingUpdate} onClick={checkUpdates}>
              {checkingUpdate ? 'Проверяем...' : 'Проверить обновления'}
            </button>
          </div>

          {updater.state === 'not-available' && (
            <div className="empty-hint">Установлена последняя версия.</div>
          )}

          {(updater.state === 'available' || updater.state === 'downloading' || updater.state === 'downloaded') &&
            updater.info && (
              <div className="server-panel" style={{ marginBottom: 12 }}>
                <div className="server-panel-row">
                  <strong>Доступна версия {updater.info.version}</strong>
                </div>
                {updater.info.releaseNotes && (
                  <div
                    className="update-changelog"
                    dangerouslySetInnerHTML={{
                      __html:
                        typeof updater.info.releaseNotes === 'string'
                          ? updater.info.releaseNotes
                          : 'Список изменений недоступен'
                    }}
                  />
                )}
              </div>
            )}

          {updater.state === 'available' && (
            <button className="btn" onClick={() => window.rovena.updater.download()}>
              Скачать обновление
            </button>
          )}

          {updater.state === 'downloading' && (
            <div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${updater.progress?.percent || 0}%` }} />
              </div>
              <div className="empty-hint">
                Загрузка: {Math.round(updater.progress?.percent || 0)}% — не закрывайте приложение, пока
                загрузка не завершится.
              </div>
            </div>
          )}

          {updater.state === 'downloaded' && (
            <button className="btn" onClick={() => window.rovena.updater.install()}>
              Установить и перезапустить
            </button>
          )}

          {updater.state === 'error' && (
            <div className="empty-hint" style={{ color: 'var(--expense)' }}>Ошибка проверки обновлений: {updater.error}</div>
          )}

          <div className="instructions">
            <h4>Как это работает</h4>
            CRM проверяет новые версии в GitHub Releases проекта. Когда версия доступна, здесь появляется
            список изменений — сначала можно посмотреть, что нового, и только потом нажать «Скачать
            обновление». После загрузки установка происходит по кнопке «Установить и перезапустить» — CRM
            закроется и переустановится на новую версию автоматически, без обычного окна установщика.
          </div>
        </AccordionItem>

        <AccordionItem
          name="modules"
          statusDot="unknown"
          badge="в разработке"
          open={openName === 'modules'}
          onToggle={() => setOpenName(openName === 'modules' ? null : 'modules')}
        >
          <div className="empty-state" style={{ padding: '20px 0' }}>
            Здесь появятся включаемые модули CRM (например, программа лояльности, акции, интеграции) —
            список и настройки конкретных модулей ещё не определены.
          </div>
        </AccordionItem>
      </div>
    </div>
  )
}
