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
