import { useState, type RefObject } from 'react'
import { Link } from 'react-router'
import type { Tag, TagFilter } from '../../../api/types'
import { useRecipeCount } from '../../hooks/useRecipeCount'
import { useT } from '../../i18n/i18n'
import type { RecipeCountState } from '../../stores/recipeCount'
import * as planSetup from '../../stores/planSetup'
import { Segmented } from '../../ui/segmented/Segmented'
import { Sheet } from '../../ui/sheet/Sheet'
import { richText } from './words'

type Mode = 'any' | TagFilter['mode']

const MODES = ['any', 'only', 'never'] as const

/**
 * The filters sheet: every tag with Any, Only or Never, the usable count
 * for what is set (asked again on every change; a late answer is dropped),
 * and Done, which saves the filters with the rest of the setup unchanged
 * and stays open with a note when the save fails. Closing without Done
 * leaves the filters as they were. Each opening starts from the saved
 * filters.
 */
export function FiltersSheet({
  open,
  onClose,
  filters,
  tags,
  count,
  finalFocus,
}: {
  open: boolean
  onClose: () => void
  /** The saved filters. */
  filters: TagFilter[]
  tags: Tag[]
  /** The count for the saved filters, shown until a mode changes. */
  count: RecipeCountState
  finalFocus?: RefObject<HTMLElement | null>
}) {
  const t = useT()
  // A fresh form for each opening.
  const [round, setRound] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setRound(round + 1)
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('recipeFilters.title')} finalFocus={finalFocus}>
      <FiltersForm key={round} filters={filters} tags={tags} count={count} onDone={onClose} />
    </Sheet>
  )
}

/** The filters as set, one per tag not on Any, in tag order. */
function chosen(tags: Tag[], modes: ReadonlyMap<number, Mode>): TagFilter[] {
  return tags.flatMap(({ id }) => {
    const mode = modes.get(id)
    return mode === 'only' || mode === 'never' ? [{ tag_id: id, mode }] : []
  })
}

function FiltersForm({
  filters,
  tags,
  count,
  onDone,
}: {
  filters: TagFilter[]
  tags: Tag[]
  count: RecipeCountState
  onDone: () => void
}) {
  const t = useT()
  const [modes, setModes] = useState<ReadonlyMap<number, Mode>>(
    () => new Map(filters.map(({ tag_id: id, mode }) => [id, mode])),
  )
  const [changed, setChanged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recipes = useRecipeCount()
  const { ask } = recipes

  if (!tags.length) {
    return (
      <p className="filters-empty">
        {richText(t, 'recipeFilters.noTagsYet', { tags: <Link to="/tags">{t('recipeFilters.tagsPage')}</Link> })}
      </p>
    )
  }

  function choose(tagId: number, mode: Mode) {
    const next = new Map(modes)
    next.set(tagId, mode)
    setModes(next)
    setChanged(true)
    setError(null)
    void ask(chosen(tags, next))
  }

  async function done() {
    const next = chosen(tags, modes)
    if (JSON.stringify(next) === JSON.stringify(chosen(tags, new Map(filters.map((f) => [f.tag_id, f.mode]))))) {
      onDone()
      return
    }
    setSaving(true)
    setError(null)
    const saved = await planSetup.change((plan) => ({ ...plan, tag_filters: next }), { optimistic: false })
    setSaving(false)
    if (saved.plan) onDone()
    else setError(saved.errors.tag_filters ?? t('common.saveFailed'))
  }

  // The count for the saved filters until a mode changes and is answered.
  const shown = changed && (recipes.count || recipes.failed) ? recipes : count
  const warn = shown.failed || shown.count?.usable === 0
  const options = MODES.map((mode) => ({ value: mode, label: t(`recipeFilters.mode.${mode}`) }))

  return (
    <>
      <p className={warn ? 'sheet-preview filters-preview filters-warn' : 'sheet-preview filters-preview'} aria-live="polite">
        {shown.failed
          ? t('recipeFilters.countFailed')
          : !shown.count
            ? ' '
            : shown.count.usable === 0
              ? richText(t, 'recipeFilters.previewNone', { none: <b>{t('recipeFilters.none')}</b> })
              : richText(
                  t,
                  'recipeFilters.preview',
                  { count: <b>{t('recipeFilters.previewCount', { usable: shown.count.usable, total: shown.count.total })}</b> },
                  shown.count.total,
                )}
      </p>
      <ul className="filters-list">
        {tags.map((tag) => (
          <li key={tag.id} className="filters-row">
            <span className="filters-row-name">{tag.name}</span>
            <Segmented
              compact
              className="filters-row-modes"
              label={t('recipeFilters.filterOf', { tag: tag.name })}
              value={modes.get(tag.id) ?? 'any'}
              options={options}
              onChange={(mode) => choose(tag.id, mode)}
            />
          </li>
        ))}
      </ul>
      {error ? (
        <p className="filters-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sheet-actions">
        <button type="button" className="sheet-btn sheet-btn-primary" disabled={saving} onClick={() => void done()}>
          {saving ? t('recipeFilters.saving') : t('common.done')}
        </button>
      </div>
    </>
  )
}
