import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../../../api/client'
import { conversionRefusal, fieldErrors } from '../../../api/errors'
import type { Attribute, AttributeFields } from '../../../api/types'
import { DECIMALS, parseDecimals } from '../../../attributeFields'
import type { Translate } from '../../../translator'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import { useConfirm } from '../../ui/confirm/Confirm'
import { LoadState } from '../../ui/loadState/LoadState'
import { AttributeForm, type Draft, type DraftErrors } from './AttributeForm'
import { useAttributeUnitChange } from './unitChangeCheck'
import './attributes.css'

/** The entry open for editing: an attribute's id, or 'new'. */
type OpenId = number | 'new'

const NEW_DRAFT: Draft = { name: '', unit: '', decimals: String(DECIMALS.default) }

const entryId = (id: number) => `attribute-${id}`
const ADD_ID = 'attributes-add'

/** "This also removes its values from 12 ingredients and 1 goal. Its mapping
 * from 2 source columns is cleared.", or "Nothing else uses it." */
function deleteWarning(t: Translate, attribute: Attribute): string {
  const parts: string[] = []
  if (attribute.ingredient_count > 0 || attribute.goal_count > 0) {
    parts.push(
      t('attributes.deleteRemoves', {
        ingredients: t('count.ingredients', attribute.ingredient_count),
        goals: t('count.goals', attribute.goal_count),
      }),
    )
  }
  if (attribute.mapping_count > 0) {
    parts.push(t('attributes.deleteUnmaps', { columns: t('count.sourceColumns', attribute.mapping_count) }))
  }
  return parts.length > 0 ? parts.join(' ') : t('common.deleteNothing')
}

/**
 * The Attributes page: what is tracked for every ingredient, as a list of
 * entries. One entry is open at a time, annotated in place; it is saved when
 * it closes (Done) or when another opens, and stays open if that fails.
 */
