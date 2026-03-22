# Gmail Inbox Setup Guide

This guide will help you set up Gmail integration for the Patient Compiler inbox feature.

---

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Name it something like "Patient Compiler Inbox"

---

## Step 2: Enable Gmail API

1. In the Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click **Enable**

---

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - User Type: **External** (or Internal if you have a Google Workspace)
   - App name: "Patient Compiler"
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.modify`
   - Test users: Add your Gmail address
4. Back in Credentials, create OAuth client ID:
   - Application type: **Web application**
   - Name: "Patient Compiler Inbox"
   - Authorized redirect URIs: 
     - `http://localhost:3000/api/auth/callback/google`
     - `https://developers.google.com/oauthplayground` (Required for generating the refresh token)
5. Click **Create**
6. **Save the Client ID and Client Secret** — you'll need these

---

## Step 4: Get Refresh Token

You need to perform a one-time OAuth flow to get a refresh token.

### Option A: Use OAuth Playground (Easiest)

1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check **"Use your own OAuth credentials"**
4. Enter your **Client ID** and **Client Secret**
5. In the left panel, scroll down to **Gmail API v1**
6. Select:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
7. Click **Authorize APIs**
8. Sign in with your Gmail account
9. Click **Exchange authorization code for tokens**
10. **Copy the Refresh Token** — you'll need this

### Option B: Manual OAuth Flow (Advanced)

If you prefer to do it manually, create a temporary script:

```javascript
// get-refresh-token.js
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3000/api/auth/callback/google';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', (code) => {
  rl.close();
  oauth2Client.getToken(code, (err, token) => {
    if (err) return console.error('Error retrieving access token', err);
    console.log('Your refresh token:', token.refresh_token);
  });
});
```

Run it:
```bash
node get-refresh-token.js
```

---

## Step 5: Add Environment Variables

Add these to your `.env.local` file:

```env
# Gmail OAuth Credentials
GMAIL_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret-here
GMAIL_REFRESH_TOKEN=your-refresh-token-here
```

---

## Step 6: Run the Migration

Run the inbox migration SQL in your Supabase dashboard:

1. Go to your Supabase project
2. Navigate to **SQL Editor**
3. Open `supabase_migration_inbox.sql`
4. Click **Run**

---

## Step 7: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:3000/inbox`

3. Click **"Check Inbox"**

4. If configured correctly, it will poll your Gmail inbox for unread messages

---

## iOS Shortcut Setup

Once the Gmail integration is working, set up an iOS Shortcut to quickly send notes:

### Basic Voice Note Shortcut

1. Open **Shortcuts** app on iPhone
2. Tap **+** to create new shortcut
3. Add these actions:
   - **Dictate Text** (or "Ask for Input" for typing)
   - **Send Email**
     - To: `your-email@gmail.com` (the Gmail account you configured)
     - Subject: `Quick Note`
     - Body: `{{Dictated Text}}`
4. Name the shortcut "Patient Note"
5. Add to Home Screen or Siri

### Patient-Tagged Shortcut (Advanced)

For better AI matching, include the patient name:

1. **Ask for Input** → "Patient Name"
2. **Dictate Text** → "Your note"
3. **Send Email**
   - To: `your-email@gmail.com`
   - Subject: `{{Patient Name}}`
   - Body: `{{Dictated Text}}`

---

## Troubleshooting

### "Missing Gmail OAuth credentials" error
- Check that all three environment variables are set in `.env.local`
- Restart your dev server after adding them

### "Invalid credentials" error
- Verify your Client ID and Client Secret are correct
- Make sure you copied the full refresh token

### "Insufficient permissions" error
- Ensure you added both `gmail.readonly` and `gmail.modify` scopes
- Re-do the OAuth flow with the correct scopes

### No emails appearing
- Check that you have unread emails in your Gmail inbox
- The system only polls for unread messages
- Try sending a test email to yourself

### AI patient matching not working
- Ensure you have patients in your database
- Include the patient name in the email subject or body
- The AI uses Gemini 3.1 Flash-Lite for matching

---

## Security Notes

- **Never commit** your `.env.local` file to git
- The refresh token gives access to your Gmail — keep it secure
- Consider using a dedicated Gmail account for this feature
- The app only reads unread emails and marks them as read after processing

---

## Next Steps

Once everything is working:
1. Test the iOS Shortcut by sending yourself a voice note
2. Check the inbox in the app
3. Assign an item to a patient
4. Verify it appears in the patient's record
