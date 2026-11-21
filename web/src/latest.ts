// "The latest question wins", framework-neutral: when the same question is
// asked again before the earlier answer arrives, only the answer to the
// latest one counts. Used by the recipe count (Vue `useRecipeCount`, and the
// React hook over the same rule).

/** A sequence of questions: `next()` starts one and gives a check that says
 * whether it is still the latest asked, for when its answer arrives. */
export function latestQuestion(): () => () => boolean {
  let latest = 0
  return function next() {
    const question = ++latest
    return () => question === latest
  }
}
