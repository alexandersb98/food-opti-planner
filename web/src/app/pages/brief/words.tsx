import { Fragment, isValidElement, type ReactNode } from 'react'
import type { Named, Translate } from '../../../translator'

// Small helpers for the brief's editorial copy: numbers in words, a
// sentence's first letter, and messages with an element in them.

/** "five": numbers from one to twelve in words, as a magazine sets them;
 * figures from 13 on (and for 0, which the messages' zero forms say). */
export function numberWord(t: Translate, n: number): string {
  return Number.isInteger(n) && n >= 1 && n <= 12 ? t(`brief.numbers.${n}`) : String(n)
}

/** The text with its first letter in upper case: "five days" → "Five days". */
export function capitalised(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

// Marks where an element goes in a translated message (a private-use
// character, which no message contains).
const MARK = '\u{E000}'

/**
 * A message with React elements in its placeholders, e.g. "This week’s
 * {brief}" with `{ brief: <em>…</em> }`: the words stay one message (so a
 * translation can move the element), the element keeps its markup.
 */
export function richText(t: Translate, key: string, named: Record<string, ReactNode>, count?: number): ReactNode[] {
  const plain: Named = {}
  for (const [name, value] of Object.entries(named)) {
    plain[name] = isValidElement(value) ? `${MARK}${name}${MARK}` : value
  }
  const text = count === undefined ? t(key, plain) : t(key, plain, count)
  return text.split(MARK).map((part, index) =>
    index % 2 ? <Fragment key={index}>{named[part]}</Fragment> : part,
  )
}
