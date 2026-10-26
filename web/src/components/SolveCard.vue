<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { Failure } from '../solve'

// The Plan page's card for Make plan (A1): Making plan… with a bar and Cancel
// while a solve runs, or Couldn't make a plan, until dismissed, after one that
// made none. The bar is the browser's clock against Max solving time, full
// past it.
const props = defineProps<{
  running: boolean
  cancelling: boolean
  startedAt: number | null
  seconds: number
  failure: Failure | null
}>()
defineEmits<{ cancel: []; dismiss: [] }>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

watch(
  () => props.running,
  (running) => {
    clearInterval(timer)
    now.value = Date.now()
    if (running) timer = setInterval(() => (now.value = Date.now()), 250)
  },
  { immediate: true },
)
onUnmounted(() => clearInterval(timer))

const elapsed = computed(() => Math.max(0, (now.value - (props.startedAt ?? now.value)) / 1000))
const progress = computed(() => (props.seconds > 0 ? Math.min(1, elapsed.value / props.seconds) : 1))
</script>

<template>
  <q-card
    v-if="running"
    flat
    bordered
    class="solve-card"
  >
    <q-card-section class="q-gutter-y-sm">
      <h2 class="text-subtitle1 q-my-none">
        {{ $t('plan.making') }}
      </h2>
      <div class="row items-center no-wrap q-gutter-x-md">
        <q-linear-progress
          class="col"
          rounded
          size="10px"
          color="primary"
          instant-feedback
          :value="progress"
        />
        <span class="text-grey-8">{{ $t('plan.elapsed', { n: Math.floor(elapsed), max: seconds }) }}</span>
      </div>
    </q-card-section>
    <q-card-actions align="right">
      <q-btn
        flat
        no-caps
        color="primary"
        :label="cancelling ? $t('plan.stopping') : $t('plan.cancel')"
        :disable="cancelling"
        @click="$emit('cancel')"
      />
    </q-card-actions>
  </q-card>
  <q-card
    v-else-if="failure"
    flat
    bordered
    class="solve-failed"
    role="alert"
  >
    <q-card-section>
      <h2 class="text-subtitle1 q-my-none">
        {{ $t('plan.failedTitle') }}
      </h2>
      <p class="q-mb-none q-mt-xs">
        {{ $t(`plan.failure.${failure}`, { n: seconds }) }}
      </p>
    </q-card-section>
    <q-card-actions align="right">
      <q-btn
        flat
        no-caps
        color="primary"
        :label="$t('plan.dismiss')"
        @click="$emit('dismiss')"
      />
    </q-card-actions>
  </q-card>
</template>
