<script setup lang="ts">
// The question before a unit change converts what is stored in the unit
// (C4, C5): what will be converted, or that the numbers stay. Mount it once
// per page; `useUnitChange().ask` opens it.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUnitChange } from '../composables/useUnitChange'

const { t, te } = useI18n()
const { state, answer } = useUnitChange()

const request = computed(() => state.value?.request ?? null)
const converts = computed(() => request.value?.change.kind === 'convert')

// "12 ingredient values and 2 goals": a count with no text of its own (a
// later slice's) or of 0 is left out.
const counts = computed(() => {
  const given = request.value?.change.counts ?? {}
  const parts = Object.entries(given)
    .filter(([key, n]) => n > 0 && te(`unitChange.counts.${key}`))
    .map(([key, n]) => t(`unitChange.counts.${key}`, { n }, n))
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')}${t('unitChange.and')}${parts.at(-1)}`
})

const body = computed(() => {
  const current = request.value
  if (!current) return ''
  const names = { name: current.name, from: current.from, to: current.to }
  if (!counts.value) return t(converts.value ? 'unitChange.nothingToConvert' : 'unitChange.nothingToKeep', names)
  if (!converts.value) return t('unitChange.noConvertBody', { ...names, counts: counts.value })
  return t('unitChange.convertBody', { ...names, counts: counts.value, factor: current.change.factor })
})

const rounded = computed(() => request.value?.change.rounded ?? 0)
</script>

<template>
  <!-- Persistent: only the buttons decide, not a click beside the dialog. -->
  <q-dialog
    :model-value="request !== null"
    persistent
    @escape-key="answer(false)"
  >
    <q-card class="unit-change">
      <q-card-section>
        <div class="text-h6">
          {{ request && converts ? $t('unitChange.convertTitle', { name: request.name }) : $t('unitChange.changeTitle') }}
        </div>
        <p class="q-mb-none q-mt-sm">
          {{ body }}
        </p>
        <p
          v-if="rounded > 0"
          class="q-mb-none q-mt-sm"
        >
          {{ $t('unitChange.rounded', { n: rounded }, rounded) }}
        </p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          flat
          :label="$t('common.cancel')"
          @click="answer(false)"
        />
        <q-btn
          flat
          color="primary"
          :label="converts ? $t('unitChange.convert') : $t('unitChange.changeUnit')"
          @click="answer(true)"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.unit-change {
  max-width: min(28rem, 100%);
}
</style>
