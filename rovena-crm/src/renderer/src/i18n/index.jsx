import { createContext, useContext, useEffect, useState } from 'react'
import ru from './ru.js'
import uzLatn from './uz-latn.js'
import uzCyrl from './uz-cyrl.js'

export const LANGUAGES = [
  { value: 'ru', label: 'Русский' },
  { value: 'uz-latn', label: "O'zbekcha (lotin)" },
  { value: 'uz-cyrl', label: 'Ўзбекча (кирилл)' }
]

const DICTS = { ru, 'uz-latn': uzLatn, 'uz-cyrl': uzCyrl }

const I18nContext = createContext({ lang: 'ru', setLang: () => {}, t: (key) => key })

function lookup(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dict)
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState('ru')

  useEffect(() => {
    window.rovena.auth.getLanguage().then((l) => {
      if (l && DICTS[l]) setLangState(l)
    })
  }, [])

  async function setLang(l) {
    if (!DICTS[l]) return
    setLangState(l)
    await window.rovena.auth.setLanguage(l)
  }

  function t(key) {
    const value = lookup(DICTS[lang], key) ?? lookup(DICTS.ru, key)
    return value ?? key
  }

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
