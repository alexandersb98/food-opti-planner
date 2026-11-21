import { useRef, useState } from 'react'
import type { Tag } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { Field } from '../../ui/field/Field'
import { Sheet } from '../../ui/sheet/Sheet'
import { namesOf, otherMembers } from './tagText'

/**
 * The sheet that adds an equivalent tag: a search line over every tag that
 * is not the open one or one of its chips yet. A tag already in another
 * group says which tags it is equivalent to now (picking it asks to move
 * it).
 */
export function EquivalentPicker({
  open,
  onClose,
  tagId,
  chosen,
  tags,
  byId,
  onPick,
}: {
  open: boolean
  onClose: () => void
  /** The open tag. */
  tagId: number
  /** Its chips. */
  chosen: readonly number[]
  tags: readonly Tag[]
  byId: ReadonlyMap<number, Tag>
  onPick: (id: number) => void
}) {
  const t = useT()
  const [typed, setTyped] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const query = typed.trim().toLowerCase()
  const choices = tags.filter(
    (tag) => tag.id !== tagId && !chosen.includes(tag.id) && tag.name.toLowerCase().includes(query),
  )

  return (
    <Sheet open={open} onClose={onClose} title={t('tags.group.add')} initialFocus={searchRef}>
      <Field label={t('tags.group.search')} hideLabel>
        {(control) => (
          <input
            {...control}
            ref={searchRef}
            className="tags-search"
            type="search"
            placeholder={t('tags.group.search')}
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        )}
      </Field>
      <div aria-live="polite">
        {choices.length ? (
          <ul className="tags-pick-list">
            {choices.map((tag) => {
              // a member of another group (not the open tag's own)
              const elsewhere = tag.group.length > 0 && !tag.group.includes(tagId)
              return (
                <li key={tag.id}>
                  <button type="button" className="tags-pick" onClick={() => onPick(tag.id)}>
                    <span className="tags-pick-name">{tag.name}</span>
                    {elsewhere ? (
                      <span className="tags-pick-note">
                        {t('tags.group.nowEquivalent', { names: namesOf(byId, otherMembers(tag)) })}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="tags-pick-none">{t('tags.group.noChoices')}</p>
        )}
      </div>
    </Sheet>
  )
}
