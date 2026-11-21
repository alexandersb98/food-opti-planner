# 03: Screenshot kit and sample data

**What to build:** Any implementer can, with two commands, fill a local dev backend with believable sample data and take the four screenshots every UI ticket needs (390 × 844 phone and 1280 × 800 desktop, paper and evening editions) of a React route and of the matching D2 prototype view, so screenshot checks are quick and comparable across tickets.

Spec: "Testing Decisions › Visual verification"; story 203.

- A sample-data seed that talks to a **local** dev backend only (the README's "Run the GUI locally" setup, with `AI_PROVIDER=fake`, `AI_ALLOW_FAKE=true` and the test data sources directory), through the public API: a handful of attributes (energy, protein, …), about a dozen ingredients with conversions and tags (one linked to a data source), tags including a tag group, about eight recipes with sections and instructions, a plan setup with goals (Must and Prefer) and filters, and one solved and saved plan used for today. Refuses to run against anything but localhost.
- A screenshot script: given a React route (under the base path), an optional step to run first (open a sheet, tap a button) and an output name, writes phone/desktop × paper/evening PNGs to a git-ignored folder, with an option for reduced motion. Editions are forced through the colour-scheme emulation (and, once ticket 05 lands, its storage key; leave a hook for it).
- The same script can shoot a D2 prototype view opened from disk (`prototypes/d2-editorial-refined/index.html#plan`, `#menu`, `#recipes`, `#recipe/<id>`, `#archive`, `#ingredients`, `#settings`).
- Short usage notes in the README's "Screenshot checks" section (update it if the commands differ).

Blocked by: None (can start immediately)

Status: ready-for-agent

- [ ] Running the seed twice against a fresh local backend works (second run is a no-op or clearly refuses), and the Vue app shows the seeded data
- [ ] The script produces the four PNGs for a Vue route today (the React app may not exist yet) and for each D2 prototype view listed
- [ ] Nothing new is committed outside `web/` scripts/config and the git-ignore entry; no screenshots committed
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass in `web/`
