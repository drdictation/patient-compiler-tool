# Gmail Inbox Feature — Implementation Summary

## What Was Built

A complete Gmail-based inbox system that allows you to capture thoughts on-the-go via iOS Shortcuts and assign them to patients.

---

## Files Created

### Database
- **`supabase_migration_inbox.sql`** — Creates `inbox_item` table with AI suggestion fields

### Backend Services
- **`src/lib/gmail-inbox.ts`** — Gmail API integration (polling, parsing, AI matching)
- **`src/app/actions.ts`** — Added inbox server actions:
  - `getPendingInboxItems()` — Fetch pending items
  - `pollGmailInbox()` — Poll Gmail for new messages
  - `assignInboxItem()` — Assign to patient as record/letter/task/smart_note
  - `discardInboxItem()` — Discard an item
  - `suggestPatientForInboxItem()` — Re-run AI suggestion

### Frontend Components
- **`src/app/inbox/page.tsx`** — Inbox page with pending items list
- **`src/components/inbox-list.tsx`** — List of inbox items
- **`src/components/inbox-item-card.tsx`** — Individual item card with preview
- **`src/components/assign-inbox-dialog.tsx`** — Assignment dialog with patient picker
- **`src/components/poll-inbox-button.tsx`** — "Check Inbox" button

### Navigation
- **`src/app/page.tsx`** — Added Inbox button to dashboard (mobile + desktop)

### Documentation
- **`GMAIL_INBOX_SETUP.md`** — Complete Gmail OAuth setup guide
- **`README.md`** — Updated with Inbox feature and setup steps

---

## Key Features

### 1. Email Ingestion
- Polls Gmail for unread messages
- Deduplicates based on Gmail message ID
- Extracts sender, subject, body, attachments
- Marks messages as read after processing

### 2. AI Patient Matching
- Uses Gemini Flash-Lite to analyze email content
- Suggests which patient the email relates to
- Shows confidence score (0-100%)
- Can be re-run manually if needed

### 3. Flexible Assignment
Users can assign inbox items as:
- **Record** — Raw transcript/document for patient
- **Letter** — Referrer letter artifact
- **Task** — Clinical/administrative/follow-up task
- **Smart Note** — Marks the item as assigned for Smart Note use (manual paste today)

### 4. iOS Shortcut Integration
- Send voice notes via email
- Include patient name in subject for better AI matching
- Works from anywhere (no app required)

---

## How It Works

```
┌─────────────────────┐
│  iOS Shortcut       │
│  (Dictate → Email)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Gmail Inbox        │
│  (Unread messages)  │
└──────────┬──────────┘
           │
           ▼ Click "Check Inbox"
┌─────────────────────┐
│  Patient Compiler   │
│  Polls Gmail API    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  AI Patient Match   │
│  (Gemini suggests)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Inbox UI           │
│  (Pending items)    │
└──────────┬──────────┘
           │
           ▼ Assign to patient
┌─────────────────────┐
│  Patient Record     │
│  Letter/Task/Note   │
└─────────────────────┘
```

---

## Next Steps for User

1. **Run the database migration**
   - Open Supabase SQL Editor
   - Run `supabase_migration_inbox.sql`

2. **Set up Gmail OAuth**
   - Follow `GMAIL_INBOX_SETUP.md`
   - Get Client ID, Client Secret, Refresh Token
   - Add to `.env.local`

3. **Test the integration**
   - Navigate to `/inbox`
   - Click "Check Inbox"
   - Verify emails appear

4. **Create iOS Shortcut**
   - Follow guide in `GMAIL_INBOX_SETUP.md`
   - Test by sending yourself a voice note

5. **Assign an item**
   - Select a patient
   - Choose assignment type
   - Verify it appears in patient record

---

## Technical Notes

### Dependencies Added
- `googleapis` — Google APIs Node.js client

### Environment Variables Required
```env
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```

### Security Considerations
- Refresh token gives access to Gmail — keep secure
- Only reads unread messages
- Marks as read after processing
- Consider using dedicated Gmail account

### AI Model Usage
- Patient matching uses **Gemini 2.5 Flash-Lite** (fast, cheap)
- Processes email subject + first 1000 chars of body
- Returns JSON with patient ID, name, confidence

### Current Limitation
- Assigning as **Smart Note** does **not** auto-open the dialog or pre-fill the transcript yet. It only marks the item as assigned.

---

## Future Enhancements (Optional)

- **Attachments** — Download and OCR PDF attachments
- **Gmail Push** — Real-time notifications instead of polling
- **Smart routing** — Auto-assign based on confidence threshold
- **Email templates** — Pre-formatted emails for specific workflows
- **Multi-account** — Support multiple Gmail accounts
- **Filters** — Custom Gmail labels for different workflows
