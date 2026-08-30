import { useEffect, useState } from 'react'
import Select from '../components/Select.jsx'
import LiveClock from '../components/LiveClock.jsx'
import { buildReceiptHtml } from '../utils/receipt.js'
import { useI18n } from '../i18n/index.jsx'

/** Подставляет {токены} шаблона как <code> — для инструкций вида "откройте {botfather}". */
function interpolateCode(template, replacements) {
  const regex = /\{(\w+)\}/g
  const nodes = []
  let lastIndex = 0
  let match
  let key = 0
  while ((match = regex.exec(template))) {
    if (match.index > lastIndex) nodes.push(template.slice(lastIndex, match.index))
    nodes.push(<code key={key++}>{replacements[match[1]]}</code>)
    lastIndex = regex.lastIndex
  }
  if (lastIndex < template.length) nodes.push(template.slice(lastIndex))
  return nodes
}

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

function AccordionItem({ name, statusDot, badge, children, open, onToggle, labels, descriptions }) {
  return (
    <div className={`accordion-item ${open ? 'open' : ''}`}>
      <button className="accordion-header" onClick={onToggle} type="button">
        <div className="accordion-title">
          <span className={`dot ${statusDot}`} />
          <div>
            {labels[name] || name}
            {badge && <span className="tag tag-soon">{badge}</span>}
            <div className="accordion-sub">{descriptions[name]}</div>
          </div>
        </div>
        <span className="accordion-chevron">▾</span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  )
}

