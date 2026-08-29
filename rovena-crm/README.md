# Rovena-CRM (стартовая сборка)

React + Electron (через `electron-vite`) + SQLite (`better-sqlite3`) для локального хранения.

## Что уже внутри

- **Брони** (`bookings`) — список + создание + смена статуса.
- **Заказы** (`orders`) — список + создание с позициями (доставка да/нет) + автосписание в бухгалтерию.
- **Бухгалтерия** (`finance_entries`) — единая лента доход/расход, сводка баланса.
- **Подключения** (`connections`) — заготовка под настройку доступов Radmin API / Rovena-Staff / Rovena-Bot: base URL + ключ на каждый источник отдельно.
- **audit_log** — история изменений (кто/когда/что), пригодится для бухгалтерской отчётности.

Всё это уже сущности, спроектированные с учётом того, что источников данных будет три (CRM/Staff/Bot) — у каждой записи есть поле `source`.

## Структура

```
src/
  main/            # Electron main process
    index.js       # точка входа, создание окна
    db.js          # схема SQLite + инициализация
    ipcHandlers.js # вся бизнес-логика через IPC (orders/bookings/finance/connections)
  preload/
    index.js       # безопасный мост window.rovena.* в renderer (contextIsolation)
  renderer/
    index.html
    src/
      App.jsx
      main.jsx
      styles.css
      pages/
        Dashboard.jsx
        Bookings.jsx
        Orders.jsx
        Finance.jsx
        Connections.jsx
```

## Установка и запуск

```bash
npm install
npm run dev        # окно Electron с hot-reload
```

## Сборка дистрибутива

```bash
npm run build:win    # или build:linux / build:mac
```

## Дальше по плану (не реализовано в стартовой сборке)

1. **Radmin API клиент** — модуль в `src/main/` для запросов к статическому API Radmin (сейчас `connections.radmin_api` только хранит base_url/ключ, реального клиента нет — добавить `radminApi.js` и вызывать его из `ipcHandlers.js`, например при синхронизации остатков).
2. **Синхронизация Staff/Bot → CRM** — сейчас все брони/заказы создаются только локально из CRM. Когда появится общий backend (обсуждали в переписке — единая точка, через которую Staff и Bot пишут данные), сюда нужно будет добавить либо периодический pull, либо приём вебхуков/событий.
3. **Права доступа** — сейчас CRM работает как единственный админ без ролей. Если появятся несколько сотрудников с разным доступом (например, к бухгалтерии) — нужна таблица `users` и простая авторизация.
4. **Статусы `connections`** (`online`/`offline`) сейчас не обновляются автоматически — нужен health-check по расписанию.

## Примечание про безопасность

`contextIsolation: true` и `nodeIntegration: false` включены в `main/index.js` — renderer не имеет прямого доступа к Node.js/файловой системе, только к тому, что явно прокинуто через `preload/index.js` (`window.rovena.*`). Это специально для того, чтобы UI (в т.ч. если когда-нибудь будет грузить внешний контент) не мог напрямую трогать БД или диск.
