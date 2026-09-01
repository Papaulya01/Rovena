import { contextBridge, ipcRenderer } from 'electron'

const api = {
  auth: {
    hasUsers: () => ipcRenderer.invoke('auth:hasUsers'),
    lastUsername: () => ipcRenderer.invoke('auth:lastUsername'),
    getLanguage: () => ipcRenderer.invoke('settings:getLanguage'),
    setLanguage: (lang) => ipcRenderer.invoke('settings:setLanguage', lang),
    setup: (payload) => ipcRenderer.invoke('auth:setup', payload),
    login: (payload) => ipcRenderer.invoke('auth:login', payload),
    logout: () => ipcRenderer.invoke('auth:logout'),
    me: () => ipcRenderer.invoke('auth:me'),
    selectVenue: (venueId) => ipcRenderer.invoke('auth:selectVenue', venueId),
    listUsers: () => ipcRenderer.invoke('auth:listUsers'),
    createUser: (payload) => ipcRenderer.invoke('auth:createUser', payload),
    updateUserVenues: (payload) => ipcRenderer.invoke('auth:updateUserVenues', payload),
    setUserActive: (payload) => ipcRenderer.invoke('auth:setUserActive', payload),
    changePassword: (payload) => ipcRenderer.invoke('auth:changePassword', payload),
    updateUser: (payload) => ipcRenderer.invoke('auth:updateUser', payload)
  },
  venues: {
    list: () => ipcRenderer.invoke('venues:list'),
    create: (payload) => ipcRenderer.invoke('venues:create', payload),
    update: (payload) => ipcRenderer.invoke('venues:update', payload),
    regenerateStaffKey: (id) => ipcRenderer.invoke('venues:regenerateStaffKey', id)
  },
  employees: {
    list: () => ipcRenderer.invoke('employees:list'),
    create: (payload) => ipcRenderer.invoke('employees:create', payload),
    update: (payload) => ipcRenderer.invoke('employees:update', payload),
    delete: (id) => ipcRenderer.invoke('employees:delete', id)
  },
  schedule: {
    list: (range) => ipcRenderer.invoke('schedule:list', range),
    create: (payload) => ipcRenderer.invoke('schedule:create', payload),
    update: (payload) => ipcRenderer.invoke('schedule:update', payload),
    delete: (id) => ipcRenderer.invoke('schedule:delete', id)
  },
  shift: {
    current: () => ipcRenderer.invoke('shift:current'),
    currentReport: () => ipcRenderer.invoke('shift:currentReport'),
    open: (payload) => ipcRenderer.invoke('shift:open', payload),
    close: (payload) => ipcRenderer.invoke('shift:close', payload),
    list: () => ipcRenderer.invoke('shift:list'),
    report: (shiftId) => ipcRenderer.invoke('shift:report', shiftId)
  },
  cashier: {
    currentOrders: () => ipcRenderer.invoke('cashier:currentOrders'),
    createOrder: (payload) => ipcRenderer.invoke('cashier:createOrder', payload)
  },
  bookings: {
    list: () => ipcRenderer.invoke('bookings:list'),
    update: (payload) => ipcRenderer.invoke('bookings:update', payload)
  },
  tables: {
    list: () => ipcRenderer.invoke('tables:list'),
    create: (payload) => ipcRenderer.invoke('tables:create', payload),
    update: (payload) => ipcRenderer.invoke('tables:update', payload),
    delete: (id) => ipcRenderer.invoke('tables:delete', id),
    statuses: () => ipcRenderer.invoke('tables:statuses'),
    close: (id) => ipcRenderer.invoke('tables:close', id)
  },
  menu: {
    categories: {
      list: () => ipcRenderer.invoke('menu:categories:list'),
      create: (payload) => ipcRenderer.invoke('menu:categories:create', payload),
      update: (payload) => ipcRenderer.invoke('menu:categories:update', payload),
      delete: (id, generalName) => ipcRenderer.invoke('menu:categories:delete', { id, generalName }),
      moveAllItems: (fromId, toId) => ipcRenderer.invoke('menu:categories:moveAllItems', { fromId, toId })
    },
    items: {
      list: () => ipcRenderer.invoke('menu:items:list'),
      create: (payload) => ipcRenderer.invoke('menu:items:create', payload),
      update: (payload) => ipcRenderer.invoke('menu:items:update', payload),
      delete: (id) => ipcRenderer.invoke('menu:items:delete', id)
    }
  },
  orders: {
    list: () => ipcRenderer.invoke('orders:list'),
    update: (payload) => ipcRenderer.invoke('orders:update', payload)
  },
  finance: {
    list: () => ipcRenderer.invoke('finance:list'),
    create: (payload) => ipcRenderer.invoke('finance:create', payload),
    summary: () => ipcRenderer.invoke('finance:summary'),
    monthly: (months) => ipcRenderer.invoke('finance:monthly', months),
    categoryBreakdown: (type) => ipcRenderer.invoke('finance:categoryBreakdown', type)
  },
  analytics: {
    dishes: (range) => ipcRenderer.invoke('analytics:dishes', range),
    delivery: (range) => ipcRenderer.invoke('analytics:delivery', range)
  },
  taxSettings: {
    get: () => ipcRenderer.invoke('taxSettings:get'),
    update: (payload) => ipcRenderer.invoke('taxSettings:update', payload)
  },
  regionalSettings: {
    get: () => ipcRenderer.invoke('regionalSettings:get'),
    update: (payload) => ipcRenderer.invoke('regionalSettings:update', payload)
  },
  printerSettings: {
    get: () => ipcRenderer.invoke('printerSettings:get'),
    update: (payload) => ipcRenderer.invoke('printerSettings:update', payload)
  },
  printer: {
    list: () => ipcRenderer.invoke('printer:list'),
    print: (payload) => ipcRenderer.invoke('printer:print', payload)
  },
  botSettings: {
    get: () => ipcRenderer.invoke('botSettings:get'),
    update: (payload) => ipcRenderer.invoke('botSettings:update', payload)
  },
  exportFile: {
    save: (payload) => ipcRenderer.invoke('export:saveFile', payload)
  },
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    update: (payload) => ipcRenderer.invoke('connections:update', payload),
    regenerateKey: (name) => ipcRenderer.invoke('connections:regenerateKey', name),
    testRadmin: () => ipcRenderer.invoke('connections:testRadmin')
  },
  server: {
    start: (port) => ipcRenderer.invoke('server:start', port),
    stop: () => ipcRenderer.invoke('server:stop'),
    status: () => ipcRenderer.invoke('server:status')
  },
  bot: {
    start: (token) => ipcRenderer.invoke('bot:start', token),
    stop: () => ipcRenderer.invoke('bot:stop'),
    status: () => ipcRenderer.invoke('bot:status'),
    testNotify: (chatId) => ipcRenderer.invoke('bot:testNotify', chatId)
  },
  audit: {
    list: () => ipcRenderer.invoke('audit:list')
  },
  updater: {
    status: () => ipcRenderer.invoke('updater:status'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onState: (callback) => {
      const listener = (_e, payload) => callback(payload)
      ipcRenderer.on('updater:state', listener)
      return () => ipcRenderer.removeListener('updater:state', listener)
    }
  }
}

// contextIsolation включён — безопасно прокидываем только явный API,
// а не весь ipcRenderer/require в renderer.
contextBridge.exposeInMainWorld('rovena', api)
