import { onMounted, ref, type Ref } from 'vue'

/** Load a page's data when it opens. `failed` is set when the server can't
 * be reached or answers with an error; `load` tries again. */
export function useLoad<T>(fetch: () => Promise<{ data?: T }>, initial: T) {
  const data = ref(initial) as Ref<T>
  const loading = ref(true)
  const failed = ref(false)

  async function load() {
    loading.value = true
    failed.value = false
    try {
      const result = await fetch()
      if (result.data !== undefined) data.value = result.data
      else failed.value = true
    } catch {
      failed.value = true
    } finally {
      loading.value = false
    }
  }

  onMounted(load)
  return { data, loading, failed, load }
}

type Answer = Promise<{ data?: unknown }>
type AllData<T extends Record<string, Answer>> = { [K in keyof T]: Exclude<Awaited<T[K]>['data'], undefined> }

/** Several calls at once, for `useLoad`: their data by name if every one
 * answered with data, and no data if any failed.
 * `useLoad(() => loadAll({ tags: api.GET('/api/tags'), ... }), initial)` */
export async function loadAll<T extends Record<string, Answer>>(calls: T): Promise<{ data?: AllData<T> }> {
  const names = Object.keys(calls)
  const answers = await Promise.all(Object.values(calls))
  if (answers.some((answer) => answer.data === undefined)) return {}
  return { data: Object.fromEntries(names.map((name, i) => [name, answers[i]!.data])) as AllData<T> }
}
