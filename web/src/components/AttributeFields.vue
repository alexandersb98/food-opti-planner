<script setup lang="ts">
import { computed } from 'vue'
import { decimalsExample, parseDecimals } from '../attributeFields'
import UnitField from './UnitField.vue'

// The fields of an attribute as typed: name, unit and decimals (a string
// while typed, so an empty field is allowed), with their hints and errors.
// The draft is edited in place, as a reactive object.

type Draft = { name: string; unit: string; decimals: string }
type Errors = { name: string; unit: string; decimals: string }

// v-model:draft on the page's reactive object; its fields are edited in place.
const draft = defineModel<Draft>('draft', { required: true })

withDefaults(
  defineProps<{
    errors: Errors
    categories?: readonly ('mass' | 'volume' | 'energy')[]
  }>(),
  { categories: () => ['mass', 'volume', 'energy'] },
)

const example = computed(() => decimalsExample(parseDecimals(draft.value.decimals), draft.value.unit))
</script>

<template>
  <div class="row q-col-gutter-sm">
    <q-input
      v-model="draft.name"
      class="col-6"
      outlined
      dense
      autofocus
      :label="$t('common.name')"
      :error="!!errors.name"
      :error-message="errors.name"
    />
    <UnitField
      v-model="draft.unit"
      class="col-3"
      :categories="categories"
      dense
      :label="$t('attributes.unit')"
      :error="!!errors.unit"
      :error-message="errors.unit"
    />
    <q-input
      v-model="draft.decimals"
      class="col-3"
      type="number"
      inputmode="numeric"
      outlined
      dense
      :label="$t('attributes.decimals')"
      :error="!!errors.decimals"
      :error-message="errors.decimals"
    />
  </div>
  <div class="text-caption text-grey-8">
    {{ $t('attributes.unitHint') }}
  </div>
  <div class="text-caption text-grey-8">
    {{ $t('attributes.decimalsHint') }}
    <span v-if="example">({{ example }})</span>
  </div>
</template>
