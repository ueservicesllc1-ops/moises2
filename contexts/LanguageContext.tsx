'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import translations from '@/lib/translations'

type Language = 'es' | 'en'

interface LanguageContextType {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'es',
  setLang: () => {},
  t: (key: string) => key,
})

export const useLanguage = () => useContext(LanguageContext)

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Language>('es')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('language')
    if (saved === 'en' || saved === 'es') {
      setLang(saved as Language)
    } else {
      const isEnglish = window.navigator.language.startsWith('en')
      if (isEnglish) setLang('en')
    }
  }, [])

  const handleSetLang = (newLang: Language) => {
    setLang(newLang)
    localStorage.setItem('language', newLang)
  }

  const t = (key: string): string => {
    if (!mounted) return key // SSR fallback (optional but safe)
    const keys = key.split('.')
    let val: any = (translations as any)[lang]
    for (const k of keys) {
      if (val === undefined) return key
      val = val[k]
    }
    return val || key
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang: handleSetLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}
