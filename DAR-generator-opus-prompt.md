# Prompt for Claude Opus — DAR Generator Web App

Copy everything below the line into a new Claude chat (attach your DAR screenshot too, if possible).

---

Build me a complete, production-ready web app called **DAR Generator**. It automates creating my "Project-Based Employee Daily Accomplishment Report" (DAR) — an official spreadsheet form — by pulling my GitHub commit history and writing a formatted Google Sheet. It must be a **fully static single-page app with NO backend**, deployable to Vercel as-is.

## Tech stack (strict)
- Vite + React + TypeScript
- Ant Design (antd v5) for all UI
- GitHub REST API called directly from the browser using a user-pasted Personal Access Token (PAT)
- Google Sheets API + Google Drive API called from the browser using **Google Identity Services (GIS) token flow** — Client ID only, no client secret, no server
- All user settings persisted in localStorage

## Multi-user design
Any user can use the deployed app with their own accounts:
1. They paste their own GitHub PAT (stored in localStorage only; show a short inline guide: create a fine-grained token with repo read access at github.com/settings/tokens)
2. They sign in to Google via the GIS popup to grant `https://www.googleapis.com/auth/spreadsheets` and `https://www.googleapis.com/auth/drive.file` scopes
3. All header/profile fields are fully editable and saved locally, so each user has their own persistent profile

## App flow (single page, stepper or tabs)

**Step 1 — Profile & Settings (editable, persisted in localStorage):**
- Name of PBE, Position Title, Department, Unit, Immediate Supervisor
- Organization header lines: org name (default "DAVAO CITY WATER DISTRICT"), address line (default "Km. 2.5 Mac Arthur Highway, Matina, Davao City"), report title (default "Project-Based Employee Daily Accomplishment Report")
- Optional logo image URL (used via =IMAGE() formula in the sheet; if empty, leave the logo cell blank)
- Core function row: duty description (default "Development of ERP- Customer Services Management System-BCA.") and Major Final Output text (default "Customer Services Management System\n- Billing\n- Collection")
- Support function rows (editable list, defaults):
  - "Good Governance" → two MFO sub-rows: "Compliance to COA Findings (AOMs) and Liquidation of Cash Advances" and "Submission of duly signed and approved PAR/ICS"
  - "Attend Forums, Supervisor and Staff meetings and facilitate committee activities" → "All meetings are attended and facilitated committee activities on scheduled time"
  - "Submits reports" → "Quarterly and other reports assigned"
- Signatories: Prepared by (name + title), Confirmed by (name + title), Noted by (name + title)
- GitHub PAT field (password input, saved locally)

**Step 2 — Dates & Repo selection:**
- Fetch and show the user's repos (owned + collaborator) in a searchable AntD Select; allow selecting ONE OR MORE repos
- For each selected repo, fetch branches and let user pick a branch (default: default branch)
- An AntD Calendar / multi-date picker where the user clicks their exact attendance dates (these come from an attendance sheet — do NOT auto-skip weekends or infer anything; only the clicked dates count, any number of them)
- Auto-derive and display: "Period Covered" = first selected date – last selected date (formatted like "June 18 - July 2 2026"), "Actual No. of Days Attended" = count of selected dates, "Date Submitted" = today (editable)

**Step 3 — Fetch commits & redistribute:**
- Fetch all commits authored by the authenticated user on the selected repo/branch combos between the first and last selected date (inclusive). Use the List Commits endpoint per repo with `author`, `sha` (branch), `since`, `until`; handle pagination
- Deduplicate by SHA, sort all commits chronologically into one pool
- **Redistribution algorithm (critical requirement):** assign commits to the N selected dates such that:
  - Every commit is used AT MOST once (no duplicates across days)
  - Each commit is preferably assigned to its actual commit date if that date is selected
  - If a selected date has NO commits, it "borrows" the nearest unassigned commits from adjacent days that have a surplus — i.e., split the chronologically sorted commit list into N contiguous, non-empty groups (one per selected date, in date order), keeping commits as close to their real dates as possible. If there are fewer commits than dates, some days stay empty (blank editable field)
  - Implement this as a pure, unit-testable function: `distribute(commits: Commit[], dates: string[]): Map<string, Commit[]>`
