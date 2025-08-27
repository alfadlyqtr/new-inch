import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// i18n setup
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Minimal resources; expand as you translate screens
const resources = {
  en: { translation: { Language: 'Language' } },
  ar: { translation: { Language: 'اللغة' } },
  hi: { translation: { Language: 'भाषा' } },
  ne: { translation: { Language: 'भाषा' } },
  tl: { translation: { Language: 'Wika' } },
  bn: { translation: { Language: 'ভাষা' } },
}

if (!i18next.isInitialized) {
  i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: 'en',
      supportedLngs: ['en', 'ar', 'hi', 'ne', 'tl', 'bn'],
      detection: {
        order: ['localStorage', 'navigator', 'htmlTag'],
        caches: ['localStorage'],
      },
      interpolation: { escapeValue: false },
    })
    .then(() => {
      const lng = i18next.language || 'en'
      document.documentElement.setAttribute('lang', lng)
      document.documentElement.setAttribute('dir', i18next.dir(lng))
    })
}

// Keep dir/lang in sync when language changes
i18next.on('languageChanged', (lng) => {
  document.documentElement.setAttribute('lang', lng)
  document.documentElement.setAttribute('dir', i18next.dir(lng))
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
