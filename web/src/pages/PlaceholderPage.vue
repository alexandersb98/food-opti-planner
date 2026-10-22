<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <q-page padding>
    <h1 class="text-h5">
      {{ $t(`pages.${String(route.name)}`) }}
    </h1>
    <p>{{ $t('placeholder') }}</p>
  </q-page>
</template>
