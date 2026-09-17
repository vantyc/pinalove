import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  inboundAtFromMailbox,
  mailboxProfileUrl,
  normalizeMailboxItem,
} from './inbox.ts'

describe('mailboxnew normalize', () => {
  it('keeps username identity and does not invent externalId', () => {
    const item = normalizeMailboxItem({
      username: 'AdaInbox',
      mailid: 'thread-9',
      new: '1',
      text: 'hello',
      time: '1758080000',
      lastactivity: 1758080000,
      age: 29,
      city: 'Mexico City',
      gender: 'female',
      thumb: '/p/2026-09/AdaInbox/abc-medium.jpg',
    })
    assert.ok(item)
    assert.equal(item.username, 'AdaInbox')
    assert.equal(item.mailid, 'thread-9')
    assert.equal(item.unread, true)
    assert.equal(item.text, 'hello')
    assert.equal(mailboxProfileUrl(item.username), 'https://www.pinalove.com/AdaInbox')
    assert.ok(inboundAtFromMailbox(item))
    assert.match(item.primaryPhotoUrl ?? '', /pinalove\.com\/p\/2026-09\/AdaInbox/)
  })

  it('drops rows without username', () => {
    assert.equal(normalizeMailboxItem({ mailid: 'x', text: 'hi' }), null)
  })
})
