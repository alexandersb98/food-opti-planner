import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fieldErrors } from '../api/errors'

/** The server's field errors by field, as `fieldErrors` gives them. */
export type FieldErrors = Partial<Record<string, string>>

/** A form's Save and Delete. `saving` is set while a save runs. A failure
 * that no field shows goes to `errors.save`, which the form shows above
 * its buttons. */
export function useSave(errors: { save: string }) {
  const { t } = useI18n()
  const saving = ref(false)

  /** Send the form with `call`; true once saved. With data, `saved` runs
   * before `saving` ends. A refusal goes to `showFieldErrors`, which marks
   * what it can on the fields and says whether it marked anything; anything
   * else just failed. */
  async function save<T>(
    call: () => Promise<{ data?: T; error?: unknown }>,
    saved: (data: T) => unknown,
    showFieldErrors: (byField: FieldErrors) => boolean = () => false,
  ): Promise<boolean> {
    errors.save = ''
    saving.value = true
    try {
      const { data, error } = await call()
      if (data !== undefined) {
        await saved(data)
        return true
      }
      if (!showFieldErrors(fieldErrors(error))) errors.save = t('common.saveFailed')
    } catch {
      errors.save = t('common.saveFailed')
    } finally {
      saving.value = false
    }
    return false
  }

  /** Delete with `call`; true when the server did. */
  async function remove(call: () => Promise<{ response: Response }>): Promise<boolean> {
    errors.save = ''
    try {
      if ((await call()).response.ok) return true
    } catch {
      // failed below
    }
    errors.save = t('common.deleteFailed')
    return false
  }

  return { saving, save, remove }
}
