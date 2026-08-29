import { useEffect, useRef, useState } from 'react'

/**
 * Один компонент на два состояния: если пользователей ещё нет — это экран
 * первичной настройки (создать первого админа + назвать первое заведение),
 * иначе — обычный вход. Логин запоминается локально ("последний вход"), пароль — никогда.
 */
export default function Login({ onAuthenticated }) {
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
      setError(
        needsSetup
          ? 'Не получилось создать аккаунт — логин занят или пароль короче 6 символов'
          : 'Неверный логин или пароль'
      )
    } finally {
      setBusy(false)
    }
  }

  if (needsSetup === null) return null

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand" style={{ justifyContent: 'center', borderBottom: 'none', marginBottom: 8 }}>
          <img src="./logo.png" alt="" className="brand-mark" />
          <span>
            Rovena
            <small>CRM · ADMIN</small>
          </span>
        </div>

        <h2>{needsSetup ? 'Первый запуск' : 'Вход'}</h2>
        <p className="auth-sub">
          {needsSetup
            ? 'Создайте аккаунт администратора и назовите первое заведение'
            : 'Введите логин и пароль'}
        </p>

        <form onSubmit={handleSubmit}>
          {needsSetup && (
            <>
              <div style={{ marginBottom: 12 }}>
                <label>Название заведения</label>
                <input
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder="напр. Rovena на Мустакиллик"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Ваше имя (необязательно)</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Как к вам обращаться"
                />
              </div>
            </>
          )}
          <div style={{ marginBottom: 12 }}>
            <label>Логин</label>
            <input ref={usernameRef} value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>Пароль</label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={needsSetup ? 6 : undefined}
            />
            {needsSetup && <div className="auth-hint">Минимум 6 символов</div>}
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Подождите...' : needsSetup ? 'Создать и войти' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
