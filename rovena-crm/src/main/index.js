import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db.js'
import { registerIpcHandlers } from './ipcHandlers.js'
import { startServer, stopServer } from './server.js'
import { startBot, stopBot } from './bot.js'
import { getConnection } from './repo.js'
import { initUpdater, checkForUpdates } from './updater.js'

// .ico (не .png) — чтобы Windows брал подходящий по чёткости размер для
// заголовка окна, панели задач и Alt+Tab по отдельности, а не масштабировал один PNG.
const iconPath = join(__dirname, '../../resources/icon.ico')

// Без явного имени Electron в некоторых сценариях запуска не может определить
// productName из package.json и откатывается на generic "Electron" — тогда
// userData (а с ним и БД) уезжает в другую папку, и после следующего запуска
// данные выглядят пропавшими. Фиксируем имя и путь к userData жёстко, чтобы
// БД всегда была в одном и том же месте независимо от того, как запущен exe.
app.setName('rovena-crm')
app.setPath('userData', join(app.getPath('appData'), 'rovena-crm'))

// Без единственного лока два запущенных экземпляра могут одновременно писать
// в один и тот же SQLite-файл (разные процессы, общий userData) — это выглядит
// как "данные то есть, то пропадают". Второй запуск просто поднимает окно первого.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow = null
let splashWindow = null

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 340,
    height: 380,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    icon: iconPath,
    webPreferences: { sandbox: true }
  })
  splashWindow.loadFile(join(__dirname, '../../resources/splash.html'))
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

// Сервер для Staff и бот поднимаются сами при каждом запуске CRM, если админ
// один раз включил их в «Подключениях» — не нужно нажимать «Запустить» заново
// каждый раз (важно для сценария «ноутбук дома, но CRM открыта и Radmin VPN
// включён» — Staff должен достучаться сразу, как только CRM стартовала).
function autoStartConnections() {
  try {
    const staffConn = getConnection('rovena_staff')
    if (staffConn?.enabled && staffConn.port) {
      startServer(staffConn.port)
    }
  } catch (e) {
    console.error('[rovena] auto-start server failed', e)
  }

  try {
    const botConn = getConnection('rovena_bot')
    if (botConn?.enabled && botConn.api_key) {
      startBot(botConn.api_key).catch((e) => console.error('[rovena] auto-start bot failed', e))
    }
  } catch (e) {
    console.error('[rovena] auto-start bot failed', e)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    closeSplash()
    mainWindow.show()
  })
  // Подстраховка: если по какой-то причине 'ready-to-show' не пришёл, сплэш
  // всё равно не должен зависнуть на экране навсегда.
  setTimeout(closeSplash, 8000)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (gotLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.rovena.crm')

    // Стандартное меню Electron (File/Edit/View/Window/Help) не нужно — оно
    // всплывало по Alt даже с autoHideMenuBar. Убираем совсем, а не просто прячем.
    Menu.setApplicationMenu(null)

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createSplash()

    initDatabase()
    registerIpcHandlers()
    autoStartConnections()

    createWindow()
    initUpdater(mainWindow)
    // Автопроверка при старте — тихая, без диалогов; результат просто доступен
    // админу в «Подключения → Обновления», когда он туда заглянет.
    if (!is.dev) {
      checkForUpdates().catch(() => {})
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopServer()
  stopBot()
})
