# DAR Generator

Builds the **Project-Based Employee Daily Accomplishment Report** (DAR) from your GitHub commit
history and writes it into a new Google Sheet, laid out like the official form.

Everything runs in the browser. There is no backend, no server, and no client secret anywhere: the
GitHub Personal Access Token lives in `localStorage` on your own device, and Google access is
granted per-session through the Google Identity Services sign-in popup. It deploys to Vercel as a
plain static site.

## How it works

1. **Profile & Settings** — your name, position, department, unit, supervisor, the org header lines,
   the core function and its Major Final Output, the support functions and their Minor Final Outputs,
   and the three signatories. All of it is editable and saved locally, so every user of the deployed
   app keeps their own profile.
2. **Dates & Repos** — pick one or more repositories and, for each, **one or more branches**, then
   click the exact dates from your attendance sheet. Nothing is inferred: weekends and holidays are
   included if you click them, skipped if you don't. Period Covered, the day count and Date Submitted
   derive from your picks.
3. **Commits** — fetches every commit you authored on the selected repo/branch pairs between the
   first and last attended date, paginated and deduplicated by SHA.

   A branch's history already contains everything merged into it, so `development` covers merged
   feature work. Branches that are still open, or that merged after the reporting period, need to be
   selected explicitly or their commits will not show up. Selecting several branches that share
   history is safe: the same commit comes back once per branch that contains it, and SHA
   deduplication collapses it to one.
4. **Preview & Edit** — one row per attendance date, with the raw commits expandable and the final
   accomplishment text editable. What you see here is exactly what lands in the sheet.

   The accomplishment sentence is written from **the code you actually changed**, not from your
   commit messages. For every commit the app pulls the changed files and their diffs, then sends each
   day's changes to Gemini, which writes one 80–100 character sentence describing what was
   accomplished. A live character count flags any cell outside that range. Without a Gemini API key
   the app falls back to cleaned-up commit messages and says so.
5. **Generate** — signs you in to Google and creates the spreadsheet in your Drive.

### The redistribution rule

`src/lib/distribute.ts` is a pure function, `distribute(commits, dates)`, unit-tested in
`src/lib/distribute.test.ts`:

- every commit is used **at most once** — never duplicated across days;
- a commit stays on its **real commit date** whenever you attended that date;
- otherwise it moves to the **nearest attended date**, which keeps the day buckets contiguous and in
  chronological order. An exact tie (e.g. Saturday work between a Thursday and a Monday) goes to the
  **earlier** day;
- an attended day with no commits of its own **borrows** from the nearest neighbour that has a
  surplus, shifting commits along the chain so chronological order survives;
- with **fewer commits than days**, the leftover days simply come through blank and you type them in.

Each day's commit messages are then collapsed into one cell: conventional-commit prefixes
(`feat:`, `fix:`, `chore:`, …) are stripped, merge commits dropped, near-duplicates removed, and the
rest joined one per line.

## GitHub token

