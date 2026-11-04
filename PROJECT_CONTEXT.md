# Imtiaz Dashboard — Project Context Map

Quick-reference of every file, its purpose, and the end-to-end data flow.
Read this first instead of re-scanning the whole tree.

> Backup snapshot: `backup_pre_round2_migration/` + git commit `6d64ba5`
> Message: `pre-round2-migration-backup` (23 files, 3440 insertions).
> Revert: `git checkout 6d64ba5 -- public/data public/pages` or
> `git reset --hard HEAD~1` to drop the backup commit itself.
> Current mode: `API_URL: ""` in `public/config.js` → **local CSVs only, zero external requests**.

---

## 1. Repository layout (root)

| File / Dir | Purpose |
|---|---|
| `server.js` | Zero-dependency Node static server, port 4700. Serves `public/`, blocks directory traversal, sets MIME types, `Cache-Control: no-cache`. Never touches data. |
| `README.md` | Setup / config / deployment notes (Cloudflare Pages). |
| `appsscript.gs.js` | Empty placeholder — the real Apps Script lives in Google, not in this repo. |
| `package-lock.json` | Project metadata only; no npm dependencies. |
| `PROJECT_CONTEXT.md` | This file. |
| `backup_pre_round2_migration/` | Pre-refactor snapshot of `public/data/` + `public/pages/` (committed). |
| `public/` | **Web root** — everything the browser loads. See §2. |
| `test/` | `server.py` + `e2e.py` + `gen_data.py` + `data/` — Python test harness / synthetic data generator. |
| `.dl/`, `.tmp-vendor/` | Local download / vendoring scratch dirs (not app code). |
| `.gitignore` | Ignores scratch dirs. |

## 2. `public/` — the app

### Shell & config

| File | Purpose |
|---|---|
| `index.html` | RTL Arabic app shell. Header, nav tabs (`data-action="page"`), `<main>` with one `<div id="page-*">` per page, loading/error screens, gate overlay, export menu, toast. Loads `config.js` first, then `icons.js`, `app.js`, `export-*.js`, `pages/*.js`; calls `window.AppBoot()`. |
| `config.js` | **Single source of settings** → `window.APP_CONFIG`: `API_URL`, `OFFLINE_CACHE`, `REQUEST_TIMEOUT_MS`, `TIMEZONE`, `LAST_DATA_UPDATE`, `GATE{...}`, feature flags, `DEFAULT_ROUND_DATES`. Edit here only; never duplicate. |
| `sw.js` | Service worker (PWA). Precaches app shell only. **Never caches Apps Script data** (network-only for `script.google.com`). `CACHE_VERSION = 'imtiaz-v21'` — bump on redeploy. |
| `manifest.json`, `assets/*`, `*.css` | PWA manifest, logos, Cairo font, main/print styles. |

### Core JS

| File | Purpose |
|---|---|
| `app.js` | **The core (~1835 lines).** Gate, data layer (`SHEETS`, `fetchSheetRaw`, `normalizeRows`, `buildDB`), dates (Africa/Cairo), search, overlays/modals, student profiles, PWA install, page routing (`PAGE_RENDERERS`, `showPage`), unified `data-action` click handler, splash, boot (`AppBoot`/`init`/`bootAfterUnlock`). |
| `icons.js` | SVG icon set (`iconSvg()`, `ico()`). |
| `export.js`, `export-core.js`, `export-assets.js` | In-browser file generation (xlsx/pdf/docx/csv) using vendored libs in `public/vendor/`. No network. |

### Pages (renderers — pure `container.innerHTML = ...`, read global `DB`)

