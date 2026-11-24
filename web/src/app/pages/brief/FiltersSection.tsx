import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Plan, Tag } from '../../../api/types'
import { useT } from '../../i18n/i18n'
import type { RecipeCountReader } from '../../hooks/useRecipeCount'
import { Button, buttonClass } from '../../ui/button/Button'
import { RuleTag } from '../../ui/ruleTag/RuleTag'
import { BriefSection } from './BriefSection'
import { FiltersSheet } from './FiltersSheet'
import './filters.css'

/** The value of `?sheet=` that opens the filters sheet (old `/plan/recipes`
 * links, the Editor's note). */
const SHEET_PARAM = 'filters'

/** The id of a filter's rule tag. */
const ruleId = (tagId: number) => `brief-filter-${tagId}`

/**
 * Section 3 of the brief, the recipe filters: each filter as a rule tag
 * ("Never: pork", "Only: weeknight"), how many recipes they leave as the
 * server counts it (the brief's count, for its standfirst too; the sheet
 * asks it again when Done saves new filters), and "See them".
 * "Change" or a rule tag opens the filters sheet; so does `?sheet=filters`,
 * which is then removed from the address.
 */
export function FiltersSection({ plan, tags, count }: { plan: Plan; tags: Tag[]; count: RecipeCountReader }) {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const changeRef = useRef<HTMLButtonElement>(null)
  // The rule tag that opened the sheet (by tag id), which gets focus back
  // when it closes; "Change" when there is none (opened by "Change" or from
  // the address) or it is gone (its tag set to Any).
  const opener = useRef<number | null>(null)
  const returnFocus = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const rule = opener.current === null ? null : document.getElementById(ruleId(opener.current))
        return rule ?? changeRef.current
      },
    }),
    [],
  )

  const asked = params.get('sheet') === SHEET_PARAM
  if (asked && !open) setOpen(true)
  useEffect(() => {
    if (!asked) return
    opener.current = null
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('sheet')
        return next
      },
      { replace: true },
    )
  }, [asked, setParams])

  function openFrom(tagId: number | null) {
    opener.current = tagId
    setOpen(true)
  }

  const names = new Map(tags.map((tag) => [tag.id, tag.name]))
  const rules = plan.tag_filters.flatMap(({ tag_id: id, mode }) => {
    const name = names.get(id)
    return name === undefined ? [] : [{ id, mode, name }]
  })

  const shown = count.count
  const warn = count.failed || shown?.usable === 0

  return (
    <BriefSection
      section="filters"
      action={
        <Button
          ref={changeRef}
          variant="text"
          aria-label={t('recipeFilters.changeLabel')}
          aria-haspopup="dialog"
          onClick={() => openFrom(null)}
        >
          {t('recipeFilters.change')}
        </Button>
      }
    >
      {rules.length ? (
        <ul className="filters-rules">
          {rules.map(({ id, mode, name }) => (
            <li key={id}>
              <RuleTag id={ruleId(id)} mode={mode} tag={name} aria-haspopup="dialog" onClick={() => openFrom(id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="filters-usable filters-none">{t('recipeFilters.noRules')}</p>
      )}
      <p className={warn ? 'filters-usable filters-warn' : 'filters-usable'}>
        <span aria-live="polite">
          {count.failed
            ? t('recipeFilters.countFailed')
            : shown
              ? t('recipeFilters.usable', { usable: shown.usable, total: shown.total }, shown.total)
              : null}
        </span>
        <Link className={buttonClass({ variant: 'text-plain' })} to="/recipes">
          {t('recipeFilters.seeThem')}
        </Link>
      </p>

      <FiltersSheet
        open={open}
        onClose={() => setOpen(false)}
        filters={plan.tag_filters}
        tags={tags}
        count={count}
        finalFocus={returnFocus}
      />
    </BriefSection>
  )
}
