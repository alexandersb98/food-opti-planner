<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/client'
import { fieldErrors } from '../api/errors'
import type { GroupQuestion, Tag, TagFields as Fields } from '../api/types'
import ConfirmDelete from '../components/ConfirmDelete.vue'
import LoadState from '../components/LoadState.vue'
import TagGroupQuestions from '../components/TagGroupQuestions.vue'
import { useLoad } from '../composables/useLoad'

const { t } = useI18n()

const { data: tags, loading, failed: loadFailed, load } = useLoad(() => api.GET('/api/tags'), [])

// The row open for editing (a tag's id, or 'new'), and its fields as typed.
const openId = ref<number | 'new' | null>(null)
const draft = reactive<Fields & { equivalentIds: number[] }>({ name: '', derive: 'all', equivalentIds: [] })
const errors = reactive({ name: '', save: '' })
const saving = ref(false)
const deleteOpen = ref(false)
// The questions of a 409 being asked, and the promise their answers settle.
const questions = ref<GroupQuestion[]>([])
const questionsOpen = ref(false)
let answerQuestions: ((yes: boolean[]) => void) | null = null
const pickerText = ref('')

const NEW_ROW: Tag = {
  id: -1,
  name: '',
  derive: 'all',
  source: null,
  group: [],
  ingredient_count: 0,
  recipe_count: 0,
  filter_count: 0,
}
const rows = computed(() => (openId.value === 'new' ? [...tags.value, NEW_ROW] : tags.value))
const openTag = computed(() => tags.value.find((tag) => tag.id === openId.value))

const deriveOptions = computed(() =>
  (['all', 'any'] as const).map((derive) => ({ value: derive, label: t(`tags.derive.${derive}`) })),
)

function rowKey(tag: Tag) {
  return tag === NEW_ROW ? 'new' : tag.id
}

function isOpen(tag: Tag) {
  return rowKey(tag) === openId.value
}

/** "When all ingredients have it · added by hand": no ingredient has the tag.
 * A source tag names its source instead: "Livsmedelsverket · When any...". */
function info(tag: Tag) {
  const rule = t(`tags.rule.${tag.derive}`)
  const base = tag.source
    ? t('tags.sourceRule', { source: tag.source.name, rule })
    : tag.ingredient_count === 0
      ? `${rule} · ${t('tags.byHand')}`
      : rule
  const others = otherMembers(tag)
  return others.length ? `${base} · ${t('tags.group.equivalentTo', { names: names(others) })}` : base
}

/** The ids of a tag's group without the tag itself. */
function otherMembers(tag: Tag) {
  return tag.group.filter((id) => id !== tag.id)
}

function nameOf(id: number) {
  return tags.value.find((tag) => tag.id === id)?.name ?? ''
}

function names(ids: number[]) {
  return ids.map(nameOf).join(', ')
}

/** The picker's choices: every other tag that is not a chip yet, matching
 * what was typed; one in another group says which tags it is equivalent to. */
const pickerOptions = computed(() => {
  const typed = pickerText.value.trim().toLowerCase()
  return tags.value
    .filter((tag) => tag.id !== openId.value && !draft.equivalentIds.includes(tag.id))
    .filter((tag) => tag.name.toLowerCase().includes(typed))
    .map((tag) => ({
      value: tag.id,
      label: tag.name,
      caption:
        tag.group.length > 0 && !tag.group.includes(openId.value as number)
          ? t('tags.group.nowEquivalent', { names: names(otherMembers(tag)) })
          : '',
    }))
})

function addEquivalent(option: { value: number } | null) {
  if (option && !draft.equivalentIds.includes(option.value)) draft.equivalentIds.push(option.value)
  pickerText.value = ''
}

function removeEquivalent(id: number) {
  draft.equivalentIds = draft.equivalentIds.filter((other) => other !== id)
}

function sameIds(a: number[], b: number[]) {
  return a.length === b.length && a.every((id) => b.includes(id))
}

function openRow(tag: Tag, id: number | 'new') {
  openId.value = id
  draft.name = tag.name
  draft.derive = tag.derive
  draft.equivalentIds = otherMembers(tag)
  pickerText.value = ''
  Object.assign(errors, { name: '', save: '' })
}

/** Open a row; an open row with changes is saved first, and stays open if that fails. */
async function open(tag: Tag) {
  if (isOpen(tag) || !(await done())) return
  openRow(tag, tag.id)
}

async function startNew() {
  if (openId.value === 'new' || !(await done())) return
  openRow(NEW_ROW, 'new')
}