- For each date, produce a single "accomplishment" text by combining that day's commit messages: strip conventional-commit prefixes (feat:, fix:, chore:), deduplicate similar lines, join into a short readable summary (line breaks between distinct items)

**Step 4 — Preview & edit:**
- Editable AntD Table: one row per selected date, columns = Day #, Date, Weekday, Raw commits (expandable), Final accomplishment (editable textarea)
- User can rewrite any cell before generating

**Step 5 — Generate Google Sheet:**
- Create a NEW spreadsheet in the user's Drive named like `DAR - {Name} - {Period}`
- Reproduce the official DAR layout with **dynamic column count = number of selected dates** (do NOT hardcode 9 columns). Layout spec:
  - Top: centered org name (bold, dark blue), address line (olive/gold, bold), blank row, centered report title (bold). Logo cell above/left of the org name using =IMAGE(url) if a logo URL was provided
  - Info block (left): label column with tan/peach background (#FCE4C4-like) and bold labels: Name of PBE / Position Title / Department / Unit / Immediate Supervisor / Period Covered, values beside them, thin borders. Right side: "Date Submitted :" and "Actual No. of Days Attended :" bold labels with values
  - "SPECIFIC DUTIES AND RESPONSIBILITIES: Please indicate the actual accomplishment" cell, and a merged yellow (#FFFF00) "DAYS" header spanning all N day columns, with numbered sub-headers 1..N, then a date row (e.g., "18-Jun") and weekday row (e.g., "THU") with peach background (#FBD5B5-like), all bordered and centered
  - Section "A.) CORE FUNCTIONS" | "MAJOR FINAL OUTPUT (MFOs)" header row (peach background, bold, centered), then row 1: number, duty description, MFO text, and one accomplishment cell per selected date (wrapped text, top-aligned, thin borders)
  - Repeat date/weekday header rows, then "B.) SUPPORT FUNCTIONS" | "MINOR FINAL OUTPUT (MFOs)" header (peach), then the support rows (numbered 5, 6, 7) with their MFO texts and EMPTY per-day cells
  - Footer: "Prepared by:", "Confirmed by:", "Noted by:" labels, then signatory names (bold) and titles below
  - Use Sheets API batchUpdate for: merged cells, cell backgrounds, bold fonts, borders, text wrap, column widths (narrow label columns, ~110px day columns), and frozen appearance similar to the original form
- After creation, show the spreadsheet URL as a clickable "Open in Google Sheets" button

## Error handling & UX
- Clear AntD message/notification errors for: invalid PAT, GitHub rate limit, no commits found, Google auth failure/expired token (re-prompt token via GIS), Sheets API errors
- Loading states on every async action
- A "Reset settings" option

## Deliverables
1. Complete project code (all files) with clean structure: `src/api/github.ts`, `src/api/googleSheets.ts`, `src/lib/distribute.ts` (+ a few unit tests for it), `src/components/...`, typed models
2. `README.md` with:
   - How to create the GitHub PAT (scopes needed)
   - Step-by-step Google Cloud setup: create project → enable Google Sheets API + Google Drive API → configure OAuth consent screen (external, test users) → create OAuth **Web application Client ID** → add the Vercel domain and http://localhost:5173 to Authorized JavaScript origins → put the Client ID in an env var `VITE_GOOGLE_CLIENT_ID`
   - Local dev instructions and Vercel deployment steps (env var setup included)
3. No backend, no server-side code, no client secrets anywhere

Build the whole thing now — do not give me a partial skeleton. If something cannot work exactly as specified in a pure browser app, implement the closest working alternative and note it in the README.
