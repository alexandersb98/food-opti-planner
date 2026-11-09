<script setup lang="ts">
// The questions a tag save raised (a 409 with `questions`), asked one at a
// time. After the last one `answer` says yes (true) or no for each, in order.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GroupQuestion, Tag } from '../api/types'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ questions: GroupQuestion[]; tags: Tag[] }>()
const emit = defineEmits<{ answer: [yes: boolean[]] }>()

const { t } = useI18n()
const at = ref(0)
const answers = ref<boolean[]>([])

watch(open, (isOpen) => {
  if (isOpen) {
    at.value = 0
    answers.value = []
  }
})

const question = computed(() => props.questions[at.value])

function name(id: number) {
  return props.tags.find((tag) => tag.id === id)?.name ?? ''
}

function names(ids: number[]) {
  return ids.map(name).join(', ')
}

const text = computed(() => {
  const q = question.value
  if (!q) return ''
  if (q.type === 'move_tag') {
    return t('tags.group.moveQuestion', { tag: name(q.tag_id), others: names(q.from_tag_ids) })
  }
  if (q.type === 'switch_rule') {
    return t('tags.group.switchQuestion', {
      tag: name(q.tag_id),
      tagRule: t(`tags.derive.${q.tag_rule as 'all' | 'any'}`),
      groupRule: t(`tags.group.ruleWord.${q.group_rule as 'all' | 'any'}`),
    })
  }
  return t('tags.group.changeQuestion', { count: q.tag_ids.length, names: names(q.tag_ids) })
})

const labels = computed(() => {
  const type = question.value?.type
  if (type === 'move_tag') return { yes: t('tags.group.move'), no: t('tags.group.dontMove') }
  if (type === 'switch_rule') return { yes: t('tags.group.switch'), no: t('tags.group.dontAdd') }
  return { yes: t('tags.group.change'), no: t('tags.group.cancel') }
})

function reply(yes: boolean) {
  answers.value.push(yes)
  if (answers.value.length < props.questions.length) {
    at.value += 1
    return
  }
  open.value = false
  emit('answer', answers.value)
}
</script>

<template>
  <q-dialog
    v-model="open"
    persistent
  >
    <q-card>
      <q-card-section class="question-text">
        {{ text }}
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          flat
          :label="labels.no"
          @click="reply(false)"
        />
        <q-btn
          flat
          color="primary"
          :label="labels.yes"
          @click="reply(true)"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
