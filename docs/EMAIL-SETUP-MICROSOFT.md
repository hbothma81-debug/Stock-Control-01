# Email from the app: the one-off Microsoft 365 setup

For Heinrich and the IT company. About ten minutes, done once, by somebody who
is an administrator of the ersupplies.co.za Microsoft 365 account.

## What this does

It tells Microsoft 365 that the Stock Control app exists and may send mail **on
behalf of the person signed in, and nobody else**. Each person still signs in
with their own Microsoft password, in Microsoft's own window. The app never
sees or stores a password, and no secret key is created. The mail leaves from
that person's own mailbox and shows in their own Sent Items.

## Steps

1. Go to https://entra.microsoft.com and sign in as an administrator.
   (Entra is Microsoft's name for the screen where logins and apps are managed.)
2. Left menu: **Applications → App registrations → New registration**.
3. Fill in:
   - **Name:** Stock Control email
   - **Supported account types:** Accounts in this organizational directory only (single tenant)
   - **Redirect URI:** choose the platform **Single-page application (SPA)** and enter
     `https://stock-control-01.vercel.app/outlook-signin.html`
4. Press **Register**.
5. On the app's page, open **Authentication** and add three more Single-page
   application redirect URIs (these are for testing on the practice copy):
   - `http://localhost:5173/outlook-signin.html`
   - `http://localhost:5174/outlook-signin.html`
   - `http://localhost:5175/outlook-signin.html`

   Each address must be typed exactly as written, ending in
   `/outlook-signin.html`: that is the small page the Microsoft sign-in window
   comes back to. Microsoft refuses the sign-in if one letter differs.
   Leave every tick box under "Implicit grant" **off**. Save.
6. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions**
   and tick:
   - `Mail.Send` (send mail as the signed-in person)
   - `User.Read` (read the signed-in person's name and address; usually already there)
   Do **not** choose "Application permissions".
7. Press **Grant admin consent for East Rand Supplies** and confirm. Without
   this, every person gets a permission question the first time.
8. Open **Overview** and copy two values to Heinrich:
   - **Application (client) ID**
   - **Directory (tenant) ID**

## Where the two IDs go (Claude does this with Heinrich)

- Practice: two lines in the file `.env.local` in the app folder,
  `VITE_MS_CLIENT_ID=...` and `VITE_MS_TENANT_ID=...`, then restart the dev server.
- Live: the same two names under Vercel → the project → Settings →
  Environment Variables, then a redeploy. Until they are there the live app
  shows no Email button at all, so the code can go live before the setup is done.

## What to send back

Only those two IDs. They are not secret: they name the app and the company,
and are useless without a person's own Microsoft sign-in. **Do not create a
"client secret"**; this design does not use one.

## What the app can and cannot do afterwards

- Can: send an email, with attachments, from the mailbox of the person who is
  signed in and pressed Send.
- Cannot: read anybody's mail, send as somebody else, or send when nobody is
  signed in.

## To undo

Delete the app registration on the same screen. Sending from the app stops at
once; nothing else is affected.
