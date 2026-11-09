<script setup lang="ts">
// Add from data source (C7), a full-screen dialog on the Ingredients page:
// pick a data source (the last one is remembered on the server), search its
// foods 20 at a time, and for a chosen food preview the ingredient it would
// become, whose name and source tags the user may change. Add posts only the
// food, the name and the tags: the server works out the unit, basis and
// values from the mapping as it stands.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { DataSourceSummary, FoodPreview, FoodSummary } from '../api/types'
import { usePreferences } from '../preferences'

const open = defineModel<boolean>({ required: true })

const { t } = useI18n()
const router = useRouter()
const preferences = usePreferences()

const SEARCH_DELAY = 300 // ms after the last key before a search is sent

const sources = ref<DataSourceSummary[]>([])
const sourcesFailed = ref(false)
const sourcesLoaded = ref(false)
const sourceKey = ref<string | null>(null)

const search = ref('')
const foods = ref<FoodSummary[]>([])
const total = ref(0)
const searching = ref(false)
const searchFailed = ref(false)

const chosen = ref<FoodSummary | null>(null)
const preview = ref<FoodPreview | null>(null)
const previewFailed = ref(false)
const name = ref('')
const tagIds = ref(new Set<number>())
const errors = ref({ name: '', save: '' })
const adding = ref(false)

// Each request counts, so a reply that is no longer the latest is dropped.
let searchRequest = 0
let previewRequest = 0
let timer: ReturnType<typeof setTimeout> | undefined

const sourceOptions = computed(() => sources.value.map((source) => ({ label: source.name, value: source.key })))
const hasMore = computed(() => foods.value.length < total.value)

/** Load the sources and the remembered one, then list the foods. */
async function start() {
  sourcesFailed.value = false
  try {
    const [{ data }] = await Promise.all([api.GET('/api/data-sources'), preferences.load()])
    if (!data) throw new Error('no data sources')
    sources.value = data
    sourcesLoaded.value = true
    const last = preferences.preferences.value?.last_data_source
    sourceKey.value = data.find((source) => source.key === last)?.key ?? data[0]?.key ?? null
  } catch {
    sourcesFailed.value = true
    return
  }
  if (sourceKey.value !== null) await runSearch(0)
}

async function runSearch(offset: number) {
  const key = sourceKey.value
  if (key === null) return
  clearTimeout(timer)
  const mine = ++searchRequest
  searching.value = true
  searchFailed.value = false
  try {
    const { data } = await api.GET('/api/data-sources/{key}/foods', {
      params: { path: { key }, query: { search: search.value, offset } },
    })
    if (mine !== searchRequest) return
    if (!data) throw new Error('no foods')
    foods.value = offset === 0 ? data.foods : [...foods.value, ...data.foods]
    total.value = data.total
  } catch {
    if (mine === searchRequest) searchFailed.value = true
  }
  if (mine === searchRequest) searching.value = false
}

watch(open, (shown) => {
  if (shown) void start()
})
if (open.value) void start()

watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(() => void runSearch(0), SEARCH_DELAY)
})

function chooseSource(key: string) {
  if (key === sourceKey.value) return
  sourceKey.value = key
  void preferences.set('last_data_source', key) // a failed save is silent
  foods.value = []
  total.value = 0
  backToResults()
  void runSearch(0)
}

function backToResults() {
  previewRequest++
  chosen.value = null
  preview.value = null
  previewFailed.value = false
  errors.value = { name: '', save: '' }
}

async function loadPreview(food: FoodSummary) {
  const key = sourceKey.value
  if (key === null) return
  const mine = ++previewRequest
  previewFailed.value = false
  try {
    const { data } = await api.GET('/api/data-sources/{key}/foods/{food_id}', {
      params: { path: { key, food_id: food.id } },
    })
    if (mine !== previewRequest) return
    if (!data) throw new Error('no preview')
    const first = preview.value === null
    preview.value = data
    if (first) {
      name.value = data.suggested_name
      tagIds.value = new Set(data.groups.map((group) => group.tag_id))
    }
  } catch {
    if (mine === previewRequest) previewFailed.value = true
  }
}

function choose(food: FoodSummary) {
  chosen.value = food
  preview.value = null
  errors.value = { name: '', save: '' }
  void loadPreview(food)
}

function toggleTag(tagId: number) {
  const next = new Set(tagIds.value)
  if (!next.delete(tagId)) next.add(tagId)
  tagIds.value = next
}

async function add() {
  const food = preview.value
  if (!food || adding.value) return
  errors.value = { name: '', save: '' }
  const typed = name.value.trim()
  if (!typed) {
    errors.value.name = t('common.nameRequired')
    return
  }
  adding.value = true
  try {
    const { data, error } = await api.POST('/api/ingredients/from-source', {
      body: {
        food_id: food.id,
        name: typed,
        tag_ids: food.groups.filter((group) => tagIds.value.has(group.tag_id)).map((group) => group.tag_id),
      },
    })
    if (data) {
      open.value = false
      await router.push(`/ingredients/${data.id}`)
      return
    }
    const byField = fieldErrors(error)
    if (byField.name === 'name_in_use') errors.value.name = t('ingredients.nameInUse')
    else if (byField.food_id === 'withdrawn' && chosen.value) void loadPreview(chosen.value)
    else errors.value.save = t('common.saveFailed')
  } catch {
    errors.value.save = t('common.saveFailed')
  } finally {
    adding.value = false
  }
}

onBeforeUnmount(() => {
  clearTimeout(timer)
  searchRequest++
  previewRequest++
})
</script>

