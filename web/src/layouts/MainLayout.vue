<script setup lang="ts">
import { ref } from 'vue'
import { pages } from '../router'

const drawerOpen = ref(false)
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn
          flat
          round
          dense
          icon="menu"
          :aria-label="$t('app.menu')"
          @click="drawerOpen = !drawerOpen"
        />
        <q-toolbar-title>{{ $t('app.title') }}</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="drawerOpen"
      overlay
      bordered
    >
      <q-list>
        <q-item
          v-for="page in pages"
          :key="page.name"
          v-ripple
          clickable
          :to="page.path"
          exact
          @click="drawerOpen = false"
        >
          <q-item-section avatar>
            <q-icon :name="page.icon" />
          </q-item-section>
          <q-item-section>{{ $t(`pages.${page.name}`) }}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container class="app-column">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<style scoped>
/* Designed at phone width; larger screens get the same layout, centred
   (GUI spec decision 1). */
.app-column {
  max-width: 600px;
  margin: 0 auto;
}
</style>
