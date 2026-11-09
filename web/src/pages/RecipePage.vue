<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'
import { api } from '../api/client'
import type { Attribute, Conversion, Ingredient, Recipe, Tag } from '../api/types'
import ConfirmDelete from '../components/ConfirmDelete.vue'
import ConversionDialog from '../components/ConversionDialog.vue'
import EditorHeader from '../components/EditorHeader.vue'
import IngredientPicker from '../components/IngredientPicker.vue'
import LoadState from '../components/LoadState.vue'
import NewIngredientDialog from '../components/NewIngredientDialog.vue'
import RecipeSection from '../components/RecipeSection.vue'
import { loadAll, useLoad } from '../composables/useLoad'
import { useRecipeDraft, type DraftLine } from '../composables/useRecipeDraft'
import { valueText } from '../format'
import { takeImportedDraft } from '../importDraft'
import {
  acceptable,
  factorSource,
  importReviewKey,
  ingredientWithPending,
  lineState,
  needsYou,
  pendingKey,
  suggestedFactorFor,
  type FactorRow,
  type ImportReview,
} from '../importReview'
import { isOwn, lineFactor } from '../lineUnits'
import { byId } from '../lists'
import { typedNumber } from '../numbers'
import { portionTotals } from '../totals'
import { useUnits } from '../units'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// The editor for a new recipe (/recipes/new) or an existing one. A new one may
// open an imported draft for review: taken once here, not in the loader, so a
// retry of the load cannot lose it.
const id = route.params.id === undefined ? null : Number(route.params.id)
const importedDraft = id === null ? takeImportedDraft() : null

const {
  draft,
  errors,
  saving,
  advancedOpen,
  derivedTagIds,
  defaultHardMax,
  servingsNumber,
  fillDraft,
  fillImported,
  addIngredient,
  setLineIngredient,
  skipLine,
  unskipLine,
  acceptFactor,
  forgetFactor,
  removeLine,
  moveLine,
  addSection,
  removeSection,
  hasTag,
  toggleTag,
  save: saveDraft,
  remove,
} = useRecipeDraft(id)
const units = useUnits()
const deleteOpen = ref(false)
const pickerOpen = ref(false)
// The line whose "New unit…" opened the conversion dialog: its section and
// its place in the section.
const conversionOpen = ref(false)
const conversionFor = ref<{ section: number; line: number } | null>(null)
// The section whose "+ Add ingredient" opened the picker.
const pickerSection = ref(0)

