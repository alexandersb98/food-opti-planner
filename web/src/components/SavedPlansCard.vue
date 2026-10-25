<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PlanResultSummary } from '../api/types'
import { dateRange } from '../dates'

// The Plan page's Saved plans card (A1): newest saved first, as the server
// lists them, each with when it was saved; the plan used for today has a
// Today chip. Tapping a row opens the plan.
defineProps<{ plans: PlanResultSummary[]; todayId: number | null }>()

const { t } = useI18n()

const weekday = new Intl.DateTimeFormat('en', { weekday: 'short' })

/** "saved Sun 20, 18:04", in the browser's time zone. */
function savedText(savedAt: string | null) {
  if (savedAt === null) return ''
  const time = new Date(savedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return t('plan.savedAt', {
    day: `${weekday.format(time)} ${time.getDate()}`,
    time: `${pad(time.getHours())}:${pad(time.getMinutes())}`,
  })
}
</script>

<template>
  <q-card
    flat
    bordered
    class="saved-plans-card"
  >
    <q-card-section class="q-pb-none">
      <h2 class="text-subtitle1 q-my-none">
        {{ $t('plan.savedPlans') }}
      </h2>
    </q-card-section>
    <q-list>
      <q-item
        v-for="saved in plans"
        :key="saved.id"
        v-ripple
        clickable
        class="saved-plan"
        :to="{ name: 'saved-plan', params: { id: saved.id } }"
      >
        <q-item-section>
          <q-item-label>{{ dateRange(saved.start_date, saved.days) }}</q-item-label>
          <q-item-label caption>
            {{ savedText(saved.saved_at) }}
          </q-item-label>
        </q-item-section>
        <q-item-section
          v-if="saved.id === todayId"
          side
        >
          <q-chip
            dense
            color="primary"
            text-color="white"
            :label="$t('plan.todayChip')"
          />
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>
