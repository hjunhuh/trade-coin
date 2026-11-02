import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './en'
import { ko } from './ko'

export const LANGUAGES = ['ko', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'trade-coin.lang'

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ko' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

document.documentElement.lang = i18n.language
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    /* storage unavailable */
  }
})

export default i18n
