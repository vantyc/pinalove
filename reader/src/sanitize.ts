const SENSITIVE_QUERY_KEYS = new Set([
  'a',
  'u',
  'uid',
  'tgz',
  'authtoken',
  'authToken',
  'phpsessid',
  'PHPSESSID',
  'token',
  'id_token',
  'access_token',
  'refresh_token',
  'cookie',
  'authorization',
])

export function sanitizeUrlForLog(raw: string): string {
  try {
    const url = new URL(raw)
    const action = url.searchParams.get('i') ?? '(none)'
    const box = url.searchParams.get('box')
    const extra = box ? ` box=${box}` : ''
    return `${url.pathname}?i=${action}${extra}`
  } catch {
    return '(unparseable-url)'
  }
}

export function containsSensitiveQuery(raw: string): boolean {
  try {
    const url = new URL(raw)
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(key) || SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        return true
      }
    }
  } catch {
    return /[?&](a|u|uid|tgz|authToken|PHPSESSID)=/i.test(raw)
  }
  return false
}

export function conceptualLog(action: string, detail: string): void {
  if (containsSensitiveQuery(action) || containsSensitiveQuery(detail)) {
    console.log('GET (redacted) -> (redacted)')
    return
  }
  console.log(`${action} ${detail}`)
}

export function redactUsername(name: unknown): string {
  if (typeof name !== 'string' || name.length === 0) return '(missing)'
  const head = name.slice(0, 2)
  return `${head}…/${name.length}`
}

export function redactText(value: unknown, keep = 48): string | null {
  if (value == null) return null
  const text = String(value)
  if (text === '' || text === 'No answer') return text
  if (text.length <= keep) return `${text} [len=${text.length}]`
  return `${text.slice(0, keep)}… [len=${text.length}]`
}

export function redactPhotoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  return value.replace(/\/p\/(\d{4}-\d{2})\/[^/]+\//, '/p/$1/{username}/')
}

export function redactId(value: unknown): string | null {
  if (value == null || value === '') return null
  const text = String(value)
  if (text.length <= 4) return `…${text}`
  return `…${text.slice(-4)}`
}

const SENSITIVE_KEY_RE =
  /^(a|u|tgz|uid|authtoken|auth_token|phpsessid|id_token|access_token|refresh_token|cookie|cookies|authorization|sessionid|session_id|email|emails|mail|password)$/i

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key)
}

export function stripSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveFields)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      out[key] = '[REDACTED]'
      continue
    }
    out[key] = stripSensitiveFields(child)
  }
  return out
}
