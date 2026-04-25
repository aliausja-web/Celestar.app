'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { messages, type Locale, type Messages } from './messages';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isRTL: boolean;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
  isRTL: false,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = (localStorage.getItem('celestar_locale') as Locale) || 'en';
    const valid: Locale[] = ['en', 'ar', 'ur', 'bn'];
    setLocaleState(valid.includes(saved) ? saved : 'en');
  }, []);

  useEffect(() => {
    const isRTL = locale === 'ar' || locale === 'ur';
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem('celestar_locale', l);
    setLocaleState(l);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const parts = key.split('.');
      let obj: any = messages[locale];
      for (const part of parts) {
        obj = obj?.[part];
        if (obj === undefined) break;
      }
      let str = typeof obj === 'string' ? obj : key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.split(`{${k}}`).join(String(v));
        }
      }
      return str;
    },
    [locale]
  );

  const isRTL = locale === 'ar' || locale === 'ur';

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, isRTL }}>
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);
