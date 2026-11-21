import { useId, useRef, useState } from 'react'
import { api } from '../../../api/client'
import type { Conversion, Ingredient } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import { useConfirm } from '../../ui/confirm/Confirm'
import { ConversionSheet } from './ConversionSheet'
import './conversions.css'

// A saved ingredient's conversions (story 159): "1 dl = 100 g" with Edit and
// Delete, and "+ Add conversion". Each act is saved at once through the API,
// and the host gets the new list. Delete is off while a recipe uses the
// conversion (the server refuses it too); an AI-suggested one says so.

export interface ConversionsProps {
  ingredient: Pick<Ingredient, 'id' | 'name' | 'unit' | 'conversions'>
  /** After an add, edit or delete, with the ingredient's conversions now. */
  onChange: (conversions: Conversion[]) => void
}

/** Runs `then` once no question (Confirm) is open: the page behind a modal
 * dialog cannot take focus while the question slides away. Gives up waiting
 * after about a second. */
function whenQuestionGone(then: () => void, tries = 0) {
  if (tries >= 20 || !document.querySelector('dialog[open][role="alertdialog"]')) then()
  else setTimeout(() => whenQuestionGone(then, tries + 1), 50)
}

/** Which conversion the sheet edits: null for a new one. */
type Editing = { conversion: Conversion | null } | null

export function Conversions({ ingredient, onChange }: ConversionsProps) {
  const t = useT()
  const [confirm, confirmSheet] = useConfirm()
  const [editing, setEditing] = useState<Editing>(null)
  // The last one edited stays in the sheet while it slides away.
  const [shown, setShown] = useState<Conversion | null>(null)
  const [message, setMessage] = useState('')
  const ownRef = useRef<HTMLDivElement>(null)
  const { conversions } = ingredient

  function open(conversion: Conversion | null) {
    setMessage('')
    setShown(conversion)
    setEditing({ conversion })
  }

  function saved(conversion: Conversion) {
    setEditing(null)
    const others = conversions.filter((c) => c.id !== conversion.id)
    onChange([...others, conversion].sort((a, b) => a.id - b.id))
  }

  async function remove(conversion: Conversion) {
    setMessage('')
    const ok = await confirm({
      title: t('common.deleteTitle', { name: t('conversions.deleteName', { unit: conversion.unit }) }),
      message: <p>{t('common.deleteNothing')}</p>,
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    try {
      const { response } = await api.DELETE('/api/ingredients/{ingredient_id}/conversions/{conversion_id}', {
        params: { path: { ingredient_id: ingredient.id, conversion_id: conversion.id } },
      })
      if (response.ok) {
        onChange(conversions.filter((c) => c.id !== conversion.id))
        // Its row is gone: focus goes on to Add (not to the top of the page)
        // once the question has slid away.
        whenQuestionGone(() => ownRef.current?.querySelector<HTMLElement>('.conv-add')?.focus({ preventScroll: true }))
        return
      }
      setMessage(response.status === 409 ? t('conversions.inUse') : t('conversions.deleteFailed'))
    } catch {
      setMessage(t('conversions.deleteFailed'))
    }
  }

  return (
    <div ref={ownRef} className="conv">
      {conversions.length === 0 ? (
        <p className="ingredient-note">{t('conversions.empty')}</p>
      ) : (
        <ul className="conv-list">
          {conversions.map((conversion) => (
            <ConversionRow
              key={conversion.id}
              conversion={conversion}
              own={ingredient.unit}
              onEdit={open}
              onDelete={remove}
            />
          ))}
        </ul>
      )}
      {message ? (
        <p className="conv-alert" role="alert">
          {message}
        </p>
      ) : null}
      <Button variant="text" className="conv-add" onClick={() => open(null)}>
        {t('conversions.add')}
      </Button>
      <ConversionSheet
        open={editing !== null}
        ingredient={ingredient}
        conversion={editing ? editing.conversion : shown}
        onSaved={saved}
        onClose={() => setEditing(null)}
      />
      {confirmSheet}
    </div>
  )
}

function ConversionRow({
  conversion,
  own,
  onEdit,
  onDelete,
}: {
  conversion: Conversion
  own: string
  onEdit: (conversion: Conversion) => void
  onDelete: (conversion: Conversion) => void
}) {
  const t = useT()
  const usedId = useId()
  const used = conversion.recipe_count
  return (
    <li className="conv-row">
      <span className="conv-text" translate="no">{t('conversions.row', { unit: conversion.unit, factor: conversion.factor, own })}</span>
      <span className="conv-actions">
        <Button variant="text-plain" aria-label={t('conversions.editOf', { unit: conversion.unit })} onClick={() => onEdit(conversion)}>
          {t('conversions.edit')}
        </Button>
        <Button
          variant="text"
          aria-label={t('conversions.deleteOf', { unit: conversion.unit })}
          aria-describedby={used > 0 ? usedId : undefined}
          disabled={used > 0}
          onClick={() => onDelete(conversion)}
        >
          {t('conversions.delete')}
        </Button>
      </span>
      {conversion.source === 'ai' || used > 0 ? (
        <span className="conv-notes">
          {conversion.source === 'ai' ? <span className="conv-ai">{t('conversions.aiTooltip')}</span> : null}
          {used > 0 ? <span id={usedId}>{t('conversions.usedIn', { n: used }, used)}</span> : null}
        </span>
      ) : null}
    </li>
  )
}
