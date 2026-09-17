import { decodeProfileText } from './localEnrichment.ts'

const FORBIDDEN =
  /\b(kid|kids|child|children|mom|mother|dad|married|marriage|husband|wife|divorce|divorced|widow|catholic|christian|religion|church|mass|age|years?\s+old|logged\s+in|inactive)\b/i

function hash(text: string): number {
  let n = 0
  for (const ch of text) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  return n
}

function clean(raw: string | null | undefined, max = 72): string {
  const text = decodeProfileText(raw)
  if (!text) return ''
  if (FORBIDDEN.test(text)) return ''
  if (text.length < 4) return ''
  if (/^[❤️💞💗😊😍!?.\s]+$/u.test(text)) return ''
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text
}

function cityName(location: string | null | undefined): string {
  const loc = decodeProfileText(location)
  if (!loc || loc.length < 3) return ''
  if (FORBIDDEN.test(loc)) return ''
  return loc.split(',')[0]?.trim() ?? ''
}

export type OpeningDraftInput = {
  username: string
  location: string | null
  headline: string | null
  bio: string | null
  occupation: string | null
}

/**
 * Short opener from persisted facts only.
 * Never asks about children, marriage, religion, age, or inactivity.
 */
export function generateOpeningDraft(input: OpeningDraftInput): string {
  const city = cityName(input.location)
  const occupation = clean(input.occupation, 40)
  const headline = clean(input.headline, 56)
  const bio = clean(input.bio, 56)
  const seed = hash(input.username)

  if (occupation) {
    return `Hi! I noticed you work as ${occupation}. I'd like to get to know you.`
  }
  if (headline && /serious relationship|forever|long[- ]term|get to know/i.test(headline)) {
    return `Hi! I also hope to build something real. Would you like to chat?`
  }
  if (headline && /travel/i.test(headline)) {
    return city
      ? `Hi! I saw you like to travel. How are things in ${city}?`
      : `Hi! I saw you like to travel. What has been your favorite place so far?`
  }
  if (bio && /travel/i.test(bio)) {
    return `Hi! Travel stood out on your profile. I'd like to get to know you.`
  }
  if (headline) {
    return `Hi! "${headline}" caught my attention. Would you like to chat?`
  }
  if (city) {
    const variants = [
      `Hi! How are things in ${city}? I'd like to get to know you.`,
      `Hi from here — how's life in ${city} these days?`,
      `Hi! ${city} is on your profile. Would you like to talk a bit?`,
    ]
    return variants[seed % variants.length]
  }
  const fallback = [
    `Hi! I'd like to get to know you. How has your week been?`,
    `Hi, I wanted to say hello. What do you enjoy doing in your free time?`,
    `Hi! Would you like to chat a bit and see if we click?`,
  ]
  return fallback[seed % fallback.length]
}
