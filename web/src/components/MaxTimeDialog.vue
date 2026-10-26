<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { Plan } from '../api/types'
import { useSave } from '../composables/useSave'
import { SOLVE_SECONDS } from '../limits'

// Max solving time on the Plan page (A1): whole seconds, saved with the
// rest of the setup as it is, since the server takes the setup whole.
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ plan: Plan }>()
const emit = defineEmits<{ saved: [plan: Plan] }>()

const { t } = useI18n()
const text = ref('')
const errors = reactive({ time: '', save: '' })
const { saving, save: send } = useSave(errors)

watch(open, (isOpen) => {
  if (!isOpen) return
  text.value = String(props.plan.solve_time_limit)
  Object.assign(errors, { time: '', save: '' })
})

/** The seconds typed, or null unless a whole number within the limits. */
function seconds(): number | null {
  const typed = text.value.trim()
  if (!/^\d+$/.test(typed)) return null
  const number = Number(typed)
  return number >= SOLVE_SECONDS.min && number <= SOLVE_SECONDS.max ? number : null
}

async function save() {
  const time = seconds()
  errors.time = time === null ? t('plan.maxTimeRange', SOLVE_SECONDS) : ''
  errors.save = ''
  if (time === null) return
  await send(
    () => api.PUT('/api/plan', { body: { ...props.plan, solve_time_limit: time } }),
    (data) => {
      emit('saved', data)
      open.value = false
    },
    (byField) => {
      if (byField.solve_time_limit) errors.time = t('plan.maxTimeRange', SOLVE_SECONDS)
      return !!byField.solve_time_limit
    },
  )
}
</script>

<template>
  <q-dialog v-model="open">
    <q-card class="max-time-dialog">
      <q-form @submit="save">
        <q-card-section class="q-gutter-y-sm">
          <div class="text-h6">
            {{ $t('plan.maxTime') }}
          </div>
          <q-input
            v-model="text"
            outlined
            autofocus
            inputmode="numeric"
            :label="$t('plan.maxTime')"
            suffix="s"
            :hint="$t('plan.maxTimeHint', { max: SOLVE_SECONDS.max })"
            :error="!!errors.time"
            :error-message="errors.time"
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
            flat
            :label="$t('common.cancel')"
            @click="open = false"
          />
          <q-btn
            flat
            type="submit"
            color="primary"
            :label="$t('common.save')"
            :loading="saving"
          />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.max-time-dialog {
  width: 100%;
  max-width: 360px;
}
</style>
