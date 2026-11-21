import type { ComponentType } from 'react'

export interface SpecimenSection {
  /** The section's anchor on the specimen page. */
  id: string
  title: string
  /** The section's file; its default export is the section's body. */
  load: () => Promise<{ default: ComponentType }>
}

/** The specimen's sections, in page order. Each primitive ticket adds one
 * line here and one section file (its own folder's `Specimen.tsx`, or a
 * file in ./sections/). Dev-only copy: not translated. */
export const specimenSections: SpecimenSection[] = [
  { id: 'edition', title: 'Editions', load: () => import('./sections/Editions') },
  { id: 'palette', title: 'Palette', load: () => import('./sections/Palette') },
  { id: 'type', title: 'Type', load: () => import('./sections/Type') },
  { id: 'figures', title: 'Figures', load: () => import('./sections/Figures') },
  { id: 'elements', title: 'Elements and rules', load: () => import('./sections/Elements') },
  { id: 'unit-field', title: 'Unit field', load: () => import('../ui/unit-field/Specimen') },
  { id: 'sheets', title: 'Sheets and Confirm', load: () => import('../ui/sheet/Specimen') },
  { id: 'buttons', title: 'Buttons', load: () => import('../ui/button/Specimen') },
  { id: 'load-state', title: 'Load state', load: () => import('../ui/loadState/Specimen') },
  { id: 'field', title: 'Fields', load: () => import('../ui/field/Specimen') },
  { id: 'stepper', title: 'Steppers', load: () => import('../ui/stepper/Specimen') },
  { id: 'segmented', title: 'Segmented controls', load: () => import('../ui/segmented/Specimen') },
  { id: 'chips', title: 'Chips', load: () => import('../ui/chips/Specimen') },
  { id: 'select', title: 'Selects', load: () => import('../ui/select/Specimen') },
  { id: 'disclosure', title: 'Disclosures', load: () => import('../ui/disclosure/Specimen') },
  { id: 'tag-picker', title: 'Tag picker', load: () => import('../ui/tagPicker/Specimen') },
  { id: 'importance', title: 'Importance dots', load: () => import('../ui/importanceDots/Specimen') },
  { id: 'rule-tag', title: 'Rule tags', load: () => import('../ui/ruleTag/Specimen') },
  { id: 'plate', title: 'Colour plates', load: () => import('../ui/plate/Specimen') },
]
