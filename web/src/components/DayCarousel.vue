<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlanResult, ResultMeal } from '../api/types'
import { dayLabel } from '../dates'
import { valueText } from '../format'
import { dayLine } from '../misses'
import { roundedText } from '../totals'

// The results page's days (R1): one day at a time, swiped or moved with
// the arrows, with Today to jump back when the plan covers today. A day
// shows a line of totals (the attributes with goals, or the first three; all
// on tap; a value missed that day in the warning colour) and its meals in
// schedule order; tapping a planned meal opens its ingredients, scaled to the
// portion, and its totals.
const props = defineProps<{
  plan: PlanResult
  today: number | null // today's day in the plan, if it covers today
  initialDay: number
  initialMeal: number | null
}>()

/** Scaled amounts are shown with at most this many decimals. */
const AMOUNT_DECIMALS = 2

const { t } = useI18n()

const day = ref(props.initialDay)
const openMeals = reactive(new Set<string>()) // "day:meal" of each open meal
// Only a planned meal opens; a skipped one has nothing to show.
if (props.initialMeal !== null && props.plan.meals[props.initialDay]?.[props.initialMeal]?.planned)
  openMeals.add(`${props.initialDay}:${props.initialMeal}`)
const allTotals = reactive(new Set<number>()) // days showing every attribute

function totalsText(values: readonly string[]) {
  return props.plan.attributes
    .map((attribute, i) => valueText(attribute, values[i] ?? '0'))
    .join(' · ')
}

function toggle<T>(set: Set<T>, key: T) {
  if (!set.delete(key)) set.add(key)
}

function toggleMeal(dayIndex: number, mealIndex: number, meal: ResultMeal) {
  if (meal.planned) toggle(openMeals, `${dayIndex}:${mealIndex}`)
}

const position = computed(() => ({
  day: dayLabel(props.plan.start_date, day.value),
  n: day.value + 1,
  days: props.plan.days,
}))
</script>

<template>
  <div class="day-carousel">
    <div class="row items-center no-wrap q-mb-xs">
      <q-btn
        flat
        round
        dense
        icon="chevron_left"
        :aria-label="$t('results.previousDay')"
        :disable="day === 0"
        @click="day--"
      />
      <div class="col text-center text-subtitle1 day-position">
        {{ $t('results.position', position) }}
      </div>
      <q-btn
        flat
        round
        dense
        icon="chevron_right"
        :aria-label="$t('results.nextDay')"
        :disable="day === plan.days - 1"
        @click="day++"
      />
      <q-btn
        v-if="today !== null && day !== today"
        flat
        dense
        no-caps
        color="primary"
        class="q-ml-xs"
        :label="$t('results.today')"
        @click="day = today"
      />
    </div>

    <q-carousel
      v-model="day"
      swipeable
      animated
      transition-prev="slide-right"
      transition-next="slide-left"
      height="auto"
    >
      <q-carousel-slide
        v-for="(meals, dayIndex) in plan.meals"
        :key="dayIndex"
        :name="dayIndex"
        class="q-pa-none"
      >
        <q-card
          flat
          bordered
        >
          <template v-if="plan.attributes.length > 0">
            <q-item
              v-ripple
              clickable
              class="day-line text-grey-9"
              @click="toggle(allTotals, dayIndex)"
            >
              <q-item-section>
                <div>
                  <template
                    v-for="(part, i) in dayLine(plan, dayIndex, t)"
                    :key="i"
                  >
                    <span v-if="i > 0"> · </span>
                    <span :class="{ 'missed text-deep-orange-9': part.missed }">{{ part.text }}</span>
                  </template>
                </div>
              </q-item-section>
            </q-item>
            <div
              v-if="allTotals.has(dayIndex)"
              class="q-px-md q-pb-sm"
            >
              <div
                v-for="(attribute, i) in plan.attributes"
                :key="attribute.name"
                class="day-total"
              >
                {{ valueText(attribute, plan.day_totals[dayIndex]?.[i] ?? '0') }}
              </div>
            </div>
            <q-separator />
          </template>

          <q-list>
            <template
              v-for="(meal, mealIndex) in meals"
              :key="mealIndex"
            >
              <q-item
                :clickable="meal.planned"
                class="meal-row"
                @click="toggleMeal(dayIndex, mealIndex, meal)"
              >
                <q-item-section>{{ meal.name }}</q-item-section>
                <q-item-section
                  side
                  :class="{ 'text-grey-9': meal.planned }"
                >
                  {{
                    meal.planned
                      ? $t('results.portion', { recipe: meal.recipe, portion: meal.portion })
                      : $t('results.skipped')
                  }}
                </q-item-section>
              </q-item>
              <div
                v-if="openMeals.has(`${dayIndex}:${mealIndex}`)"
                class="meal-detail q-pl-lg q-pr-md q-pb-sm"
              >
                <div
                  v-for="item in meal.items"
                  :key="item.ingredient"
                  class="meal-item row no-wrap"
                >
                  <span class="col">{{ item.ingredient }}</span>
                  <span>{{ `${roundedText(item.amount, AMOUNT_DECIMALS)} ${item.unit}`.trim() }}</span>
                </div>
                <div class="meal-totals text-caption text-grey-8 q-mt-xs">
                  {{ totalsText(meal.totals) }}
                </div>
              </div>
            </template>
          </q-list>
        </q-card>
      </q-carousel-slide>
    </q-carousel>
  </div>
</template>