| File | Exported fn | Page / Reads |
|---|---|---|
| `pages/overview.js` | `renderOverview(el)` | `page-overview` — hero stats, R2 summary cards, field preferences, per-group current round, groups/gender table. Reads `DB.groups`, `DB.round2Summary`, `DB.stationsUnits`, `DB.roundSchedule`, `DB.students`, `DB.unregistered`. |
| `pages/schedule.js` | `renderSchedule(el)` | `page-schedule` — rotation matrix (groups × rounds 1-4 + elective). Horizontal table ≥1200px, stacked cards below. Reads `DB.roundSchedule`, `DB.groups`, `DB.roundMatrix`, `DB.unregistered`. |
| `pages/rounds.js` | `renderRoundPage(order)` | `page-round-1..4` — roster cards per round + elite student profile. Reads `DB.roundSchedule`, `DB.assignments`, `DB.students`, `getUnitAssignments()`. |
| `pages/units.js` | `renderUnits(el)` | `page-units` — veterinary unit cards + per-unit student lists, print/copy. Reads `DB.stationsUnits`, `DB.assignments` via `getUnitAssignments()`, `DB.studentLookup`. |
| `pages/not-registered.js` | `renderNotRegistered(el)` | `page-not-registered` — unregistered students grouped by round → group. Reads `DB.unregistered`. |

### Data

| Path | Purpose |
|---|---|
| `public/data/*.csv` | **Local data source when `API_URL === ""`.** One CSV per sheet (see §3). `Accounts.csv` = auth. `raw_form_responses/` = untouched raw form exports (reference only, never fetched). |

## 3. Data flow (end to end)

```
Google Sheet ──Apps Script Web App (doGet ?sheet=<name>)──┐   (live mode only)
                                                            ├─► fetchSheetRaw(name)  [app.js:892]
public/data/<name>.csv ────────────────(API_URL === "")───┘        │
                                                                   ▼
                                                     normalizeRows → toRows + normKey/normCell
                                                                   ▼
                              fetchAllSheets() — Promise.allSettled(11 sheets, 1 retry)
                                                                   ▼
                              refreshData() — merge {...cached, ...fresh}; fingerprint check
                                                                   ▼
                              buildDB(sheets) — Arabic→English columns, gender/phone/group
                                               coercion, round_key/round_order resolution,
                                               roster-based group counts  →  window.DB
                                                                   ▼
                              showPage(id) → PAGE_RENDERERS[id] → container.innerHTML
                                                                   ▼
                              delegated click on [data-action] → ACTIONS map → modals/profiles
```

### 3.1 Fetch — `fetchSheetRaw` is the single choke point

```js
base = CFG().API_URL;
if (!base) → fetch('./data/' + name + '.csv', {cache:'no-store'}) → parseCSV → normalizeRows
else       → fetch(base + '?sheet=' + name + '&key=' + API_TOKEN)  → JSON.parse → normalizeRows
```

- Every caller funnels here: `fetchSheet` (gate-checked), `fetchSheetRetry`,
  `fetchAllSheets`, and `Gate.fetchAccounts` via `window.__gateFetchSheet`.
- **Verified**: with `API_URL: ""`, all 12 requests resolve to `./data/*.csv`.
  The live branch is unreachable (unconditional `return` in the `!base` branch);
  no `XHR`/`WebSocket`/`sendBeacon` anywhere. Only external URL in code is
  the generated `wa.me` link (`waLink()`), never fetched.
- **Sheet map** (`SHEETS`, app.js:862) — key → sheet/CSV basename:

| DB key | Sheet / CSV | Required |
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

### 3.2 Gate (before any data)

`Gate.init()` blocks `init()` until unlocked. `MODE:'sheet'` fetches the
`Accounts` tab through the **same** `fetchSheetRaw` → `./data/Accounts.csv`
in local mode. Password hashed in-browser (FNV-1a for sheet mode, SHA-256
for local passphrase), session in `localStorage`. `lock()` wipes
`imtiaz_data_cache_v3_r2`. Rate limit: 5 attempts → 30s lockout.

### 3.3 Cache

- `localStorage['imtiaz_data_cache_v2'] = {ts, sheets}` — data only, separate
  from the SW app-shell cache.
- Boot: cache hit + all required sheets → instant paint from cache, then
  silent background `refreshData()`. Miss → `refreshData({firstPaint:true})`.
