import type { DraftLine, DraftSection, RecipeDraft } from '../../../recipeDraft'

// The line editor's changes to a recipe draft's sections and lines, as pure
// functions of the draft (for useRecipeDraft's `edit` action). Lines and
// sections are found by their key, which stays put while others move. A
// new line or section is made by the caller (with its key), so the page
// knows where to put the focus and a reducer run twice makes the same one.

function mapSections(draft: RecipeDraft, change: (section: DraftSection) => DraftSection): RecipeDraft {
  return { ...draft, sections: draft.sections.map(change) }
}

/** Change the line with `key`, wherever it is. */
export function changeLine(draft: RecipeDraft, key: number, change: Partial<Pick<DraftLine, 'amount' | 'unit'>>): RecipeDraft {
  return mapSections(draft, (section) =>
    section.items.some((line) => line.key === key)
      ? { ...section, items: section.items.map((line) => (line.key === key ? { ...line, ...change } : line)) }
      : section,
  )
}

/** Put `line` at the end of the section with `sectionKey`. */
export function addLine(draft: RecipeDraft, sectionKey: number, line: DraftLine): RecipeDraft {
  return mapSections(draft, (section) => (section.key === sectionKey ? { ...section, items: [...section.items, line] } : section))
}

export function removeLine(draft: RecipeDraft, key: number): RecipeDraft {
  return mapSections(draft, (section) =>
    section.items.some((line) => line.key === key) ? { ...section, items: section.items.filter((line) => line.key !== key) } : section,
  )
}

/** Move the line with `key` to the end of the section with `to`. */
export function moveLine(draft: RecipeDraft, key: number, to: number): RecipeDraft {
  const line = draft.sections.flatMap((section) => section.items).find((item) => item.key === key)
  if (!line || !draft.sections.some((section) => section.key === to)) return draft
  return addLine(removeLine(draft, key), to, line)
}

export function renameSection(draft: RecipeDraft, key: number, name: string): RecipeDraft {
  return mapSections(draft, (section) => (section.key === key ? { ...section, name } : section))
}

export function addSection(draft: RecipeDraft, section: DraftSection): RecipeDraft {
  return { ...draft, sections: [...draft.sections, section] }
}

/** Delete a section's heading: its lines join the section above (the one
 * below, for the first), so none is lost. The last section stays. */
export function removeSection(draft: RecipeDraft, key: number): RecipeDraft {
  const index = draft.sections.findIndex((section) => section.key === key)
  if (index < 0 || draft.sections.length < 2) return draft
  const gone = draft.sections[index]!
  const into = index > 0 ? index - 1 : 1
  const sections = draft.sections.map((section, i) =>
    i !== into ? section : { ...section, items: index > 0 ? [...section.items, ...gone.items] : [...gone.items, ...section.items] },
  )
  return { ...draft, sections: sections.filter((_, i) => i !== index) }
}
