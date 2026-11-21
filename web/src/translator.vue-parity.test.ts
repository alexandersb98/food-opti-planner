import { expect, test } from 'vitest'
import { makeI18n } from './i18n'
import { findLocale, makeTranslator, type Messages } from './translator'

// While the Vue app lives, the translator must say exactly what vue-i18n
// says for every English message. Ticket 42 (the swap) deletes this file
// together with vue-i18n.

function flatten(messages: Messages, prefix = ''): [string, string][] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [[prefix + key, value] as [string, string]] : flatten(value, `${prefix}${key}.`),
  )
}

test('every English message reads as vue-i18n reads it, in every call shape', () => {
  const { t: vue } = makeI18n().global
  const t = makeTranslator(findLocale('en'))
  for (const [key, message] of flatten(findLocale('en').messages)) {
    const named = Object.fromEntries([...message.matchAll(/\{(\w+)\}/g)].map(([, name], i) => [name, i % 2 ? i : `«${name}»`]))
    expect(t(key), key).toBe(vue(key))
    expect(t(key, named), key).toBe(vue(key, named))
    expect(t(key, {}), key).toBe(vue(key, {}))
    for (const count of [0, 1, 2, 7]) {
      expect(t(key, count), `${key} ${count}`).toBe(vue(key, count))
      expect(t(key, named, count), `${key} ${count}`).toBe(vue(key, named, count))
    }
  }
})
