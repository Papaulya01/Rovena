import { useI18n, LANGUAGES } from '../i18n/index.jsx'

/** Сегмент из 3 кнопок языков — для экрана входа/первого запуска (вместо выпадающего списка). */
export default function LanguageButtons({ className = '' }) {
  const { lang, setLang } = useI18n()
  return (
    <div className={`lang-buttons ${className}`}>
      {LANGUAGES.map((l) => (
        <button
          key={l.value}
          type="button"
          className={`lang-button ${lang === l.value ? 'active' : ''}`}
          onClick={() => setLang(l.value)}
          title={l.label}
        >
          {l.shortLabel}
        </button>
      ))}
    </div>
  )
}
