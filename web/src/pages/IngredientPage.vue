<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import EditorHeader from '../components/EditorHeader.vue'
import IngredientForm from '../components/IngredientForm.vue'

const route = useRoute()
const router = useRouter()

// The editor for a new ingredient (/ingredients/new) or an existing one.
const id = route.params.id === undefined ? null : Number(route.params.id)
</script>

<template>
  <q-page padding>
    <EditorHeader
      back="/ingredients"
      :title="id === null ? $t('ingredients.new') : $t('ingredients.edit')"
    />
    <IngredientForm
      :id="id"
      @saved="router.push('/ingredients')"
      @deleted="router.push('/ingredients')"
    />
  </q-page>
</template>
