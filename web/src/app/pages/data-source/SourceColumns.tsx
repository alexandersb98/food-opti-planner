import { useId, useRef, useState } from 'react'
import type { Attribute, SourceColumn } from '../../../api/types'
import { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { Button } from '../../ui/button/Button'
import { Field } from '../../ui/field/Field'
import { Select, type SelectGroup, type SelectOption } from '../../ui/select/Select'

/** The Attribute choice's value for Not mapped (attribute ids are numbers). */
export const NOT_MAPPED = 'none'
/** The Attribute choice's value for Create attribute… */
export const CREATE = 'create'

const SEARCH_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" strokeLinecap="round" />
  </svg>
)

/**
 * The source's columns in the server's order (active by name, withdrawn
 * last), narrowed by a search on the name, each with its Attribute choice.
 * Unlike other lists they are not re-sorted.
 */
export function SourceColumns({
  columns,
  count,
  attributes,
  saving,
  errors,
  onChoose,
}: {
  columns: readonly SourceColumn[]
  /** The columns still in the source, as the server counts them. */
  count: number
  attributes: readonly Attribute[]
  /** The ids of the columns whose mapping is being saved. */
  saving: ReadonlySet<number>
  /** Each column's refusal, by id ('' or none: nothing to say). */
  errors: Readonly<Record<number, string>>
  onChoose: (column: SourceColumn, choice: string) => void
}) {
  const t = useT()
  const { convertible } = useUnits()
  const headingId = useId()
  const searchId = useId()
  const searchInput = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')

  const text = search.trim().toLocaleLowerCase()
  const shown = text ? columns.filter((column) => column.name.toLocaleLowerCase().includes(text)) : columns

  // Which column feeds each attribute, for the other rows' choices.
  const holders = new Map<number, SourceColumn>()
  for (const column of columns) if (column.attribute_id !== null) holders.set(column.attribute_id, column)

  /** Not mapped, then the attributes that convert with the column's unit
   * (one another column feeds is disabled and names it), then Create
   * attribute… The attribute the column has now is always listed. */
  function optionsFor(column: SourceColumn): (SelectOption | SelectGroup)[] {
    const offered = attributes
      .filter((a) => a.id === column.attribute_id || convertible(column.unit, a.unit))
      .map((a): SelectOption => {
        const holder = holders.get(a.id)
        return holder && holder.id !== column.id
          ? { value: String(a.id), label: t('dataSource.takenOption', { attribute: a.name, column: holder.name }), disabled: true }
          : { value: String(a.id), label: a.name }
      })
    const options: (SelectOption | SelectGroup)[] = [{ value: NOT_MAPPED, label: t('dataSource.notMapped') }]
    if (offered.length && column.unit) options.push({ group: t('dataSource.convertsWith', { unit: column.unit }), options: offered })
    else options.push(...offered)
    options.push({ value: CREATE, label: t('dataSource.createAttribute') })
    return options
  }

  function clearSearch() {
    setSearch('')
    searchInput.current?.focus()
  }

  return (
    <section className="ds-columns" aria-labelledby={headingId}>
      <div className="ds-columns-head">
        <h2 id={headingId}>{t('dataSource.columns')}</h2>
        <p className="kicker">{t('dataSource.columnCount', count)}</p>
      </div>
      <div className="ds-search">
        {SEARCH_ICON}
        <label className="visually-hidden" htmlFor={searchId}>
          {t('dataSource.searchColumns')}
        </label>
        <input
          ref={searchInput}
          id={searchId}
          type="search"
          name="column-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('dataSource.searchColumns')}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {shown.length ? (
        <>
          <p className="ds-list-head sc" aria-hidden="true">
            <span>{t('dataSource.column')}</span>
            <span>{t('dataSource.attribute')}</span>
          </p>
          <ul className="ds-list">
            {shown.map((column) => (
              <ColumnRow
                key={column.id}
                column={column}
                options={optionsFor(column)}
                saving={saving.has(column.id)}
                error={errors[column.id] ?? ''}
                onChoose={onChoose}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="empty-state ds-empty">
          <p role="status">{t('dataSource.noColumnNamed', { search: search.trim() })}</p>
          <Button variant="text" onClick={clearSearch}>
            {t('dataSource.clearSearch')}
          </Button>
        </div>
      )}
    </section>
  )
}

/** One column: its name, unit and whether it left the source, and the
 * Attribute choice that maps it (disabled while its save runs). */
function ColumnRow({
  column,
  options,
  saving,
  error,
  onChoose,
}: {
  column: SourceColumn
  options: (SelectOption | SelectGroup)[]
  saving: boolean
  error: string
  onChoose: (column: SourceColumn, choice: string) => void
}) {
  const t = useT()
  return (
    <li className={column.withdrawn ? 'ds-row ds-row-withdrawn' : 'ds-row'}>
      <div className="ds-row-name">
        <span className="ds-name">{column.name}</span>
        {column.unit || column.withdrawn ? (
          <span className="ds-meta">
            {column.unit ? <span className="num">{column.unit}</span> : null}
            {column.withdrawn ? <span className="ds-withdrawn">{t('dataSource.withdrawn')}</span> : null}
          </span>
        ) : null}
      </div>
      <Field className="ds-row-choice" label={t('dataSource.attributeFor', { column: column.name })} hideLabel error={error || undefined}>
        {(control) => (
          <Select
            {...control}
            value={column.attribute_id === null ? NOT_MAPPED : String(column.attribute_id)}
            options={options}
            onValueChange={(choice) => onChoose(column, choice)}
            disabled={saving}
            aria-busy={saving || undefined}
          />
        )}
      </Field>
    </li>
  )
}
