import { useI18n, LANGUAGES } from '../i18n/index.jsx'

/** Компактный переключатель языка — используется на экране входа и в сайдбаре CRM. */
export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang } = useI18n()
  return (
    <select className={`lang-switcher ${className}`} value={lang} onChange={(e) => setLang(e.target.value)}>
      {LANGUAGES.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  )
}
