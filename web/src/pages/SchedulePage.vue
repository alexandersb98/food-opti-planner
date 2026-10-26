<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { Plan, PlanFields as Fields } from '../api/types'
import EditorHeader from '../components/EditorHeader.vue'
import LoadState from '../components/LoadState.vue'
import MealNamesDialog, { type MealName } from '../components/MealNamesDialog.vue'
import { useLoad } from '../composables/useLoad'
import { dateRange, dayLabel } from '../dates'

const { t } = useI18n()
const router = useRouter()

// The server's limits on the number of days and a meal's name.
const DAYS = { min: 1, max: 31 }
const MEAL_NAME_LENGTH = 40

// The schedule as edited. Meals have a key, which stays when they are
// renamed or moved, so a skipped cell ("day:key") keeps its meal. Cells
// and minimums of days beyond the number of days are kept while editing,
// so lowering the number and raising it again loses nothing, but they are
// not sent.
const draft = reactive({
  start: '',
  daysText: '',
  meals: [] as { key: number; id: number | null; name: string }[],
  skipped: new Set<string>(),
  minimums: [] as (number | null)[], // by day; null is "all"
})
// The days shown: the last valid number of days, and start date for labels.
const days = ref(DAYS.min)
const labelStart = ref('')
const errors = reactive({
  start: '',
  days: '',
  meals: {} as Partial<Record<number, string>>, // by meal key
  minimums: {} as Partial<Record<number, string>>, // by day
  save: '',
})
const saving = ref(false)
const mealsOpen = ref(false)
let solveTimeLimit = 30
// The goals, sent back as they were: this page doesn't edit them.
let goals: Plan['goals'] = []
let nextKey = 0

const { loading, failed, load } = useLoad(async () => {
  const loaded = await api.GET('/api/plan')
  if (loaded.data) fillDraft(loaded.data)
  return loaded
}, null as Plan | null)

function fillDraft(plan: Plan) {
  draft.start = labelStart.value = plan.start_date
  draft.daysText = String(plan.days)
  days.value = plan.days
  draft.meals = plan.meals.map(({ id, name }) => ({ key: nextKey++, id, name }))
  draft.skipped = new Set(plan.skips.map(({ day, meal }) => cellKey(day, draft.meals[meal]!.key)))
  draft.minimums = Array.from({ length: DAYS.max }, () => null)
  for (const { day, at_least } of plan.minimums) draft.minimums[day] = at_least
  solveTimeLimit = plan.solve_time_limit
  goals = plan.goals
}

function cellKey(day: number, mealKey: number) {
  return `${day}:${mealKey}`
}

/** The date typed, if it is one: "YYYY-MM-DD", a real day. */
function validDate(text: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return date.getUTCMonth() === month! - 1 && date.getUTCDate() === day ? text : null
}

/** The number of days typed, if a whole number within the limits. */
function validDays(text: string): number | null {
  const typed = text.trim()
  const number = Number(typed)
  return /^\d+$/.test(typed) && number >= DAYS.min && number <= DAYS.max ? number : null
}

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

function step(by: -1 | 1) {
  const number = Math.min(DAYS.max, Math.max(DAYS.min, days.value + by))
  days.value = number
  draft.daysText = String(number)
  errors.days = ''
}

const range = computed(() => (labelStart.value ? dateRange(labelStart.value, days.value) : ''))

const rows = computed(() =>
  Array.from({ length: labelStart.value ? days.value : 0 }, (_, day) => {
    const label = dayLabel(labelStart.value, day)
    const cells = draft.meals.map((meal) => ({ meal, planned: !draft.skipped.has(cellKey(day, meal.key)) }))
    const planned = cells.filter((cell) => cell.planned).length
    // "all", then from one fewer than the planned meals down to none.
    const choices = [null, ...Array.from({ length: planned }, (_, i) => planned - 1 - i)]
    return { day, label, cells, planned, choices }
  }),
)

// A minimum of every planned meal, or more, is "all".
watch(
  () => rows.value.map((row) => row.planned),
  (planned) =>
    planned.forEach((count, day) => {
      const minimum = draft.minimums[day]
      if (minimum != null && minimum >= count) draft.minimums[day] = null
    }),
)