- Partial failure: failed sheet keeps its cached copy (`{...cached, ...fresh}`).
  Cache rewritten only when **all** sheets succeed. `fingerprint()` skips
  rebuild if unchanged.
- SW: `script.google.com` bypassed (network-only); everything else
  cache-first with background refresh.

### 3.4 `buildDB` normalization

1. Arabic headers → English (`AR_COLS`, e.g. `رقم_الجروب→group_id`,
   `اسم_الطالب→full_name`), plus case/space/ZWSP-insensitive canonicalization
   against `10_fields`.
2. Coercion: `group_id`→int, `gender`→`M/F`, phone→`20`-prefixed E.164,
   `enrolled`→`registered`, empty rows dropped.
3. `round_key` normalized via `ROUND_META` (`units`, `college`, `poultry`,
   `slaughter`, `equine_lab_fish`, `elective`); `round_order` resolved from
   `round_key` / Arabic names (`الراوند ٢`) / date index.
4. Group `total_students` **recomputed from the `master_students` roster**, not
   the sheet's declared total. `DB.studentLookup`, `DB.roundMatrix`,
   `DB.fieldsMap`/`DB.prefColumns`, `DB.roundNames` built here.
5. Dates: `formatDate()`/`getTodayStr()` in `Africa/Cairo`; Apps Script
   sends UTC ISO strings — converted, never string-sliced.
6. **تاريخ الميلاد من الرقم القومي** (`window.extractBirthFromNID`): إذا كان
   `birth_date` فاضياً والرقم القومي موجود، يُستخرج التاريخ من الأرقام 2-7
   من الرقم القومي (الصيغة المصرية: قرن + سنة + شهر + يوم). مثال:
   `30304242102642` → `2003-04-24`.
7. **توحيد `student_code` من `raw_code`**: في `normalizeRows`، إذا كان
   `student_code` فاضياً و`raw_code` موجود، يُحول `raw_code` إلى الكود
   الكامل `1101202110` + 4 أرقام (مثال: `676` → `11012021100676`) ليتطابق
   مع `student_code` في جدول التسجيلات (`assignments`). هذا يحل مشكلة فقدان
   بيانات طلاب مثل "نعمة عادل عزالدين" الذين الكود القصير لديهم لا يطابق
   الكود الكامل في التسجيلات.

### 3.5 Display rules

- No framework, no build step. Renderers emit HTML strings with `esc()` on
  every dynamic value; interaction via `data-action` + one delegated listener.
- Pages render once (`dataset.rendered`), re-rendered by `rerenderAll()` on
  data change. `VERIFY.run()` cross-checks displayed counts vs list lengths.

## 4. Round 2 migration — current state & plan

**State (current):** the Round-2 migration is applied in code and local CSVs use
the `*_r2` basenames (`master_students`, `06_assignments_round2_r2`,
`07_unregistered_round2_r2`, `08_round2_summary_r2`, …). Overview labels most
sections **«الدورة الثانية (R2)»**; other pages are round-neutral.

**Applied changes (historical plan → done):**
1. Every `SHEETS` value renamed to the `*_r2` sheet (e.g. `master_students`,
   `06_assignments_round2_r2`); local CSV basenames follow the same `*_r2` suffix.
2. Local CSVs renamed to the new `*_r2.csv` basenames so local mode keeps working.
3. Data rows tagged via `round_order` / `round_key` in `normalizeRows`;
   `buildDB` applies R2 defaults (missing `round_order` → `'2'`,
   assignments fallback `round_key` → `'units'`); R2 is the default context
   (`DB.currentRound = '2'`), units logic untouched.
4. Cache key bumped `imtiaz_data_cache_v3_r2` to invalidate pre-migration snapshots.

## 5. Editing conventions

- All settings in `public/config.js` only.
- No inline `onclick` — `data-action="..."` + `window.act()` / `window.btn()`.
- Escape dynamic text with `window.esc()` (dates: `window.escDates()`).
- Bump `CACHE_VERSION` in `public/sw.js` on redeploy.
- Keep Arabic labels/values from the sheet; code stays English-keyed.
