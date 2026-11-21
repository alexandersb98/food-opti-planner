import { PageStub } from '../../shell/PageStub'
import type { SpreadData } from './RecipeSpread'

/**
 * The spread's edit mode (the annotated page): a stub until ticket 27
 * builds it. `data` is null for a new recipe (/recipes/new), which opens
 * here directly. Places left for later tickets:
 * - ticket 35: the import banner, above the head, for an imported draft;
 * - ticket 33: the line editor, in place of the read-only `SpreadIngredients`.
 */
export function SpreadEditor({ data }: { data: SpreadData | null }) {
  void data
  return <PageStub title="shell.stub.recipe" />
}
