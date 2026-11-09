<script setup lang="ts">
// Add or edit a conversion of an ingredient: "1 [unit] = [number] g" (C2's
// New unit… and C4's Conversions card). Saves at once through the API and
// tells the page what was saved.
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { Conversion, Ingredient } from '../api/types'
import { typedNumber } from '../numbers'
import UnitField from './UnitField.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  ingredient: Pick<Ingredient, 'id' | 'name' | 'unit'>
  /** The conversion to edit; none adds a new one. */
  conversion?: Conversion | null
}>()
const emit = defineEmits<{ saved: [conversion: Conversion] }>()

const { t } = useI18n()

const draft = reactive({ unit: '', factor: '' })
const errors = reactive({ unit: '', factor: '', save: '' })
const saving = ref(false)

watch(
  open,
  (shown) => {
    if (!shown) return
    Object.assign(draft, { unit: props.conversion?.unit ?? '', factor: props.conversion?.factor ?? '' })
    Object.assign(errors, { unit: '', factor: '', save: '' })
  },
  { immediate: true },
)

const UNIT_ERRORS: Record<string, string> = {
  unit_not_for_ingredient: 'ingredients.unitNotForIngredient',
  unit_is_own_unit: 'conversions.unitIsOwn',
  duplicate: 'conversions.duplicate',
  conversion_in_use: 'conversions.unitInUse',
}

async function save() {
  const unit = draft.unit.trim()
  const factor = typedNumber(draft.factor)
  errors.unit = unit ? '' : t('conversions.unitRequired')
  errors.factor = factor !== null && Number(factor) > 0 ? '' : t('conversions.factorInvalid')
  errors.save = ''
  if (errors.unit || errors.factor || factor === null) return

  saving.value = true
  try {
    const path = { ingredient_id: props.ingredient.id }
    const body = { unit, factor }
    const { data, error } = props.conversion
      ? await api.PUT('/api/ingredients/{ingredient_id}/conversions/{conversion_id}', {
          params: { path: { ...path, conversion_id: props.conversion.id } },
          body,
        })
      : await api.POST('/api/ingredients/{ingredient_id}/conversions', { params: { path }, body })
    if (data) {
      open.value = false
      emit('saved', data)
      return
    }
    const byField = fieldErrors(error)
    const unitKey = UNIT_ERRORS[byField.unit ?? '']
    if (unitKey) errors.unit = t(unitKey)
    else if (byField.unit) errors.unit = t('conversions.unitRequired')
    if (byField.factor) {
      errors.factor = /decimal|digits|whole/.test(byField.factor) ? t('conversions.numberTooLong') : t('conversions.factorInvalid')
    }
    if (!errors.unit && !errors.factor) errors.save = t('conversions.saveFailed')
  } catch {
    errors.save = t('conversions.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <q-dialog v-model="open">
    <q-card
      class="conversion-dialog"
      style="min-width: min(26rem, 92vw)"
    >
      <q-form @submit="save">
        <q-card-section>
          <div class="text-h6">
            {{ conversion ? $t('conversions.editTitle') : $t('conversions.addTitle') }}
          </div>
          <div class="text-caption text-grey-8">
            {{ ingredient.name }}
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none q-gutter-y-sm">
          <UnitField
            v-model="draft.unit"
            :label="$t('conversions.unit')"
            :categories="['volume', 'mass', 'piece']"
            :error="!!errors.unit"
            :error-message="errors.unit"
            hide-bottom-space
          />
          <q-input
            v-model="draft.factor"
            outlined
            inputmode="decimal"
            :aria-label="$t('conversions.factor', { own: ingredient.unit })"
            :label="$t('conversions.factor', { own: ingredient.unit })"
            :suffix="ingredient.unit"
            :error="!!errors.factor"
            :error-message="errors.factor"
            hide-bottom-space
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
            :label="$t('common.save')"
          />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>
