import { BriefSection, SectionStub } from './BriefSection'

/** Section 3 of the brief, the recipe filters: a frame until ticket 19
 * fills it. The brief can pass the setup (`plan`), the tags it loaded
 * (`page.data.tags`) and the usable-recipe count it already asks for the
 * standfirst (`recipes.count`). */
export function FiltersSection() {
  return (
    <BriefSection section="filters">
      <SectionStub />
    </BriefSection>
  )
}
