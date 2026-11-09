<script setup lang="ts">
// The unit of one recipe line (C2): the ingredient's own unit, the catalogue
// units that convert to it, the ingredient's stored conversions (✨ for one
// the AI suggested) and "New unit…", which asks the page to add a conversion.
// The value is the line's unit: empty for the ingredient's own.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Conversion, Ingredient } from '../api/types'
import { lineFactor, pickerOptions } from '../lineUnits'
import { useUnits } from '../units'

type Option =
  | { kind: 'header'; group: 'own' | 'steps' | 'conversions' }
  | { kind: 'unit'; value: string; label: string; conversion?: Conversion }
  | { kind: 'new' }

const props = defineProps<{
  ingredient: Ingredient
  modelValue: string
  /** The ingredient's name, for the label. */
  name: string
  error?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [unit: string]; 'new-unit': [] }>()

const { t } = useI18n()
const units = useUnits()

// The catalogue is shared and loaded once; a failed load leaves the picker
// with the own unit and the stored conversions.
onMounted(() => void units.load())

const NEW = '\u0000new'

const options = computed<Option[]>(() => {
  const offered = [...units.offered('mass'), ...units.offered('volume'), ...units.offered(null)]
  const found = pickerOptions(units.ratio, offered, props.ingredient)
  const own: Option[] = [{ kind: 'header', group: 'own' }, { kind: 'unit', value: '', label: found.own }]
  const steps: Option[] = found.steps.length
    ? [{ kind: 'header', group: 'steps' }, ...found.steps.map((unit): Option => ({ kind: 'unit', value: unit.symbol, label: units.label(unit) }))]
    : []
  const conversions: Option[] = found.conversions.length
    ? [
        { kind: 'header', group: 'conversions' },
        ...found.conversions.map((conversion): Option => ({
          kind: 'unit', value: conversion.unit, label: conversion.unit, conversion,
        })),
      ]
    : []
  return [...own, ...steps, ...conversions, { kind: 'new' }]
})

// What the box shows: the ingredient's unit for the own unit, else the unit's
// symbol in the catalogue's spelling.
const shown = computed(() => (props.modelValue === '' ? props.ingredient.unit : (units.findUnit(props.modelValue)?.symbol ?? props.modelValue)))
// A unit the ingredient can't take (stale data): marked, not hidden.
const stale = computed(() => lineFactor(units.ratio, props.ingredient, props.modelValue) === null)

function onChoose(value: string) {
  if (value === NEW) emit('new-unit')
  else emit('update:modelValue', value)
}

function optionValue(option: Option): string {
  if (option.kind === 'unit') return option.value
  return option.kind === 'new' ? NEW : `\u0000${option.group}`
}

function factorText(conversion: Conversion): string {
  return `= ${conversion.factor} ${props.ingredient.unit}`
}
</script>

<template>
  <q-select
    class="line-unit"
    :model-value="modelValue"
    :options="options"
    :option-value="optionValue"
    :option-disable="(option: Option) => option.kind === 'header'"
    :display-value="shown"
    :aria-label="t('recipes.unitOf', { name })"
    :error="error || stale"
    :class="{ 'unit-stale': stale }"
    behavior="menu"
    outlined
    dense
    emit-value
    map-options
    :virtual-scroll-slice-size="60"
    hide-bottom-space
    @update:model-value="onChoose"
  >
    <template #option="{ opt, itemProps }">
      <q-item-label
        v-if="opt.kind === 'header'"
        header
      >
        {{ t(`recipes.unitGroups.${opt.group}`) }}
      </q-item-label>
      <q-item
        v-else-if="opt.kind === 'new'"
        v-bind="itemProps"
        class="new-unit"
      >
        <q-item-section class="text-primary">
          {{ t('recipes.newUnit') }}
        </q-item-section>
      </q-item>
      <q-item
        v-else
        v-bind="itemProps"
      >
        <q-item-section>
          <q-item-label>{{ opt.label }}</q-item-label>
          <q-item-label
            v-if="opt.conversion"
            caption
          >
            {{ factorText(opt.conversion) }}
          </q-item-label>
        </q-item-section>
        <q-item-section
          v-if="opt.conversion?.source === 'ai'"
          side
        >
          <span class="ai-mark">✨<q-tooltip>{{ t('recipes.aiTooltip') }}</q-tooltip></span>
        </q-item-section>
      </q-item>
    </template>
  </q-select>
</template>

<style scoped>
.line-unit {
  width: 9em;
}
</style>
