import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { usePreferences } from '../../hooks/usePreferences'
import { useUnits } from '../../hooks/useUnits'
import { useT } from '../../i18n/i18n'
import { unitOptions, type UnitGroup } from './options'
import './unit-field.css'

export type { UnitGroup } from './options'

// A unit as text, with the catalogue's units to choose from: grouped by kind,
// the preferred unit of each kind first. Typed text is kept as typed; a chosen
// unit is its symbol, in the catalogue's spelling. An editable combobox with
// list autocomplete (ARIA 1.2): focus stays in the box, the active option is
// named by aria-activedescendant.
//
// `UnitCombobox` is the box and its list alone, for a label, hint and error
// drawn by someone else (ticket 10's Field); `UnitField` adds its own.

export interface UnitComboboxProps {
  /** The text in the box: a unit symbol or whatever was typed. */
  value: string
  /** Called with the new text at every keystroke and on a choice, only when
   * it differs from `value`. */
  onChange: (text: string) => void
  /** The groups to offer, in this order; 'piece' is "Other". One group
   * restricts the field to one kind. */
  kinds: readonly UnitGroup[]
  /** The input's id, for a `<label htmlFor>`. */
  id?: string
  /** The id of the element naming the field; also names the list. */
  labelId?: string
  /** Ids of the hint and error, for aria-describedby. */
  describedBy?: string
  invalid?: boolean
  name?: string
  disabled?: boolean
  required?: boolean
}

/** The unit box and its drop-down list, without a label. */
export function UnitCombobox({
  value,
  onChange,
  kinds,
  id,
  labelId,
  describedBy,
  invalid = false,
  name,
  disabled,
  required,
}: UnitComboboxProps) {
  const t = useT()
  const catalogue = useUnits()
  const { preferences } = usePreferences()
  const ownId = useId()
  const inputId = id ?? `${ownId}-input`
  const listId = `${ownId}-list`

  const [open, setOpen] = useState(false)
  // What was typed since the list was last opened or a unit chosen; null
  // shows the whole list.
  const [needle, setNeedle] = useState<string | null>(null)
  const [active, setActive] = useState(-1)

  const kindsKey = kinds.join(' ')
  const { offered, findUnit } = catalogue
  const groups = useMemo(
    () => unitOptions(offered, preferences, kindsKey.split(' ') as UnitGroup[], needle),
    [offered, preferences, kindsKey, needle],
  )
  const flat = useMemo(() => groups.flatMap((g) => g.units), [groups])
  const expanded = open && flat.length > 0
  const activeIndex = expanded && active < flat.length ? active : -1
  const optionId = (index: number) => `${ownId}-option-${index}`
  const current = findUnit(value)

  // Keep the active option in sight while moving through a long list.
  useEffect(() => {
    if (activeIndex < 0) return
    document.getElementById(`${ownId}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, ownId])

  function close() {
    setOpen(false)
    setNeedle(null)
    setActive(-1)
  }

  function send(text: string) {
    if (text !== value) onChange(text)
  }

  function choose(index: number) {
    const unit = flat[index]
    if (!unit) return
    send(unit.symbol)
    close()
  }

  function onType(text: string) {
    setNeedle(text)
    setActive(-1)
    setOpen(true)
    send(text)
  }

  function step(by: 1 | -1, fromClosed: boolean) {
    const count = flat.length
    if (count === 0) return
    if (fromClosed) {
      setOpen(true)
      setActive(by === 1 ? 0 : count - 1)
      return
    }
    setActive(activeIndex < 0 ? (by === 1 ? 0 : count - 1) : (activeIndex + by + count) % count)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        if (event.altKey) {
          if (event.key === 'ArrowDown') setOpen(true)
          else close()
          return
        }
        step(event.key === 'ArrowDown' ? 1 : -1, !expanded)
        return
      case 'Enter':
        if (activeIndex >= 0) {
          event.preventDefault()
          choose(activeIndex)
        } else if (expanded) close()
        return
      case 'Escape':
        // An open list closes first; a closed one lets Escape reach the sheet.
        if (expanded) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
        return
      case 'Tab':
        close()
        return
    }
  }

  return (
    <div className="unit-field-box" data-no-swipe>
      <input
        id={inputId}
        name={name}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-describedby={describedBy || undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        className="unit-field-input"
        value={value}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => onType(event.target.value)}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      <span className="unit-field-caret" aria-hidden="true" data-open={expanded || undefined} />
      <div
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        className="unit-field-list"
        hidden={!expanded}
        // Keep focus in the box while the list is used with a pointer.
        onMouseDown={(event) => event.preventDefault()}
      >
        {expanded &&
          groups.map(({ group, units, start }) => {
            const headId = `${ownId}-group-${group}`
            return (
              <div key={group} role="group" aria-labelledby={headId} className="unit-field-group">
                <div id={headId} role="presentation" className="unit-field-head sc">
                  {t(`units.groups.${group}`)}
                </div>
                {units.map((unit, i) => {
                  const at = start + i
                  return (
                    <div
                      key={unit.symbol}
                      id={optionId(at)}
                      role="option"
                      aria-selected={at === activeIndex}
                      className="unit-field-option"
                      data-current={unit === current || undefined}
                      onClick={() => choose(at)}
                    >
                      <span className="unit-field-symbol" translate="no">{unit.symbol}</span>{' '}
                      <span className="unit-field-name">({unit.name})</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
      </div>
    </div>
  )
}

export interface UnitFieldProps extends Omit<UnitComboboxProps, 'labelId' | 'describedBy' | 'invalid'> {
  label: string
  /** A line under the box saying what the unit is for. */
  hint?: string
  /** What is wrong with the unit; marks the box invalid. */
  error?: string
  className?: string
}

/** The unit box with its label, hint and error, in D2's field style. */
export function UnitField({ label, hint, error, className, id, ...box }: UnitFieldProps) {
  const ownId = useId()
  const inputId = id ?? `${ownId}-input`
  const labelId = `${ownId}-label`
  const hintId = hint ? `${ownId}-hint` : undefined
  const errorId = error ? `${ownId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ')
  return (
    <div className={className ? `unit-field ${className}` : 'unit-field'}>
      <label id={labelId} htmlFor={inputId} className="unit-field-label">
        {label}
      </label>
      <UnitCombobox {...box} id={inputId} labelId={labelId} describedBy={describedBy} invalid={Boolean(error)} />
      {hint && (
        <p id={hintId} className="unit-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="unit-field-error">
          {error}
        </p>
      )}
    </div>
  )
}
