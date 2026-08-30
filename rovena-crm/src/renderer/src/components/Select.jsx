import { useEffect, useRef, useState } from 'react'

/**
 * Нативный <select> отрисовывает открытый список средствами ОС — его нельзя
 * стилизовать через CSS. Этот компонент — полная замена: сам рендерит и
 * закрытое поле, и выпадающий список, под общий дизайн приложения.
 */
export default function Select({ value, onChange, options, placeholder, disabled, style, className = '' }) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function handleToggle() {
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const estimatedListHeight = Math.min(260, options.length * 34 + 8)
      const spaceBelow = window.innerHeight - rect.bottom
      setDropUp(spaceBelow < estimatedListHeight && rect.top > spaceBelow)
    }
    setOpen((v) => !v)
  }

  const current = options.find((o) => String(o.value) === String(value))

  return (
    <div className={`custom-select${open ? ' open' : ''} ${className}`} ref={rootRef} style={style}>
      <button
        type="button"
        className="custom-select-trigger"
        disabled={disabled}
        onClick={handleToggle}
      >
        <span className={current ? '' : 'placeholder'}>{current ? current.label : placeholder || ''}</span>
      </button>
      {open && (
        <div className={`custom-select-list${dropUp ? ' dropup' : ''}`} role="listbox">
          {options.map((o) => (
            <div
              key={o.value}
              role="option"
              aria-selected={String(o.value) === String(value)}
              className={`custom-select-option${String(o.value) === String(value) ? ' selected' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
