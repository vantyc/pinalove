import { readFileSync } from 'node:fs'
import path from 'node:path'
import { openDatabase } from './db.ts'
import { ProfileStore } from './store.ts'
import { normalizeMailboxItem, type MailboxIngestPayload } from '../../shared/inbox.ts'

const sqlitePath = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data/pinalove.sqlite')
const file = process.argv[2]
if (!file) {
  console.error('Usage: node dist/backend/src/applyInbox.js <mailbox-payload.json>')
  process.exit(1)
}

const payload = JSON.parse(readFileSync(file, 'utf8')) as MailboxIngestPayload
if (payload.action !== 'mailboxnew' || payload.type !== 'newunread') {
  throw new Error('STOP: payload is not mailboxnew type=newunread')
}
const items = Array.isArray(payload.messages) ? payload.messages : []
const db = openDatabase(sqlitePath)
const store = new ProfileStore(db)
const before = store.count()
const result = store.ingestMailbox(items)
const after = store.list({})
const needs = after.filter((p) => p.conversationNeedsReply)
const pending = after.filter((p) => p.inboundReviewStatus === 'PENDING')
const report = {
  sqlitePath,
  rowsBefore: before,
  rowsAfter: after.length,
  ...result,
  pendingInbound: pending.length,
  pendingUsernames: pending.map((p) => p.username),
  conversationNeedsReply: needs.length,
  replyUsernames: needs.map((p) => p.username),
}
console.log(JSON.stringify(report, null, 2))