function minimumText(minimum: number | null | undefined) {
  return minimum == null ? t('schedule.all') : String(minimum)
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
  if (!start || count === null) return null
  const visible = rows.value.slice(0, count)
  return {
    start_date: start,
    days: count,
    meals: draft.meals.map(({ id, name }) => ({ id, name })),
    skips: visible.flatMap(({ day, cells }) =>
      cells.flatMap(({ planned }, meal) => (planned ? [] : [{ day, meal }])),
    ),
    minimums: visible.flatMap(({ day }) => {
      const atLeast = draft.minimums[day]
      return atLeast == null ? [] : [{ day, at_least: atLeast }]
    }),
    goals,
    solve_time_limit: solveTimeLimit,
  }
}

async function save() {
  // The server's marks from an earlier save go; checked() redoes the rest.
  errors.meals = {}
  errors.minimums = {}
  errors.save = ''
  const fields = checked()
  if (!fields) return
  saving.value = true
  try {
    const { data, error } = await api.PUT('/api/plan', { body: fields })
    if (data) {
      await router.push('/')
      return
    }
    showServerErrors(fieldErrors(error), fields)
  } catch {
    errors.save = t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

/** A field the server refuses, on its field; anything else just failed. */
function showServerErrors(byField: Partial<Record<string, string>>, fields: Fields) {
  let shown = false
  if (byField.start_date) {
    errors.start = t('schedule.startInvalid')
    shown = true
  }
  if (byField.days) {
    errors.days = t('schedule.daysRange', DAYS)
    shown = true
  }
  const nameMessages: Partial<Record<string, string>> = {
    duplicate: t('schedule.nameInUse'),
    string_too_long: t('schedule.nameTooLong', { max: MEAL_NAME_LENGTH }),
  }
  draft.meals.forEach((meal, i) => {
    const type = byField[`meals.${i}.name`]
    if (!type) return
    errors.meals[meal.key] = nameMessages[type] ?? t('common.nameRequired')
    shown = true
  })
  fields.minimums.forEach(({ day }, i) => {
    if (!byField[`minimums.${i}.at_least`]) return
    errors.minimums[day] = t('schedule.abovePlanned')
    shown = true
  })
  if (!shown) errors.save = t('common.saveFailed')
}

const mealsWrong = computed(() => Object.keys(errors.meals).length > 0)
const columns = computed(() => `4.2em repeat(${draft.meals.length}, minmax(0, 1fr)) 3.6em`)
</script>

<template>
  <q-page padding>
    <EditorHeader
      back="/"
      :title="$t('schedule.title')"
    />

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('plan.loadFailed')"
      @retry="load"
    >
      <q-form
        class="q-gutter-y-md"
        @submit="save"
      >
        <q-input
          v-model="draft.start"
          class="start-field"
          outlined
          mask="####-##-##"
          :label="$t('schedule.starts')"
          :hint="range"
          :error="!!errors.start"
          :error-message="errors.start"
        >
          <template #append>
            <q-btn
              flat
              round
              dense
              icon="event"
              :aria-label="$t('schedule.pickDate')"
            >
              <q-popup-proxy
                cover
                transition-show="scale"
                transition-hide="scale"
              >
                <q-date
                  v-model="draft.start"
                  mask="YYYY-MM-DD"
                  :first-day-of-week="1"
                  minimal
                >
                  <div class="row justify-end">
                    <q-btn
                      v-close-popup
                      flat
                      color="primary"
                      :label="$t('common.done')"
                    />
                  </div>
                </q-date>
              </q-popup-proxy>
            </q-btn>
          </template>
        </q-input>

        <div>
          <div class="row items-center no-wrap q-gutter-x-xs">
            <div class="col text-body1">
              {{ $t('schedule.days') }}
            </div>
            <q-btn
              outline
              dense
              icon="remove"
              :disable="days <= DAYS.min"
              :aria-label="$t('schedule.fewerDays')"
              @click="step(-1)"
            />
            <q-input
              v-model="draft.daysText"
              class="days-field"
              outlined
              dense
              inputmode="numeric"
              input-class="text-center"
              :aria-label="$t('schedule.days')"
              :error="!!errors.days"
              hide-bottom-space
            />
            <q-btn
              outline
              dense
              icon="add"
              :disable="days >= DAYS.max"
              :aria-label="$t('schedule.moreDays')"
              @click="step(1)"
            />
          </div>
          <div
            v-if="errors.days"
            class="days-error text-negative text-caption text-right"
          >
            {{ errors.days }}
          </div>
        </div>

        <q-list
          bordered
          class="rounded-borders"
        >
          <q-item
            v-ripple
            clickable
            class="meals-row"
            @click="mealsOpen = true"
          >
            <q-item-section>
              <q-item-label>{{ $t('schedule.meals') }}</q-item-label>
              <q-item-label caption>
                {{ draft.meals.map((meal) => meal.name).join(', ') }}
              </q-item-label>
              <q-item-label
                v-if="mealsWrong"
                caption
                class="text-negative"
              >
                {{ $t('schedule.mealsWrong') }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>
        </q-list>
        <div class="text-caption text-grey-8 q-mt-xs">
          {{ $t('schedule.mealsHint') }}
        </div>

        <q-card
          flat
          bordered
        >
          <q-card-section class="schedule-grid">
            <div
              class="schedule-header grid-line text-caption text-grey-8"
              :style="{ gridTemplateColumns: columns }"
            >
              <span />
              <span
                v-for="meal in draft.meals"
                :key="meal.key"
                class="meal-name"
                :title="meal.name"
              >{{ meal.name }}</span>
              <span class="text-center">{{ $t('schedule.atLeast') }}</span>
            </div>
            <template
              v-for="row in rows"
              :key="row.day"
            >
              <div
                class="schedule-row grid-line"
                :style="{ gridTemplateColumns: columns }"
              >
                <span class="day-label">{{ row.label }}</span>
                <button
                  v-for="cell in row.cells"
                  :key="cell.meal.key"
                  type="button"
                  class="cell"
                  :class="cell.planned ? 'planned' : 'skipped'"
                  :aria-pressed="cell.planned"
                  :aria-label="$t('schedule.cell', { meal: cell.meal.name, day: row.label })"
                  @click="toggle(row.day, cell.meal.key)"
                >
                  {{ cell.planned ? '' : $t('schedule.skip') }}
                </button>
                <q-btn
                  outline
                  dense
                  no-caps
                  class="at-least"
                  :color="errors.minimums[row.day] ? 'negative' : 'grey-8'"
                  :label="minimumText(draft.minimums[row.day])"
                  :aria-label="$t('schedule.atLeastOn', { day: row.label })"
                >
                  <q-menu>
                    <q-list>
                      <q-item
                        v-for="choice in row.choices"
                        :key="String(choice)"
                        v-close-popup
                        clickable
                        @click="choose(row.day, choice)"
                      >
                        <q-item-section>{{ minimumText(choice) }}</q-item-section>
                      </q-item>
                    </q-list>
                  </q-menu>
                </q-btn>
              </div>
              <div
                v-if="errors.minimums[row.day]"
                class="schedule-row-error text-negative text-caption"
              >
                {{ row.label }}: {{ errors.minimums[row.day] }}
              </div>
            </template>
          </q-card-section>
        </q-card>

        <div class="legend text-caption text-grey-8">
          <div class="row items-center q-gutter-x-sm">
            <span class="swatch planned" /><span>{{ $t('schedule.legendPlanned') }}</span>
          </div>
          <div class="row items-center q-gutter-x-sm">
            <span class="swatch skipped" /><span>{{ $t('schedule.legendSkipped') }}</span>
          </div>
          <div>{{ $t('schedule.legendTap') }}</div>
        </div>

        <div
          v-if="errors.save"
          class="text-negative"
          role="alert"
        >
          {{ errors.save }}
        </div>
        <q-btn
          class="full-width"
          type="submit"
          color="primary"
          :label="$t('common.save')"
          :loading="saving"
        />
      </q-form>
    </LoadState>

    <MealNamesDialog
      v-model="mealsOpen"
      :meals="draft.meals"
      :errors="errors.meals"
      @done="setMeals"
    />
  </q-page>
</template>

<style scoped>
.days-field {
  width: 4em;
}
.grid-line {
  display: grid;
  gap: 6px;
  align-items: center;
}
.schedule-header {
  padding-bottom: 6px;
}
.schedule-row {
  padding: 3px 0;
}
.meal-name {
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.day-label {
  white-space: nowrap;
}
.cell,
.swatch {
  border-radius: 8px;
  box-sizing: border-box;
}
.cell {
  height: 40px;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  font-size: 12px;
  cursor: pointer;
}
.planned {
  background: #1c1c1a;
  border: none;
}
.skipped {
  background: #fff;
  color: #5e5e59;
  border: 1.5px dashed #8a8a84;
}
.at-least {
  height: 40px;
}
.swatch {
  display: inline-block;
  width: 22px;
  height: 14px;
  border-radius: 4px;
}
</style>
