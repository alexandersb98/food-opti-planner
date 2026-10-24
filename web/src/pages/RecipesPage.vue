<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '../api/client'
import type { Attribute, Recipe, Tag } from '../api/types'
import AddButton from '../components/AddButton.vue'
import LoadState from '../components/LoadState.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { valueText } from '../format'
import { byId, searchByName } from '../lists'

// The attributes and tags give the totals and tags their names.
const { data, loading, failed, load } = useLoad(
  () =>
    loadAll({
      recipes: api.GET('/api/recipes'),
      attributes: api.GET('/api/attributes'),
      tags: api.GET('/api/tags'),
    }),
  { recipes: [] as Recipe[], attributes: [] as Attribute[], tags: [] as Tag[] },
)

const search = ref('')
const chosenTags = ref(new Set<number>())
const attributes = computed(() => byId(data.value.attributes))

/** A recipe's tags, from its ingredients or added by hand. */
function tagIds(recipe: Recipe) {
  return new Set([...recipe.derived_tag_ids, ...recipe.extra_tag_ids])
}

/** The quick filter chips: every tag some recipe has, in tag order. */
const chipTags = computed(() => {
  const used = new Set(data.value.recipes.flatMap((recipe) => [...tagIds(recipe)]))
  return data.value.tags.filter((tag) => used.has(tag.id))
})

/** The recipes matching the search and having every chosen tag. */
const shown = computed(() =>
  searchByName(data.value.recipes, search.value).filter((recipe) => {
    const has = tagIds(recipe)
    return [...chosenTags.value].every((id) => has.has(id))
  }),
)

function toggleTag(tag: Tag) {
  const chosen = new Set(chosenTags.value)
  if (chosen.has(tag.id)) chosen.delete(tag.id)
  else chosen.add(tag.id)
  chosenTags.value = chosen
}

/** "Energy 233 kcal · Protein 10.1 g": the totals for one portion. */
function totals(recipe: Recipe) {
  return recipe.totals
    .flatMap(({ attribute_id, value }) => {
      const attribute = attributes.value.get(attribute_id)
      return attribute ? [valueText(attribute, value)] : []
    })
    .join(' · ')
}

function tagNames(recipe: Recipe) {
  const has = tagIds(recipe)
  return data.value.tags.filter((tag) => has.has(tag.id)).map((tag) => tag.name)
}
</script>

<template>
  <q-page padding>
    <h1 class="text-h5">
      {{ $t('pages.recipes') }}
    </h1>
    <p class="text-caption text-grey-8">
      {{ $t('recipes.intro') }}
    </p>

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('recipes.loadFailed')"
      @retry="load"
    >
      <template v-if="data.recipes.length > 0">
        <q-input
          v-model="search"
          class="q-mb-sm"
          outlined
          dense
          clearable
          :label="$t('recipes.search')"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
        <div
          v-if="chipTags.length > 0"
          class="q-mb-md"
        >
          <q-chip
            v-for="tag in chipTags"
            :key="tag.id"
            class="tag-filter"
            clickable
            :outline="!chosenTags.has(tag.id)"
            color="primary"
            :text-color="chosenTags.has(tag.id) ? 'white' : 'primary'"
            :icon="chosenTags.has(tag.id) ? 'check' : undefined"
            :label="tag.name"
            :aria-pressed="chosenTags.has(tag.id)"
            role="button"
            @click="toggleTag(tag)"
          />
        </div>
      </template>

      <q-list
        bordered
        separator
        class="rounded-borders"
      >
        <q-item v-if="shown.length === 0">
          <q-item-section class="text-grey-8">
            {{ data.recipes.length === 0 ? $t('recipes.empty') : $t('recipes.noMatch') }}
          </q-item-section>
        </q-item>
        <q-item
          v-for="recipe in shown"
          :key="recipe.id"
          v-ripple
          clickable
          class="recipe-row"
          :to="`/recipes/${recipe.id}`"
        >
          <q-item-section>
            <q-item-label>{{ recipe.name }}</q-item-label>
            <q-item-label
              v-if="recipe.totals.length > 0"
              caption
            >
              {{ $t('recipes.totalsLine', { totals: totals(recipe) }) }}
            </q-item-label>
            <q-item-label
              v-if="tagNames(recipe).length > 0"
              caption
            >
              {{ tagNames(recipe).join(', ') }}
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-icon name="chevron_right" />
          </q-item-section>
        </q-item>
      </q-list>
    </LoadState>
    <AddButton
      to="/recipes/new"
      :label="$t('recipes.new')"
    />
  </q-page>
</template>
