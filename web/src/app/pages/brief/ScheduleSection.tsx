import { BriefSection, SectionStub } from './BriefSection'

/** Section 1 of the brief, the schedule: a frame until ticket 15 fills it.
 * The brief can pass the setup it shows (`plan`, from the plan-setup store). */
export function ScheduleSection() {
  return (
    <BriefSection section="schedule">
      <SectionStub />
    </BriefSection>
  )
}
