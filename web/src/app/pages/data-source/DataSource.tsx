import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../../../api/client'
import { fieldErrors } from '../../../api/errors'
import type { Attribute, DataSource as Source, SourceColumn } from '../../../api/types'
import { loadAll } from '../../../load'
import { useLoad } from '../../hooks/useLoad'
import { useT } from '../../i18n/i18n'
import { useRunningHead } from '../../shell/runningHead'
import { attributesList } from '../../stores/sharedLists'
import { buttonClass } from '../../ui/button/Button'
import { LoadState } from '../../ui/loadState/LoadState'
import { CreateAttribute } from './CreateAttribute'
import { CREATE, NOT_MAPPED, SourceColumns } from './SourceColumns'
import { SourceFacts } from './SourceFacts'
import './data-source.css'

/**
 * A data source (`/settings/data-sources/:key`, a lazy route): its version,
 * when it was imported, its attribution and colour, and its columns, each
 * with the attribute it feeds. A mapping is saved as soon as it is chosen;
 * one the server refuses because the page was stale (the attribute is
 * mapped from another column, or the units no longer convert) reloads the
 * source first, then says why, so the row shows the truth.
 */
export function DataSource() {
  const t = useT()
  const key = useParams().key ?? ''
  const page = useLoad(
    (signal) =>
      loadAll({
        source: api.GET('/api/data-sources/{key}', { params: { path: { key } }, signal }),
        attributes: attributesList.loadCall(),
      }),
    key,
  )
  // The column ids being saved, and each row's last refusal.
  const [saving, setSaving] = useState<ReadonlySet<number>>(() => new Set())
  const [errors, setErrors] = useState<Readonly<Record<number, string>>>({})
  // The column Create attribute is for; kept while its sheet slides away,
  // and a new key for each opening (a fresh form).
  const [creating, setCreating] = useState<{ column: SourceColumn; open: boolean; key: number } | null>(null)
  useRunningHead(page.data?.source.name)

  if (!page.data) return <LoadState of={page} message={t('dataSource.loadFailed')} />
  const { source, attributes } = page.data

  const setSource = (update: (source: Source) => Source) => page.setData((data) => ({ ...data, source: update(data.source) }))
  const setError = (column: SourceColumn, message: string) => setErrors((all) => ({ ...all, [column.id]: message }))

  /** The source as the server has it now, after a refused mapping; null if
   * it could not be read (the page stays as it was). */
  async function reloadSource(): Promise<Source | null> {
    try {
      const { data: fresh } = await api.GET('/api/data-sources/{key}', { params: { path: { key } } })
      if (!fresh) return null
      setSource(() => fresh)
      return fresh
    } catch {
      return null
    }
  }

  /** Saves a column's mapping (null: none); a refusal is shown on its row.
   * Answers whether it was saved. */
  async function map(column: SourceColumn, attributeId: number | null): Promise<boolean> {
    setSaving((ids) => new Set(ids).add(column.id))
    setError(column, '')
    let message = ''
    try {
      const { data: saved, error } = await api.PUT('/api/data-sources/{key}/columns/{column_id}', {
        params: { path: { key, column_id: column.id } },
        body: { attribute_id: attributeId },
      })
      if (saved) {
        setSource((current) => ({ ...current, columns: current.columns.map((c) => (c.id === saved.id ? saved : c)) }))
      } else {
        const problem = fieldErrors(error).attribute_id
        if (problem === 'attribute_taken' || problem === 'unit_mismatch') {
          // The page was stale: show the truth first, then what was refused.
          const fresh = await reloadSource()
          const attribute = attributes.find((a) => a.id === attributeId)?.name ?? ''
          if (problem === 'unit_mismatch') {
            message = t('dataSource.mismatchError', { column: column.name, attribute })
          } else {
            // Named from the reloaded source; if it can't say who, a plain failure.
            const holder = (fresh ?? source).columns.find((c) => c.id !== column.id && c.attribute_id === attributeId)
            message = holder ? t('dataSource.takenError', { attribute, column: holder.name }) : t('dataSource.mapFailed')
          }
        } else {
          message = t('dataSource.mapFailed')
        }
      }
    } catch {
      message = t('dataSource.mapFailed')
    }
    setError(column, message)
    setSaving((ids) => {
      const rest = new Set(ids)
      rest.delete(column.id)
      return rest
    })
    return message === ''
  }

  /** A row's Attribute choice: an attribute id, or Not mapped. */
  function choose(column: SourceColumn, choice: string) {
    if (choice === CREATE) return setCreating((last) => ({ column, open: true, key: (last?.key ?? 0) + 1 }))
    void map(column, choice === NOT_MAPPED ? null : Number(choice))
  }

  /** Create attribute made one for `column`: close the sheet, list it for
   * every row and map the column to it. The attribute exists whatever the
   * mapping does, so a refused mapping says so on the row. */
  async function created(column: SourceColumn, attribute: Attribute) {
    setCreating((last) => last && { ...last, open: false })
    page.setData((data) => ({ ...data, attributes: [...data.attributes, attribute] }))
    if (!(await map(column, attribute.id))) setError(column, t('dataSource.createdNotMapped'))
  }

  return (
    <article className="ds">
      <Link className={buttonClass({ variant: 'text-plain' }, 'ds-back')} to="/settings">
        {t('dataSource.backToSettings')}
      </Link>
      <div className="cover ds-cover">
        <p className="kicker">{t('dataSource.kicker')}</p>
        <h1 className="cover-title display ds-title">{source.name}</h1>
      </div>
      <SourceFacts source={source} sourceKey={key} onSaved={(saved) => setSource(() => saved)} />
      <SourceColumns
        columns={source.columns}
        count={source.column_count}
        attributes={attributes}
        saving={saving}
        errors={errors}
        onChoose={choose}
      />
      {creating ? (
        <CreateAttribute
          key={creating.key}
          open={creating.open}
          column={creating.column}
          onClose={() => setCreating({ ...creating, open: false })}
          onCreated={(attribute) => void created(creating.column, attribute)}
        />
      ) : null}
    </article>
  )
}
