import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { Plan, PlanFields as Fields } from '../api/types'
import { dateRange } from '../dates'
import { useSavePlan } from '../plan'
import {
  cellKey,
  DAYS,
  planDraft,
  scheduleFields,
  scheduleRows,
  serverErrors,
  validDate,
  validDays,
  type MealName,
  type ScheduleDraft,
  type ScheduleErrors,
} from '../scheduleDraft'
import { useLoad } from './useLoad'

// The schedule editor's draft in Vue: the rules (`../scheduleDraft`) held in
// reactive state, with loading the setup and saving it.

/** The schedule editor's state: the setup loaded into a draft, the grid's
 * rows, the edits, and `save`, which checks the draft, sends it and gives
 * whether it was saved (marking what is wrong when not). */
export function useScheduleDraft() {
  const { t } = useI18n()

  const draft = reactive<ScheduleDraft>({ start: '', daysText: '', meals: [], skipped: new Set(), minimums: [] })
  // The days shown: the last valid number of days, and start date for labels.
  const days = ref(DAYS.min)
  const labelStart = ref('')
  const errors = reactive<ScheduleErrors>({ start: '', days: '', meals: {}, minimums: {}, save: '' })
  const { saving, savePlan } = useSavePlan()
  let nextKey = 0

  // The setup as loaded: the parts this page doesn't edit are sent back as they were.
  const { data: loaded, loading, failed, load } = useLoad(async () => {
    const answer = await api.GET('/api/plan')
    if (answer.data) {
      Object.assign(draft, planDraft(answer.data, () => nextKey++))
      labelStart.value = answer.data.start_date
      days.value = answer.data.days
    }
    return answer
  }, null as Plan | null)

  watch(
    () => draft.start,
    (start) => {
      if (validDate(start)) labelStart.value = start
    },
  )
  watch(
    () => draft.daysText,
    (text) => {
      const number = validDays(text)
      if (number !== null) days.value = number
    },
  )

  const range = computed(() => (labelStart.value ? dateRange(labelStart.value, days.value) : ''))
  const rows = computed(() => scheduleRows(labelStart.value, days.value, draft.meals, draft.skipped))

  // A minimum of every planned meal, or more, is "all".
  watch(
    () => rows.value.map((row) => row.planned),
    (planned) =>
      planned.forEach((count, day) => {
        const minimum = draft.minimums[day]
        if (minimum != null && minimum >= count) draft.minimums[day] = null
      }),
  )

  function step(by: -1 | 1) {
    const number = Math.min(DAYS.max, Math.max(DAYS.min, days.value + by))
    days.value = number
    draft.daysText = String(number)
    errors.days = ''
  }

  function toggle(day: number, mealKey: number) {
    const key = cellKey(day, mealKey)
    if (!draft.skipped.delete(key)) draft.skipped.add(key)
  }

  function choose(day: number, minimum: number | null) {
    draft.minimums[day] = minimum
    delete errors.minimums[day]
  }

  /** The names from the meal names dialog; a meal left out goes, with its cells. */
  function setMeals(meals: MealName[]) {
    const byKey = new Map(draft.meals.map((meal) => [meal.key, meal]))
    draft.meals = meals.map(({ key, name }) => ({ key: key ?? nextKey++, id: key === null ? null : byKey.get(key)!.id, name }))
    const keys = new Set(draft.meals.map((meal) => String(meal.key)))
    draft.skipped = new Set([...draft.skipped].filter((cell) => keys.has(cell.split(':')[1]!)))
    errors.meals = {}
  }

  /** The fields to send, or null after marking what is wrong. */
  function checked(): Fields | null {
    const start = validDate(draft.start)
    const count = validDays(draft.daysText)
    errors.start = start ? '' : t('schedule.startInvalid')
    errors.days = count === null ? t('schedule.daysRange', DAYS) : ''
    if (!start || count === null || !loaded.value) return null
    return scheduleFields(loaded.value, draft, start, count)
  }

  async function save(): Promise<boolean> {
    // The server's marks from an earlier save go; checked() redoes the rest.
    errors.meals = {}
    errors.minimums = {}
    errors.save = ''
    const fields = checked()
    if (!fields) return false
    const saved = await savePlan(fields)
    if (!saved.plan) {
      const found = serverErrors(saved.errors, draft.meals, fields, t)
      // A later check's marks on the start and days, made while this was sent, stay.
      Object.assign(errors, found, { start: found.start || errors.start, days: found.days || errors.days })
    }
    return !!saved.plan
  }

  return { draft, days, errors, rows, range, loading, failed, load, saving, step, toggle, choose, setMeals, save }
}
