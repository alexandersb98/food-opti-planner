import { api } from '../../api/client'
import { useLoad } from './useLoad'

/** Whether the server has an AI key, for recipe import: null until the
 * health check answers (so a hint does not flash), and an unreadable
 * answer counts as no. */
export function useAiConfigured(): boolean | null {
  const health = useLoad((signal) => api.GET('/api/health', { signal }))
  return health.data ? health.data.ai_configured === true : health.failed ? false : null
}
