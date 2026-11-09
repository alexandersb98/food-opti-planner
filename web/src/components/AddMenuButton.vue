<script setup lang="ts">
// A list page's round + button that opens a menu of ways to add (C1: a new
// recipe, or one imported). A disabled item shows its hint as a caption. No
// logic: the page says what the items are.
defineProps<{
  label: string
  items: { label: string; to: string; disabled?: boolean; hint?: string }[]
}>()
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
      :aria-label="label"
    >
      <q-menu
        anchor="top right"
        self="bottom right"
      >
        <q-list style="min-width: 12em">
          <q-item
            v-for="item in items"
            :key="item.to"
            v-close-popup
            clickable
            :to="item.to"
            :disable="item.disabled"
            class="add-menu-item"
          >
            <q-item-section>
              <q-item-label>{{ item.label }}</q-item-label>
              <q-item-label
                v-if="item.disabled && item.hint"
                caption
              >
                {{ item.hint }}
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-btn>
  </q-page-sticky>
</template>

<style scoped>
.add-button-space {
  height: 72px;
}
</style>
