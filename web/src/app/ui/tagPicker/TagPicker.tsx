import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { Tag } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { Chip, Chips } from '../chips/Chips'
import { Disclosure } from '../disclosure/Disclosure'
import './tag-picker.css'

/**
 * Tags to choose from a long catalogue: the chosen ones as pressed chips
 * (press one to take it off), the others behind "Add a tag", narrowed by a
 * find box. Locked tags (a recipe's tags from its ingredients) show chosen,
 * disabled, with `lockedNote`; `hint` sits right under the chosen chips.
 *
 * ```tsx
 * <TagPicker labelledBy={headingId} tags={tags} chosen={draft.tagIds} onToggle={toggleTag} />
 * ```
 */
export function TagPicker({
  tags,
  chosen,
  locked,
  lockedNote,
  hint,
  labelledBy,
  onToggle,
}: {
  /** The whole catalogue, in the order to show it. */
  tags: readonly Tag[]
  chosen: ReadonlySet<number>
  locked?: ReadonlySet<number>
  lockedNote?: string
  hint?: ReactNode
  /** The id of the heading that names the chosen tags. */
  labelledBy: string
  onToggle: (tagId: number) => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const find = useRef<HTMLInputElement>(null)
  // Where keyboard focus goes once a moved chip has left its row.
  const focusNext = useRef<(() => HTMLElement | null | undefined) | null>(null)

  const isOn = (tag: Tag) => chosen.has(tag.id) || (locked?.has(tag.id) ?? false)
  const on = tags.filter(isOn)
  const off = tags.filter((tag) => !isOn(tag))
  const text = query.trim().toLocaleLowerCase()
  const matching = text ? off.filter((tag) => tag.name.toLocaleLowerCase().includes(text)) : off

  useLayoutEffect(() => {
    const target = focusNext.current?.()
    focusNext.current = null
    target?.focus()
  })

  // From the keyboard (no click count), keep the reader's place: the next
  // chosen chip, else "Add a tag"; after adding, the find box.
  function takeOff(tagId: number, event: MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) {
      const chips = Array.from(row.current?.querySelectorAll<HTMLButtonElement>('.chip:not(:disabled)') ?? [])
      const at = chips.indexOf(event.currentTarget)
      const next = chips[at + 1] ?? chips[at - 1]
      focusNext.current = () => next ?? root.current?.querySelector<HTMLElement>('.disclosure-summary')
    }
    onToggle(tagId)
  }

  function putOn(tagId: number, event: MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) focusNext.current = () => find.current
    onToggle(tagId)
  }

  // Enter in the find box must not submit the form around it: it adds the
  // one tag that matches, and otherwise does nothing.
  function onFindKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (text && matching.length === 1) {
      onToggle(matching[0].id)
      setQuery('')
    }
  }

  return (
    <div className="tag-picker" ref={root}>
      <div className="tag-picker-chosen">
        {on.length > 0 ? (
          <div ref={row}>
            <Chips labelledBy={labelledBy}>
              {on.map((tag) =>
                locked?.has(tag.id) ? (
                  <Chip key={tag.id} pressed disabled note={lockedNote}>
                    {tag.name}
                  </Chip>
                ) : (
                  <Chip key={tag.id} pressed onClick={(event) => takeOff(tag.id, event)}>
                    {tag.name}
                  </Chip>
                ),
              )}
            </Chips>
          </div>
        ) : (
          <p className="tag-picker-none">{t('tagPicker.none')}</p>
        )}
        {hint}
      </div>
      {off.length > 0 ? (
        <Disclosure
          className="tag-picker-add"
          summary={
            <>
              {t('tagPicker.add')}
              <span className="tag-picker-count">{t('tagPicker.more', { n: off.length })}</span>
            </>
          }
        >
          <div className="tag-picker-find">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
              <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <input
              ref={find}
              className="tag-picker-find-input"
              type="search"
              aria-label={t('tagPicker.find')}
              placeholder={t('tagPicker.find')}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onFindKey}
            />
          </div>
          {matching.length > 0 ? (
            <Chips label={t('tagPicker.others')} className="tag-picker-others">
              {matching.map((tag) => (
                <Chip key={tag.id} pressed={false} onClick={(event) => putOn(tag.id, event)}>
                  {tag.name}
                </Chip>
              ))}
            </Chips>
          ) : (
            <p className="tag-picker-none" aria-hidden="true">
              {t('tagPicker.noMatch', { query: query.trim() })}
            </p>
          )}
          <p className="visually-hidden" role="status">
            {!text ? '' : matching.length > 0 ? t('tagPicker.matches', matching.length) : t('tagPicker.noMatch', { query: query.trim() })}
          </p>
        </Disclosure>
      ) : null}
    </div>
  )
}