export default function Connections() {
  const { t } = useI18n()
  const LABELS = {
    radmin_api: t('connections.labelRadmin'),
    rovena_staff: t('connections.labelStaff'),
    rovena_bot: t('connections.labelBot'),
    regional: t('connections.labelRegional'),
    printing: t('connections.labelPrinting'),
    updates: t('connections.labelUpdates'),
    modules: t('connections.labelModules')
  }
  const DESCRIPTIONS = {
    radmin_api: t('connections.descRadmin'),
    rovena_staff: t('connections.descStaff'),
    rovena_bot: t('connections.descBot'),
    regional: t('connections.descRegional'),
    printing: t('connections.descPrinting'),
    updates: t('connections.descUpdates'),
    modules: t('connections.descModules')
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
          items: [{ name: 'Тестовая позиция', qty: 1, price: 25000 }]
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
          <h1>{t('connections.pageTitle')}</h1>
          <p>{t('connections.pageSubtitle')}</p>
        </div>
      </div>

      <div className="accordion">
        <AccordionItem
          name="radmin_api"
          statusDot={radminConn.status || 'unknown'}
          open={openName === 'radmin_api'}
          onToggle={() => setOpenName(openName === 'radmin_api' ? null : 'radmin_api')}
          labels={LABELS}
          descriptions={DESCRIPTIONS}
        >
          <div className="form-row">
            <div>
              <label>{t('connections.baseUrl')}</label>
              <input
                value={drafts.radmin_api?.base_url ?? ''}
                onChange={(e) => setDraft('radmin_api', 'base_url', e.target.value)}
                placeholder="https://api.radmin..."
                onBlur={() => saveBaseUrl('radmin_api')}
              />
            </div>
            <div>
              <label>{t('connections.apiKeyToken')}</label>
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
              {t('connections.testConnection')}
            </button>
            {radminTest && (
              <span style={{ fontSize: 12.5, color: radminTest.ok ? 'var(--income)' : 'var(--expense)' }}>
                {radminTest.ok
                  ? t('connections.responding')
                  : `${t('connections.notResponding')}${radminTest.error ? ' — ' + radminTest.error : ''}`}
              </span>
            )}
          </div>
          <div className="instructions">
            <h4>{t('connections.radminLogicTitle')}</h4>
            {t('connections.radminLogicText')}
          </div>
        </AccordionItem>

        <AccordionItem
          name="rovena_staff"
          statusDot={serverStatus.running ? 'online' : 'offline'}
          open={openName === 'rovena_staff'}
          onToggle={() => setOpenName(openName === 'rovena_staff' ? null : 'rovena_staff')}
          labels={LABELS}
          descriptions={DESCRIPTIONS}
        >
          <div className="server-panel">
            <div className="server-panel-row">
              <button className="btn" disabled={busy} onClick={toggleServer}>
                {serverStatus.running ? t('connections.stopServer') : t('connections.startServer')}
              </button>
              <div className="server-panel-field">
                <label>{t('connections.port')}</label>
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
                <label>{t('connections.addressForStaff')}</label>
                <div className="address-list">
                  {serverStatus.urls.length > 0 ? (
                    serverStatus.urls.map((u) => (
                      <div className="address-row" key={u.url}>
                        <CopyChip value={u.url} />
                        <span className={`tag ${u.viaRadminVpn ? 'tag-vpn' : 'tag-lan'}`}>
                          {u.viaRadminVpn ? t('connections.viaRadminVpn') : t('connections.localNetwork')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="empty-hint">{t('connections.noNetworkAddress')}</span>
                  )}
                </div>
              </div>
            )}

            <div className="server-panel-section">
              <span className="empty-hint">{t('connections.apiKeyPerVenueHint')}</span>
            </div>
          </div>

          <div className="instructions">
            <h4>{t('connections.staffHowToTitle')}</h4>
            <ol>
              <li>{t('connections.staffHowTo1')}</li>
              <li>{t('connections.staffHowTo2')}</li>
              <li>{t('connections.staffHowTo3')}</li>
              <li>{t('connections.staffHowTo4')}</li>
              <li>{t('connections.staffHowTo5')}</li>
            </ol>
          </div>
        </AccordionItem>

        <AccordionItem
          name="rovena_bot"
          statusDot={botStatus.running ? 'online' : 'offline'}
          open={openName === 'rovena_bot'}
          onToggle={() => setOpenName(openName === 'rovena_bot' ? null : 'rovena_bot')}
          labels={LABELS}
          descriptions={DESCRIPTIONS}
        >
          <div className="form-row">
            <div>
              <label>{t('connections.botTokenLabel')}</label>
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
              {botStatus.running ? t('connections.stopBot') : t('connections.startBot')}
            </button>
            {botStatus.running && botStatus.username && (
              <span style={{ fontSize: 12.5, color: 'var(--income)' }}>
                {t('connections.workingAs')} @{botStatus.username}
              </span>
            )}
            {botStatus.lastError && (
              <span style={{ fontSize: 12.5, color: 'var(--expense)' }}>
                {t('connections.error')}: {botStatus.lastError}
              </span>
            )}
          </div>

          <div className="instructions">
            <h4>{t('connections.botHowToTitle')}</h4>
            <ol>
              <li>{interpolateCode(t('connections.botHowTo1'), { botfather: '@BotFather', newbot: '/newbot' })}</li>
              <li>{interpolateCode(t('connections.botHowTo2'), { sample: '123456789:AA...' })}</li>
              <li>{t('connections.botHowTo3')}</li>
              <li>{interpolateCode(t('connections.botHowTo4'), { start: '/start', menu: '/menu' })}</li>
            </ol>
            {t('connections.botFooterNote')}
          </div>
        </AccordionItem>

        <AccordionItem
          name="regional"
          statusDot="unknown"
          open={openName === 'regional'}
          onToggle={() => setOpenName(openName === 'regional' ? null : 'regional')}
          labels={LABELS}
          descriptions={DESCRIPTIONS}
        >
          {regionalSettings && (
            <>
              <div className="form-row">
                <div>
                  <label>{t('connections.timezone')}</label>
                  <Select
                    value={regionalSettings.timezone}
                    onChange={(v) => saveRegionalSetting('timezone', v)}
                    options={TIMEZONES}
                  />
                </div>
                <div>
                  <label>{t('connections.timeFormat')}</label>
                  <Select
                    value={regionalSettings.time_format}
                    onChange={(v) => saveRegionalSetting('time_format', v)}
                    options={[
                      { value: '24h', label: t('connections.format24') },
                      { value: '12h', label: t('connections.format12') }
                    ]}
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>{t('connections.dateFormat')}</label>
                  <Select
                    value={regionalSettings.date_format}
                    onChange={(v) => saveRegionalSetting('date_format', v)}
                    options={[
                      { value: 'dmy', label: t('connections.formatDmy') },
                      { value: 'ymd', label: t('connections.formatYmd') }
                    ]}
                  />
                </div>
                <div>
                  <label>{t('connections.now')}</label>
                  <div className="server-panel" style={{ padding: '10px 14px' }}>
                    <LiveClock timezone={regionalSettings.timezone} timeFormat={regionalSettings.time_format} />
                  </div>
                </div>
              </div>
              <div className="instructions">
                <h4>{t('connections.regionalHowTitle')}</h4>
                {t('connections.regionalHowText')}
              </div>
            </>
          )}
        </AccordionItem>

        <AccordionItem
          name="printing"
          statusDot="unknown"
          open={openName === 'printing'}
          onToggle={() => setOpenName(openName === 'printing' ? null : 'printing')}
          labels={LABELS}
          descriptions={DESCRIPTIONS}
        >
          {printerSettings && (
            <>
              <div className="form-row">
                <div>
                  <label>{t('connections.printer')}</label>
                  <Select
                    value={printerSettings.printer_name || ''}
                    onChange={(v) => savePrinterSetting('printer_name', v)}
                    placeholder={t('connections.printerDefault')}
                    options={printers.map((p) => ({
                      value: p.name,
                      label: p.displayName || p.name
                    }))}
                  />
                </div>
                <div>
                  <label>{t('connections.receiptWidth')}</label>
                  <Select
                    value={printerSettings.receipt_width}
                    onChange={(v) => savePrinterSetting('receipt_width', v)}
                    options={[
                      { value: '58mm', label: t('connections.width58') },
                      { value: '80mm', label: t('connections.width80') },
                      { value: 'a4', label: t('connections.widthA4') }
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
                  {t('connections.autoPrintLabel')}
                </label>
              </div>
              <div className="field-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={!!printerSettings.silent_print}
                    onChange={(e) => savePrinterSetting('silent_print', e.target.checked ? 1 : 0)}
                  />
                  {t('connections.silentPrintLabel')}
                </label>
              </div>
              <div className="field-row">
                <button className="btn secondary" disabled={busy} onClick={testPrint}>
                  {t('connections.testPrint')}
                </button>
                {testPrintResult && (
                  <span style={{ fontSize: 12.5, color: testPrintResult.success ? 'var(--income)' : 'var(--expense)' }}>
                    {testPrintResult.success
                      ? t('connections.sentToPrint')
                      : `${t('connections.printFailed')}: ${testPrintResult.reason || '—'}`}
                  </span>
                )}
              </div>
              <div className="instructions">
                <h4>{t('connections.notFiscalTitle')}</h4>
                {t('connections.notFiscalText')}
              </div>
            </>
          )}
        </AccordionItem>

        <AccordionItem
          name="updates"
          statusDot={updater.state === 'available' || updater.state === 'downloaded' ? 'online' : 'unknown'}
          open={openName === 'updates'}
          onToggle={() => setOpenName(openName === 'updates' ? null : 'updates')}
          labels={LABELS}
          descriptions={DESCRIPTIONS}
        >
          <div className="server-panel-row" style={{ marginBottom: 12 }}>
            <div>
              {t('connections.currentVersion')}: <strong>{updater.currentVersion || '—'}</strong>
            </div>
            <button className="btn secondary" disabled={checkingUpdate} onClick={checkUpdates}>
              {checkingUpdate ? t('connections.checking') : t('connections.checkUpdates')}
            </button>
          </div>

          {updater.state === 'not-available' && (
            <div className="empty-hint">{t('connections.latestInstalled')}</div>
          )}

          {(updater.state === 'available' || updater.state === 'downloading' || updater.state === 'downloaded') &&
            updater.info && (
              <div className="server-panel" style={{ marginBottom: 12 }}>
                <div className="server-panel-row">
                  <strong>
                    {t('connections.versionAvailable')} {updater.info.version}
                  </strong>
                </div>
                {updater.info.releaseNotes && (
                  <div
                    className="update-changelog"
                    dangerouslySetInnerHTML={{
                      __html:
                        typeof updater.info.releaseNotes === 'string'
                          ? updater.info.releaseNotes
                          : t('connections.changelogUnavailable')
                    }}
                  />
                )}
              </div>
            )}

          {updater.state === 'available' && (
            <button className="btn" onClick={() => window.rovena.updater.download()}>
              {t('connections.downloadUpdate')}
            </button>
          )}

          {updater.state === 'downloading' && (
            <div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${updater.progress?.percent || 0}%` }} />
              </div>
              <div className="empty-hint">
                {t('connections.downloading')}: {Math.round(updater.progress?.percent || 0)}%{' '}
                {t('connections.dontCloseWhileDownloading')}
              </div>
            </div>
          )}

          {updater.state === 'downloaded' && (
            <button className="btn" onClick={() => window.rovena.updater.install()}>
              {t('connections.installAndRestart')}
            </button>
          )}

          {updater.state === 'error' && (
            <div className="empty-hint" style={{ color: 'var(--expense)' }}>
              {t('connections.updateCheckError')}: {updater.error}
            </div>
          )}

          <div className="instructions">
            <h4>{t('connections.updatesHowTitle')}</h4>
            {t('connections.updatesHowText')}
          </div>
        </AccordionItem>

        <AccordionItem
          name="modules"
          statusDot="unknown"
          badge={t('connections.inDevelopment')}
          open={openName === 'modules'}
          onToggle={() => setOpenName(openName === 'modules' ? null : 'modules')}
          labels={LABELS}
          descriptions={DESCRIPTIONS}
        >
          <div className="empty-state" style={{ padding: '20px 0' }}>
            {t('connections.modulesEmptyState')}
          </div>
        </AccordionItem>
      </div>
    </div>
  )
}
