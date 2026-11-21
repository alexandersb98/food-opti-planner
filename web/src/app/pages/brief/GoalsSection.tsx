import { BriefSection, SectionStub } from './BriefSection'

/** Section 2 of the brief, the goals: a frame until ticket 17 fills it.
 * The brief can pass the setup (`plan`) and the attributes it loaded
 * (`page.data.attributes`). */
export function GoalsSection() {
  return (
    <BriefSection section="goals">
      <SectionStub />
    </BriefSection>
  )
}
