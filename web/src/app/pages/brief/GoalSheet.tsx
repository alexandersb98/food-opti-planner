import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Attribute, Goal, Plan } from '../../../api/types'
import { goalSentence, IMPORTANCE, NAME_LENGTH } from '../../../goals'
import { useT } from '../../i18n/i18n'
import { toast } from '../../shell/toast'
import { Chip, Chips } from '../../ui/chips/Chips'
import { Disclosure } from '../../ui/disclosure/Disclosure'
import { Field, Fieldset } from '../../ui/field/Field'
import { Segmented } from '../../ui/segmented/Segmented'
import { Sheet } from '../../ui/sheet/Sheet'
import type { GoalToOpen } from './GoalsSection'
import { useGoalDraft } from './useGoalDraft'
import { richText } from './words'
import './goal-sheet.css'
import { buttonClass } from '../../ui/button/Button'

const SCOPES = ['day', 'daily_average', 'plan_total'] as const
const STRICTNESS = ['must', 'prefer'] as const
const LEVELS = Array.from({ length: IMPORTANCE.max - IMPORTANCE.min + 1 }, (_, i) => IMPORTANCE.min + i)

/**
 * The goal sheet (D2's "Add goal" / "Edit goal" on `#plan`): a live preview
 * sentence of the goal as edited; what to track as chips; Min and Max in
 * the attribute's unit; Each day, Daily average or Plan total; Must or
 * Prefer with Prefer's importance; the reference for a zero bound when one
 * is needed; and an Advanced part (the name, importance below and above,
 * the day guard-rail), open by itself when the goal uses it or an error is
 * inside it. Done saves the whole setup and closes with a toast; a refusal
 * keeps it open with each error on its field. "Remove goal" deletes it.
 *
 * `toOpen` is the goal to open (null closes the sheet); each opening starts
 * from the goal as stored.
 */
export function GoalSheet({
  toOpen,
  onClose,
  plan,
  attributes,
  afterRemove,
}: {
  toOpen: GoalToOpen
  onClose: () => void
  plan: Plan
  attributes: Attribute[]
  /** Where focus goes once the goal it was opened from is gone. */
  afterRemove: RefObject<HTMLElement | null>
}) {
  const t = useT()
  // The goal shown stays while the sheet slides away; a fresh form for each
  // opening.
  const [shown, setShown] = useState(toOpen)
  const [round, setRound] = useState(0)
  if (toOpen && toOpen !== shown) {
    setShown(toOpen)
    setRound(round + 1)
  }
  // Removed, focus goes to "Add goal" instead of the goal's own button.
  const [removed, setRemoved] = useState(false)
  if (toOpen && removed) setRemoved(false)
  const goal = shown?.goal ?? null

  return createPortal(
    <Sheet
      open={toOpen !== null}
      onClose={onClose}
      title={goal ? t('goals.editor.editTitle') : t('goals.editor.addTitle')}
      finalFocus={removed ? afterRemove : undefined}
    >
      {shown ? (
        <GoalForm
          key={round}
          plan={plan}
          attributes={attributes}
          goal={goal}
          onSaved={(how) => {
            if (how === 'removed') setRemoved(true)
            onClose()
            toast(t(`goals.editor.${how}`))
          }}
        />
      ) : null}
    </Sheet>,
    document.body,
  )
}

