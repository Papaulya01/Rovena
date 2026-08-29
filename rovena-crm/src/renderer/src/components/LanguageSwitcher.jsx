import { useI18n, LANGUAGES } from '../i18n/index.jsx'
import Select from './Select.jsx'

/** Компактный переключатель языка — используется на экране входа и в сайдбаре CRM. */
export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang } = useI18n()
  return (
    <Select
      value={lang}
      onChange={setLang}
      options={LANGUAGES}
      style={{ minWidth: 150 }}
      className={`lang-switcher ${className}`}
    />
  )
}
