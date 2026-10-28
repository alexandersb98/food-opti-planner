<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/client'
import type { Attribute, Ingredient, Recipe, Tag } from '../api/types'
import ConfirmDelete from '../components/ConfirmDelete.vue'
import EditorHeader from '../components/EditorHeader.vue'
import IngredientPicker from '../components/IngredientPicker.vue'
import LoadState from '../components/LoadState.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { useRecipeDraft } from '../composables/useRecipeDraft'
import { valueText } from '../format'
import { byId } from '../lists'
import { typedNumber } from '../numbers'
import { portionTotals } from '../totals'

const route = useRoute()
const router = useRouter()

// The editor for a new recipe (/recipes/new) or an existing one.
const id = route.params.id === undefined ? null : Number(route.params.id)

const {
  draft,
  errors,
  saving,
  advancedOpen,
  derivedTagIds,
  defaultHardMax,
  fillDraft,
  addIngredient,
  removeIngredient,
  hasTag,
  toggleTag,
  save: saveDraft,
  remove,
} = useRecipeDraft(id)
const deleteOpen = ref(false)
const pickerOpen = ref(false)

const { data, loading, failed, load } = useLoad(
  async () => {
    const loaded = await loadAll({
      attributes: api.GET('/api/attributes'),
      tags: api.GET('/api/tags'),
      ingredients: api.GET('/api/ingredients'),
      recipe:
        id === null
          ? Promise.resolve({ data: null })
          : api.GET('/api/recipes/{recipe_id}', { params: { path: { recipe_id: id } } }),
    })
    if (loaded.data?.recipe) fillDraft(loaded.data.recipe)
    return loaded
  },
  {
    attributes: [] as Attribute[],
    tags: [] as Tag[],
    ingredients: [] as Ingredient[],
    recipe: null as Recipe | null,
  },
)

const ingredients = computed(() => byId(data.value.ingredients))
const inRecipe = computed(() => new Set(draft.items.map((item) => item.ingredientId)))

/** Live totals for one portion, by attribute; an amount not yet a number counts as 0. */
const totals = computed(() => {
  const amounts = draft.items.flatMap(({ ingredientId, amount }) => {
    const ingredient = ingredients.value.get(ingredientId)
    const number = typedNumber(amount)
    return ingredient && number !== null ? [{ ingredient, amount: number }] : []
  })
  return portionTotals(amounts, data.value.attributes)
})

function save() {
  return saveDraft(data.value.tags, () => router.push('/recipes'))
}

async function confirmDelete() {
  const deleted = await remove()
  deleteOpen.value = false
  if (deleted) await router.push('/recipes')
}
</script>

