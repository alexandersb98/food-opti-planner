<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Plan } from '../api/types'
import { dateRange, dayLabel } from '../dates'

// The Plan page's Schedule card (A1): the dates, meals a day, skipped
// meals and a dot per meal of each day, filled when planned and dashed
// when skipped. The days run a week to a row, from the plan's first day.
const props = defineProps<{ plan: Plan }>()

const { t } = useI18n()

const skipped = computed(() => new Set(props.plan.skips.map(({ day, meal }) => `${day}:${meal}`)))

const summary = computed(() => {
  const { start_date: start, days, meals } = props.plan
  const skips = props.plan.skips.filter((skip) => skip.day < days).length
  return [dateRange(start, days), t('plan.mealsADay', meals.length), t('plan.skipped', skips)].join(' · ')
})

const days = computed(() =>
  Array.from({ length: props.plan.days }, (_, day) => ({
    label: dayLabel(props.plan.start_date, day),
    meals: props.plan.meals.map((_, meal) => skipped.value.has(`${day}:${meal}`)),
  })),
)
</script>

<template>
  <q-card
    flat
    bordered
    class="schedule-card"
  >
    <q-card-section>
      <div class="row items-center no-wrap">
        <h2 class="col text-subtitle1 q-my-none">
          {{ $t('plan.schedule') }}
        </h2>
        <q-btn
          flat
          dense
          no-caps
          color="primary"
          :label="$t('plan.edit')"
          to="/plan/schedule"
        />
      </div>
      <div class="schedule-summary text-grey-8">
        {{ summary }}
      </div>
      <div
        class="schedule-dots q-mt-sm"
        aria-hidden="true"
      >
        <div
          v-for="(day, index) in days"
          :key="index"
          class="schedule-day"
          :title="day.label"
        >
          <span class="weekday text-caption text-grey-8">{{ day.label.charAt(0) }}</span>
          <span
            v-for="(isSkipped, meal) in day.meals"
            :key="meal"
            class="dot"
            :class="{ skipped: isSkipped }"
          />
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.schedule-dots {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px 6px;
}
.schedule-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 18px;
  height: 10px;
  border-radius: 3px;
  box-sizing: border-box;
  background: currentColor;
}
.dot.skipped {
  background: none;
  border: 1.5px dashed #8a8a84;
}
</style>
