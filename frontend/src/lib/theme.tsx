import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getTranslation, type TranslationKey } from './i18n'

type Theme = 'light' | 'dark'
type Language = 'en' | 'zh' | 'ms'

interface ThemeContextType {
  theme: Theme
  setTheme: (t: Theme) => void
  language: Language
  setLanguage: (l: Language) => void
  t: (key: TranslationKey, params?: Record<string, string>) => string
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const LANG_LABELS: Record<Language, string> = {
  en: 'English',
  zh: '中文',
  ms: 'Bahasa Melayu',
}

export { LANG_LABELS }
export type { Theme, Language }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language')
    if (saved === 'en' || saved === 'zh' || saved === 'ms') return saved
    return 'en'
  })

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('theme', t)
  }

  const setLanguage = (l: Language) => {
    setLanguageState(l)
    localStorage.setItem('language', l)
  }

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string>) => getTranslation(language, key, params),
    [language]
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, language, setLanguage, t }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