<template>
  <q-page padding>
    <EditorHeader
      back="/recipes"
      :title="id === null ? $t('recipes.new') : $t('recipes.edit')"
    />

    <LoadState
      :loading="loading"
      :failed="failed"
      :message="$t('recipes.loadOneFailed')"
      @retry="load"
    >
      <q-form
        class="q-gutter-y-md"
        @submit="save"
      >
        <q-input
          v-model="draft.name"
          outlined
          :autofocus="id === null"
          :label="$t('common.name')"
          :error="!!errors.name"
          :error-message="errors.name"
          hide-bottom-space
        />

        <q-card
          flat
          bordered
        >
          <q-card-section class="q-gutter-y-sm">
            <div class="text-subtitle1">
              {{ $t('recipes.items') }}
            </div>
            <div
              v-for="(item, index) in draft.items"
              :key="item.ingredientId"
              class="row items-start no-wrap q-gutter-x-sm recipe-item"
            >
              <div class="col item-name">
                {{ ingredients.get(item.ingredientId)?.name }}
              </div>
              <q-input
                v-model="item.amount"
                class="amount-field"
                outlined
                dense
                inputmode="decimal"
                :aria-label="$t('recipes.amountOf', { name: ingredients.get(item.ingredientId)?.name })"
                :suffix="ingredients.get(item.ingredientId)?.unit"
                :error="!!errors.amounts[item.ingredientId]"
                :error-message="errors.amounts[item.ingredientId]"
                hide-bottom-space
              />
              <q-btn
                flat
                round
                dense
                icon="close"
                :aria-label="$t('recipes.remove', { name: ingredients.get(item.ingredientId)?.name })"
                @click="removeIngredient(index)"
              />
            </div>
            <div
              v-if="errors.items"
              class="text-negative text-caption"
            >
              {{ errors.items }}
            </div>
            <q-btn
              flat
              no-caps
              color="primary"
              :label="$t('recipes.addIngredientButton')"
              @click="pickerOpen = true"
            />
          </q-card-section>
        </q-card>

        <q-card
          flat
          bordered
        >
          <q-card-section>
            <div class="text-subtitle1 q-mb-xs">
              {{ $t('recipes.perPortion') }}
            </div>
            <div
              v-if="data.attributes.length === 0"
              class="text-grey-8"
            >
              {{ $t('ingredients.noAttributes') }}
            </div>
            <div
              v-for="attribute in data.attributes"
              :key="attribute.id"
              class="portion-total"
            >
              {{ valueText(attribute, totals.get(attribute.id) ?? '0') }}
            </div>
          </q-card-section>
        </q-card>

        <div>
          <div class="text-subtitle1 q-mb-xs">
            {{ $t('recipes.tags') }}
          </div>
          <div
            v-if="data.tags.length === 0"
            class="text-grey-8"
          >
            {{ $t('ingredients.noTags') }}
          </div>
          <template v-else>
            <div class="q-gutter-sm">
              <q-btn
                v-for="tag in data.tags"
                :key="tag.id"
                class="tag-choice"
                no-caps
                rounded
                color="primary"
                :outline="!hasTag(tag)"
                :unelevated="hasTag(tag)"
                :icon="hasTag(tag) ? 'check' : undefined"
                :label="tag.name"
                :aria-pressed="hasTag(tag)"
                :disable="derivedTagIds.includes(tag.id)"
                @click="toggleTag(tag)"
              />
            </div>
            <div class="text-caption text-grey-8 q-mt-xs">
              {{ $t('recipes.tagsHint') }}
            </div>
          </template>
        </div>

        <q-card
          flat
          bordered
        >
          <q-card-section class="q-gutter-y-sm">
            <div class="text-subtitle1">
              {{ $t('recipes.portionSize') }}
            </div>
            <div class="row q-col-gutter-sm">
              <q-input
                v-model="draft.min"
                class="col-6"
                outlined
                dense
                inputmode="decimal"
                :label="$t('recipes.from')"
                suffix="×"
                :error="!!errors.min"
                :error-message="errors.min"
                hide-bottom-space
              />
              <q-input
                v-model="draft.max"
                class="col-6"
                outlined
                dense
                inputmode="decimal"
                :label="$t('recipes.to')"
                suffix="×"
                :error="!!errors.max"
                :error-message="errors.max"
                hide-bottom-space
              />
            </div>
            <div class="q-gutter-x-sm">
              <q-btn
                v-for="choice in [
                  { label: $t('recipes.anyAmount'), inSteps: false },
                  { label: $t('recipes.inSteps'), inSteps: true },
                ]"
                :key="choice.label"
                class="step-choice"
                size="sm"
                no-caps
                :outline="draft.inSteps !== choice.inSteps"
                :unelevated="draft.inSteps === choice.inSteps"
                color="primary"
                :label="choice.label"
                :aria-pressed="draft.inSteps === choice.inSteps"
                @click="draft.inSteps = choice.inSteps"
              />
            </div>
            <q-input
              v-if="draft.inSteps"
              v-model="draft.step"
              outlined
              dense
              inputmode="decimal"
              :label="$t('recipes.step')"
              suffix="×"
              :error="!!errors.step"
              :error-message="errors.step"
              hide-bottom-space
            />
            <q-expansion-item
              v-model="advancedOpen"
              dense
              :label="$t('recipes.advanced')"
            >
              <div class="q-gutter-y-sm q-pt-sm">
                <q-input
                  v-model="draft.hardMax"
                  outlined
                  dense
                  inputmode="decimal"
                  :label="$t('recipes.hardMax')"
                  :placeholder="defaultHardMax"
                  suffix="×"
                  :hint="defaultHardMax ? $t('recipes.hardMaxHint', { max: defaultHardMax }) : $t('recipes.hardMaxHintNoMax')"
                  :error="!!errors.hardMax"
                  :error-message="errors.hardMax"
                />
                <q-input
                  v-model="draft.penalty"
                  outlined
                  dense
                  inputmode="decimal"
                  :label="$t('recipes.penalty')"
                  :hint="$t('recipes.penaltyHint')"
                  :error="!!errors.penalty"
                  :error-message="errors.penalty"
                />
              </div>
            </q-expansion-item>
          </q-card-section>
        </q-card>

        <div
          v-if="errors.save"
          class="text-negative"
          role="alert"
        >
          {{ errors.save }}
        </div>
        <div class="row q-gutter-sm">
          <q-btn
            v-if="data.recipe"
            class="col"
            outline
            color="negative"
            :label="$t('common.delete')"
            @click="deleteOpen = true"
          />
          <q-btn
            class="col"
            type="submit"
            color="primary"
            :label="$t('common.save')"
            :loading="saving"
          />
        </div>
      </q-form>
    </LoadState>

    <IngredientPicker
      v-model="pickerOpen"
      :ingredients="data.ingredients"
      :exclude="inRecipe"
      @pick="addIngredient"
    />
    <ConfirmDelete
      v-model="deleteOpen"
      :name="data.recipe?.name ?? ''"
      :warning="$t('common.deleteNothing')"
      @confirm="confirmDelete"
    />
  </q-page>
</template>

<style scoped>
.item-name {
  padding-top: 8px;
  overflow-wrap: anywhere;
}
.amount-field {
  width: 8.5em;
}
</style>
