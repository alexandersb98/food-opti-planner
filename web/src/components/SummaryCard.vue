<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlanResult } from '../api/types'
import { missRows } from '../misses'

// The results page's Summary card (R1): each attribute's plan total and
// daily average, in the attributes' order. More than 5 start collapsed. The
// missed goals stay below, collapsed or not.
const props = defineProps<{ plan: PlanResult }>()

const { t } = useI18n()

const SHOWN_COLLAPSED = 5
const expanded = ref(false)
const collapsible = computed(() => props.plan.attributes.length > SHOWN_COLLAPSED)

const rows = computed(() => {
  const { attributes, totals, averages } = props.plan
  const shown = collapsible.value && !expanded.value ? attributes.slice(0, SHOWN_COLLAPSED) : attributes
  return shown.map(({ name, unit }, i) => ({
    name,
    total: `${totals[i]} ${unit}`.trim(),
    average: `${averages[i]} ${unit}`.trim(),
  }))
})

const misses = computed(() => missRows(props.plan, t))
</script>

<template>
  <q-card
    flat
    bordered
    class="summary-card"
  >
    <q-card-section>
      <h2 class="text-subtitle1 q-mt-none q-mb-xs">
        {{ $t('results.summary') }}
      </h2>
      <div
        v-for="row in rows"
        :key="row.name"
        class="summary-row row no-wrap q-py-xs"
      >
        <span class="col">{{ row.name }}</span>
        <span class="text-right">{{ row.total }} · {{ $t('results.perDay', { value: row.average }) }}</span>
      </div>
      <q-btn
        v-if="collapsible"
        flat
        dense
        no-caps
        color="primary"
        class="q-mt-xs"
        :label="expanded ? $t('results.showFewer') : $t('results.showAll', { n: plan.attributes.length })"
        @click="expanded = !expanded"
      />
      <template v-if="plan.goals.length > 0">
        <div
          v-if="misses.length === 0"
          class="q-mt-sm"
        >
          {{ $t('results.allGoalsMet') }}
        </div>
        <template v-else>
          <h3 class="text-subtitle2 q-mt-sm q-mb-xs">
            {{ $t('results.missedGoals') }}
          </h3>
          <div
            v-for="row in misses"
            :key="row.title"
            class="miss-row q-py-xs"
          >
            <div class="missed text-deep-orange-9">
              {{ row.title }}
            </div>
            <div class="text-caption text-grey-8">
              {{ row.worst }}
            </div>
          </div>
        </template>
      </template>
    </q-card-section>
  </q-card>
</template>
