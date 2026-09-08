# Instructions for working with Heinrich

## My background
- I have no coding background at all. I'm a design engineer/draughtsman, not a programmer.
- I'm new to Claude Code, git, terminals, and technical tools generally.
- Explain everything in plain, everyday language — no jargon without a plain-English definition the first time you use a term.

## How to work with me
- Explain technical terms the first time you use them (e.g. "commit," "repo," "deploy," "npm").
- Walk me through steps one at a time, don't assume I know how to do something.
- If you see me doing something in an outdated, risky, or less efficient way, tell me directly and explain why — I'm still learning how you work and want to improve.
- Ask before doing anything irreversible or that goes live to real users.

## Working on this app
- This app (Stock Control — East Rand Supplies) is already live and in daily use by staff. Treat it like production — don't break it.
- Before making any change, create a git commit as a save point so we can undo it if something breaks.
- Make one small change at a time, then let me test it, before moving to the next change.
- Flag any security issues clearly and explain the real-world risk in plain language — don't just silently fix them.
- Small, low-risk changes can be merged and pushed live without asking first — but only after you have actually checked them, and you must tell me what you deployed afterwards. "Low-risk" means all of: no application code changed (or the change is trivial and you've tested it), a clean build from a fresh clone passes, and it's straightforward to undo.
- Everything else still needs my confirmation before going live. That includes anything that changes how the app behaves, touches the database structure, alters permissions or logins, or that you're not sure about. If in doubt, ask.
- When you spot a genuine opportunity to split up a very large file (like App.jsx) — normally while we're already working in that part of the app — tell me the possibility exists and what it would involve. We decide together each time. Never start a split on your own, and never do it as one big separate project: split as a by-product of work we're already doing, so the change gets tested by me using the feature anyway.

## Working alongside my other conversations

I run several conversations with you at once, each on a different part of the
app, all sharing this one folder and one branch. You cannot see the others, so
assume at any moment that somebody else is editing a file you have not looked
at for five minutes.

- **Never `git add -A` or `git add .`** Stage only the files you changed
  yourself, by name. Another conversation's half-finished work sitting in this
  folder is not yours to commit.
- **Before pushing, run `git log --oneline origin/main..HEAD`.** If there is a
  commit you did not make, stop and tell me what it is and what it does. Do not
  push somebody else's work live on my say-so about yours — I may not know it
  is queued.
- **If a file you need has changed under you, say so before writing to it.**
  Re-read it rather than working from what you remember.
- **Database changes get announced.** If you add a column, a table, or change a
  function, tell me in plain words what changed, so I can pass it to the others.
  Two conversations dropping and recreating the same function will undo each
  other silently.
- **Copies of the same rule drift.** If you write something in the app that
  redoes what the database already decides, say so in a comment at the top of
  the file, naming what it mirrors. Then whoever changes one knows to change
  the other.

Which conversation owns what, so far:

- **Jobs page** — the jobs list, job detail, quotes, invoicing
- **Laser production** — the cutting screen, nesting, shortages
- **Planning** — shifts, the time lockout, and whatever we are designing next
- **Quoting** — the new quoting module

`src/App.jsx` is the one file all of you have to touch, because it wires
everything together. That is the collision point. When your work naturally
takes you into a page's chunk of it, offer to lift that page out into its own
file — but only that page, only as part of work I am already testing, and only
after asking me.
