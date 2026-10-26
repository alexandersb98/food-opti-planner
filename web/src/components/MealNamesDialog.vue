<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MEAL_NAME_LENGTH, MOST_MEALS } from '../limits'

// "Meals each day" in the schedule (A2): the meal names in the order of
// the day, added, renamed, moved and removed on a copy; Done hands the
// copy back, once every name is set and none is given twice. One meal
// always stays.
export type MealName = { key: number | null; name: string } // key null: added here

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  meals: readonly { key: number; name: string }[]
  errors: Partial<Record<number, string>> // by meal key, from the server
}>()
const emit = defineEmits<{ done: [meals: MealName[]] }>()

const { t } = useI18n()
// The rows as edited; `row` only tells them apart while open.
const rows = ref<(MealName & { row: number; error: string })[]>([])
let nextRow = 0

watch(open, (isOpen) => {
  if (!isOpen) return
  rows.value = props.meals.map(({ key, name }) => ({ key, name, row: nextRow++, error: props.errors[key] ?? '' }))
})

/** The meal's name for the buttons beside it, or "meal 2" while it has none. */
function title(index: number) {
  return rows.value[index]!.name.trim() || t('schedule.mealN', { n: index + 1 })
}

function add() {
  rows.value.push({ key: null, name: '', row: nextRow++, error: '' })
}

function move(index: number, by: -1 | 1) {
  const [row] = rows.value.splice(index, 1)
  rows.value.splice(index + by, 0, row!)
}

function remove(index: number) {
  rows.value.splice(index, 1)
}

function done() {
  const seen = new Set<string>()
  for (const row of rows.value) {
    const name = row.name.trim()
    if (name === '') row.error = t('common.nameRequired')
    else if (name.length > MEAL_NAME_LENGTH) row.error = t('schedule.nameTooLong', { max: MEAL_NAME_LENGTH })
    else if (seen.has(name)) row.error = t('schedule.nameInUse')
    else row.error = ''
    seen.add(name)
  }
  if (rows.value.some((row) => row.error)) return
  emit(
    'done',
    rows.value.map(({ key, name }) => ({ key, name: name.trim() })),
  )
  open.value = false
}
</script>

<template>
  <q-dialog v-model="open">
    <q-card class="meal-names">
      <q-card-section class="q-gutter-y-sm">
        <div class="text-h6">
          {{ $t('schedule.meals') }}
        </div>
        <div
          v-for="(meal, index) in rows"
          :key="meal.row"
          class="row items-start no-wrap meal-row"
        >
          <q-input
            v-model="meal.name"
            class="col"
            outlined
            dense
            :maxlength="MEAL_NAME_LENGTH"
            :aria-label="$t('schedule.mealName', { n: index + 1 })"
            :error="!!meal.error"
            :error-message="meal.error"
            hide-bottom-space
          />
          <q-btn
            flat
            round
            dense
            icon="arrow_upward"
            :disable="index === 0"
            :aria-label="$t('schedule.moveUp', { name: title(index) })"
            @click="move(index, -1)"
          />
          <q-btn
            flat
            round
            dense
            icon="arrow_downward"
            :disable="index === rows.length - 1"
            :aria-label="$t('schedule.moveDown', { name: title(index) })"
            @click="move(index, 1)"
          />
          <q-btn
            flat
            round
            dense
            icon="close"
            :disable="rows.length === 1"
            :aria-label="$t('schedule.remove', { name: title(index) })"
            @click="remove(index)"
          />
        </div>
        <div class="row items-center">
          <q-btn
            flat
            no-caps
            color="primary"
            :label="$t('schedule.addMeal')"
            :aria-label="$t('schedule.addMeal')"
            :disable="rows.length >= MOST_MEALS"
            @click="add"
          />
          <span
            v-if="rows.length >= MOST_MEALS"
            class="text-caption text-grey-8"
          >{{ $t('schedule.mostMeals', { max: MOST_MEALS }) }}</span>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          flat
          :label="$t('common.cancel')"
          @click="open = false"
        />
        <q-btn
          flat
          color="primary"
          :label="$t('common.done')"
          @click="done"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.meal-names {
  width: 100%;
  max-width: 420px;
}
</style>
