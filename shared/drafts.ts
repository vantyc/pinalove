import { decodeProfileText } from './localEnrichment.ts'
import type { FactConfidence, ProvenanceRecord } from './types.ts'

const FORBIDDEN =
  /\b(kid|kids|child|children|haschildren|wantschildren|mom|mother|dad|married|marriage|marital|husband|wife|divorce|divorced|widow|widowed|never\s+married|catholic|christian|religion|church|mass|faith|god|age|years?\s+old|logged\s+in|inactive|stale|unknown|verified|verification|photo\s+verified|score|scoring|preselected|discarded|filter|filters|provenance|inferred)\b/i

const UNSAFE =
  /\b(sex|sexy|sexual|nude|naked|horny|fuck|shit|bitch|slut|dick|pussy|porn|onlyfans|kill|hate|ugly|stupid|idiot|dumb)\b/i

const ASK_PERMISSION = /would you like to (chat|talk)/i

function hash(text: string): number {
  let n = 0
  for (const ch of text) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  return n
}

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length]
}

function greetingName(username: string): string {
  const u = username.trim()
  if (!/^[A-Za-z][A-Za-z0-9._-]{1,20}$/.test(u)) return ''
  return u
}

function hi(username: string, seed: number): string {
  const name = greetingName(username)
  if (!name) return 'Hi 🙂'
  return pick([`Hi ${name} 🙂`, `Hi ${name}!`, `Hi ${name} 🙂`], seed)
}

function usableSnippet(raw: string | null | undefined, max = 48): string {
  const text = decodeProfileText(raw)
  if (!text) return ''
  if (text.length < 4 || text.length > 80) return ''
  if (/[…]|\.\.\./.test(text)) return ''
  if (FORBIDDEN.test(text) || UNSAFE.test(text)) return ''
  if (/^[❤️💞💗😊😍!?.\s]+$/u.test(text)) return ''
  return text.length > max ? '' : text
}

function cityName(location: string | null | undefined): string {
  const loc = decodeProfileText(location)
  if (!loc || loc.length < 3) return ''
  if (FORBIDDEN.test(loc) || UNSAFE.test(loc)) return ''
  return loc.split(',')[0]?.trim() ?? ''
}

function explicitOccupation(input: OpeningDraftInput): string {
  if (input.occupationConfidence !== 'EXPLICIT') return ''
  const fact = (input.facts ?? []).find((f) => f.field === 'occupation' && f.confidence === 'EXPLICIT')
  const raw =
    (typeof fact?.value === 'string' ? fact.value : null) ?? input.occupation ?? null
  const text = usableSnippet(raw, 40)
  if (!text) return ''
  if (/^[A-Za-z].{2,39}$/.test(text) === false) return ''
  return text
}

function naturalTheme(headline: string, bio: string): 'serious' | 'travel' | null {
  const blob = `${headline} ${bio}`
  if (FORBIDDEN.test(blob) || UNSAFE.test(blob)) return null
  if (/serious relationship|looking for something (real|serious)|long[- ]term|something real/i.test(blob)) {
    return 'serious'
  }
  if (/\b(travel|travelling|traveling)\b/i.test(blob)) return 'travel'
  return null
}

export type OpeningDraftInput = {
  username: string
  location: string | null
  headline: string | null
  bio: string | null
  occupation: string | null
  occupationConfidence?: FactConfidence | null
  facts?: ProvenanceRecord[]
}

/**
 * Short opener from persisted facts only.
 * Starts a conversation with a question. Never asks permission to chat.
 * Never mentions children, marriage, religion, age, UNKNOWN, or internal fields.
 */
export function generateOpeningDraft(input: OpeningDraftInput): string {
  const seed = hash(input.username)
  const greet = hi(input.username, seed)
  const occupation = explicitOccupation(input)
  const city = cityName(input.location)
  const headline = usableSnippet(input.headline)
  const bio = usableSnippet(input.bio)
  const theme = naturalTheme(headline, bio)

  if (occupation) {
    const job = occupation.charAt(0).toLowerCase() + occupation.slice(1)
    return pick(
      [
        `${greet} I saw you're a ${job}. What kind of work does that involve day to day?`,
        `${greet} I noticed you work as a ${job}. What do you enjoy most about it?`,
        `${greet} I saw you're a ${job}. How did you get into that?`,
      ],
      seed,
    )
  }

  if (theme === 'serious') {
    return pick(
      [
        `${greet} I saw you're looking for something serious too. What are you hoping to find here?`,
        `${greet} I also hope to build something real. What matters most to you in a partner?`,
      ],
      seed,
    )
  }

  if (theme === 'travel') {
    return city
      ? pick(
          [
            `${greet} I saw you like to travel. How are things in ${city}?`,
            `${greet} I saw you like to travel. What's been your favorite place so far?`,
          ],
          seed,
        )
      : `${greet} I saw you like to travel. What's been your favorite place so far?`
  }

  if (city) {
    return pick(
      [
        `${greet} How are things in ${city}? Have you always lived there?`,
        `${greet} How's life in ${city} these days?`,
        `${greet} What's your favorite thing about ${city}?`,
      ],
      seed,
    )
  }

  return pick(
    [
      `Hi 🙂 How's your week going?`,
      `Hi 🙂 What have you been up to this week?`,
      `Hi 🙂 How's your day going so far?`,
    ],
    seed,
  )
}

export function assertSafeOpening(draft: string): void {
  if (ASK_PERMISSION.test(draft)) {
    throw new Error('opening asks permission to chat')
  }
  if (!draft.includes('?')) {
    throw new Error('opening has no question')
  }
  if (FORBIDDEN.test(draft) || UNSAFE.test(draft)) {
    throw new Error('opening contains forbidden content')
  }
}
