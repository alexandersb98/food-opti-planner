<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Ingredient } from '../api/types'
import type { DraftLine } from '../composables/useRecipeDraft'
import { acceptable, type FactorRow, type LineState } from '../importReview'

// One imported line under review (C2), wrapped around the line's ordinary
// row: the source line above it, and below it what the line needs from the
// user: pick an ingredient, give a factor ("1 dl = [100] g ✨ Accept"), pick
// another unit, or Skip. A skipped line is greyed, with Add anyway (it was
// not an ingredient) or Add back (the user skipped it). No logic: the page
// decides the states and does what the events ask.
const props = defineProps<{
  line: DraftLine
  ingredient: Ingredient | undefined
  state: LineState
  ownUnit: string
  factor: FactorRow | null // a line that needs a factor, or has one accepted
}>()
const { t } = useI18n()

/** An action's accessible name with the line it is for (the buttons repeat per line). */
function named(label: string) {
  return t('recipes.buttonFor', { action: label, name: props.ingredient?.name ?? props.line.food })
}

defineEmits<{
  pick: []
  skip: []
  unskip: []
  accept: [text: string]
  change: []
  'factor-input': [text: string]
}>()
</script>

<template>
  <div
    class="review-line"
    :class="{
      'line-skipped': state === 'skipped',
      'needs-you': state === 'unmatched' || state === 'needs_factor' || state === 'bad_unit',
    }"
  >
    <div
      v-if="line.originalText"
      class="source-line text-caption text-grey-7"
      :title="$t('recipes.sourceLine', { text: line.originalText })"
    >
      {{ line.originalText }}
    </div>
    <slot />

    <div
      v-if="state === 'skipped'"
      class="row items-center q-gutter-x-sm"
    >
      <span class="text-caption text-grey-7">{{ $t('recipes.skipped') }}</span>
      <q-btn
        class="unskip"
        flat
        dense
        no-caps
        color="primary"
        :label="line.notAnIngredient ? $t('recipes.addAnyway') : $t('recipes.addBack')"
        :aria-label="named(line.notAnIngredient ? $t('recipes.addAnyway') : $t('recipes.addBack'))"
        @click="$emit('unskip')"
      />
    </div>

    <div
      v-else-if="state === 'unmatched'"
      class="row items-center q-gutter-x-sm"
    >
      <q-btn
        class="pick-ingredient"
        outline
        dense
        no-caps
        color="negative"
        :label="$t('recipes.pickIngredient')"
        :aria-label="named($t('recipes.pickIngredient'))"
        @click="$emit('pick')"
      />
      <q-btn
        class="skip"
        flat
        dense
        no-caps
        :label="$t('recipes.skip')"
        :aria-label="named($t('recipes.skip'))"
        @click="$emit('skip')"
      />
    </div>

    <div
      v-if="factor && state !== 'skipped' && state !== 'unmatched'"
      class="factor-row row items-center q-gutter-x-sm"
    >
      <span>{{ $t('recipes.factorRow', { unit: line.unit }) }}</span>
      <template v-if="factor.accepted">
        <span class="factor-value">{{ factor.text }} {{ ownUnit }}</span>
        <span
          v-if="factor.ai"
          class="ai-mark"
        >✨<q-tooltip>{{ $t('recipes.aiTooltip') }}</q-tooltip></span>
        <q-btn
          class="change-factor"
          flat
          dense
          no-caps
          color="primary"
          :label="$t('recipes.change')"
          :aria-label="named($t('recipes.change'))"
          @click="$emit('change')"
        />
      </template>
      <template v-else>
        <q-input
          class="factor-input"
          style="width: 7em"
          outlined
          dense
          inputmode="decimal"
          :model-value="factor.text"
          :readonly="factor.loading"
          :placeholder="factor.loading ? $t('recipes.suggesting') : ''"
          :aria-label="$t('recipes.factorLabel', { own: ownUnit, unit: line.unit })"
          :error="factor.text !== '' && acceptable(factor.text) === null"
          :error-message="$t('recipes.factorInvalid')"
          @update:model-value="(value) => $emit('factor-input', String(value ?? ''))"
        />
        <span>{{ ownUnit }}</span>
        <span
          v-if="factor.ai && factor.text"
          class="ai-mark"
        >✨<q-tooltip>{{ $t('recipes.aiTooltip') }}</q-tooltip></span>
        <q-btn
          class="accept-factor"
          unelevated
          dense
          no-caps
          color="primary"
          :label="$t('recipes.accept')"
          :aria-label="named($t('recipes.accept'))"
          :disable="factor.loading || acceptable(factor.text) === null"
          @click="$emit('accept', factor.text)"
        />
      </template>
    </div>

    <div
      v-if="state === 'bad_unit'"
      class="bad-unit text-negative text-caption"
    >
      {{ $t('recipes.badUnit', { unit: line.unit }) }}
    </div>
    <div
      v-if="state === 'needs_factor' || state === 'bad_unit'"
      class="row"
    >
      <q-btn
        class="skip"
        flat
        dense
        no-caps
        :label="$t('recipes.skip')"
        :aria-label="named($t('recipes.skip'))"
        @click="$emit('skip')"
      />
    </div>
  </div>
</template>

<style scoped>
.line-skipped {
  opacity: 0.55;
}
</style>