Create a token at [github.com/settings/tokens](https://github.com/settings/tokens):

- **Fine-grained token** (recommended) — grant it access to the repositories you report on, with
  **Repository permissions → Contents: Read-only** and **Metadata: Read-only**.
- **Classic token** — the `repo` scope covers private repos; `public_repo` is enough if all the
  repositories you report on are public.

Paste it into Profile & Settings. It is stored in `localStorage` and sent only to `api.github.com`.

## Gemini API key

Create one **free** at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and paste it
into Profile & Settings. It is stored in `localStorage` and sent only to
`generativelanguage.googleapis.com` (the browser calls the API directly — there is no backend to
proxy through).

Each generated report is a **single request** carrying the diffs for your whole attendance period, so
one DAR costs one request. Gemini's free tier allows far more than that per day, so in practice this
costs nothing. The response uses a JSON schema keyed by date, so the day-to-sentence mapping cannot
drift.

Google retires Gemini models fairly often (a retired model returns `404 … no longer available to new
users`), so [gemini.ts](src/api/gemini.ts) tries a list of models in order — currently
`gemini-3.5-flash`, then `gemini-3.1-flash-lite`, then `gemini-2.5-flash` — and falls through on a
404. If they all go, update `MODELS` in that file from
[ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models).

If you hit a `429`, that's the free-tier per-minute limit — wait a minute and press **Rewrite from
code changes** again.

**Note on browser-side keys:** anyone with access to this browser profile can read the key out of
`localStorage`, exactly as with the GitHub PAT. That is the unavoidable cost of a no-backend app. In
Google Cloud you can restrict the key to the Generative Language API, and you shouldn't paste one
into a shared machine.

## Google Cloud setup

You need one **Web application OAuth Client ID**. No client secret is used or needed.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and **create a project**.
2. **APIs & Services → Library**: enable both **Google Sheets API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name and support
   email. Under **Data access**, add the scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`

   While the app is in **Testing**, add every person who will use it under **Audience → Test users**.
   (Publishing the app removes that limit; both scopes are sensitive, so publishing to the general
   public would require Google verification. For a small team, test users are the simple path.)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**.
   Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173`
   - your Vercel domain, e.g. `https://dar-generator.vercel.app`

   Leave **Authorized redirect URIs** empty — the GIS token flow does not use one.
5. Copy the Client ID (`…apps.googleusercontent.com`) into `VITE_GOOGLE_CLIENT_ID`.

The `drive.file` scope means the app can only see and touch the files it creates itself; the rest of
your Drive stays invisible to it.

## Local development

```bash
npm install
cp .env.example .env        # then paste your Client ID into VITE_GOOGLE_CLIENT_ID
npm run dev                 # http://localhost:5173
npm test                    # unit tests for the distribution logic
npm run build               # typecheck + production build into dist/
```

## Deploying to Vercel

1. Push this repo to GitHub and **Import Project** in Vercel. The framework preset is **Vite**;
   `vercel.json` already pins the build command (`npm run build`) and output directory (`dist`).
2. **Settings → Environment Variables**: add `VITE_GOOGLE_CLIENT_ID` with your Client ID, for the
   Production, Preview and Development environments. Vite inlines it at build time, so redeploy after
   changing it.
3. Add the resulting `https://<project>.vercel.app` origin to **Authorized JavaScript origins** in
   Google Cloud (step 4 above). Preview deployments get their own URLs — add any you intend to sign
   in from, or just use the production domain.

Users can also paste their own Client ID in Profile & Settings, which overrides the build-time one —
handy if someone wants to run the app against their own Google Cloud project.

## Notes on the generated sheet

- The number of day columns is **derived from how many dates you picked** — nothing is hardcoded to 9.
- Reproduced from the official form: the dark-blue org name and olive address, the tan info block,
  the yellow merged **DAYS** banner with numbered sub-headers, the date/weekday header pair repeated
  above both sections, **A.) CORE FUNCTIONS / MAJOR FINAL OUTPUT (MFOs)** with one accomplishment cell
  per day, **B.) SUPPORT FUNCTIONS / MINOR FINAL OUTPUT (MFOs)** with empty day cells, and the three
  signatory blocks. Merges, fills, borders, bold, text wrapping, column widths and row heights all go
  through one Sheets `batchUpdate`.
- The first three columns are frozen, which is the closest equivalent to the original form's layout
  in a live spreadsheet.
- A logo URL is inserted with `=IMAGE(url)` and must be publicly reachable for Sheets to render it;
  leave it blank and the logo cell stays empty. The logo sits in the leftmost column of the header
  block rather than floating over it, since Sheets cannot place a floating image via the values API.
- If you pick very few dates (fewer than three), there is not enough width for the *Date Submitted* /
  *Actual No. of Days Attended* block to sit on the right, so it stacks under the info block instead
  and the signatories stack vertically. With a normal reporting period the layout matches the form.

## Known browser-only trade-offs

- **Commit authorship** is matched by GitHub account (the `author` parameter of the List Commits
  endpoint). If you commit under an email that is not attached to your GitHub account, those commits
  will not match; the app notices when the filter returns nothing and falls back to showing every
  commit on the selected branches, telling you it did so. You can also untick *Only commits authored
  by me*.
- **Rate limits** are the standard authenticated GitHub limits (5,000 requests/hour). The app reads
  the rate-limit headers and tells you when the window resets.
- **Popups** must be allowed for the Google sign-in to appear.
