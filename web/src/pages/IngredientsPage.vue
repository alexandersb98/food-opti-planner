<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { components } from '../api/schema'
import LoadState from '../components/LoadState.vue'
import { useLoad } from '../composables/useLoad'

type Ingredient = components['schemas']['Ingredient']
type Attribute = components['schemas']['Attribute']

const { t } = useI18n()

// The attributes give each value its name and unit.
const { data, loading, failed, load } = useLoad(
  async () => {
    const [ingredients, attributes] = await Promise.all([api.GET('/api/ingredients'), api.GET('/api/attributes')])
    if (!ingredients.data || !attributes.data) return {}
    return { data: { ingredients: ingredients.data, attributes: attributes.data } }
  },
  { ingredients: [] as Ingredient[], attributes: [] as Attribute[] },
)

const search = ref('')

/** By name, narrowed to those whose name contains the search text. */
const shown = computed(() => {
  const text = search.value.trim().toLocaleLowerCase()
  return data.value.ingredients
    .filter((ingredient) => ingredient.name.toLocaleLowerCase().includes(text))
    .sort((a, b) => a.name.localeCompare(b.name))
})

/** "per 100 g · Energy 389 kcal · Protein 16.9 g": the values typed in. */
function values(ingredient: Ingredient) {
  const byId = new Map(data.value.attributes.map((attribute) => [attribute.id, attribute]))
  const typed = ingredient.values.flatMap(({ attribute_id, value }) => {
    const attribute = byId.get(attribute_id)
    return attribute ? [`${attribute.name} ${value} ${attribute.unit}`.trim()] : []
  })
  return [t('ingredients.perBasis', { basis: ingredient.basis, unit: ingredient.unit }), ...typed].join(' · ')
}
</script>

<template>
  <q-page padding>
    <h1 class="text-h5">
      {{ $t('pages.ingredients') }}
    </h1>
    <p class="text-caption text-grey-8">
      {{ $t('ingredients.intro') }}
    </p>

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('ingredients.loadFailed')"
      @retry="load"
    >
      <q-input
        v-if="data.ingredients.length > 0"
        v-model="search"
        class="q-mb-md"
        outlined
        dense
        clearable
        :label="$t('ingredients.search')"
      >
        <template #prepend>
          <q-icon name="search" />
        </template>
      </q-input>

      <q-list
        bordered
        separator
        class="rounded-borders"
      >
        <q-item v-if="shown.length === 0">
          <q-item-section class="text-grey-8">
            {{ data.ingredients.length === 0 ? $t('ingredients.empty') : $t('ingredients.noMatch') }}
          </q-item-section>
        </q-item>
        <q-item
          v-for="ingredient in shown"
          :key="ingredient.id"
          v-ripple
          clickable
          class="ingredient-row"
          :to="`/ingredients/${ingredient.id}`"
        >
          <q-item-section>
            <q-item-label>{{ ingredient.name }}</q-item-label>
            <q-item-label caption>
              {{ values(ingredient) }}
            </q-item-label>
            <q-item-label caption>
              {{ $t('ingredients.usedIn', { recipes: $t('count.recipes', ingredient.recipe_count) }) }}
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-icon name="chevron_right" />
          </q-item-section>
        </q-item>
      </q-list>
    </LoadState>
    <div class="fab-space" />

    <q-page-sticky
      position="bottom-right"
      :offset="[18, 18]"
    >
      <q-btn
        fab
        icon="add"
        color="primary"
        to="/ingredients/new"
        :aria-label="$t('ingredients.new')"
      />
    </q-page-sticky>
  </q-page>
</template>

<style scoped>
/* Room below the list, so the round + button covers no row. */
.fab-space {
  height: 72px;
}
</style>
