# IMTIAZ VET DASHBOARD — Data & Files Guide (English)

This document explains the data structure, file relationships, and known inconsistencies so any new developer/session can understand the project quickly.

---

## 1. PROJECT OVERVIEW

- **Name:** لوعة متابعة الامتياز البيطرى (Vet Internship Follow-up Dashboard)
- **College:** كلية الطب البيطري — جامعة القاهرة (Faculty of Veterinary Medicine, Cairo University)
- **Year:** 2026 / 2027
- **Purpose:** Track veterinary internship rotations across 5 rounds (راوندات) for student groups.
- **Live site:** `bbc07288.imtiaz-dashboard.pages.dev` (GitHub Pages)
- **Repo:** `https://github.com/YahyaBadr/imtiaz-dashboard`

---

## 2. FILE STRUCTURE (`public/`)

```
public/
├── index.html              # Main HTML shell + nav buttons + page divs
├── config.js               # App configuration (gate, timezone, aliases)
├── style.css               # All CSS including dark mode overrides
├── app.js                  # Core JS: gate, dates, data layer, PAGE_RENDERERS
├── icons.js                # SVG icons
├── sw.js                   # Service Worker (NOT registered — cache disabled)
├── manifest.json           # PWA manifest
├── pages/
│   ├── overview.js         # Dashboard overview page
│   ├── schedule.js         # Matrix/schedule page
│   ├── rounds.js           # Round 1-5 pages + Round 2 domain subpages
│   ├── units.js            # Units page (not used — removed from nav)
│   └── not-registered.js   # Not-registered students page
├── export-*.js             # Excel/PDF export modules
├── vendor/                 # Third-party libraries (xlsx, pdfmake, etc.)
├── assets/                 # Logos, images
└── data/                   # Local CSV data files (used for testing / fallback)
    ├── 01_students.csv
    ├── 02_groups_r2.csv
    ├── 03_rounds_overview_r2.csv
    ├── 04_round_schedule_r2.csv
    ├── 05_stations_units_draft_r2.csv
    ├── 06_assignments_round2_r2.csv
    ├── 07_unregistered_round2_r2.csv
    ├── 08_round2_summary_r2.csv
    ├── 09_round_dates_r2.csv
    ├── 10_fields_r2.csv
    └── master_students.csv
```

---

## 3. DATA SOURCES & CSV FILES

All data comes from **Google Sheets** via Apps Script. Local CSV files in `public/data/` are used for local testing/fallback.

### Key tables:

| File | Purpose |
|------|---------|
| `01_students.csv` / `master_students.csv` | Student master data (raw_code, full_name, group_id, gender, phone, etc.) |
| `02_groups_r2.csv` | Group definitions |
| `03_rounds_overview_r2.csv` | Round overview (names, dates, keys) |
| `04_round_schedule_r2.csv` | **Round schedule: group_id → round_order → round_key** (this is the SOURCE OF TRUTH for domain assignment) |
| `05_stations_units_draft_r2.csv` | Vet unit stations (name, registered count, group_id) |
| `06_assignments_round2_r2.csv` | **Student registrations for Round 2** (student_code, group_id, round_key, unit_name, rotation_order, etc.) |
| `07_unregistered_round2_r2.csv` | Unregistered students for Round 2 |
| `08_round2_summary_r2.csv` | Summary counts per domain (registered, not_registered, expected) |
| `09_round_dates_r2.csv` | Round start/end dates |
| `10_fields_r2.csv` | Field preferences (pref_Poultry, pref_Equine, etc.) |

---

## 4. ROUND 2 (R2) STRUCTURE — THE CORE

Round 2 is the active cycle. It has **5 training domains (fields)**:

| Domain Key | Arabic Label | Groups in Round 2 |
|------------|--------------|-------------------|
| `units` | وحدات بيطرية (Vet Units) | Groups 1, 6 |
| `college` | أقسام الكلية (College Departments) | Group 2 |
| `slaughter` | مجازر وسلامة غذاء (Slaughter & Food Safety) | Groups 3, 4 |
| `poultry` | دواجن (Poultry) | Groups 7, 8 |
| `equine_lab_fish` | خيل ومعامل وسمك (Equine/Lab/Fish) | Group 5 |

### Source of truth for domain assignment:
**`04_round_schedule_r2.csv`** — each row maps `group_id + round_order + round_key`.

Example rows (round_order = 2):
- Group 1 → `units`
- Group 2 → `college`
- Group 3 → `slaughter`
- Group 4 → `slaughter`
- Group 5 → `equine_lab_fish`
- Group 6 → `units`
- Group 7 → `poultry`
- Group 8 → `poultry`

**IMPORTANT:** The domain of a student in Round 2 is determined by **`group_id` from `04_round_schedule_r2.csv`**, NOT from `round_key` in `06_assignments_round2_r2.csv` (which stores `units` for everyone).

---

## 5. DATA INCONSISTENCY — THE BIGGEST BUG SOURCE

There is a **group_id mismatch** between tables for some students.

### Case study: Nejma Adel ( student_code `11012021100676` )

| Table | group_id | round_key | Notes |
|-------|----------|-----------|-------|
| `06_assignments_round2_r2.csv` | `1.0` | `units` | Unit: الشيخ زايد |
| `master_students.csv` | `2` | — | Different group! |

**If you use `students.group_id`**, Nejma Adel maps to Group 2 → **College** (WRONG).
**If you use `assignments.group_id`**, Nejma Adel maps to Group 1 → **Units** (CORRECT).

