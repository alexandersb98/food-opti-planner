import { createContext, use, useMemo, useState, type ReactNode } from 'react'
import { findLocale, locales, makeTranslator, type Locale, type Translate } from '../../translator'

interface I18n {
  t: Translate
  /** The locale the app is shown in. */
  locale: Locale
  /** Every locale the app has; a language choice shows only when there is
   * more than one. */
  locales: readonly Locale[]
  setLocale: (code: string) => void
}

const I18nContext = createContext<I18n | null>(null)

/** In development a missing message is logged; tests pass their own
 * reporter (the app harness fails the test). */
function warnMissing(key: string) {
  if (import.meta.env.DEV) console.warn(`No message for "${key}"`)
}

/** Gives the app its translator. Wraps the app root and the test harness. */
export function I18nProvider({
  children,
  initialLocale = 'en',
  onMissing = warnMissing,
}: {
  children: ReactNode
  initialLocale?: string
  onMissing?: (key: string) => void
}) {
  const [code, setLocale] = useState(initialLocale)
  const value = useMemo(() => {
    const locale = findLocale(code)
    return { t: makeTranslator(locale, onMissing), locale, locales, setLocale }
  }, [code, onMissing])
  return <I18nContext value={value}>{children}</I18nContext>
}

function useI18n(): I18n {
  const i18n = use(I18nContext)
  if (!i18n) throw new Error('useT needs an I18nProvider above it')
  return i18n
}

/** The translator: `t(key)`, `t(key, named)`, `t(key, count)` or
 * `t(key, named, count)`. */
export function useT(): Translate {
  return useI18n().t
}

/** The locale, the locales the app has, and a way to change the locale. */
export function useLocale(): Pick<I18n, 'locale' | 'locales' | 'setLocale'> {
  const { locale, setLocale } = useI18n()
  return { locale, locales, setLocale }
}
