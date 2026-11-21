// Loading several calls at once, framework-neutral: the React load hook
// (`app/hooks/useLoad`) takes its answer.

type Answer = Promise<{ data?: unknown }>
type AllData<T extends Record<string, Answer>> = { [K in keyof T]: Exclude<Awaited<T[K]>['data'], undefined> }

/** Several calls at once, for a load hook: their data by name if every one
 * answered with data, and no data if any failed.
 * `useLoad(() => loadAll({ tags: api.GET('/api/tags'), ... }), initial)` */
export async function loadAll<T extends Record<string, Answer>>(calls: T): Promise<{ data?: AllData<T> }> {
  const names = Object.keys(calls)
  const answers = await Promise.all(Object.values(calls))
  if (answers.some((answer) => answer.data === undefined)) return {}
  return { data: Object.fromEntries(names.map((name, i) => [name, answers[i]!.data])) as AllData<T> }
}
