<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { Attribute, Ingredient } from '../api/types'
import AddButton from '../components/AddButton.vue'
import LoadState from '../components/LoadState.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { valueText } from '../format'
import { byId, searchByName } from '../lists'

const { t } = useI18n()

// The attributes give each value its name and unit.
const { data, loading, failed, load } = useLoad(
  () => loadAll({ ingredients: api.GET('/api/ingredients'), attributes: api.GET('/api/attributes') }),
  { ingredients: [] as Ingredient[], attributes: [] as Attribute[] },
)

const search = ref('')
const shown = computed(() => searchByName(data.value.ingredients, search.value))
const attributes = computed(() => byId(data.value.attributes))

/** "per 100 g · Energy 389 kcal · Protein 16.9 g": the values typed in. */
function values(ingredient: Ingredient) {
  const typed = ingredient.values.flatMap(({ attribute_id, value }) => {
    const attribute = attributes.value.get(attribute_id)
    return attribute ? [valueText(attribute, value)] : []
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
    <AddButton
      to="/ingredients/new"
      :label="$t('ingredients.new')"
    />
  </q-page>
</template>

