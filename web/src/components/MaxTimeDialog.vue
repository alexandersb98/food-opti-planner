<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Plan } from '../api/types'
import { planFields, useSavePlan } from '../plan'

// Max solving time on the Plan page (A1): whole seconds, saved with the
// rest of the setup as it is, since the server takes the setup whole.
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ plan: Plan }>()
const emit = defineEmits<{ saved: [plan: Plan] }>()

// The server's limits; the solve runs inside the request (the 5-minute ceiling).
const LIMIT = { min: 1, max: 300 }

const { t } = useI18n()
const text = ref('')
const errors = reactive({ time: '', save: '' })
const { saving, savePlan } = useSavePlan()

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
  return number >= LIMIT.min && number <= LIMIT.max ? number : null
}

async function save() {
  const time = seconds()
  errors.time = time === null ? t('plan.maxTimeRange', LIMIT) : ''
  errors.save = ''
  if (time === null) return
  const saved = await savePlan({ ...planFields(props.plan), solve_time_limit: time })
  if (saved.plan) {
    emit('saved', saved.plan)
    open.value = false
  } else if (saved.errors.solve_time_limit) errors.time = t('plan.maxTimeRange', LIMIT)
  else errors.save = t('common.saveFailed')
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
            :hint="$t('plan.maxTimeHint', { max: LIMIT.max })"
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
