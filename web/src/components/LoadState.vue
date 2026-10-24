<script setup lang="ts">
// Shows its content once loaded, or `message` and "Try again" if loading failed.
defineProps<{ loading: boolean; failed: boolean; message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    v-if="failed"
    class="q-gutter-sm"
  >
    <p>{{ message }}</p>
    <q-btn
      outline
      color="primary"
      :label="$t('common.retry')"
      @click="$emit('retry')"
    />
  </div>
  <slot v-else-if="!loading" />
</template>
