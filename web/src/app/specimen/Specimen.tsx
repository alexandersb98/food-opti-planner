import { lazy, Suspense } from 'react'
import { specimenSections } from './sections'
import './specimen.css'

// Created once, at module scope, so each section keeps its identity across renders.
const sections = specimenSections.map((section) => ({ ...section, Body: lazy(section.load) }))

/** The type specimen: the design tokens, the type and every primitive, one
 * section each. Dev-only (its route exists only in the dev server), not in
 * Contents. */
export function Specimen() {
  return (
    <div className="specimen-desk">
      <main className="specimen paper" aria-labelledby="specimen-title">
        <header className="specimen-cover">
          <p className="kicker">For the workshop, not the reader</p>
          <h1 id="specimen-title" className="specimen-title">
            Specimen <em>of paper &amp; ink</em>
          </h1>
          <p className="lead-text">
            The tokens, type and parts every page is set from, in the edition picked below. Tab through it
            to check the focus rings.
          </p>
          <nav aria-label="Sections">
            <ol className="specimen-toc">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        </header>
        {sections.map(({ id, title, Body }) => (
          <section key={id} id={id} className="specimen-section" aria-labelledby={`${id}-title`}>
            <h2 id={`${id}-title`} className="specimen-section-title">
              {title}
            </h2>
            <Suspense fallback={<p className="kicker">Setting the type…</p>}>
              <Body />
            </Suspense>
          </section>
        ))}
      </main>
    </div>
  )
}
