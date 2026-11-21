import { useRef, useState, type MouseEvent } from 'react'
import type { Tag } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { Chip, Chips } from '../chips/Chips'
import { Disclosure } from '../disclosure/Disclosure'
import './tag-picker.css'

/**
 * Tags to choose from a long catalogue: the chosen ones as pressed chips
 * (press one to take it off), the others behind "Add a tag", narrowed by a
 * find box. Locked tags (a recipe's tags from its ingredients) show chosen,
 * disabled, with `lockedNote`.
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
  labelledBy,
  onToggle,
}: {
  /** The whole catalogue, in the order to show it. */
  tags: readonly Tag[]
  chosen: ReadonlySet<number>
  locked?: ReadonlySet<number>
  lockedNote?: string
  /** The id of the heading that names the chosen tags. */
  labelledBy: string
  onToggle: (tagId: number) => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const row = useRef<HTMLDivElement>(null)
  const find = useRef<HTMLInputElement>(null)

  const isOn = (tag: Tag) => chosen.has(tag.id) || (locked?.has(tag.id) ?? false)
  const on = tags.filter(isOn)
  const off = tags.filter((tag) => !isOn(tag))
  const text = query.trim().toLocaleLowerCase()
  const matching = text ? off.filter((tag) => tag.name.toLocaleLowerCase().includes(text)) : off

  // A chip leaves its row when pressed. From the keyboard (no click count),
  // keep the reader's place: the next chosen chip, or the find box.
  function takeOff(tagId: number, event: MouseEvent<HTMLButtonElement>) {
    const fromKeyboard = event.detail === 0
    const chips = Array.from(row.current?.querySelectorAll<HTMLButtonElement>('.chip:not(:disabled)') ?? [])
    const at = chips.indexOf(event.currentTarget)
    const next = chips[at + 1] ?? chips[at - 1]
    onToggle(tagId)
    if (fromKeyboard) next?.focus()
  }

  function putOn(tagId: number, event: MouseEvent<HTMLButtonElement>) {
    const fromKeyboard = event.detail === 0
    onToggle(tagId)
    if (fromKeyboard) find.current?.focus()
  }

  return (
    <div className="tag-picker">
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
          <input
            ref={find}
            className="tag-picker-find"
            type="search"
            aria-label={t('tagPicker.find')}
            placeholder={t('tagPicker.find')}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {matching.length > 0 ? (
            <Chips label={t('tagPicker.others')} className="tag-picker-others">
              {matching.map((tag) => (
                <Chip key={tag.id} pressed={false} onClick={(event) => putOn(tag.id, event)}>
                  {tag.name}
                </Chip>
              ))}
            </Chips>
          ) : (
            <p className="tag-picker-none" role="status">
              {t('tagPicker.noMatch', { query: query.trim() })}
            </p>
          )}
        </Disclosure>
      ) : null}
    </div>
  )
}
