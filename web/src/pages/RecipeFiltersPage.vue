<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import type { Plan, Tag, TagFilter } from '../api/types'
import EditorHeader from '../components/EditorHeader.vue'
import LoadState from '../components/LoadState.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { planFields, useSavePlan } from '../plan'
import { useRecipeCount } from '../recipeCount'

type Mode = 'any' | TagFilter['mode']

const { t } = useI18n()
const router = useRouter()

// Each tag's mode as edited, by tag id; a tag set to Any has no filter.
const modes = reactive<Record<number, Mode>>({})
const saveError = ref('')
const { saving, savePlan } = useSavePlan()
const { count, failed: countFailed, ask } = useRecipeCount()

// The setup as loaded: the parts this page doesn't edit are sent back as they were.
const { data, loading, failed, load } = useLoad(
  async () => {
    const loaded = await loadAll({ plan: api.GET('/api/plan'), tags: api.GET('/api/tags') })
    if (loaded.data) fillDraft(loaded.data.plan, loaded.data.tags)
    return loaded
  },
  { plan: null as Plan | null, tags: [] as Tag[] },
)

function fillDraft(plan: Plan, tags: Tag[]) {
  for (const tag of tags) modes[tag.id] = 'any'
  for (const { tag_id, mode } of plan.tag_filters) modes[tag_id] = mode
  void ask(filters(tags))
}

/** The filters set, in tag order (the tags come in id order). */
function filters(tags: Tag[]): TagFilter[] {
  return tags.flatMap(({ id }) => {
    const mode = modes[id]
    return mode === 'only' || mode === 'never' ? [{ tag_id: id, mode }] : []
  })
}

function choose(tagId: number, mode: Mode) {
  modes[tagId] = mode
  void ask(filters(data.value.tags))
}

const modeOptions = computed(() =>
  (['any', 'only', 'never'] as const).map((mode) => ({ value: mode, label: t(`recipeFilters.mode.${mode}`) })),
)

const countText = computed(() => {
  if (countFailed.value) return t('recipeFilters.countFailed')
  if (!count.value) return ''
  const { usable, total } = count.value
  return t('recipeFilters.count', { usable, total }, total)
})

async function save() {
  if (!data.value.plan) return
  saveError.value = ''
  const saved = await savePlan({ ...planFields(data.value.plan), tag_filters: filters(data.value.tags) })
  if (saved.plan) await router.push('/')
  else saveError.value = t('common.saveFailed')
}
</script>

<template>
  <q-page padding>
    <EditorHeader
      back="/"
      :title="$t('recipeFilters.title')"
    />

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('plan.loadFailed')"
      @retry="load"
    >
      <p v-if="data.tags.length === 0">
        {{ $t('recipeFilters.noTags') }}
      </p>
      <div
        v-else
        class="q-gutter-y-md"
      >
        <div class="row items-center no-wrap q-gutter-x-sm">
          <div
            class="col count-line"
            :class="{ 'text-negative': countFailed || count?.usable === 0 }"
          >
            {{ countText }}
          </div>
          <q-btn
            flat
            dense
            no-caps
            color="primary"
            to="/recipes"
            :label="$t('recipeFilters.showRecipes')"
          />
        </div>

        <q-list
          bordered
          separator
          class="rounded-borders"
        >
          <q-item
            v-for="tag in data.tags"
            :key="tag.id"
            class="filter-row"
          >
            <q-item-section class="tag-name">
              {{ tag.name }}
            </q-item-section>
            <q-item-section side>
              <q-btn-toggle
                :model-value="modes[tag.id]"
                dense
                no-caps
                unelevated
                toggle-color="primary"
                :options="modeOptions"
                :aria-label="$t('recipeFilters.filterOf', { tag: tag.name })"
                @update:model-value="(mode: Mode) => choose(tag.id, mode)"
              />
            </q-item-section>
          </q-item>
        </q-list>

        <div
          v-if="saveError"
          class="text-negative"
          role="alert"
        >
          {{ saveError }}
        </div>
        <q-btn
          class="full-width"
          color="primary"
          :label="$t('common.save')"
          :loading="saving"
          @click="save"
        />
      </div>
    </LoadState>
  </q-page>
</template>

<style scoped>
.tag-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
