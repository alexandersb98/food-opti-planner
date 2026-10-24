<script setup lang="ts">
// An editor page's title, with a back arrow to the list it came from.
defineProps<{ title: string; back: string }>()
</script>

<template>
  <div class="row items-center no-wrap q-mb-md">
    <q-btn
      flat
      round
      dense
      icon="arrow_back"
      :to="back"
      :aria-label="$t('common.back')"
    />
    <h1 class="text-h5 q-my-none q-ml-sm">
      {{ title }}
    </h1>
  </div>
</template>
