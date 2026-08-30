import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/index.jsx'
import LanguageButtons from '../components/LanguageButtons.jsx'

/**
 * Один компонент на два состояния: если пользователей ещё нет — это экран
 * первичной настройки (создать первого админа + назвать первое заведение),
 * иначе — обычный вход. Логин запоминается локально ("последний вход"), пароль — никогда.
 */
export default function Login({ onAuthenticated }) {
  const { t } = useI18n()
  const [needsSetup, setNeedsSetup] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [venueName, setVenueName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const usernameRef = useRef(null)
  const passwordRef = useRef(null)

  useEffect(() => {
    window.rovena.auth.hasUsers().then((hasUsers) => {
      setNeedsSetup(!hasUsers)
      if (hasUsers) {
        window.rovena.auth.lastUsername().then((u) => {
          if (u) {
            setUsername(u)
            // Логин уже известен — сразу в пароль, незачем печатать логин заново.
            setTimeout(() => passwordRef.current?.focus(), 0)
          } else {
            setTimeout(() => usernameRef.current?.focus(), 0)
          }
        })
      } else {
        setTimeout(() => usernameRef.current?.focus(), 0)
      }
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const session = needsSetup
        ? await window.rovena.auth.setup({ username, password, displayName, venueName })
        : await window.rovena.auth.login({ username, password })
      onAuthenticated(session)
    } catch (err) {
      setError(needsSetup ? t('login.setupError') : t('login.wrongCredentials'))
    } finally {
      setBusy(false)
    }
  }

  if (needsSetup === null) return null

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <LanguageButtons />
        <div className="brand" style={{ justifyContent: 'center', borderBottom: 'none', marginBottom: 8 }}>
          <img src="./logo.png" alt="" className="brand-mark" />
          <span>
            Rovena
            <small>{t('login.brandTagline')}</small>
          </span>
        </div>

        <h2>{needsSetup ? t('login.setupTitle') : t('login.loginTitle')}</h2>
        <p className="auth-sub">{needsSetup ? t('login.setupSubtitle') : t('login.loginSubtitle')}</p>

        <form onSubmit={handleSubmit}>
          {needsSetup && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label>{t('login.venueName')}</label>
                <input
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder={t('login.venueNamePlaceholder')}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>{t('login.yourName')}</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('login.yourNamePlaceholder')}
                />
              </div>
            </>
          )}
          <div style={{ marginBottom: 12 }}>
            <label>{t('login.username')}</label>
            <input ref={usernameRef} value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>{t('login.password')}</label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={needsSetup ? 6 : undefined}
            />
            {needsSetup && <div className="auth-hint">{t('login.minChars')}</div>}
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy
              ? needsSetup
                ? t('login.creating')
                : t('login.enteringIn')
              : needsSetup
                ? t('login.createAndEnter')
                : t('login.enter')}
          </button>
        </form>
      </div>
    </div>
  )
}
