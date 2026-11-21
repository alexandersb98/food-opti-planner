import { useId, useRef, useState } from 'react'
import { api } from '../../../api/client'
import type { Attribute, Ingredient, UpdatedValue } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import './updated-values.css'

type Answer = 'accept' | 'keep'

/** The form's values as typed, by attribute id. */
export type TypedValues = Partial<Record<number, string>>

/**
 * The typed values after an answer: Accept takes the new numbers; Keep mine
 * keeps them and puts the 0 the server stored where the ingredient had no
 * value and nothing was typed, so that saving the form does not delete that
 * row and bring the banner back.
 */
export function answeredValues(values: TypedValues, shown: readonly UpdatedValue[], answer: Answer): TypedValues {
  const next = { ...values }
  for (const { attribute_id, value, new_value } of shown) {
    if (answer === 'accept') next[attribute_id] = new_value
    else if (value === null && !next[attribute_id]?.trim()) next[attribute_id] = '0'
  }
  return next
}

/**
 * The data source has new numbers for a linked ingredient (story 164): a note
 * listing each attribute's own value and the new one ("Protein 13.5 g →
 * 13.8 g"), with Keep mine and Accept. Renders nothing for an ingredient
 * without a source or without updates for known attributes.
 *
 * After an answer the host gets the ingredient as the server sent it and a
 * function that fills the typed values to match; other edits stay.
 */
export function UpdatedValues({
  ingredient,
  attributes,
  onAnswered,
}: {
  ingredient: Ingredient | null
  attributes: readonly Attribute[]
  onAnswered: (ingredient: Ingredient, fill: (values: TypedValues) => TypedValues) => void
}) {
  const t = useT()
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sending = useRef(false)

  if (!ingredient?.source) return null
  const shown = ingredient.updated_values
  const byId = new Map(attributes.map((attribute) => [attribute.id, attribute]))
  // An update for an attribute this page does not know is skipped.
  const lines = shown.flatMap((update) => {
    const attribute = byId.get(update.attribute_id)
    return attribute ? [{ update, attribute }] : []
  })
  if (lines.length === 0) return null
  const { id } = ingredient

  async function answer(choice: Answer) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setFailed(false)
    try {
      const { data } = await api.POST('/api/ingredients/{ingredient_id}/source-values', {
        params: { path: { ingredient_id: id } },
        body: { answer: choice },
      })
      if (!data) throw new Error('no answer')
      onAnswered(data, (values) => answeredValues(values, shown, choice))
    } catch {
      setFailed(true)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <section className="updated-values" role="status" aria-labelledby={titleId}>
      <h2 className="updated-values-title" id={titleId}>
        {t('ingredients.updatedValues')}
      </h2>
      <p className="updated-values-lead">{t('ingredients.updatedValuesLead')}</p>
      <ul className="updated-values-list">
        {lines.map(({ update, attribute }) => (
          <li key={attribute.id} className="updated-values-line">
            <span className="updated-values-name">{attribute.name}</span>{' '}
            <span className="updated-values-old" translate="no">
              {update.value === null ? t('ingredients.noValue') : withUnit(update.value, attribute.unit)}
            </span>
            <span className="updated-values-arrow"> → </span>
            <span className="updated-values-new" translate="no">{withUnit(update.new_value, attribute.unit)}</span>
          </li>
        ))}
      </ul>
      {failed ? (
        <p className="updated-values-alert" role="alert">
          {t('ingredients.sourceValuesFailed')}
        </p>
      ) : null}
      <div className="updated-values-actions">
        <Button small disabled={busy} onClick={() => answer('keep')}>
          {t('ingredients.keepMine')}
        </Button>
        <Button small variant="primary" disabled={busy} onClick={() => answer('accept')}>
          {t('ingredients.accept')}
        </Button>
      </div>
    </section>
  )
}

function withUnit(value: string, unit: string) {
  return `${value} ${unit}`.trim()
}
