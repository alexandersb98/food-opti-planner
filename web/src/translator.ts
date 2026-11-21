import en from './i18n/en.json'

// The app's translator, framework-neutral: it reads the message files as they
// are (written for vue-i18n) and implements the part of vue-i18n's message
// format they use: named placeholders ("{name}"), plural forms separated by
// "|" (one | other, or zero | one | other), and the implicit "{n}" and
// "{count}" when a count is given. Linked messages ("@:"), literals ("{'…'}")
// and list placeholders ("{0}") are not supported; the translator test fails
// if a message uses them.

/** A message file: nested objects of messages, keyed by dotted paths. */
export interface Messages {
  [key: string]: string | Messages
}

/** The named values a message's placeholders are filled from. */
export type Named = Record<string, unknown>

/** Translates a key in one of four shapes: `t(key)`, `t(key, named)`,
 * `t(key, count)` and `t(key, named, count)`. It fits the `Translate` types
 * the framework-neutral modules (goals, clash, misses, unit change) take. */
export interface Translate {
  (key: string, count: number): string
  (key: string, named?: Named, count?: number): string
}

/** Which of a message's plural forms a count picks, given how many forms the
 * message has. */
export type PluralRule = (count: number, forms: number) => number

/** A language the app can be shown in. */
export interface Locale {
  /** The BCP 47 code, such as "en". */
  code: string
  /** The language's own name for itself, for a language choice. */
  name: string
  messages: Messages
  plural: PluralRule
}

/** English plural choice, as vue-i18n's default: two forms are one | other,
 * three are zero | one | other. */
export const englishPlural: PluralRule = (count, forms) => {
  const n = Math.abs(count)
  if (forms === 2) return n === 1 ? 0 : 1
  return n === 0 ? 0 : n === 1 ? 1 : 2
}

/** The languages the app has, in the order a language choice lists them.
 * Swedish is added here as another file. */
export const locales: readonly Locale[] = [{ code: 'en', name: 'English', messages: en, plural: englishPlural }]

/** The locale with this code, or the first one. */
export function findLocale(code: string): Locale {
  return locales.find((locale) => locale.code === code) ?? locales[0]
}

/** A message split into its plural forms, each split into text and
 * placeholder names (odd indexes are names). */
type Compiled = string[][]

const PLACEHOLDER = /\{(\w+)\}/

function compile(message: string): Compiled {
  // vue-i18n drops the spaces next to each "|", but keeps a message's own
  // leading and trailing spaces.
  return message.split(/\s*\|\s*/).map((form) => form.split(PLACEHOLDER))
}

function display(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) return JSON.stringify(value, null, 2)
  return String(value)
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages
  for (const part of key.split('.')) {
    if (typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** Which plural form to show. As in vue-i18n, a number given as the named
 * value "count" or "n" decides before the count; with neither, the form a
 * count of 1 would pick. */
function formIndex(locale: Locale, forms: number, named: Named, count: number | undefined): number {
  const choice = [named.count, named.n, count].find((value) => typeof value === 'number') ?? 1
  return Math.min(locale.plural(choice, forms), forms - 1)
}

/** A translator for `locale`. A key with no message translates to the key
 * itself, visibly, and is reported to `onMissing`. */
export function makeTranslator(locale: Locale, onMissing: (key: string) => void = () => {}): Translate {
  const cache = new Map<string, Compiled>()

  return (key: string, namedOrCount?: Named | number, maybeCount?: number): string => {
    const count = typeof namedOrCount === 'number' ? namedOrCount : maybeCount
    const given = typeof namedOrCount === 'object' ? namedOrCount : {}
    let compiled = cache.get(key)
    if (!compiled) {
      const message = lookup(locale.messages, key)
      if (message === undefined) {
        onMissing(key)
        return key
      }
      compiled = compile(message)
      cache.set(key, compiled)
    }
    const form = compiled.length === 1 ? compiled[0] : compiled[formIndex(locale, compiled.length, given, count)]
    // As in vue-i18n, a count fills "{n}" and "{count}" where no truthy
    // named value of that name is given.
    const named = count === undefined ? given : { ...given, n: given.n || count, count: given.count || count }
    return form.map((part, index) => (index % 2 ? display(named[part]) : part)).join('')
  }
}