/** The list with a new tag in the server's order: after the tags made by
 * hand, before the source tags. */
function withNew(created: Tag) {
  const firstSource = tags.value.findIndex((tag) => tag.source)
  const at = firstSource === -1 ? tags.value.length : firstSource
  return [...tags.value.slice(0, at), created, ...tags.value.slice(at)]
}

/** Ask the questions of a 409, answers yes or no for each, in order. */
function ask(list: GroupQuestion[]) {
  questions.value = list
  questionsOpen.value = true
  return new Promise<boolean[]>((resolve) => {
    answerQuestions = resolve
  })
}

/** The tags again, without the list's loading state, as a change to a group
 * changes other tags too. */
async function refresh() {
  try {
    const { data } = await api.GET('/api/tags')
    if (data) tags.value = data
  } catch {
    // The list we have is only a little stale; the next load puts it right.
  }
}

/** Save the open row and close it; false if it has to stay open. */
async function done(): Promise<boolean> {
  if (openId.value === null) return true
  const fields: Fields = { name: draft.name.trim(), derive: draft.derive }
  errors.name = fields.name ? '' : t('common.nameRequired')
  errors.save = ''
  if (errors.name) return false

  const current = openTag.value
  if (
    current &&
    current.name === fields.name &&
    current.derive === fields.derive &&
    sameIds(draft.equivalentIds, otherMembers(current))
  ) {
    openId.value = null
    return true
  }

  saving.value = true
  try {
    return await save(current, fields, false)
  } catch {
    errors.save = t('common.saveFailed')
  } finally {
    saving.value = false
  }
  return false
}

/** Send the draft. A 409 with questions is asked; yes to all sends the same
 * body again with `confirm`, a no changes the draft and saves it again. */
async function save(current: Tag | undefined, fields: Fields, confirm: boolean): Promise<boolean> {
  const { data, error, response } = current
    ? await api.PUT('/api/tags/{tag_id}', {
        params: { path: { tag_id: current.id } },
        body: { ...fields, equivalent_tag_ids: [...draft.equivalentIds], confirm },
      })
    : await api.POST('/api/tags', { body: fields })
  if (data) {
    tags.value = current ? tags.value.map((tag) => (tag.id === data.id ? data : tag)) : withNew(data)
    openId.value = null
    if (current && (current.group.length > 0 || data.group.length > 0)) await refresh()
    return true
  }
  const asked = response.status === 409 && error && 'questions' in error ? error.questions : null
  if (asked && current) {
    saving.value = false
    const yes = await ask(asked)
    if (yes.every(Boolean)) {
      saving.value = true
      return save(current, fields, true)
    }
    asked.forEach((question, i) => {
      if (yes[i]) return
      if (question.type === 'change_rule') draft.derive = current.derive
      else removeEquivalent(question.tag_id)
    })
    return done()
  }
  if (fieldErrors(error).name === 'name_in_use') errors.name = t('tags.nameInUse')
  else errors.save = t('common.saveFailed')
  return false
}

function onAnswer(yes: boolean[]) {
  answerQuestions?.(yes)
  answerQuestions = null
}

const deleteWarning = computed(() => {
  const tag = openTag.value
  if (!tag) return ''
  // The server takes it out of its group, which dissolves when one tag is left.
  const leavesGroup = otherMembers(tag).length ? ` ${t('tags.deleteLeavesGroup')}` : ''
  if (tag.ingredient_count + tag.recipe_count + tag.filter_count === 0) {
    return t('common.deleteNothing') + leavesGroup
  }
  return (
    t('tags.deleteRemoves', {
      ingredients: t('count.ingredients', tag.ingredient_count),
      recipes: t('count.recipes', tag.recipe_count),
      filters: t('count.planFilters', tag.filter_count),
    }) + leavesGroup
  )
})

async function confirmDelete() {
  const tag = openTag.value
  if (!tag) return
  errors.save = ''
  try {
    const { response } = await api.DELETE('/api/tags/{tag_id}', { params: { path: { tag_id: tag.id } } })
    if (response.ok) {
      tags.value = tags.value.filter((other) => other.id !== tag.id)
      openId.value = null
      if (tag.group.length > 0) await refresh()
    } else {
      errors.save = t('common.deleteFailed')
    }
  } catch {
    errors.save = t('common.deleteFailed')
  }
  deleteOpen.value = false
}
</script>

