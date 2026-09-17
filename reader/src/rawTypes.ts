export type RawSnapshot = {
  sourceUrl: string | null
  externalId: string | null
  extractedAt: string
  sourceAction: 'listsnew'
  original: Record<string, unknown>
}

export type ListsNewPayload = {
  foundrows?: unknown
  results?: unknown
  likescount?: unknown
  likescountcached?: unknown
  [key: string]: unknown
}
