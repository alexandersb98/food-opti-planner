<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Tag, TagFilter } from '../api/types'
import { useRecipeCount } from '../recipeCount'

// The Plan page's Recipes card (A1): how many recipes the plan's tag filters
// leave, as the server counts them, and a chip per filter, in tag order.
const props = defineProps<{ filters: TagFilter[]; tags: Tag[] }>()

const { t } = useI18n()
const { count, failed, ask } = useRecipeCount()

const countText = computed(() => {
  if (failed.value) return t('recipeFilters.countFailed')
  if (!count.value) return ''
  const { usable, total } = count.value
  return t('recipeFilters.count', { usable, total }, total)
})

const chips = computed(() =>
  props.filters.map(({ tag_id: id, mode }) => ({
    id,
    text: t(`plan.filterChip.${mode}`, { tag: props.tags.find((tag) => tag.id === id)?.name ?? '' }),
  })),
)

onMounted(() => void ask(props.filters))
// A saved goal or time gives a new plan object with the same filters.
watch(
  () => JSON.stringify(props.filters),
  () => void ask(props.filters),
)
</script>

<template>
  <q-card
    flat
    bordered
    class="recipes-card"
  >
    <q-card-section>
      <div class="row items-center no-wrap">
        <h2 class="col text-subtitle1 q-my-none">
          {{ $t('plan.recipes') }}
        </h2>
        <q-btn
          flat
          dense
          no-caps
          color="primary"
          :label="$t('plan.edit')"
          to="/plan/recipes"
        />
      </div>
      <div
        class="recipe-count"
        :class="failed || count?.usable === 0 ? 'text-negative' : 'text-grey-8'"
      >
        {{ countText }}
      </div>
      <div
        v-if="chips.length > 0"
        class="filter-chips q-mt-xs"
      >
        <q-chip
          v-for="chip in chips"
          :key="chip.id"
          dense
          class="filter-chip"
        >
          {{ chip.text }}
        </q-chip>
      </div>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
}
</style>
