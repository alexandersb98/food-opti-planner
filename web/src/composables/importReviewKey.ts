import type { InjectionKey } from 'vue'
import type { ImportReview } from '../importReview'

/** Where the recipe page provides the import review to its sections (Vue). */
export const importReviewKey: InjectionKey<ImportReview> = Symbol('importReview')
