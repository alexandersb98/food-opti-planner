import type { Attribute } from './api/types'

/** "Energy 389 kcal": an attribute's value with its name and unit. */
export function valueText(attribute: Pick<Attribute, 'name' | 'unit'>, value: string) {
  return `${attribute.name} ${value} ${attribute.unit}`.trim()
}
