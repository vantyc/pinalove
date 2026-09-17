# mailboxnew (FASE inbox discovery)

**mailboxnew is an approved read-only diagnostic for Inbox/Unread listing, not a bulk ingestion strategy.**

Do not loop it. Do not persist this probe. Do not open a conversation. Do not mark as read.

## Inbox list

| | |
|---|---|
| Action | `mailboxnew` |
| URL | `GET https://www.pinalove.com/nt/app.php?i=mailboxnew` |
| Client | in-page `apiRequest("mailboxnew", payload)` default method GET |
| Payload | `{ type, pagenumber }` |
| `type` | `newunread` (Unread tab), `newinbox` (Inbox), `newoutbox` (Outbox) |
| First page | `pagenumber: 1` |
| Likes / hide / send / read | **separate** mutators. Not this action. |

SPA `loadMail(type)` is the only caller of `mailboxnew`. It does not call `markasread`.

Response (live probe, `type=newunread`, page 1): `{ messages[], unreadcount, users? }`.

Live field union on each message: `age`, `city`, `faceverified`, `gender`, `lastactivity`, `mailid`, `new`, `premium`, `replied`, `sender`, `text`, `thumb`, `time`, `username`.

`userid` was **absent**. Identity is `username` (+ `mailid`). `new === "1"` is unread. `text` is the preview. `lastactivity` is unix seconds. `time` arrived as a string (not parsed as unix in the probe sanitizer).

The Unread listing returned `unreadcount: 3` and every row still `new: "1"`. Listing did not clear unread in the payload. `markasread` was not called.

## Mark as read (FORBIDDEN)

`apiRequest("markasread", { uc: 1, up: username })`. Separate function `markAsRead`.

Triggered when the SPA **opens a chat** (`initialMessagesArr.length > 0`) and when swipe-hiding an Unread row. Not when listing the mailbox.

Also: `markasunread`, `markasdeleted`.

## Conversation body (not probed)

`convonew` GET `{ up: username, vx }` (`loadChatRequest`). Optional `limit: 1` or `limit: 500`.

Opening chat in the SPA also fires **`broadcastinchat`** (presence) and **`markasread`**. `readreceipt` is `{ rr: 1, up }`. Do not navigate to Mail/Chat to “see what happens”.

## Send (FORBIDDEN — identified only)

`POST sendmessage` via `ajaxSendChatMessage`. Payload keys: `up`, `m` (body), `irr`, `pv`, `unreadcount`, `brr`, `vx`, `ufmcode`, optional `cad`, `feedpostid`, `ppid`, `puid`.

Also `POST sendfeedmessage` `{ up, m, feedpostid }`.
