<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import type { Attribute, Ingredient } from '../api/types'
import AddButton from '../components/AddButton.vue'
import AddFromSourceDialog from '../components/AddFromSourceDialog.vue'
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

const search = ref<string | null>('')
const fromSourceOpen = ref(false)
const onlyUpdated = ref(false)
const hasUpdates = (ingredient: Ingredient) => ingredient.updated_values.length > 0
const updatedCount = computed(() => data.value.ingredients.filter(hasUpdates).length)
// The filter is ignored while its toggle is hidden (no ingredient has updates).
const filtering = computed(() => onlyUpdated.value && updatedCount.value > 0)
const shown = computed(() => {
  const found = searchByName(data.value.ingredients, search.value)
  return filtering.value ? found.filter(hasUpdates) : found
})
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

    <q-btn
      class="add-from-source q-mb-md"
      outline
      no-caps
      color="primary"
      icon="cloud_download"
      :label="$t('addFromSource.button')"
      @click="fromSourceOpen = true"
    />
    <AddFromSourceDialog v-model="fromSourceOpen" />

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('ingredients.loadFailed')"
      @retry="load"
    >
      <div
        v-if="data.ingredients.length > 0"
        class="row items-center q-gutter-md q-mb-md"
      >
        <q-input
          v-model="search"
          class="col"
          outlined
          dense
          clearable
          :label="$t('ingredients.search')"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
        <q-toggle
          v-if="updatedCount > 0"
          v-model="onlyUpdated"
          class="updated-filter"
          :label="$t('ingredients.onlyUpdated', { n: updatedCount })"
        />
      </div>

      <q-list
        bordered
        separator
        class="rounded-borders"
      >
        <q-item v-if="shown.length === 0">
          <q-item-section class="text-grey-8">
            {{
              data.ingredients.length === 0
                ? $t('ingredients.empty')
                : filtering
                  ? $t('ingredients.noUpdated')
                  : $t('ingredients.noMatch')
            }}
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
            <q-item-label
              v-if="hasUpdates(ingredient)"
              caption
            >
              <q-badge
                class="updated-marker"
                color="blue-9"
                text-color="white"
                :label="$t('ingredients.updatedMarker')"
              />
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

