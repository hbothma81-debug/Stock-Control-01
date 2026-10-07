# CNC module — the brief

Written 7 Oct 2026 by the ERS TURNING APP planning conversation (folder
`C:\ERS\OneDrive - East Rand Supplies\CLAUDE - SOLIDWORKS AUTOMATION\ERS TURNING APP`)
for the conversation that builds the CNC tab here. Nothing is built in
this app yet. Read this, then `CLAUDE.md`, then ask Heinrich before
writing any code. Only Planning pushes (`CLAUDE.md`).

## What it is

The lathe programming app (LEO 1600, Fanuc 0i-F) as a module of this
app: import a STEP model, answer a short questionnaire, and get the Fanuc
program(s) in Heinrich's layout, the checks, a toolpath picture, a setup
sheet and the machine time for costing. It will be sold as a product
later, so it is kept self-contained.

## Decided by Heinrich (7 Oct 2026)

1. **A tab in the top bar, CNC**, shown only to people with the CNC tick
   (view / edit) in User Management, like the other departments.
2. **Same Supabase projects and logins** (practice, then live). Same
   staff (the sales people). Admin and per-user permissions as today.
3. **Tables named `cnc_…`**, in the same schema as the rest of the app.
   Nothing else in the app reads or writes them except through the
   links below.
4. **The engine stays Python** (built and tested in the ERS TURNING APP
   folder, about 5,000 lines, 0.1 s per part). It runs as its own small
   web service on Vercel, own GitHub repository, own deploys. The CNC tab
   sends it the STEP file and the settings; it answers with the
   program(s), checks, toolpath picture data and machine time. It only
   answers people signed in to this app (it checks the Supabase login).
   Not rewritten in JavaScript, not run in the browser (that would hand
   the engine to every browser).
5. **Screens in `src/cnc/`**, using this app's own pieces: pill lists,
   `TypeToFind`, `Section`. New CNC work never goes into `App.jsx`
   beyond the one line that adds the tab.
6. **A program stands on its own.** It is not a Stock Code. Its customer
   is picked from the app's customer list (name only).
7. **Costing lives in the program** (Costing tab: machine time from the
   engine, bar from CNC Grades, rates from the turning rules). The
   Quoting module's CNC line reads it and has **Open program →**; a part
   with no program yet has **+ New program →**, which opens the CNC tab
   with the customer filled in and returns to the quote after Generate.
   Each program lists the quotes it is used in.
8. **Setup sheet PDF made in the browser with jsPDF**, as the app's
   other documents.
9. **Program files go to the machine by USB**: a Copy to USB button.
10. **Machine, tools, cutting data and the program layout are data per
    machine**, not code, so other shops' machines can be added.

## The screens

CNC tab, sub-tabs: **Programs**, **Tools**, **Cutting data**, **Machines**.

- **Programs**: one search box, **+ New program**, pills with counts:
  Not for machine (starts open, the fault on each line), Ready (starts
  shut). One line per program: O number, part, customer, material and
  bar, revision. Sorted by program number.
- **One program**: buttons **Update program**, **Copy to USB**,
  **Import machine copy**; tabs **Settings** (the questionnaire, editable
  after creation), **Program**, **Toolpath**, **Setup sheet**,
  **Customer**, **Costing**.
- **Update program** makes a new revision (rev A, B…); the old one is
  kept and the changes are shown before anything goes to the machine.
- **Import machine copy** saves the operator's edited program as the
  made revision and shows what changed (the hand program wins).
- **Export to Excel**: a list of programs, for review only.
- **Tools**: insert and holder builder. Type the ISO code (WNMG 080408,
  MWLNR 2525M08), grade and chipbreaker; the app fills in shape,
  size, nose radius, approach angle and shank from the code.
- **Cutting data**: moves here from `LEO1600 CUTTING DATA.xlsx`, with an
  Excel export.
- **Quick part**: a washer, spacer or bush from typed OD / ID / length,
  no model needed.

Click counts: new program from a STEP about 6 (CNC, New, pick STEP,
customer, material, Generate); change a program 3 plus the edit.

## Build order (one step at a time, tried on practice)

1. Engine on GitHub (private).
2. Engine as a web service on Vercel, practice only, login checked.
3. `setup-cnc-*.sql`: the `cnc_` tables and the CNC permission
   (proven on pglite, Heinrich pastes, practice first).
4. Programs screen and one program, Generate / Update, Copy to USB,
   Import machine copy, Excel export.
5. Tools and Cutting data screens, the ISO insert builder.
6. Quick part; the Quoting CNC line (with the Quoting conversation).

## Watch out

- **Supabase downloads**: the account went over the free 5 GB last
  cycle. Programs are a few kB; STEP files and PDFs are loaded only when
  a program is opened, never in a list. No timed reloads of whole tables.
- **Vercel's free plan is for non-commercial use** under its terms;
  selling this needs the paid plan.
- The engine's own rules are in the ERS TURNING APP folder, `0.RULES.md`
  (rule 11: one job per file, never over 1000 lines).
