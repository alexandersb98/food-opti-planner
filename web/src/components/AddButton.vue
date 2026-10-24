<script setup lang="ts">
// A list page's round + button, opening the editor for a new item, with
// room below the list so the button covers no row.
defineProps<{ to: string; label: string }>()
</script>

<template>
  <div class="add-button-space" />
  <q-page-sticky
    position="bottom-right"
    :offset="[18, 18]"
  >
    <q-btn
      fab
      icon="add"
      color="primary"
      :to="to"
      :aria-label="label"
    />
  </q-page-sticky>
</template>

<style scoped>
.add-button-space {
  height: 72px;
}
</style>
