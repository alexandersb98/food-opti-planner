<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CatalogueUnit } from '../api/types'
import { usePreferences } from '../preferences'
import { useUnits, type Category } from '../units'

// A unit as text, with the catalogue's units to choose from: grouped by
// category, the preferred unit of each first. Typed text is kept as typed;
// a chosen unit is its symbol, in the catalogue's spelling.

type Group = Category | 'piece'
type Option = { kind: 'header'; group: Group } | { kind: 'unit'; unit: CatalogueUnit }

const props = defineProps<{
  modelValue: string
  label: string
  /** The groups to offer, in this order; 'piece' is "Other", the known free-text units. */
  categories: readonly Group[]
  dense?: boolean
  error?: boolean
  errorMessage?: string
  hideBottomSpace?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [text: string] }>()

const { t } = useI18n()
const units = useUnits()
const preferences = usePreferences()

// Both loads are shared and once-only, and never reject; a failed one leaves
// the list empty and the field a plain text box.
onMounted(() => {
  void units.load()
  void preferences.load()
})

const PREFERENCE = { mass: 'unit.mass', volume: 'unit.volume', energy: 'unit.energy' } as const

function inGroup(group: Group): CatalogueUnit[] {
  if (group === 'piece') return units.offered(null)
  const preferred = preferences.preferences.value?.[PREFERENCE[group]]
  const offered = units.offered(group)
  return [...offered.filter((u) => u.symbol === preferred), ...offered.filter((u) => u.symbol !== preferred)]
}

// What the user has typed since the list was last opened or a unit chosen;
// null shows the whole list.
const needle = ref<string | null>(null)

function matches(unit: CatalogueUnit, text: string): boolean {
  const key = text.trim().toLowerCase()
  return [unit.symbol, unit.name, ...unit.aliases].some((spelling) => spelling.toLowerCase().includes(key))
}

const options = computed<Option[]>(() => {
  const text = needle.value
  return props.categories.flatMap((group) => {
    const found = inGroup(group).filter((unit) => text === null || matches(unit, text))
    return found.length === 0 ? [] : [{ kind: 'header', group } as Option, ...found.map((unit): Option => ({ kind: 'unit', unit }))]
  })
})

// The text last sent or received, so a typed or filled-in text equal to it
// is not sent again.
let current = props.modelValue
watch(
  () => props.modelValue,
  (text) => (current = text),
)

function send(text: string) {
  if (text === current) return
  current = text
  emit('update:modelValue', text)
}

function onInput(text: string) {
  if (text === current) return
  needle.value = text
  send(text)
}

function onChoose(option: Option | string | null) {
  needle.value = null
  if (option && typeof option === 'object' && option.kind === 'unit') send(option.unit.symbol)
}

function onFilter(_text: string, update: (callback: () => void) => void) {
  update(() => undefined)
}

/** The text an option or the model stands for in the box: the symbol. */
function optionText(option: Option | string): string {
  if (typeof option === 'string') return option
  return option.kind === 'unit' ? option.unit.symbol : ''
}

function onHide() {
  needle.value = null
}
</script>

<template>
  <q-select
    :model-value="modelValue"
    :options="options"
    :option-label="optionText"
    :option-disable="(option: Option) => option.kind === 'header'"
    :label="label"
    :error="error"
    :error-message="errorMessage"
    :hide-bottom-space="hideBottomSpace"
    :dense="dense"
    behavior="menu"
    outlined
    use-input
    hide-selected
    fill-input
    input-debounce="0"
    :virtual-scroll-slice-size="60"
    @filter="onFilter"
    @input-value="onInput"
    @update:model-value="onChoose"
    @popup-hide="onHide"
  >
    <template #option="{ opt, itemProps }">
      <q-item-label
        v-if="opt.kind === 'header'"
        header
      >
        {{ t(`units.groups.${opt.group}`) }}
      </q-item-label>
      <q-item
        v-else
        v-bind="itemProps"
      >
        <q-item-section>
          <q-item-label>{{ units.label(opt.unit) }}</q-item-label>
        </q-item-section>
      </q-item>
    </template>
  </q-select>
</template>
