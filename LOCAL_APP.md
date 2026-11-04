# Local Patient Compiler

Run `npm run local` from this directory, or double-click `Local Patient Compiler.command`.
Open <http://127.0.0.1:3210> and sign in with the existing app password.
Keep the terminal window open; press Control-C to stop the server.

The local app reads the existing `.env` configuration and connects to the configured
Supabase project. It uses the same live patient database as the deployed app: changes
made locally affect the shared database. The laptop requires an internet connection.
The Vercel deployment is unchanged. This local server listens on loopback only.

ChatGPT subscription sign-in is not yet connected. Existing AI calls continue to use
the configured API credentials and may incur charges. Do not use real patient data to
test a future ChatGPT subscription integration until its privacy terms are reviewed.