### Fix implemented:
In `public/pages/rounds.js`, `r2StudentsForKey()` and `getRosterForRoundOrder()` now use **`row.group_id` from the assignments/unregistered source table** to determine the domain, and `resolveStudent()` only for display fields (name, gender, code).

---

## 6. STUDENT NAME UNIFICATION

Students appear in multiple tables with different formats:
- `master_students.csv`: `raw_code` (short, e.g. `449`, `676`) or full `student_code` (`11012021100676`)
- `06_assignments_round2_r2.csv`: `student_code` (full, e.g. `11012021100676`) + `code_short` (`676`)

### Matching order in `resolveStudent()` (`app.js`):
1. `student_code` exact match (most reliable)
2. `group_id` + `code_short` match
3. **Full name match** (normalized Arabic) — fallback for students missing codes in one table

---

## 7. EQUINE / LAB / FISH ROTATION (Group 5)

Group 5 rotates through 3 subunits every 2 weeks:
- **Sequence:** Horse (خيل) → Fish (سمك) → Lab (معامل)
- **Cycle length:** 6 weeks total (2 weeks per subunit)
- **Round 2 dates:** 2026-11-07 to 2026-12-24

### Fields in assignments for equine students:
- `rotation_order`: e.g. `خيل>سمك>معامل` or `يبدأ خيل`
- `sub_unit_start`: starting subunit

### Code:
- `parseSubRotation()` in `app.js` — parses rotation string into sequence
- `subUnitAtDate()` — computes current subunit based on date + 2-week blocks
- `studentSubUnitNow()` — returns current subunit for a student
- Displayed in `renderRound2Domain()` as column "التناوب الآن" (Rotation Now)

---

## 8. CACHE BUSTING — CRITICAL FOR DEPLOYMENT

**Every time you make code changes and want them to appear immediately on the live site, you MUST change the version number in `index.html`.**

### Location: `public/index.html`

All script and stylesheet links use a cache-busting query parameter:

```html
<link rel="stylesheet" href="style.css?v=999">
<script src="config.js?v=999"></script>
<script src="app.js?v=999"></script>
<script src="pages/rounds.js?v=999"></script>
...
```

### Procedure:
1. Make your code changes in `public/`
2. Change `?v=999` to `?v=1000` (or any new number) in `index.html` — **use `replaceAll` to change all occurrences**
3. Commit and push to `origin/main`
4. GitHub Pages will deploy within 1–2 minutes
5. Users will get the new files automatically (no hard refresh needed because of the new `v=` value)

### Why this exists:
- GitHub Pages + browsers cache JS/CSS aggressively
- Without changing `v=`, users see the old version until they hard-refresh (`Ctrl+F5`)
- The Service Worker (`sw.js`) was **removed/disabled** to prevent stale cache

---

## 9. SERVICE WORKER STATUS

- **File:** `public/sw.js`
- **Status:** EXISTS but **NOT registered** (registration code removed from `app.js`)
- **Reason:** SW was caching old versions of `app.js`, `rounds.js`, `style.css`, causing users to see outdated code even after deployment.
- **CACHE_VERSION:** was `imtiaz-v17`, bumped to `imtiaz-v18` before removal.
- If you ever want to re-enable SW, add `registerSW()` call back in `bootAfterUnlock()` and increment `CACHE_VERSION` on every deploy.

---

## 10. PAGE ROUTING (`PAGE_RENDERERS` in `app.js`)

| Page ID | Renderer | Notes |
|---------|----------|-------|
| `overview` | `renderOverview()` | Dashboard summary |
| `schedule` | `renderSchedule()` | Matrix view |
| `round-1` | `renderRoundPage('1')` | Placeholder |
| `round-2` | `renderRoundPage('2')` → `renderRound2Hub()` | Round 2 hub with 5 domain cards |
| `round-2-units` | `renderRound2Units()` | Units subpage under Round 2 |
| `round-2-college` | `renderRound2College()` | College subpage |
| `round-2-equine` | `renderRound2Equine()` | Equine/Lab/Fish subpage (with rotation column) |
| `round-2-slaughter` | `renderRound2Slaughter()` | Slaughter subpage |
| `round-2-poultry` | `renderRound2Poultry()` | Poultry subpage |
| `round-3` | `renderRoundPage('3')` | Placeholder |
| `round-4` | `renderRoundPage('4')` | Placeholder |
| `round-5` | `renderRound0Elective()` | Elective training (standalone, NOT under Round 2) |
| `not-registered` | `renderNotRegistered()` | Unregistered students |

**Removed:** `units` standalone page and `round-2-elective` (elective is now Round 5 standalone).

---

## 11. HOW TO MAKE CHANGES APPEAR IMMEDIATELY

1. Edit files in `public/` (e.g. `app.js`, `rounds.js`, `style.css`, `index.html`)
2. **Change `?v=999` to a new number in ALL script/link tags in `index.html`**
3. `git add public/ && git commit -m "your message" && git push`
4. Wait ~1–2 minutes for GitHub Pages to deploy
5. Site shows new version automatically — no hard refresh needed for returning users (because of new `v=` value)

---

## 12. KNOWN ISSUES / TODO

- [ ] Round 1, 3, 4 are placeholders (no real data yet)
- [ ] Round 5 (elective) is a placeholder page
- [ ] Unregistered students display uses `u.group_id` from unregistered table directly
- [ ] PDF export uses `export-core.js`, `export.js`, `export-assets.js`
- [ ] Dark mode CSS overrides are in `style.css` under `html.dark` blocks

---

*Generated automatically for onboarding new sessions. Last updated: commit history on `origin/main`.*
