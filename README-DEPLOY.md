# From Download to Live App — Complete Walkthrough

This takes you from the zip file you just downloaded to a real, working
website your whole team can use — with real individual logins. No coding
experience needed. Every step is spelled out; nothing is assumed.

You don't need to install anything on your computer for this. Everything
happens through your web browser, across three free accounts you'll create
along the way: **Supabase** (your database), **GitHub** (where the code
lives), and **Vercel** (what actually runs the website).

Budget about 30–45 minutes for your first time through this, start to
finish. Take it one part at a time — nothing here needs to be rushed.

---

## Part 1 — Unzip the download

1. Find the file you downloaded — it's called `stock-control-app.zip`.
2. **On Windows:** right-click it → **Extract All** → choose a spot you'll
   remember (your Desktop is fine) → **Extract**.
   **On Mac:** just double-click it — it unzips itself into the same
   folder.
3. You should now have a folder called `stock-control-app` with things
   like `package.json`, `src`, and this file inside it. Leave it there —
   you'll come back to it in Part 3.

---

## Part 2 — Set up your database (Supabase)

This is where all your stock data and everyone's login lives.

1. Go to **supabase.com** and click **Start your project**. Sign up (an
   email + password, or sign up with GitHub if you've already made that
   account — either works).
2. Click **New project**. Give it any name, e.g. "East Rand Stock". Pick a
   password for the database itself (Supabase asks for this — save it
   somewhere, though you won't need it day-to-day) and pick a region close
   to you. Click **Create new project**. It takes a minute or two to spin
   up.
3. Once it's ready, look at the left sidebar and click the **SQL Editor**
   icon (it looks like `>_`). Click **New query**.
4. Open the file called `supabase-setup.sql` inside your unzipped folder
   (any text editor works — Notepad on Windows, TextEdit on Mac). Select
   all the text (Ctrl+A / Cmd+A), copy it, and paste it into the Supabase
   SQL box.
5. Click **Run** (bottom right, or Ctrl+Enter). You should see a green
   "Success" message. This just created your database tables — nothing to
   check further here.
6. In the left sidebar, click **Authentication** → **Providers** → click
   into **Email**. Find the toggle called **"Confirm email"** and turn it
   **off**. Save. *(This just means people don't need to click a
   confirmation link in their inbox to finish signing up — simpler for an
   internal tool. You can turn it back on later if you ever want to.)*
7. Click the **gear/Settings icon** in the sidebar → **API**. You'll see
   two things you need in a minute — keep this tab open, or copy both
   somewhere safe:
   - **Project URL** (starts with `https://` and ends in `.supabase.co`)
   - **anon public** key (a long string of letters and numbers)

That's your database done. Don't close this browser tab yet — you'll need
those two values again shortly.

---

## Part 3 — Put the code on GitHub

GitHub just stores your code and hands it to Vercel whenever it changes.

1. Go to **github.com**, click **Sign up**, create a free account.
2. Once logged in, click the **+** icon top-right → **New repository**.
3. Give it a name, e.g. `stock-control`. Leave everything else as-is
   (Public or Private both work fine — Private is a reasonable default
   since it's your business tool, though the code itself isn't sensitive).
   Click **Create repository**.
4. You'll land on a mostly empty page. Look for a link that says
   **"uploading an existing file"** (it's in the text on that page) and
   click it. If you don't see that link, click **Add file** → **Upload
   files** instead — same destination.
5. Now, open your unzipped `stock-control-app` folder in Windows
   Explorer / Mac Finder. **Select everything inside that folder** (all
   the files and sub-folders like `src`, `package.json`, etc. — select all
   of it, but not the outer `stock-control-app` folder itself).
6. Drag all of that into the GitHub upload box in your browser. *(Use
   Chrome or Edge for this step — folder drag-and-drop is most reliable
   there.)* Give it a moment to upload everything.
7. Scroll down, and click the green **Commit changes** button.

Your code is now on GitHub. You'll come back here anytime you want to
update it later, but for now, on to making it live.

---

## Part 4 — Make it live (Vercel)

1. Go to **vercel.com**, click **Sign Up**, and choose **Continue with
   GitHub** — this links the two accounts automatically, which saves you
   a step.
2. Click **Add New...** → **Project**.
3. You'll see a list of your GitHub repos — find `stock-control` and click
   **Import**.
4. Before clicking Deploy, look for **Environment Variables** (you may
   need to click to expand that section). Add exactly these two:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | the Project URL from Part 2, step 7 |
   | `VITE_SUPABASE_ANON_KEY` | the anon public key from Part 2, step 7 |

   Paste each value in carefully — no extra spaces at the start or end.
5. Click **Deploy**. Vercel builds your app — this takes a minute or two.
   You'll see a progress screen, then confetti and a screenshot of your
   live site.
6. Click the link/button that says something like **Visit** or shows your
   new URL — it'll look like `stock-control-yourname.vercel.app`. **That's
   your real, live app.** Bookmark it. Send it to your phone. This is what
   everyone on the floor will use from now on.

---

## Part 5 — Become the first Admin

Nobody starts as Admin — not even you, yet. Here's the one-time fix:

1. Open your new live app (the Vercel URL from Part 4). You'll see a
   sign-in screen.
2. Click **Create account**. Fill in your name, your email, and a
   password. Submit.
3. You're now signed in — but you'll see a message saying nobody's granted
   you access yet. That's expected. Leave this tab open.
4. Go back to your **Supabase** tab. In the left sidebar, click
   **Table Editor**, then click the **profiles** table.
5. Find the row with your email in it. Click into that row's `is_admin`
   cell and change it from `false` to `true`. Save (usually just clicking
   away from the cell saves it, or there's a save icon).
6. Go back to your app tab and **refresh the page**, then sign in again if
   needed. You should now see the full app, with a **Stock Manager**
   button in the header.

You'll never need to touch that Supabase table again after this — from
here on, you manage everyone's access from inside the app itself.

---

## Part 6 — Bring your team on board

1. As Admin, open **Stock Manager → User Management**. Right now it's
   empty except you.
2. Send your team the app's URL. Each person opens it and clicks
   **Create account** themselves (their own name, email, password —
   nobody else can do this step for them).
3. Once someone's signed up, they'll appear in your User Management list
   automatically (you may need to close and reopen Stock Manager to see
   them, or just wait — it refreshes each time you open that screen).
4. Tick the boxes for what each person should be able to do — same
   controls as before: view/edit per section, add material, request
   stock, manage requisitions, and so on.
5. Tell that person to refresh their page — their new access applies
   immediately once they do.

---

## Part 7 — Quick test checklist

Before trusting this for real work, run through:

- [ ] Sign up as a second test person, confirm they see nothing until you
      grant access
- [ ] Grant them "view" on Plate & Sheet, confirm they now see that tab
      and nothing else
- [ ] Add a stock item, confirm it saves and is still there after a
      refresh
- [ ] Open the app on your phone using the same URL, sign in, confirm it
      looks and works right on mobile
- [ ] Sign out and back in, confirm your session and permissions hold

---

## Making changes going forward

Two ways, same as before:

- **Keep working with me.** Describe the change, I hand you an updated
  `App.jsx`. In GitHub, open `src/App.jsx` in your repo, click the pencil
  (edit) icon, delete everything, paste the new version in, commit.
  Vercel redeploys automatically within a minute or two — no other steps.
- **Claude Code**, once you're comfortable with the above — it can push
  changes to GitHub directly instead of you copy-pasting files by hand.
  Worth exploring later, not needed to get started.

---

## If something doesn't work

- **Vercel deploy fails / build error:** almost always means one of the
  two environment variables is missing or has a typo. In Vercel, go to
  your project → **Settings → Environment Variables**, check both are
  there exactly as shown in Part 4, then go to **Deployments** and
  redeploy.
- **Sign up seems to hang, or asks to check email:** go back to Supabase
  → Authentication → Providers → Email, and confirm "Confirm email" is
  switched off (Part 2, step 6).
- **You can't find `is_admin` to edit in Part 5:** make sure you're in
  **Table Editor**, not SQL Editor, and that you've clicked into the
  `profiles` table specifically — there'll be one row per person who's
  signed up.
- **Anything else:** come back here and tell me exactly what you see —
  screenshots help a lot if you're not sure how to describe it.
