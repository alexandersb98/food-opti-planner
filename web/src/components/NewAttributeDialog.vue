<script setup lang="ts">
// Create attribute (S2): a small form that makes an attribute for a source
// column. Its unit must convert with the column's, so it starts as the
// preferred unit of the column's category and offers that category only.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { Attribute, SourceColumn } from '../api/types'
import { DECIMALS, parseDecimals } from '../attributeFields'
import { usePreferences } from '../preferences'
import { useUnits } from '../units'
import AttributeFields from './AttributeFields.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ column: SourceColumn | null }>()
const emit = defineEmits<{ created: [attribute: Attribute] }>()

const { t } = useI18n()
const units = useUnits()
const preferences = usePreferences()

const draft = reactive({ name: '', unit: '', decimals: '' })
const errors = reactive({ name: '', unit: '', decimals: '', save: '' })
const saving = ref(false)

const category = computed(() => (props.column ? (units.findUnit(props.column.unit)?.category ?? null) : null))
// The units offered: the column's category, or none (a plain text box) for a
// column in free text.
const categories = computed(() => (category.value ? [category.value] : []))

/** The unit a new attribute starts with: the preferred unit of the column's
 * category, else the column's own unit. */
function startUnit(column: SourceColumn): string {
  const found = units.findUnit(column.unit)?.category
  const preferred = found ? preferences.preferences.value?.[`unit.${found}`] : undefined
  return preferred ?? column.unit
}

watch(
  () => open.value,
  (shown) => {
    if (!shown || !props.column) return
    void units.load()
    void preferences.load()
    Object.assign(draft, { name: '', unit: startUnit(props.column), decimals: String(DECIMALS.default) })
    Object.assign(errors, { name: '', unit: '', decimals: '', save: '' })
  },
  { immediate: true },
)

// The catalogue and the preferences may arrive after the dialog opened: the
// start unit follows them until the user has touched the unit.
let touched = false
watch(open, () => (touched = false))
watch(
  () => draft.unit,
  (unit) => {
    if (props.column && unit !== startUnit(props.column)) touched = true
  },
)
watch(
  () => [units.units.value.length, preferences.preferences.value] as const,
  () => {
    if (open.value && props.column && !touched) draft.unit = startUnit(props.column)
  },
)

async function add() {
  const column = props.column
  if (!column) return
  const name = draft.name.trim()
  const unit = draft.unit.trim()
  const decimals = parseDecimals(draft.decimals)
  errors.name = name ? '' : t('common.nameRequired')
  errors.decimals = decimals === null ? t('attributes.decimalsRange', DECIMALS) : ''
  errors.unit = units.convertible(column.unit, unit) ? '' : t('dataSource.createUnitMismatch', { unit: column.unit })
  errors.save = ''
  if (errors.name || errors.decimals || errors.unit || decimals === null) return

  saving.value = true
  try {
    const { data, error } = await api.POST('/api/attributes', { body: { name, unit, decimals } })
    if (data) {
      open.value = false
      emit('created', data)
    } else if (fieldErrors(error).name === 'name_in_use') errors.name = t('attributes.nameInUse')
    else errors.save = t('common.saveFailed')
  } catch {
    errors.save = t('common.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <q-dialog v-model="open">
    <q-card
      class="new-attribute-dialog"
      style="min-width: min(32rem, 92vw)"
    >
      <q-form @submit="add">
        <q-card-section>
          <div class="text-h6">
            {{ $t('dataSource.newAttribute') }}
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none q-gutter-y-sm">
          <AttributeFields
            v-model:draft="draft"
            :errors="errors"
            :categories="categories"
          />
          <div
            v-if="errors.save"
            class="text-negative"
            role="alert"
          >
            {{ errors.save }}
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-close-popup
            flat
            :label="$t('common.cancel')"
          />
          <q-btn
            type="submit"
            color="primary"
            :loading="saving"
            :label="$t('dataSource.add')"
          />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>
