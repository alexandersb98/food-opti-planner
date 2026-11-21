import { useRef, useState, type CSSProperties } from 'react'
import { api } from '../../../api/client'
import type { Ingredient } from '../../../api/types'
import { contrastText } from '../../../colours'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import { useConfirm } from '../../ui/confirm/Confirm'
import './ingredient-source.css'

/**
 * Where a linked ingredient comes from (story 163): "From Livsmedelsverket:
 * Havregryn" as a tag in the source's colour, "No longer in the source" when
 * the source has withdrawn the food, and Unlink from source, which asks
 * first. Renders nothing for an ingredient without a source.
 *
 * After an unlink the host gets the ingredient as the server sent it; what
 * was typed in the form stays.
 */
export function IngredientSource({
  ingredient,
  onChange,
}: {
  ingredient: Ingredient | null
  onChange: (ingredient: Ingredient) => void
}) {
  const t = useT()
  const [confirm, confirmSheet] = useConfirm()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sending = useRef(false)
  const source = ingredient?.source
  if (!ingredient || !source) return null
  const { id, name } = ingredient
  const sourceName = source.name

  async function unlink() {
    if (sending.current) return
    const ok = await confirm({
      title: t('ingredients.unlinkTitle', { name, source: sourceName }),
      message: <p>{t('ingredients.unlinkBody')}</p>,
      confirmLabel: t('ingredients.unlinkConfirm'),
    })
    if (!ok || sending.current) return
    sending.current = true
    setBusy(true)
    setFailed(false)
    try {
      const { data } = await api.POST('/api/ingredients/{ingredient_id}/unlink', {
        params: { path: { ingredient_id: id } },
      })
      if (data) onChange(data)
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const colours = { '--source': source.colour, '--source-ink': contrastText(source.colour) } as CSSProperties

  return (
    <div className="ingredient-source">
      <p className="ingredient-source-line">
        <span className="ingredient-source-tag" style={colours}>
          {t('ingredients.fromSource', { source: source.name, food: source.food_name })}
        </span>
        {source.withdrawn ? <span className="ingredient-source-withdrawn">{t('ingredients.noLongerInSource')}</span> : null}
        <Button variant="text" className="ingredient-source-unlink" disabled={busy} onClick={unlink}>
          {t('ingredients.unlink')}
        </Button>
      </p>
      {failed ? (
        <p className="ingredient-source-alert" role="alert">
          {t('ingredients.unlinkFailed')}
        </p>
      ) : null}
      {confirmSheet}
    </div>
  )
}
