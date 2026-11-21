import { useEffect, useId, useState, type CSSProperties } from 'react'
import type { Tag } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import { Field } from '../../ui/field/Field'
import { Select } from '../../ui/select/Select'
import { EquivalentPicker } from './EquivalentPicker'
import type { Derive } from './tagText'

/** The open row's fields as typed. */
export interface Draft {
  name: string
  derive: Derive
  equivalentIds: number[]
}

export interface DraftErrors {
  name: string
  save: string
}

/**
 * The open row, annotated in place with the red pencil: the name (a source
 * tag's is fixed), the rule as a sentence with its choice inline, and the
 * equivalent tags as removable chips with a picker. Done saves and closes
 * (in the page); a new tag has Cancel instead of Delete and no equivalent
 * tags yet.
 */
export function TagEditor({
  tag,
  isNew,
  draft,
  onDraft,
  errors,
  saving,
  tags,
  byId,
  onDone,
  onCancel,
  onDelete,
}: {
  tag: Tag
  isNew: boolean
  draft: Draft
  onDraft: (update: Partial<Draft>) => void
  errors: DraftErrors
  saving: boolean
  tags: readonly Tag[]
  byId: ReadonlyMap<number, Tag>
  onDone: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const t = useT()
  const id = useId()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerKey, setPickerKey] = useState(0)

  // Opening the row puts the cursor in its first field.
  useEffect(() => {
    ;(document.getElementById(`${id}-name`) ?? document.getElementById(`${id}-rule`))?.focus()
  }, [id])

  // A refused name takes the cursor back to the name.
  useEffect(() => {
    if (errors.name) document.getElementById(`${id}-name`)?.focus()
  }, [errors.name, id])

  const deriveOptions = (['all', 'any'] as const).map((derive) => ({ value: derive, label: t(`tags.derive.${derive}`) }))
  const source = tag.source

  return (
    <form
      className="tags-edit"
      aria-label={isNew ? t('tags.new') : tag.name}
      onSubmit={(event) => {
        event.preventDefault()
        onDone()
      }}
    >
      {source ? (
        <div className="tags-edit-source" style={{ '--tags-source': source.colour } as CSSProperties}>
          <p className="tags-edit-name">
            <span className="tags-swatch" aria-hidden="true" />
            {tag.name}
          </p>
          <p className="tags-edit-note">{t('tags.sourceTagNote', { source: source.name })}</p>
        </div>
      ) : (
        <Field id={`${id}-name`} label={t('common.name')} error={errors.name}>
          {(control) => (
            <input
              {...control}
              className="annot tags-name-in"
              name="name"
              autoComplete="off"
              enterKeyHint="done"
              value={draft.name}
              onChange={(event) => onDraft({ name: event.target.value })}
            />
          )}
        </Field>
      )}

      <p className="tags-rule-line">
        <label htmlFor={`${id}-rule`}>{t('tags.deriveLabel')}</label>{' '}
        <Select
          id={`${id}-rule`}
          annotation
          value={draft.derive}
          options={deriveOptions}
          onValueChange={(value) => onDraft({ derive: value as Derive })}
        />
      </p>

      {isNew ? null : (
        <section className="tags-equiv" aria-labelledby={`${id}-equiv`}>
          <h3 id={`${id}-equiv`} className="tags-equiv-title">
            {t('tags.group.equivalent')}
          </h3>
          <p className="tags-equiv-hint">{t('tags.group.equivalentHint')}</p>
          {draft.equivalentIds.length ? (
            <ul className="tags-chips">
              {draft.equivalentIds.map((other) => {
                const name = byId.get(other)?.name ?? ''
                return (
                  <li key={other} className="tags-chip">
                    <span>{name}</span>
                    <button
                      type="button"
                      className="tags-chip-remove"
                      aria-label={t('tags.group.remove', { name })}
                      onClick={() => onDraft({ equivalentIds: draft.equivalentIds.filter((id) => id !== other) })}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="tags-none">{t('tags.group.none')}</p>
          )}
          <Button
            variant="text"
            onClick={() => {
              setPickerKey((key) => key + 1)
              setPickerOpen(true)
            }}
          >
            {t('tags.group.add')}
          </Button>
          <EquivalentPicker
            key={pickerKey}
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            tagId={tag.id}
            chosen={draft.equivalentIds}
            tags={tags}
            byId={byId}
            onPick={(picked) => {
              onDraft({ equivalentIds: [...draft.equivalentIds, picked] })
              setPickerOpen(false)
            }}
          />
        </section>
      )}

      {errors.save ? (
        <p className="tags-edit-error" role="alert">
          {errors.save}
        </p>
      ) : null}

      <div className="tags-edit-actions">
        {isNew ? (
          <Button variant="ghost" small onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : source ? null : (
          <Button variant="text" className="tags-delete" onClick={onDelete}>
            {t('common.delete')}
          </Button>
        )}
        <Button type="submit" variant="primary" small className="tags-done" aria-busy={saving || undefined}>
          {t('common.done')}
        </Button>
      </div>
    </form>
  )
}
