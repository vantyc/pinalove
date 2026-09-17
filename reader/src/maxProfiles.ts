/** Cap for a single listsnew page. Do not paginate or issue extra listsnew calls. */
export const MAX_PROFILES = 25

export function takeMaxProfiles<T>(items: readonly T[], max = MAX_PROFILES): T[] {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`Invalid MAX_PROFILES=${String(max)}`)
  }
  return items.slice(0, max)
}

export function assertMaterializeLimit(count: number, max = MAX_PROFILES): void {
  if (count > max) {
    throw new Error(
      `Refusing to materialize ${count} profiles; MAX_PROFILES=${max}. Slice before processing.`,
    )
  }
}