export function Attributes() {
  const t = useT()
  const page = useLoad((signal) => api.GET('/api/attributes', { signal }))
  const [confirm, confirmSheet] = useConfirm()
  const [checkUnitChange, unitChangeSheet] = useAttributeUnitChange()

  const [openId, setOpenId] = useState<OpenId | null>(null)
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [busy, setBusy] = useState<'saving' | 'deleting' | null>(null)
  const [refusals, setRefusals] = useState(0)
  // A save or delete under way (read in handlers, before the state re-renders).
  const working = useRef(false)
  // Where focus goes once the list has re-rendered after an entry closed.
  const focusAfter = useRef<string | null>(null)

  useEffect(() => {
    if (focusAfter.current === null) return
    document.getElementById(focusAfter.current)?.focus()
    focusAfter.current = null
  })

  if (!page.data) {
    return (
      <Cover>
        <LoadState of={page} message={t('attributes.loadFailed')} />
      </Cover>
    )
  }
  const attributes = page.data
  const openAttribute = attributes.find((a) => a.id === openId)

  function openEntry(id: OpenId, fields: Draft) {
    setOpenId(id)
    setDraft(fields)
    setErrors({})
  }

  function closeEntry(focus: string) {
    focusAfter.current = focus
    setOpenId(null)
    setErrors({})
  }

  /** Saves the open entry if it changed and closes it; false if it has to
   * stay open (a field error, a refusal, a cancelled question, a failed save). */
  async function close(): Promise<boolean> {
    if (openId === null) return true
    if (working.current) return false
    const decimals = parseDecimals(draft.decimals)
    const fields: AttributeFields = { name: draft.name.trim(), unit: draft.unit.trim(), decimals: decimals ?? 0 }
    const invalid: DraftErrors = {}
    if (!fields.name) invalid.name = t('common.nameRequired')
    if (decimals === null) invalid.decimals = t('attributes.decimalsRange', DECIMALS)
    if (invalid.name || invalid.decimals) {
      setErrors(invalid)
      setRefusals((n) => n + 1)
      return false
    }

    const current = openAttribute
    if (current && current.name === fields.name && current.unit === fields.unit && current.decimals === fields.decimals) {
      closeEntry(entryId(current.id))
      return true
    }

    working.current = true
    setBusy('saving')
    setErrors({})
    try {
      if (current && fields.unit !== current.unit) {
        const outcome = await checkUnitChange(current, fields)
        if (!outcome.go) {
          setErrors({ unit: outcome.unitError, save: outcome.failed ? t('common.saveFailed') : undefined })
          if (outcome.unitError) setRefusals((n) => n + 1)
          return false
        }
      }
      const { data, error } = current
        ? await api.PUT('/api/attributes/{attribute_id}', { params: { path: { attribute_id: current.id } }, body: fields })
        : await api.POST('/api/attributes', { body: fields })
      if (data) {
        page.setData((list) => (current ? list.map((a) => (a.id === data.id ? data : a)) : [...list, data]))
        closeEntry(entryId(data.id))
        return true
      }
      const refusal = conversionRefusal(error)
      if (fieldErrors(error).name === 'name_in_use') setErrors({ name: t('attributes.nameInUse') })
      else if (refusal) setErrors({ unit: refusal })
      else setErrors({ save: t('common.saveFailed') })
      if (refusal || fieldErrors(error).name) setRefusals((n) => n + 1)
    } catch {
      setErrors({ save: t('common.saveFailed') })
    } finally {
      working.current = false
      setBusy(null)
    }
    return false
  }

  async function open(attribute: Attribute) {
    if (!(await close())) return
    openEntry(attribute.id, { name: attribute.name, unit: attribute.unit, decimals: String(attribute.decimals) })
  }

  async function startNew() {
    if (!(await close())) return
    openEntry('new', NEW_DRAFT)
  }

  async function remove(attribute: Attribute) {
    if (working.current) return
    const confirmed = await confirm({
      title: t('common.deleteTitle', { name: attribute.name }),
      message: deleteWarning(t, attribute),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!confirmed) return
    working.current = true
    setBusy('deleting')
    setErrors({})
    try {
      const { response } = await api.DELETE('/api/attributes/{attribute_id}', {
        params: { path: { attribute_id: attribute.id } },
      })
      if (response.ok) {
        page.setData((list) => list.filter((a) => a.id !== attribute.id))
        closeEntry(ADD_ID)
      } else {
        setErrors({ save: t('common.deleteFailed') })
      }
    } catch {
      setErrors({ save: t('common.deleteFailed') })
    } finally {
      working.current = false
      setBusy(null)
    }
  }

  function change(fields: Partial<Draft>) {
    setDraft((previous) => ({ ...previous, ...fields }))
    // a field's message (a refusal under the unit, too) stays until that field is edited
    setErrors((previous) => {
      const next = { ...previous }
      for (const key of Object.keys(fields) as (keyof Draft)[]) delete next[key]
      return next
    })
  }

  const form = (attribute?: Attribute) => (
    <li key={attribute?.id ?? 'new'} className="attributes-item attributes-item-open">
      <AttributeForm
        label={attribute ? t('attributes.editing', { name: attribute.name }) : t('attributes.newEntry')}
        draft={draft}
        errors={errors}
        isNew={!attribute}
        busy={busy}
        refusals={refusals}
        onChange={change}
        onDone={() => void close()}
        onCancel={() => closeEntry(ADD_ID)}
        onDelete={() => attribute && void remove(attribute)}
      />
    </li>
  )

  return (
    <Cover count={attributes.length}>
      {attributes.length === 0 && openId !== 'new' ? (
        <div className="attributes-empty">
          <p>{t('attributes.empty')}</p>
        </div>
      ) : (
        <ul className="attributes-list">
          {attributes.map((attribute) =>
            attribute.id === openId ? (
              form(attribute)
            ) : (
              <li key={attribute.id} className="attributes-item">
                <button id={entryId(attribute.id)} type="button" className="attributes-entry" onClick={() => void open(attribute)}>
                  <span className="attributes-entry-name">{attribute.name}</span>{' '}
                  {attribute.unit ? (
                    <span className="attributes-entry-unit" translate="no">
                      {attribute.unit}
                    </span>
                  ) : null}{' '}
                  <span className="attributes-entry-meta">
                    {t('attributes.decimalCount', attribute.decimals)} · {t('count.goals', attribute.goal_count)}
                  </span>
                </button>
              </li>
            ),
          )}
          {openId === 'new' ? form() : null}
        </ul>
      )}
      {openId !== 'new' ? (
        <p className="attributes-add">
          <Button id={ADD_ID} variant="text" onClick={() => void startNew()}>
            {t('attributes.new')}
          </Button>
        </p>
      ) : null}
      {confirmSheet}
      {unitChangeSheet}
    </Cover>
  )
}

/** The page's opening: kicker, title and standfirst, then the page's body. */
function Cover({ count, children }: { count?: number; children: ReactNode }) {
  const t = useT()
  return (
    <article className="attributes">
      <div className="attributes-cover">
        {count === undefined ? null : <p className="kicker">{t('attributes.tracked', count)}</p>}
        <h1 className="attributes-title display">
          <em>{t('shell.pages.attributes.title')}</em>
        </h1>
        <p className="attributes-standfirst">{t('attributes.intro')}</p>
      </div>
      {children}
    </article>
  )
}
