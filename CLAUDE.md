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
- If a file is getting very large (like App.jsx), mention it and suggest splitting it into smaller files when it makes sense — but explain why before doing it.