const { data, loading, failed, load } = useLoad(
  async () => {
    // The catalogue is shared and loaded once; if it fails the page still
    // works for lines in the ingredient's own unit and its conversions.
    await units.load()
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
    else if (importedDraft && loaded.data) fillImported(importedDraft)
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

/** What one of a line's `unit` makes of its ingredient's own unit (null: it
 * doesn't convert), by the server's rule. */
function factorOf(ingredient: Ingredient, unit: string) {
  return lineFactor(units.ratio, ingredientWithPending(ingredient, draft.pending), unit)
}

/** A line's ingredient; none for an imported line not matched yet. */
function ingredientOf(line: { ingredientId: number | null }): Ingredient | undefined {
  return line.ingredientId === null ? undefined : ingredients.value.get(line.ingredientId)
}

/** Whether a line's unit converts to its ingredient's. Without the catalogue
 * (a failed load) the page can't tell, so the server decides. */
function converts(line: DraftLine) {
  if (units.units.value.length === 0) return true
  const ingredient = ingredientOf(line)
  return !ingredient || factorOf(ingredient, line.unit) !== null
}

/** Live totals for one portion, by attribute: all the lines (amounts are for
 * the whole recipe, each converted to its ingredient's own unit) divided by
 * the servings; an amount not yet a number, or a unit that doesn't convert,
 * counts as 0. */
const totals = computed(() => {
  const amounts = draft.sections.flatMap((section) =>
    section.items.flatMap(({ ingredientId, amount, unit, skipped }) => {
      const ingredient = skipped ? undefined : ingredientOf({ ingredientId })
      const number = typedNumber(amount)
      return ingredient && number !== null ? [{ ingredient, amount: number, unit }] : []
    }),
  )
  return portionTotals(amounts, data.value.attributes, servingsNumber.value, factorOf)
})

/** A section's name, or "Section n" while it has none. */
function sectionLabel(index: number) {
  return draft.sections[index]?.name.trim() || t('recipes.sectionN', { n: index + 1 })
}

/** The other sections a line of section `index` can move to. */
function movesFrom(index: number) {
  return draft.sections.flatMap((_, other) => (other === index ? [] : [{ index: other, label: sectionLabel(other) }]))
}

function askForIngredient(index: number) {
  pickerSection.value = index
  pickTarget.value = null
  pickerOpen.value = true
}

/** A link the page may offer to open: http(s) only. */
const sourceLink = computed(() => {
  const link = draft.sourceUrl.trim()
  return /^https?:\/\/\S+$/.test(link) ? link : null
})

function askForUnit(section: number, line: number) {
  conversionFor.value = { section, line }
  conversionOpen.value = true
}

/** The ingredient of the line that asked for a new unit. */
const conversionIngredient = computed(() => {
  const line = askingLine()
  return line ? ingredientOf(line) : undefined
})

/** The line that asked for a new unit, if it is still there. */
function askingLine(): DraftLine | undefined {
  const asking = conversionFor.value
  return asking ? draft.sections[asking.section]?.items[asking.line] : undefined
}

/** A conversion was saved: keep it in the page's copy of the ingredient and
 * give the line that asked for it as its unit. */
function conversionSaved(saved: Conversion) {
  const line = askingLine()
  const ingredient = line && ingredientOf(line)
  if (!line || !ingredient) return
  const conversions = [...ingredient.conversions.filter((c) => c.id !== saved.id), saved].sort((a, b) => a.id - b.id)
  const index = data.value.ingredients.findIndex((i) => i.id === ingredient.id)
  data.value.ingredients[index] = { ...ingredient, conversions }
  line.unit = saved.unit
}

function save() {
  if (blocked.value) return
  return saveDraft(
    data.value.tags,
    () => {
      saved.value = true // leaving after a save is not leaving a draft
      return router.push('/recipes')
    },
    converts,
  )
}

// The import review ------------------------------------------------------------
// Each imported line's state is worked out here from the draft, the ingredients
// and the accepted conversions, so every change shows at once.

const reviewLines = computed(() => draft.sections.flatMap((section) => section.items))
const needsCount = computed(() =>
  draft.imported ? needsYou(reviewLines.value, ingredients.value, draft.pending, units.ratio) : 0,
)
/** An imported recipe can't be saved while a line needs the user. */
const blocked = computed(() => needsCount.value > 0)

function stateOf(line: DraftLine) {
  return lineState(line, ingredientOf(line), draft.pending, units.ratio)
}

// What the user typed in a factor row, and the AI's suggestions asked for
// lines matched by hand, by ingredient and unit (`pendingKey`).
const typed = reactive<Record<string, { text: string; loading: boolean }>>({})
const suggestions = reactive<Record<string, string | null>>({})

function keyOf(line: DraftLine) {
  return line.ingredientId === null ? '' : pendingKey(line.ingredientId, line.unit)
}

/** The AI's number for a line's ingredient and unit, if one was given. */
function suggestedFor(line: DraftLine): string | null {
  const key = keyOf(line)
  if (suggestions[key] != null) return suggestions[key]
  return suggestedFactorFor(line, reviewLines.value)
}

function factorRow(line: DraftLine): FactorRow | null {
  if (line.ingredientId === null || line.skipped) return null
  const key = keyOf(line)
  const accepted = draft.pending.find((p) => pendingKey(p.ingredientId, p.unit) === key)
  if (accepted) return { text: accepted.factor, ai: accepted.source === 'ai', loading: false, accepted: true }
  if (stateOf(line) !== 'needs_factor') return null
  const suggested = suggestedFor(line)
  const row = typed[key]
  const text = row?.text ?? suggested ?? ''
  return { text, ai: suggested !== null && factorSource(text, suggested) === 'ai', loading: row?.loading ?? false, accepted: false }
}

/** Ask the AI for a number for a line matched by hand that needs one. */
async function suggestFor(line: DraftLine) {
  const key = keyOf(line)
  if (line.ingredientId === null || stateOf(line) !== 'needs_factor' || suggestedFor(line) !== null || typed[key]?.loading) return
  typed[key] = { text: typed[key]?.text ?? '', loading: true }
  try {
    const { data: answer } = await api.POST('/api/recipe-imports/factor', {
      body: { ingredient_id: line.ingredientId, unit: line.unit, food: line.food || line.unit },
    })
    if (answer) {
      suggestions[key] = answer.factor
      if (typed[key]!.text === '') typed[key]!.text = answer.factor
    }
  } catch {
    // no suggestion: the box stays empty to type in
  } finally {
    typed[key]!.loading = false
  }
}

// The line whose "Pick ingredient" opened the picker (null: "+ Add ingredient").
const pickTarget = ref<{ section: number; line: number } | null>(null)
const newOpen = ref(false)
const pickedLine = () => (pickTarget.value ? draft.sections[pickTarget.value.section]?.items[pickTarget.value.line] : undefined)
const pickerSearch = computed(() => pickedLine()?.food ?? '')
const newName = computed(() => {
  const food = pickedLine()?.food.trim() ?? ''
  return food.charAt(0).toUpperCase() + food.slice(1)
})

/** Match the line that asked with an ingredient: its unit stays as imported
 * (empty when it is the ingredient's own), and a number is asked for if needed. */
function matchPicked(ingredient: Ingredient) {
  const target = pickTarget.value
  const line = pickedLine()
  if (!target || !line) return
  setLineIngredient(target.section, target.line, ingredient)
  if (isOwn(units.ratio, ingredient, line.unit)) line.unit = ''
  void suggestFor(line)
}

function ingredientPicked(ingredient: Ingredient) {
  if (pickTarget.value) matchPicked(ingredient)
  else addIngredient(pickerSection.value, ingredient)
}

function ingredientCreated(ingredient: Ingredient) {
  data.value.ingredients.push(ingredient)
  matchPicked(ingredient)
}

const review: ImportReview = {
  state: stateOf,
  factor: factorRow,
  pick(section, line) {
    pickTarget.value = { section, line }
    pickerOpen.value = true
  },
  skip: skipLine,
  unskip: unskipLine,
  accept(section, lineIndex, text) {
    const line = draft.sections[section]?.items[lineIndex]
    const factor = acceptable(text)
    if (!line || line.ingredientId === null || factor === null) return
    acceptFactor(line.ingredientId, line.unit, factor, suggestedFor(line))
    delete typed[keyOf(line)]
  },
  change(section, lineIndex) {
    const line = draft.sections[section]?.items[lineIndex]
    if (!line || line.ingredientId === null) return
    const key = keyOf(line)
    const accepted = draft.pending.find((p) => pendingKey(p.ingredientId, p.unit) === key)
    forgetFactor(line.ingredientId, line.unit)
    typed[key] = { text: accepted?.factor ?? '', loading: false }
  },
  factorInput(section, lineIndex, text) {
    const line = draft.sections[section]?.items[lineIndex]
    if (line) typed[keyOf(line)] = { text, loading: false }
  },
}
// Only an imported draft is reviewed; an ordinary editor provides nothing.
if (importedDraft) provide(importReviewKey, review)

/** The banner: scrolls to the next line that needs the user, cycling. */
const form = ref<{ $el: HTMLElement } | null>(null)
let scrolled = -1
function scrollToNext() {
  const lines = [...(form.value?.$el.querySelectorAll<HTMLElement>('.needs-you') ?? [])]
  if (lines.length === 0) return
  scrolled = (scrolled + 1) % lines.length
  lines[scrolled]!.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// Leaving an imported draft asks first; a save sets `saved` so its own
// navigation isn't stopped.
const saved = ref(false)
const leaveOpen = ref(false)
let leaveTo: RouteLocationNormalized | null = null
const unsaved = () => draft.imported !== null && !saved.value

onBeforeRouteLeave((to) => {
  if (!unsaved()) return true
  leaveTo = to
  leaveOpen.value = true
  return false
})

async function discard() {
  saved.value = true
  leaveOpen.value = false
  if (leaveTo) await router.push(leaveTo.fullPath)
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (unsaved()) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

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
        ref="form"
        class="q-gutter-y-md"
        @submit="save"
      >
        <q-banner
          v-if="draft.imported"
          class="import-banner bg-blue-1 text-dark cursor-pointer"
          rounded
          role="button"
          tabindex="0"
          @click="scrollToNext"
          @keydown.enter="scrollToNext"
          @keydown.space.prevent="scrollToNext"
        >
          <div>
            {{ needsCount > 0 ? $t('recipes.banner', { n: needsCount }, needsCount) : $t('recipes.bannerReady') }}
          </div>
          <div
            v-if="draft.imported.cut"
            class="import-cut text-caption"
          >
            {{ $t('recipes.bannerCut') }}
          </div>
        </q-banner>

        <q-input
          v-model="draft.name"
          outlined
          :autofocus="id === null"
          :label="$t('common.name')"
          :error="!!errors.name"
          :error-message="errors.name"
          hide-bottom-space
        />

        <q-input
          v-model="draft.servings"
          class="servings-field"
          outlined
          dense
          inputmode="numeric"
          :aria-label="$t('recipes.servings')"
          :label="$t('recipes.servings')"
          :hint="$t('recipes.servingsHint')"
          :error="!!errors.servings"
          :error-message="errors.servings"
        />

        <q-card
          flat
          bordered
        >
          <q-card-section class="q-gutter-y-md">
            <div>
              <div class="text-subtitle1">
                {{ $t('recipes.itemsFor', { n: servingsNumber }, servingsNumber) }}
              </div>
            </div>
            <RecipeSection
              v-for="(section, index) in draft.sections"
              :key="section.key"
              v-model:section="draft.sections[index]!"
              :index="index"
              :count="draft.sections.length"
              :ingredients="ingredients"
              :errors="{ name: errors.sectionNames[section.key] ?? '', amounts: errors.amounts, units: errors.unitErrors }"
              :others="movesFrom(index)"
              @add="askForIngredient(index)"
              @remove-line="(lineIndex) => removeLine(index, lineIndex)"
              @move="(lineIndex, to) => moveLine(index, lineIndex, to)"
              @new-unit="(lineIndex) => askForUnit(index, lineIndex)"
              @remove-section="removeSection(index)"
            />
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
              :label="$t('recipes.addSection')"
              @click="addSection"
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

        <q-input
          v-model="draft.instructions"
          type="textarea"
          autogrow
          outlined
          :label="$t('recipes.instructions')"
        />

        <div>
          <q-input
            v-model="draft.sourceUrl"
            outlined
            dense
            inputmode="url"
            :label="$t('recipes.source')"
            :error="!!errors.sourceUrl"
            :error-message="errors.sourceUrl"
            hide-bottom-space
          />
          <a
            v-if="sourceLink"
            class="source-link text-caption"
            :href="sourceLink"
            target="_blank"
            rel="noopener noreferrer"
          >{{ $t('recipes.openSource') }}</a>
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
            :disable="blocked"
          />
        </div>
        <div
          v-if="blocked"
          class="save-blocked text-caption text-grey-8"
        >
          {{ $t('recipes.saveBlocked') }}
        </div>
      </q-form>
    </LoadState>

    <IngredientPicker
      v-model="pickerOpen"
      :ingredients="data.ingredients"
      :initial-search="pickerSearch"
      :allow-new="pickTarget !== null"
      @pick="ingredientPicked"
      @new="newOpen = true"
    />
    <NewIngredientDialog
      v-model="newOpen"
      :initial-name="newName"
      @saved="ingredientCreated"
    />
    <q-dialog v-model="leaveOpen">
      <q-card>
        <q-card-section>
          <div class="text-h6">
            {{ $t('recipes.leaveTitle') }}
          </div>
          <p class="q-mb-none q-mt-sm">
            {{ $t('recipes.leaveBody') }}
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-close-popup
            flat
            no-caps
            :label="$t('recipes.keepEditing')"
          />
          <q-btn
            flat
            no-caps
            color="negative"
            :label="$t('recipes.discard')"
            @click="discard"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <ConversionDialog
      v-if="conversionIngredient"
      v-model="conversionOpen"
      :ingredient="conversionIngredient"
      @saved="conversionSaved"
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
.servings-field {
  max-width: 12em;
}
</style>
