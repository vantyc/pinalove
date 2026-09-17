import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hasPriorOutboundContact,
  inboundAtFromMailbox,
  inboundReviewOnIngest,
  mailboxProfileUrl,
  normalizeMailboxItem,
  queueConversationNeedsReply,
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

describe('inbound review vs unread vs replies', () => {
  it('unknown inbound stays PENDING and is not queued for REPLIES', () => {
    assert.equal(inboundReviewOnIngest(null), 'PENDING')
    assert.equal(
      queueConversationNeedsReply({
        inboundPending: true,
        inboundReviewStatus: 'PENDING',
        contactStatus: 'NONE',
      }),
      false,
    )
  })

  it('PENDING + unread is not conversationNeedsReply', () => {
    assert.equal(
      queueConversationNeedsReply({
        inboundPending: true,
        inboundReviewStatus: 'PENDING',
        contactStatus: 'NONE',
      }),
      false,
    )
  })

  it('INTERESTED + inbound pending queues REPLIES', () => {
    assert.equal(
      queueConversationNeedsReply({
        inboundPending: true,
        inboundReviewStatus: 'INTERESTED',
        contactStatus: 'NONE',
      }),
      true,
    )
  })

  it('DISCARD never queues REPLIES', () => {
    assert.equal(
      queueConversationNeedsReply({
        inboundPending: true,
        inboundReviewStatus: 'DISCARDED',
        contactStatus: 'MESSAGE_SENT',
      }),
      false,
    )
  })

  it('known previously contacted inbound queues REPLIES', () => {
    assert.equal(hasPriorOutboundContact('MESSAGE_SENT'), true)
    assert.equal(hasPriorOutboundContact('PROBE_SENT'), true)
    assert.equal(hasPriorOutboundContact('REPLIED'), true)
    assert.equal(inboundReviewOnIngest({ contactStatus: 'MESSAGE_SENT' }), 'INTERESTED')
    assert.equal(
      queueConversationNeedsReply({
        inboundPending: true,
        inboundReviewStatus: inboundReviewOnIngest({ contactStatus: 'PROBE_SENT' }),
        contactStatus: 'PROBE_SENT',
      }),
      true,
    )
  })

  it('existing never approved or contacted inbound stays PENDING', () => {
    assert.equal(inboundReviewOnIngest({ contactStatus: 'NONE', inboundReviewStatus: null }), 'PENDING')
    assert.equal(inboundReviewOnIngest({ contactStatus: 'READY_TO_CONTACT' }), 'PENDING')
    assert.equal(inboundReviewOnIngest({ contactStatus: 'STALE_LOCAL_PROBE' }), 'PENDING')
    assert.equal(
      queueConversationNeedsReply({
        inboundPending: true,
        inboundReviewStatus: 'PENDING',
        contactStatus: 'READY_TO_CONTACT',
      }),
      false,
    )
  })

  it('keeps inboundUnread conceptually separate from conversationNeedsReply', () => {
    assert.equal(
      queueConversationNeedsReply({
        inboundPending: true,
        inboundReviewStatus: 'PENDING',
      }),
      false,
    )
    assert.equal(
      queueConversationNeedsReply({
        inboundPending: false,
        inboundReviewStatus: 'INTERESTED',
      }),
      false,
    )
  })
})
