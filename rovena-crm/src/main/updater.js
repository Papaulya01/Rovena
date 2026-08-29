import { autoUpdater } from 'electron-updater'
import { app } from 'electron'

let mainWindowRef = null
let latestInfo = null
let state = 'idle' // idle | checking | available | downloading | downloaded | error | not-available

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

function send(channel, payload) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, payload)
  }
}

export function initUpdater(mainWindow) {
  mainWindowRef = mainWindow

  autoUpdater.on('checking-for-update', () => {
    state = 'checking'
    send('updater:state', { state })
  })

  autoUpdater.on('update-available', (info) => {
    state = 'available'
    latestInfo = info
    send('updater:state', { state, info: serializeInfo(info) })
  })

  autoUpdater.on('update-not-available', (info) => {
    state = 'not-available'
    latestInfo = info
    send('updater:state', { state, info: serializeInfo(info) })
  })

  autoUpdater.on('download-progress', (progress) => {
    state = 'downloading'
    send('updater:state', {
      state,
      progress: { percent: progress.percent, bytesPerSecond: progress.bytesPerSecond, transferred: progress.transferred, total: progress.total }
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    state = 'downloaded'
    latestInfo = info
    send('updater:state', { state, info: serializeInfo(info) })
  })

  autoUpdater.on('error', (err) => {
    state = 'error'
    send('updater:state', { state, error: err?.message || String(err) })
  })
}

function serializeInfo(info) {
  if (!info) return null
  return {
    version: info.version,
    releaseDate: info.releaseDate,
    // releaseNotes может быть строкой (markdown/HTML из тела GitHub Release) или массивом по языкам
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : info.releaseNotes || null
  }
}

export function getUpdaterStatus() {
  return { state, currentVersion: app.getVersion(), info: serializeInfo(latestInfo) }
}

export async function checkForUpdates() {
  try {
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, info: serializeInfo(result?.updateInfo) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function downloadUpdate() {
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export function quitAndInstall() {
  autoUpdater.quitAndInstall()
}