function GoalForm({
  plan,
  attributes,
  goal,
  onSaved,
}: {
  plan: Plan
  attributes: Attribute[]
  goal: Goal | null
  onSaved: (how: 'added' | 'changed' | 'removed') => void
}) {
  const t = useT()
  const draft = useGoalDraft({ plan, attributes, goal })
  const { draft: fields, edit, errors, unit } = draft
  const formRef = useRef<HTMLFormElement>(null)
  // Counts refused saves: after each, focus goes to the first field marked.
  const [refusals, setRefusals] = useState(0)
  useEffect(() => {
    if (refusals) focusFirstError(formRef.current)
  }, [refusals])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The sheet sits inside the brief: its submit stays here.
    event.stopPropagation()
    if (await draft.save()) onSaved(goal ? 'changed' : 'added')
    else setRefusals((n) => n + 1)
  }

  async function remove() {
    if (await draft.remove()) onSaved('removed')
  }

  const unitText = unit ? <span className="goal-sheet-unit">{t('goals.editor.unitIn', { unit })}</span> : null
  const scopeOptions = SCOPES.map((value) => ({ value, label: t(`goals.editor.scope.${value}`) }))
  const strictOptions = STRICTNESS.map((value) => ({ value, label: t(`goals.${value}`) }))

  return (
    <form ref={formRef} className="goal-sheet" noValidate onSubmit={(event) => void save(event)}>
      <Preview {...draft} />

      <Fieldset legend={t('goals.editor.attribute')} error={errors.attribute}>
        <Chips>
          {attributes.map((attribute) => (
            <Chip
              key={attribute.id}
              pressed={attribute.id === fields.attribute_id}
              onClick={() => edit({ attribute_id: attribute.id })}
            >
              {attribute.name}
            </Chip>
          ))}
        </Chips>
      </Fieldset>

      <div className="goal-sheet-bounds">
        <BoundField name="min" label={t('goals.editor.min')} unit={unitText} error={errors.min} value={fields.min} onChange={(min) => edit({ min })} />
        <BoundField name="max" label={t('goals.editor.max')} unit={unitText} error={errors.max} value={fields.max} onChange={(max) => edit({ max })} />
      </div>

      {draft.showReference ? (
        <Field
          label={
            <>
              {t('goals.editor.zeroReference')} {unitText}
            </>
          }
          hint={draft.reference === null ? null : zeroExample(t, draft.reference, unit)}
          error={errors.reference}
        >
          {(control) => (
            <input
              {...control}
              name="zero_reference"
              className="goal-sheet-number"
              inputMode="decimal"
              autoComplete="off"
              value={fields.zero_reference}
              onChange={(event) => edit({ zero_reference: event.target.value })}
            />
          )}
        </Field>
      ) : null}

      <Fieldset legend={t('goals.editor.appliesTo')}>
        <Segmented value={fields.applies_to} options={scopeOptions} onChange={(applies_to) => edit({ applies_to })} />
      </Fieldset>

      <Fieldset legend={t('goals.editor.strictness')}>
        <Segmented
          value={fields.must ? 'must' : 'prefer'}
          options={strictOptions}
          onChange={(strictness) => edit({ must: strictness === 'must' })}
        />
      </Fieldset>

      {fields.must ? null : (
        <Fieldset legend={t('goals.editor.importance')}>
          {draft.split ? (
            <p className="goal-sheet-note">{t('goals.editor.splitSet')}</p>
          ) : (
            <ImportancePick value={fields.importance} onChange={(importance) => edit({ importance })} />
          )}
        </Fieldset>
      )}

      <Disclosure className="goal-sheet-advanced" summary={t('goals.editor.advanced')} startOpen={draft.advancedOpen}>
        <Field label={t('goals.editor.name')} error={errors.name}>
          {(control) => (
            <input
              {...control}
              name="custom_name"
              className="goal-sheet-name"
              autoComplete="off"
              maxLength={draft.nameFollows ? undefined : NAME_LENGTH}
              placeholder={draft.generatedName}
              value={draft.nameShown}
              onChange={(event) => draft.typeName(event.target.value)}
              onBlur={draft.leaveName}
            />
          )}
        </Field>

        {draft.showSplit ? (
          <div className="goal-sheet-part">
            <Switch checked={fields.split} onChange={draft.setSplit}>
              {t('goals.editor.split')}
            </Switch>
            {fields.split ? (
              <>
                <Fieldset legend={t('goals.editor.below')} error={errors.below}>
                  <ImportancePick
                    value={fields.importance_below}
                    onChange={(importance_below) => edit({ importance_below })}
                  />
                </Fieldset>
                <Fieldset legend={t('goals.editor.above')} error={errors.above}>
                  <ImportancePick
                    value={fields.importance_above}
                    onChange={(importance_above) => edit({ importance_above })}
                  />
                </Fieldset>
              </>
            ) : null}
          </div>
        ) : null}

        {draft.showGuardRail ? (
          <div className="goal-sheet-part">
            <Switch checked={fields.day_guard_rail} onChange={(day_guard_rail) => edit({ day_guard_rail })}>
              {t('goals.editor.guardRail')}
            </Switch>
            {fields.day_guard_rail ? (
              <Fieldset legend={t('goals.editor.guardRailImportance')}>
                <ImportancePick
                  value={draft.guardRailShown}
                  onChange={(guard_rail_importance) => edit({ guard_rail_importance })}
                />
              </Fieldset>
            ) : null}
            {errors.guardRail ? (
              <p className="field-error" role="alert">
                {errors.guardRail}
              </p>
            ) : null}
          </div>
        ) : null}
      </Disclosure>

      {errors.save ? (
        <p className="goal-sheet-error" role="alert">
          {errors.save}
        </p>
      ) : null}

      <div className="sheet-actions">
        {goal ? (
          <button
            type="button"
            className={buttonClass({ variant: 'ghost' })}
            disabled={draft.saving}
            onClick={() => void remove()}
          >
            {t('goals.editor.remove')}
          </button>
        ) : null}
        <button type="submit" className={buttonClass({ variant: 'primary' })} aria-busy={draft.saving || undefined}>
          {goal ? t('common.done') : t('goals.section.add')}
        </button>
      </div>
    </form>
  )
}