<template>
  <q-dialog
    v-model="open"
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <q-card class="add-from-source column no-wrap">
      <q-toolbar class="bg-primary text-white">
        <q-btn
          flat
          round
          icon="arrow_back"
          :aria-label="$t('addFromSource.close')"
          @click="open = false"
        />
        <q-toolbar-title>{{ $t('addFromSource.title') }}</q-toolbar-title>
      </q-toolbar>

      <q-card-section class="col scroll q-gutter-y-md">
        <div
          v-if="sourcesFailed"
          class="q-gutter-sm"
        >
          <p>{{ $t('settings.dataSources.loadFailed') }}</p>
          <q-btn
            outline
            color="primary"
            :label="$t('common.retry')"
            @click="start"
          />
        </div>
        <p
          v-else-if="sourcesLoaded && sourceKey === null"
          class="text-grey-8"
        >
          {{ $t('addFromSource.noSources') }}
        </p>
        <template v-else-if="sourceKey !== null">
          <q-select
            :model-value="sourceKey"
            :options="sourceOptions"
            :label="$t('addFromSource.dataSource')"
            emit-value
            map-options
            outlined
            dense
            behavior="menu"
            @update:model-value="chooseSource"
          />

          <template v-if="!chosen">
            <q-input
              v-model="search"
              outlined
              dense
              clearable
              :label="$t('addFromSource.search')"
              :aria-label="$t('addFromSource.search')"
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>

            <div
              v-if="searchFailed"
              class="q-gutter-sm"
            >
              <p>{{ $t('addFromSource.loadFailed') }}</p>
              <q-btn
                outline
                color="primary"
                :label="$t('common.retry')"
                @click="runSearch(0)"
              />
            </div>
            <q-list
              v-else
              bordered
              separator
              class="rounded-borders"
            >
              <q-item v-if="foods.length === 0 && !searching">
                <q-item-section class="text-grey-8">
                  {{ $t('addFromSource.noResults') }}
                </q-item-section>
              </q-item>
              <q-item
                v-for="food in foods"
                :key="food.id"
                v-ripple
                clickable
                class="food-row"
                @click="choose(food)"
              >
                <q-item-section>
                  <q-item-label>{{ food.name }}</q-item-label>
                  <q-item-label
                    v-if="food.groups.length > 0"
                    caption
                  >
                    {{ food.groups.join(', ') }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
            <q-btn
              v-if="hasMore && !searchFailed"
              flat
              no-caps
              color="primary"
              :label="$t('addFromSource.showMore')"
              :loading="searching"
              @click="runSearch(foods.length)"
            />
          </template>

          <template v-else>
            <div
              v-if="previewFailed"
              class="q-gutter-sm"
            >
              <p>{{ $t('addFromSource.loadFoodFailed') }}</p>
              <q-btn
                outline
                color="primary"
                :label="$t('common.retry')"
                @click="loadPreview(chosen)"
              />
            </div>
            <q-form
              v-else-if="preview"
              class="q-gutter-y-md"
              @submit="add"
            >
              <q-input
                v-model="name"
                class="food-name"
                outlined
                :label="$t('common.name')"
                :error="!!errors.name"
                :error-message="errors.name"
                hide-bottom-space
              />
              <div class="measured">
                {{ $t('addFromSource.measured', { unit: preview.unit, basis: preview.basis }) }}
              </div>
              <ul
                v-if="preview.values.length > 0"
                class="values q-pl-md q-my-none"
              >
                <li
                  v-for="value in preview.values"
                  :key="value.attribute_id"
                >
                  {{ value.attribute_name }} {{ value.value }} {{ value.attribute_unit }}
                </li>
              </ul>
              <div
                v-else
                class="text-grey-8"
              >
                {{ $t('addFromSource.valuesNone') }}
              </div>
              <div
                v-if="preview.skipped.length > 0"
                class="skipped text-grey-8"
              >
                {{ $t('addFromSource.skipped', { names: preview.skipped.join(', ') }) }}
              </div>

              <div>
                <div class="text-subtitle1 q-mb-xs">
                  {{ $t('addFromSource.tags') }}
                </div>
                <div
                  v-if="preview.groups.length === 0"
                  class="text-grey-8"
                >
                  {{ $t('addFromSource.noTags') }}
                </div>
                <div
                  v-else
                  class="q-gutter-sm"
                >
                  <q-btn
                    v-for="group in preview.groups"
                    :key="group.tag_id"
                    class="tag-choice"
                    no-caps
                    rounded
                    color="primary"
                    :outline="!tagIds.has(group.tag_id)"
                    :unelevated="tagIds.has(group.tag_id)"
                    :icon="tagIds.has(group.tag_id) ? 'check' : undefined"
                    :label="group.name"
                    :aria-pressed="tagIds.has(group.tag_id)"
                    @click="toggleTag(group.tag_id)"
                  />
                </div>
              </div>

              <q-banner
                v-if="preview.existing.length > 0"
                dense
                rounded
                class="duplicate bg-orange-2"
              >
                {{ $t('addFromSource.duplicate', { names: preview.existing.map((e) => e.name).join(', ') }) }}
              </q-banner>
              <div
                v-if="preview.withdrawn"
                class="withdrawn text-negative"
                role="alert"
              >
                {{ $t('addFromSource.withdrawn') }}
              </div>
              <div
                v-if="errors.save"
                class="text-negative"
                role="alert"
              >
                {{ errors.save }}
              </div>

              <div class="row q-gutter-sm">
                <q-btn
                  class="col"
                  outline
                  color="primary"
                  no-caps
                  :label="$t('addFromSource.backToResults')"
                  @click="backToResults"
                />
                <q-btn
                  class="col"
                  type="submit"
                  color="primary"
                  :label="$t('addFromSource.add')"
                  :loading="adding"
                  :disable="preview.withdrawn"
                />
              </div>
            </q-form>
          </template>
        </template>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>
