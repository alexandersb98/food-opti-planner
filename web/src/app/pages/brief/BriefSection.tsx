import type { ReactNode } from 'react'
import { useT } from '../../i18n/i18n'

/** The brief's four numbered sections, in order: their anchors (for "In this
 * brief") and titles. */
export const briefSections = [
  { key: 'schedule', id: 'brief-schedule', title: 'brief.sections.schedule' },
  { key: 'goals', id: 'brief-goals', title: 'brief.sections.goals' },
  { key: 'filters', id: 'brief-filters', title: 'brief.sections.filters' },
  { key: 'time', id: 'brief-time', title: 'brief.sections.time' },
] as const

export type BriefSectionKey = (typeof briefSections)[number]['key']

/** The id of a section's heading, which "In this brief" moves focus to. */
export function headingId(sectionId: string): string {
  return `${sectionId}-title`
}

/**
 * One numbered section of the brief, in D2's look: a strong rule, the
 * number in red-pencil italic, the title, and an optional action at the
 * right of the head ("Change", "Add goal"). The section files (schedule,
 * goals, recipe filters, time) each render one:
 *
 * ```tsx
 * <BriefSection section="goals" action={<Button variant="text" onClick={add}>{t('…')}</Button>}>
 *   …
 *   <p className="brief-section-intro">…</p>
 * </BriefSection>
 * ```
 */
export function BriefSection({
  section,
  action,
  children,
}: {
  section: BriefSectionKey
  action?: ReactNode
  children: ReactNode
}) {
  const t = useT()
  const index = briefSections.findIndex((other) => other.key === section)
  const { id, title } = briefSections[index]!
  return (
    <section className="brief-section" id={id} aria-labelledby={headingId(id)}>
      <div className="brief-section-head">
        <span className="brief-section-no" aria-hidden="true">
          {index + 1}
        </span>
        <h2 className="brief-section-title" id={headingId(id)} tabIndex={-1}>
          {t(title)}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** What a section shows until its ticket fills it. */
export function SectionStub() {
  const t = useT()
  return <p className="brief-section-intro">{t('brief.sectionStub')}</p>
}
