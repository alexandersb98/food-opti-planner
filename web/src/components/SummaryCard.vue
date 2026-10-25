<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PlanResult } from '../api/types'

// The results page's Summary card (R1): each attribute's plan total and
// daily average, in the attributes' order. More than 5 start collapsed.
const props = defineProps<{ plan: PlanResult }>()

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
    </q-card-section>
  </q-card>
</template>
