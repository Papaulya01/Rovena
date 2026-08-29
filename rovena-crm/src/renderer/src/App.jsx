import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Bookings from './pages/Bookings.jsx'
import Tables from './pages/Tables.jsx'
import Orders from './pages/Orders.jsx'
import Menu from './pages/Menu.jsx'
import Finance from './pages/Finance.jsx'
import Employees from './pages/Employees.jsx'
import Connections from './pages/Connections.jsx'
import Venues from './pages/Venues.jsx'
import Login from './pages/Login.jsx'
import CashierPanel from './pages/CashierPanel.jsx'
import { useI18n } from './i18n/index.jsx'
import LanguageSwitcher from './components/LanguageSwitcher.jsx'
import {
  IconDashboard,
  IconCalendar,
  IconBag,
  IconList,
  IconWallet,
  IconLink,
  IconTable,
  IconVenue,
  IconEmployees
} from './components/icons.jsx'

// Роли (27.08.2026): admin — всё; accountant — бухгалтерия/сотрудники/обзор;
// warehouse — пока только обзор (экран склада ещё не сделан); cashier —
// работает в Rovena-Staff, в CRM ему открывать нечего (см. CashierNotice).
const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', end: true, icon: IconDashboard, roles: ['admin', 'accountant', 'warehouse'] },
  { to: '/bookings', labelKey: 'nav.bookings', icon: IconCalendar, roles: ['admin'] },
  { to: '/tables', labelKey: 'nav.tables', icon: IconTable, roles: ['admin'] },
  { to: '/orders', labelKey: 'nav.orders', icon: IconBag, roles: ['admin'] },
  { to: '/menu', labelKey: 'nav.menu', icon: IconList, roles: ['admin'] },
  { to: '/finance', labelKey: 'nav.finance', icon: IconWallet, roles: ['admin', 'accountant'] },
  { to: '/employees', labelKey: 'nav.employees', icon: IconEmployees, roles: ['admin', 'accountant'] },
  { to: '/venues', labelKey: 'nav.venues', icon: IconVenue, roles: ['admin'] },
  { to: '/connections', labelKey: 'nav.connections', icon: IconLink, roles: ['admin'] }
]

function VenueSwitcher({ session, onChanged }) {
  const [venues, setVenues] = useState([])

  useEffect(() => {
    window.rovena.venues.list().then((all) => setVenues(all.filter((v) => session.venueIds.includes(v.id))))
  }, [session.venueIds.join(',')])

  if (venues.length <= 1) {
    return <div className="venue-current">{venues[0]?.name || '—'}</div>
  }

  return (
    <select
      className="venue-select"
      value={session.currentVenueId || ''}
      onChange={async (e) => {
        await window.rovena.auth.selectVenue(Number(e.target.value))
        onChanged()
      }}
    >
      {venues.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  )
}

function NoAccessNotice({ onLogout }) {
  const { t } = useI18n()
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2>{t('noAccess.title')}</h2>
        <p className="auth-sub">{t('noAccess.subtitle')}</p>
        <button className="btn" onClick={onLogout} style={{ width: '100%' }}>
          {t('common.logout')}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const { t } = useI18n()
  const [session, setSession] = useState(undefined) // undefined = ещё загружается, null = не вошли
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    window.rovena.auth.me().then(setSession)
  }, [])

  async function handleLogout() {
    await window.rovena.auth.logout()
    setSession(null)
  }

  async function refreshSession() {
    const fresh = await window.rovena.auth.me()
    setSession(fresh)
    setReloadKey((k) => k + 1)
  }

  if (session === undefined) return null
  if (!session) return <Login onAuthenticated={setSession} />

  if (session.role === 'cashier') {
    return <CashierPanel session={session} onLogout={handleLogout} />
  }

  const navItems = NAV_ITEMS.filter((item) => item.roles.includes(session.role))
  if (navItems.length === 0) return <NoAccessNotice onLogout={handleLogout} />

  const allowedPaths = new Set(navItems.map((i) => i.to))
  const guard = (path, element) => (allowedPaths.has(path) ? element : <Navigate to={navItems[0].to} replace />)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="./logo.png" alt="" className="brand-mark" />
          <span>
            Rovena
            <small>
              {t('login.brandTagline')} · {t(`roles.${session.role}`)}
            </small>
          </span>
        </div>

        <VenueSwitcher session={session} onChanged={refreshSession} />

        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <item.icon />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <LanguageSwitcher />
          <div className="sidebar-footer-row">
            <div>{session.displayName}</div>
            <button className="logout-link" onClick={handleLogout}>
              {t('common.logout')}
            </button>
          </div>
        </div>
      </aside>
      <main className="main" key={reloadKey}>
        <Routes>
          <Route path="/" element={guard('/', <Dashboard />)} />
          <Route path="/bookings" element={guard('/bookings', <Bookings />)} />
          <Route path="/tables" element={guard('/tables', <Tables />)} />
          <Route path="/orders" element={guard('/orders', <Orders />)} />
          <Route path="/menu" element={guard('/menu', <Menu />)} />
          <Route path="/finance" element={guard('/finance', <Finance />)} />
          <Route path="/employees" element={guard('/employees', <Employees />)} />
          <Route path="/venues" element={guard('/venues', <Venues onVenuesChanged={refreshSession} />)} />
          <Route path="/connections" element={guard('/connections', <Connections />)} />
          <Route path="*" element={<Navigate to={navItems[0].to} replace />} />
        </Routes>
      </main>
    </div>
  )
}
