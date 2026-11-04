# Imtiaz Dashboard — لوحة متابعة الإمتياز البيطري

A responsive, installable **PWA dashboard** for tracking the veterinary internship (الإمتياز البيطري) program at the **Faculty of Veterinary Medicine, Cairo University**. It visualizes student rotation rounds, group assignments, unit placements, and unregistered students — all in Arabic (RTL).

Data is sourced live from a Google Spreadsheet via a Google Apps Script Web App API, with offline caching so the dashboard keeps working without a connection.

## Features

- 📊 **Pages**: Overview (الملخص), Rotation Matrix (المصفوفة), Rounds (الراوند ١–٤), Units (الوحدات), Unregistered Students (غير المسجلين)
- 📱 **PWA / installable** — service worker caches the app shell; works offline with the last-known data
- 🌐 **Arabic RTL UI** with the self-hosted Cairo font, fully responsive (desktop & mobile)
- 🔍 **Arabic-aware search** (normalizes أ/إ/آ, ى/ي, ة/ه, diacritics, Arabic numerals)
- 🖥️ **Presentation mode** (hides contact numbers for projector display) and 🖨️ print styles
- 🗃️ **Offline data cache** in `localStorage` with per-sheet fallback and merge on partial fetch failures
- ⏱️ All dates computed in the **Africa/Cairo** timezone
- 🛡️ No inline `onclick` handlers — actions are wired via `data-action` attributes with HTML escaping

## Tech Stack

- **Frontend:** vanilla JavaScript (no framework, no build step), plain CSS
- **Server:** zero-dependency Node.js static file server (`server.js`)
- **Data:** Google Sheets → Google Apps Script Web App (JSON), parsed client-side
- **Libraries (vendored):** SheetJS (xlsx.full + xlsx-js-style) and pdfmake (PDF) / docx (Word) / jszip (ZIP) in `public/vendor/` — fully offline, no CDN.

## Project Structure

```
.
├── server.js              # Zero-dependency Node static server (port 4700)
├── package-lock.json      # Project metadata (no dependencies)
└── public/                # Web root served by server.js
    ├── index.html         # App shell (RTL, PWA meta, nav tabs)
    ├── app.js             # Core: data fetching, caching, dates, search, install
    ├── config.js          # ⚙️ All user-editable settings (API URL, flags, dates)
    ├── sw.js              # Service worker (offline cache; bump CACHE_VERSION on redeploy)
    ├── manifest.json      # PWA manifest
    ├── style.css          # Main styles
    ├── cairo.css          # Self-hosted Cairo font styles
    ├── print.css          # Print-only styles
    ├── pages/             # Page renderers
    │   ├── overview.js
    │   ├── schedule.js
    │   ├── units.js
    │   └── not-registered.js
    ├── vendor/           # Vendored libs (xlsx.full.min.js, xlsx-js-style.min.js, pdfmake, docx, jszip, vfs_fonts)
    └── assets/            # Logos + Cairo font files (woff2)
```

## Getting Started

### Requirements

- Node.js ≥ 14 (only needed for local serving; the app itself has no runtime dependencies)

### Run locally

```bash
node server.js
```

Then open **http://localhost:4700**.

The server serves everything in `public/`, blocks directory traversal, sets correct MIME types, and disables caching (`Cache-Control: no-cache`) so edits show up immediately.

## Configuration (`public/config.js`)

All settings live in a single file: `public/config.js` → `window.APP_CONFIG`. Edit values, save, then push to GitHub (Cloudflare redeploys automatically).

| Key | Description |
|---|---|
| `API_URL` | Google Apps Script Web App URL that reads the Sheet. Set to `""` to load local CSVs from `./data/` for offline testing. |
| `OFFLINE_CACHE` | Cache the latest data in the browser so the dashboard works without internet. |
| `REQUEST_TIMEOUT_MS` | Timeout per sheet request (default 30000). |
| `TIMEZONE` | Timezone for all date calculations (`Africa/Cairo`). |
| `LAST_DATA_UPDATE` | Date shown in the header badge. |
| `ACADEMIC_YEAR` | Academic year label. |
| `VICE_DEAN_EMAIL` | Contact email shown in the app. |
| `SHOW_DATA_NOTES` | Feature flag: data-quality notes page. |
| `SHOW_NID_BY_DEFAULT` | Show national IDs directly (otherwise masked). |
| `PRESENTATION_MODE` | Projector mode (hides contact details). |
| `DEFAULT_ROUND_DATES` | Fallback round start/end dates, used only if sheet `09_round_dates` is empty. |

## Data Sources (Google Sheets)

The app fetches these sheets in parallel from `API_URL` (each as `?sheet=<name>`):

| Key | Sheet / CSV | Required |
|---|---|---|
| `students` | `master_students` | ✅ |
| `groups` | `02_groups_r2` | ✅ |
| `roundsOverview` | `03_rounds_overview_r2` | |
| `roundSchedule` | `04_round_schedule_r2` | ✅ |
| `stationsUnits` | `05_stations_units_draft_r2` | ✅ |
| `assignments` | `06_assignments_round2_r2` | ✅ |
| `unregistered` | `07_unregistered_round2_r2` | ✅ |
| `round2Summary` | `08_round2_summary_r2` | ✅ |
| `roundDates` | `09_round_dates_r2` | |
| `fields` | `10_fields_r2` | ✅ |
| `issues` / `issuesR2` | `00_data_issues_r2` / `00_data_issues_round2_r2` | |
| *(auth)* | `Accounts` (via `GATE.USERS_SHEET_NAME`) | gate |

If some sheets fail to fetch, the last cached copy is used as a fallback; the Apps Script must be published as *Execute as “Me”* + *Access: Anyone*.

## Deployment

The site is designed to deploy from GitHub via **Cloudflare Pages/Workers** (push → auto-redeploy). Any static host that serves the `public/` folder works too.

**After each redeploy:** bump `CACHE_VERSION` in `public/sw.js` (e.g. `imtiaz-v21`) so clients pick up the new app shell.

## Development Notes

- There is **no build step** — edit files in `public/` and refresh.
- Keep all configuration in `config.js`; do not add a second copy of it.
- Add new interactive elements using `data-action` attributes (see `window.act()` in `app.js`) instead of inline handlers, and always escape dynamic text with `window.esc()`.
- The service worker only precaches the app shell; sheet data is cached separately in `localStorage` under `imtiaz_data_cache_v2`.

## License

Private/internal use — Faculty of Veterinary Medicine, Cairo University. Not indexed (`robots: noindex, nofollow`).
