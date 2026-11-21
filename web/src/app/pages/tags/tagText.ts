import type { GroupQuestion, Tag } from '../../../api/types'
import type { Translate } from '../../../translator'

export type Derive = Tag['derive']

/** The ids of a tag's group without the tag itself. */
export function otherMembers(tag: Tag): number[] {
  return tag.group.filter((id) => id !== tag.id)
}

/** The tags' names by id, joined with commas, in the order given. */
export function namesOf(byId: ReadonlyMap<number, Tag>, ids: readonly number[]): string {
  return ids.map((id) => byId.get(id)?.name ?? '').join(', ')
}

/** The line under a tag's name: "When all ingredients have it · added by
 * hand" (no ingredient has it yet), a source tag's source first
 * ("Livsmedelsverket · When any…"), and the tags it is equivalent to. */
export function ruleLine(t: Translate, tag: Tag, byId: ReadonlyMap<number, Tag>): string {
  const rule = t(`tags.rule.${tag.derive}`)
  const base = tag.source
    ? t('tags.sourceRule', { source: tag.source.name, rule })
    : tag.ingredient_count === 0
      ? `${rule} · ${t('tags.byHand')}`
      : rule
  const others = otherMembers(tag)
  return others.length ? `${base} · ${t('tags.group.equivalentTo', { names: namesOf(byId, others) })}` : base
}

/** What deleting the tag also removes, and that it leaves its group. */
export function deleteWarning(t: Translate, tag: Tag): string {
  // The server takes it out of its group, which ends when one tag is left.
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
}

/** A question of the server's about a group, as a sentence, with the
 * labels of its two answers. */
export function questionText(t: Translate, question: GroupQuestion, byId: ReadonlyMap<number, Tag>) {
  const name = (id: number) => byId.get(id)?.name ?? ''
  if (question.type === 'move_tag') {
    return {
      text: t('tags.group.moveQuestion', { tag: name(question.tag_id), others: namesOf(byId, question.from_tag_ids) }),
      yes: t('tags.group.move'),
      no: t('tags.group.dontMove'),
    }
  }
  if (question.type === 'switch_rule') {
    return {
      text: t('tags.group.switchQuestion', {
        tag: name(question.tag_id),
        tagRule: t(`tags.derive.${question.tag_rule}`),
        groupRule: t(`tags.group.ruleWord.${question.group_rule}`),
      }),
      yes: t('tags.group.switch'),
      no: t('tags.group.dontAdd'),
    }
  }
  return {
    text: t('tags.group.changeQuestion', { count: question.tag_ids.length, names: namesOf(byId, question.tag_ids) }),
    yes: t('tags.group.change'),
    no: t('tags.group.cancel'),
  }
}