/** The goal as edited, read whole: "At least 120 g protein, each day:
 * preferred, importance 3." Announced as it changes. */
function Preview({
  draft,
  attribute,
  split,
}: Pick<ReturnType<typeof useGoalDraft>, 'draft' | 'attribute' | 'split'>) {
  const t = useT()
  const sentence = goalSentence(draft, attribute, t)
  const how = draft.must
    ? t('goals.editor.preview.must')
    : split
      ? t('goals.editor.preview.preferSplit', { below: draft.importance_below, above: draft.importance_above })
      : t('goals.editor.preview.prefer', { n: draft.importance })
  return (
    <p className="sheet-preview goal-sheet-preview" aria-live="polite">
      {richText(t, 'goals.editor.preview.text', {
        sentence: (
          <>
            {richText(t, sentence.key, {
              ...sentence.named,
              amount: <b>{sentence.named.amount}</b>,
              attribute: <span className="goal-sheet-attr">{sentence.named.attribute}</span>,
            })}
          </>
        ),
        how: <em>{how}</em>,
      })}
    </p>
  )
}

/** Focus on the first control with an error: a field marked invalid, or the
 * first control of a group with an error line (an Advanced part opened for
 * it already). A save error alone leaves focus where it is. */
function focusFirstError(form: HTMLFormElement | null) {
  const error = form?.querySelector('.field-error')
  const part = error?.closest('.field, .field-set, .goal-sheet-part')
  part?.querySelector<HTMLElement>('input, button')?.focus()
}

/** "With 25 kcal, missing by 5 kcal counts as 20%." (a fifth of the reference). */
function zeroExample(t: ReturnType<typeof useT>, reference: string, unit: string) {
  const miss = Number((Number(reference) / 5).toPrecision(6))
  return t('goals.editor.zeroExample', { reference: Number(reference), miss, unit, percent: 20 })
}

/** Min or Max: a number typed in the attribute's unit, the unit in its label. */
function BoundField({
  name,
  label,
  unit,
  error,
  value,
  onChange,
}: {
  name: string
  label: string
  unit: ReactNode
  error: string
  value: string
  onChange: (value: string) => void
}) {
  const t = useT()
  return (
    <Field
      label={
        <>
          {label} {unit}
        </>
      }
      error={error}
    >
      {(control) => (
        <input
          {...control}
          name={name}
          className="goal-sheet-number"
          inputMode="decimal"
          autoComplete="off"
          placeholder={t('goals.editor.none')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}

/** Importance from 1 to 5 as D2's numbered squares, filled up to the one
 * chosen (pressed). Inside a Fieldset, whose legend names it. */
function ImportancePick({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const t = useT()
  return (
    <div className="goal-sheet-imp" data-no-swipe="">
      {LEVELS.map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? 'goal-sheet-imp-on' : undefined}
          aria-pressed={n === value}
          aria-label={t('goals.importanceOf', { n, max: IMPORTANCE.max })}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** A setting turned on or off: a native checkbox read as a switch. */
function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="goal-sheet-switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  )
}
