import { useEffect, useId, useRef, useState } from 'react'
import type { Translate } from '../../../translator'
import type { UnitChangeRequest } from '../../../unitChange'
import { useUnitChangeQuestion } from '../../hooks/useUnitChangeQuestion'
import { useT } from '../../i18n/i18n'
import { unitChangeQuestion } from '../../stores/unitChangeQuestion'
import { Sheet } from '../sheet/Sheet'
import './unit-change.css'

// The counts the server sends that have text of their own. Another one (a
// later slice's) shows by its key, never hidden, as it is converted all the same.
const COUNTED = new Set(['ingredient_values', 'source_values', 'goals', 'basis', 'recipe_amounts', 'conversions'])

/** "the basis, 1 recipe amount and 2 conversions": a count of 0 is left out. */
function countsText(t: Translate, counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => (COUNTED.has(key) ? t(`unitChange.counts.${key}`, { n }, n) : `${n} ${key}`))
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')}${t('unitChange.and')}${parts.at(-1)}`
}

/** What happens to the numbers: converted (with the factor), kept, or nothing stored. */
function bodyText(t: Translate, { name, from, to, change }: UnitChangeRequest): string {
  const converts = change.kind === 'convert'
  const counts = countsText(t, change.counts)
  if (!counts) return t(converts ? 'unitChange.nothingToConvert' : 'unitChange.nothingToKeep', { name, from, to })
  if (!converts) return t('unitChange.noConvertBody', { name, from, to, counts })
  return t('unitChange.convertBody', { name, from, to, counts, factor: change.factor })
}

/**
 * The question before a unit change converts or keeps what is stored in the
 * unit (C4, C5): a sheet saying what will be converted or kept and what
 * would be rounded, with Cancel and Convert (or Change unit). Escape, a tap
 * outside and the close button cancel; nothing changes until the owner says
 * yes. Mount it once per page; `askUnitChange` opens it. A page left with
 * the question open answers no.
 */
export function UnitChangeSheet() {
  const t = useT()
  const question = useUnitChangeQuestion()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  // The last question stays on the sheet while it slides away.
  const [shown, setShown] = useState(question)
  if (question && question !== shown) setShown(question)

  useEffect(() => () => unitChangeQuestion.answer(false), [])

  if (!shown) return null
  const converts = shown.change.kind === 'convert'
  const { rounded } = shown.change
  const no = () => unitChangeQuestion.answer(false)
  return (
    <Sheet
      open={question !== null}
      onClose={no}
      title={converts ? t('unitChange.convertTitle', { name: shown.name }) : t('unitChange.changeTitle')}
      role="alertdialog"
      describedBy={bodyId}
      initialFocus={cancelRef}
    >
      <div id={bodyId}>
        <p className="sheet-preview unit-change-body">{bodyText(t, shown)}</p>
        {rounded > 0 ? <p className="unit-change-rounded">{t('unitChange.rounded', { n: rounded }, rounded)}</p> : null}
      </div>
      <div className="sheet-actions">
        <button ref={cancelRef} type="button" className="sheet-btn sheet-btn-ghost" onClick={no}>
          {t('common.cancel')}
        </button>
        <button type="button" className="sheet-btn sheet-btn-primary" onClick={() => unitChangeQuestion.answer(true)}>
          {converts ? t('unitChange.convert') : t('unitChange.changeUnit')}
        </button>
      </div>
    </Sheet>
  )
}