<template>
  <q-page padding>
    <h1 class="text-h5">
      {{ $t('pages.tags') }}
    </h1>
    <p class="text-caption text-grey-8">
      {{ $t('tags.intro') }}
    </p>

    <LoadState
      :loading="loading"
      :failed="loadFailed"
      :message="$t('tags.loadFailed')"
      @retry="load"
    >
      <q-list
        bordered
        separator
        class="rounded-borders"
      >
        <q-item v-if="rows.length === 0">
          <q-item-section class="text-grey-8">
            {{ $t('tags.empty') }}
          </q-item-section>
        </q-item>

        <div
          v-for="tag in rows"
          :key="rowKey(tag)"
          class="tag-row"
        >
          <q-form
            v-if="isOpen(tag)"
            class="q-pa-md q-gutter-y-sm"
            @submit="done"
          >
            <template v-if="tag.source">
              <div class="text-subtitle1">
                {{ tag.name }}
              </div>
              <div class="text-caption text-grey-8">
                {{ $t('tags.sourceTagNote', { source: tag.source.name }) }}
              </div>
            </template>
            <q-input
              v-else
              v-model="draft.name"
              outlined
              dense
              autofocus
              :label="$t('common.name')"
              :error="!!errors.name"
              :error-message="errors.name"
            />
            <div
              :id="`derive-label-${rowKey(tag)}`"
              class="text-body2"
            >
              {{ $t('tags.deriveLabel') }}
            </div>
            <q-option-group
              v-model="draft.derive"
              :options="deriveOptions"
              type="radio"
              dense
              role="radiogroup"
              :aria-labelledby="`derive-label-${rowKey(tag)}`"
            />
            <div
              v-if="openId !== 'new'"
              class="q-mt-md"
            >
              <div
                :id="`equivalent-label-${rowKey(tag)}`"
                class="text-body2"
              >
                {{ $t('tags.group.equivalent') }}
              </div>
              <div class="text-caption text-grey-8">
                {{ $t('tags.group.equivalentHint') }}
              </div>
              <div class="row items-center q-gutter-xs q-my-xs">
                <q-chip
                  v-for="id in draft.equivalentIds"
                  :key="id"
                  removable
                  class="equivalent-chip"
                  @remove="removeEquivalent(id)"
                >
                  {{ nameOf(id) }}
                </q-chip>
                <span
                  v-if="draft.equivalentIds.length === 0"
                  class="text-caption text-grey-8"
                >
                  {{ $t('tags.group.none') }}
                </span>
              </div>
              <q-select
                :model-value="null"
                :options="pickerOptions"
                :label="$t('tags.group.add')"
                outlined
                dense
                use-input
                hide-selected
                input-debounce="0"
                behavior="menu"
                @filter="(text: string, update: (fn: () => void) => void) => update(() => (pickerText = text))"
                @update:model-value="addEquivalent"
              >
                <template #option="{ opt, itemProps }">
                  <q-item v-bind="itemProps">
                    <q-item-section>
                      <q-item-label>{{ opt.label }}</q-item-label>
                      <q-item-label
                        v-if="opt.caption"
                        caption
                      >
                        {{ opt.caption }}
                      </q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
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
                v-if="openId === 'new'"
                class="col"
                outline
                :label="$t('common.cancel')"
                @click="openId = null"
              />
              <q-btn
                v-else-if="!tag.source"
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
                :label="$t('common.done')"
                :loading="saving"
              />
            </div>
          </q-form>

          <q-item
            v-else
            v-ripple
            clickable
            @click="open(tag)"
          >
            <q-item-section
              v-if="tag.source"
              avatar
            >
              <span
                class="source-dot"
                aria-hidden="true"
                :style="{ backgroundColor: tag.source.colour }"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ tag.name }}</q-item-label>
              <q-item-label caption>
                {{ info(tag) }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-icon name="chevron_right" />
            </q-item-section>
          </q-item>
        </div>

        <q-item
          v-if="openId !== 'new'"
          v-ripple
          clickable
          class="text-primary"
          @click="startNew"
        >
          <q-item-section>{{ $t('tags.new') }}</q-item-section>
        </q-item>
      </q-list>
    </LoadState>

    <TagGroupQuestions
      v-model="questionsOpen"
      :questions="questions"
      :tags="tags"
      @answer="onAnswer"
    />
    <ConfirmDelete
      v-model="deleteOpen"
      :name="openTag?.name ?? ''"
      :warning="deleteWarning"
      @confirm="confirmDelete"
    />
  </q-page>
</template>

<style scoped>
.source-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
}
</style>
