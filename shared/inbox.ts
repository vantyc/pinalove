import { conversationNeedsReply } from './workflow.ts'
import { lastActivityToIso } from './activity.ts'
import type { Tristate } from './types.ts'

export const PINALOVE_ORIGIN = 'https://www.pinalove.com'

export type MailboxNewItem = {
  username: string
  mailid: string | null
  sender: unknown
  text: string | null
  time: unknown
  lastactivity: unknown
  unread: boolean
  age: number | null
  city: string | null
  gender: string | null
  faceVerified: Tristate
  primaryPhotoUrl: string | null
  replied: unknown
  premium: unknown
}

export type MailboxIngestPayload = {
  extractedAt: string
  action: 'mailboxnew'
  type: 'newunread'
  pagenumber: 1
  unreadcount: number | null
  messages: MailboxNewItem[]
}

export function inboxIdentityFromUsername(username: string): string {
  return username.trim()
}

export function mailboxProfileUrl(username: string): string {
  return `${PINALOVE_ORIGIN}/${username.trim()}`
}

export function mailboxPhotoUrl(thumb: unknown, username: string): string | null {
  if (typeof thumb !== 'string' || !thumb.trim()) return null
  const filled = thumb.replaceAll('{username}', username)
  if (/^https?:\/\//i.test(filled)) return filled
  if (filled.startsWith('/')) return `${PINALOVE_ORIGIN}${filled}`
  return `${PINALOVE_ORIGIN}/${filled}`
}

export function parseMailboxTime(value: unknown): string | null {
  const fromUnix = lastActivityToIso(value)
  if (fromUnix) return fromUnix
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString()
}

export function inboundAtFromMailbox(item: { time: unknown; lastactivity: unknown }): string | null {
  return parseMailboxTime(item.time) ?? parseMailboxTime(item.lastactivity)
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return null
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t ? t : null
}

function unreadFromRaw(value: unknown): boolean {
  return value === 1 || value === '1' || value === true
}

function faceFromMailbox(value: unknown): Tristate {
  if (value === 1 || value === '1' || value === true) return 'YES'
  return 'UNKNOWN'
}

function genderFromMailbox(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim().toLowerCase()
  if (t === 'female' || t === 'f') return 'female'
  if (t === 'male' || t === 'm') return 'male'
  if (!t || t === 'no answer') return null
  return value.trim()
}

export function normalizeMailboxItem(raw: Record<string, unknown>): MailboxNewItem | null {
  const username = asText(raw.username)
  if (!username) return null
  const mailid =
    raw.mailid != null && String(raw.mailid).trim() !== '' ? String(raw.mailid) : null
  return {
    username,
    mailid,
    sender: raw.sender ?? null,
    text: asText(raw.text),
    time: raw.time,
    lastactivity: raw.lastactivity,
    unread: unreadFromRaw(raw.new),
    age: asInt(raw.age),
    city: asText(raw.city),
    gender: genderFromMailbox(raw.gender),
    faceVerified: faceFromMailbox(raw.faceverified),
    primaryPhotoUrl: mailboxPhotoUrl(raw.thumb, username),
    replied: raw.replied ?? null,
    premium: raw.premium ?? null,
  }
}

export function mailboxNeedsReply(item: MailboxNewItem, lastOutboundAt: string | null): boolean {
  const inbound = inboundAtFromMailbox(item)
  if (item.unread) return true
  return conversationNeedsReply({ lastInboundAt: inbound, lastOutboundAt })
}
