# PLAN — Option A: QR Scan Event Log API + Mini UI

## Context

Day 5 capstone. The repo is **greenfield**: only `docs/`, `schema/`, `wireframes/`,
and `.claude/` (the `review` command + `test-writer` agent) exist — there is no
`package.json` or source code yet. We build a small Express + SQLite service that
logs factory-floor QR scan events and lists them, plus a minimal static HTML UI.

The build must follow the mandatory Day 5 workflow: Plan Mode first → commit
`PLAN.md` → scaffold → endpoint → delegate tests to `test-writer` → `npm test`
passes → `/review` → commit, repeated in small steps (8+ commits).

**Decisions locked with the user:**
- SQLite driver: **better-sqlite3** (synchronous, simple, works cleanly with
  `DB_PATH=':memory:'` test isolation that `/review` and `test-writer` expect).
- Mini UI: a **minimal static HTML page, no frontend framework**, implemented
  **only after** the API and its tests are complete.

---

## 1. Project structure

```
day5_repository/
├── package.json            # deps + scripts (NEW)
├── PLAN.md                 # committed plan (NEW)
├── CLAUDE.md               # scenario rules for Claude (NEW)
├── .gitignore              # check; add *.db if missing (see §6)
├── server.js               # http listener only: app.listen() (NEW)
├── app.js                  # Express app, mounts routes + static (NEW)
├── db.js                   # better-sqlite3 connection + schema init (NEW)
├── routes/
│   └── scans.js            # POST /scan, GET /scans (NEW)
├── validators/
│   └── scan.js             # pure validation helpers (NEW)
├── public/
│   └── index.html          # mini UI (NEW, built last)
├── tests/
│   ├── post-scan.test.js   # POST /scan tests (NEW, via test-writer)
│   └── get-scans.test.js   # GET /scans tests (NEW, via test-writer)
├── schema/option-a.sql     # existing — source of truth for the table
└── .claude/ docs/ wireframes/   # existing, unchanged
```

**Separation of concerns** (so tests can `require('app')` without opening a port):
- `server.js` only calls `app.listen()`.
- `app.js` exports the configured Express app (Supertest imports this).
- `db.js` reads `process.env.DB_PATH` (default `./data.db`), creates the
  connection, and runs the schema from `schema/option-a.sql` on startup.
- `validators/scan.js` holds pure functions returning `{ ok, error }` — easy to
  unit-reason about and reuse between routes.

---

## 2. API endpoints

| Method | Path     | Purpose                                    |
| ------ | -------- | ------------------------------------------ |
| POST   | `/scan`  | Insert one scan event, return stored row   |
| GET    | `/scans` | List recent events, newest first, paginated |
| GET    | `/healthz` | **Optional smoke/liveness endpoint** — returns `{ "status": "ok" }`. Kept intentionally small and added in the scaffold (commit 3) so the server is verifiable before any real route exists. Not part of the Option A spec; demo-only. |

---

## 3. Request and response shapes

### POST /scan
Request body (JSON):
```json
{ "qr_code": "QR-A1B2C3", "event_type": "IN", "location": "WH-01", "scanned_by": "nguyen.van.a" }
```
Success `201` — the full stored row, snake_case, matching the schema columns:
```json
{ "id": 1, "qr_code": "QR-A1B2C3", "event_type": "IN", "location": "WH-01",
  "scanned_by": "nguyen.van.a", "scanned_at": "2026-06-11T09:00:00.000Z" }
```
Error `400`:
```json
{ "error": "qr_code must match QR- followed by 6 alphanumerics" }
```

### GET /scans
Query params: `page` (default 1), `limit` (default 20).
Success `200`:
```json
{ "data": [ { "id": 42, "qr_code": "QR-A1B2C3", "event_type": "IN",
              "location": "WH-01", "scanned_by": "nguyen.van.a",
              "scanned_at": "..." } ],
  "page": 1, "limit": 20, "total": 137 }
```
- `data` is ordered **newest first** via `ORDER BY scanned_at DESC, id DESC`:
  `scanned_at` is the primary sort key (matches the schema's
  `idx_scan_events_scanned_at` index), and `id DESC` is the deterministic
  tiebreaker for rows sharing the same millisecond `scanned_at`.
- `total` = total rows in table (unfiltered), so the UI can compute page count.
- Error `400`: `{ "error": "<message>" }`.

---

## 4. Validation rules

POST /scan — each failing field returns `400` with a message **naming the field**.
Order: check missing/empty first, then format. Reject unknown/missing body too.

| Field        | Rule                                                      | Example error message |
| ------------ | --------------------------------------------------------- | --------------------- |
| `qr_code`    | required string, regex `^QR-[A-Za-z0-9]{6}$`              | `qr_code must match QR- followed by 6 alphanumerics` |
| `event_type` | required, one of `IN` / `OUT` / `MOVE`                    | `event_type must be one of IN, OUT, MOVE` |
| `location`   | required, non-empty string, length ≤ 20 (trim-aware)      | `location is required and must be 1-20 characters` |
| `scanned_by` | required, non-empty string, length ≤ 50                   | `scanned_by is required and must be 1-50 characters` |

GET /scans — `page` and `limit` must be **positive integers**:
- `page`: default `1`, minimum `1`. `page=0`, negative, non-integer, or
  non-numeric → `400`.
- `limit`: default `20`, minimum `1`, maximum `100`. `limit=101`, `limit=0`,
  negative, non-integer, or non-numeric → `400`.
- Validation uses strict integer parsing (reject `"1.5"`, `"abc"`, `"10abc"`),
  not loose `parseInt`. Example error: `limit must be an integer between 1 and 100`.

Common rules:
- Body parsed by `express.json()`; a non-object/empty body → `400`.
- **Malformed JSON** (a `SyntaxError` from `express.json()`) must be caught by a
  JSON error-handling middleware and returned as `{ "error": "invalid JSON body" }`
  with status `400` — otherwise Express returns its default HTML 400, breaking the
  required error shape.
- `location` / `scanned_by`: reject when `value.trim()` is empty; measure length
  against the raw string (`≤ 20` / `≤ 50`); **store the value as-is** (do not trim
  before insert — avoid silently altering submitted data).
- All `400` responses use exactly `{ "error": "<message>" }`.

---

## 5. SQLite schema usage

> **Rule — schema is the source of truth.** `schema/option-a.sql` defines the
> `scan_events` table and **must not be modified** unless the Option A spec
> explicitly changes. The API adapts to the schema, never the reverse. All column
> names, types, the `event_type` CHECK, and the `scanned_at` default are taken as
> given. This rule belongs in `CLAUDE.md` too so `/review` enforces it.

- Source of truth: `schema/option-a.sql` (table `scan_events`). `db.js` reads and
  executes this file at startup via `db.exec(sql)` so the API never drifts from
  the schema. `CREATE TABLE IF NOT EXISTS` makes it idempotent. Resolve the path
  with `path.join(__dirname, 'schema', 'option-a.sql')` so it works regardless of
  the current working directory (important for tests).
- **`db.js` exports a single shared connection** (module singleton). Because Node
  caches modules, `app.js` and the test files all get the *same* connection — so a
  `:memory:` DB is one shared database, and `beforeEach` resets affect what the app
  sees. (Opening a second `:memory:` connection would be a separate empty DB and
  silently break tests.)
- `id` → `INTEGER PRIMARY KEY AUTOINCREMENT` (returned via
  `info.lastInsertRowid`).
- `scanned_at` → **not** sent by the client; the column `DEFAULT
  (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` fills it. After insert we `SELECT` the
  row back by `id` so the 201 response includes the DB-generated `scanned_at`.
- `event_type` has a DB-level `CHECK` constraint; API validation gives the clean
  400 message before we ever hit the constraint.
- All SQL uses **prepared statements / parameterized queries** (`db.prepare(...)
  .run(params)` / `.get()` / `.all()`) — never string concatenation (a `/review`
  security check).
- `process.env.DB_PATH` selects the file; tests set `':memory:'` for isolation.

Key statements:
```sql
INSERT INTO scan_events (qr_code, event_type, location, scanned_by)
  VALUES (@qr_code, @event_type, @location, @scanned_by);
SELECT * FROM scan_events WHERE id = ?;
SELECT * FROM scan_events ORDER BY scanned_at DESC, id DESC LIMIT ? OFFSET ?;  -- OFFSET = (page-1)*limit
SELECT COUNT(*) AS total FROM scan_events;
```

---

## 6. Files to be created or changed

**Created:** `package.json`, `PLAN.md`, `CLAUDE.md`, `server.js`, `app.js`,
`db.js`, `routes/scans.js`, `validators/scan.js`, `public/index.html`,
`tests/post-scan.test.js`, `tests/get-scans.test.js`, `RETROSPECTIVE.md`.
(Run/demo instructions live in `CLAUDE.md`, **not** in the existing training
`README.md` — leave `README.md` untouched to avoid out-of-scope edits.)

**Possibly changed:** `.gitignore` — **check** that it ignores `node_modules/`,
`data.db`, `*.db`, and `.env`, and **update it only if any are missing**. (Current
file already has `node_modules/`, `data.db`, `.env`; it is missing the broader
`*.db` glob, so add that one line.)

**Unchanged:** everything under `docs/`, `schema/`, `wireframes/`, `.claude/`.

**Dependencies** (`package.json`):
- runtime: `express`, `better-sqlite3`
- dev: `jest`, `supertest`
- scripts: `"start": "node server.js"`, `"test": "jest"`,
  `"dev": "node server.js"`

---

## 7. Jest/Supertest test plan

All DB-touching test files start with `process.env.DB_PATH = ':memory:'` **before**
`require('../app')` (mandated by `test-writer` + `/review`). Use `toMatchObject`
for partial shape assertions.

**Test isolation strategy:** each test file clears the table in a `beforeEach`
hook so every `it` block starts from known data:
```js
const db = require('../db');           // same in-memory connection app uses
beforeEach(() => {
  db.exec('DELETE FROM scan_events');
});
```
- **Always** `DELETE FROM scan_events` before each test — this is the core reset.
- **Reset `sqlite_sequence` only if needed and safe:** add
  `db.exec("DELETE FROM sqlite_sequence WHERE name = 'scan_events'")` *only* for
  tests that assert on absolute `id` values (e.g. expecting `id: 1`). It is safe
  because `sqlite_sequence` exists once any AUTOINCREMENT row has been inserted;
  guard with `WHERE name = 'scan_events'` so a missing row is a harmless no-op.
  Tests that assert on *relative* ordering (last-inserted id first) do **not**
  need this and should avoid it to keep the reset minimal.

Tests then seed exactly the rows they need inside the `it` (or a local helper),
so assertions on `id`, `total`, and ordering are deterministic and order-independent
across runs.

`tests/post-scan.test.js`:
- ✅ 201 + returns stored row including `id` (number) and `scanned_at` (ISO string).
- ✅ snake_case fields exactly match schema columns.
- ❌ 400 missing `qr_code`; ❌ 400 bad `qr_code` format (`QR-123`, `QRA1B2C3`, lowercase length wrong).
- ❌ 400 missing/invalid `event_type` (e.g. `"in"`, `"SHIP"`).
- ❌ 400 missing/empty `location`; ❌ 400 `location` > 20 chars.
- ❌ 400 missing/empty `scanned_by`; ❌ 400 `scanned_by` > 50 chars.
- ❌ 400 empty body `{}`.
- Each 400 body matches `{ error: <string naming the field> }`.

`tests/get-scans.test.js`:
- Seed N rows, then assert ordering is **newest first** (last inserted `id` is `data[0]`).
- ✅ defaults: no params → `page:1`, `limit:20`, correct `total`.
- ✅ `page`/`limit` paginate correctly (e.g. seed 25, `limit=10&page=2` → 10 rows, right slice).
- ✅ `limit=100` accepted.
- ❌ 400 `limit=101`; ❌ 400 `page=0`; ❌ 400 `limit=0`; ❌ 400 `page=-1`;
  ❌ 400 non-integer `limit=abc` / `page=1.5`.
- 200 response shape: `{ data, page, limit, total }`.

Run: `npm test` (all), `npx jest tests/post-scan.test.js` (one file),
`npx jest -t "rejects limit=101"` (one test by name).

---

## 8. Mini UI plan (built last, after API + tests pass)

`public/index.html` — a single static page, **no framework**, plain HTML + vanilla
JS + `fetch`, served by Express via `app.use(express.static('public'))`:
- A **scan list** table (id, qr_code, event_type, location, scanned_by, scanned_at)
  that polls `GET /scans?page=1&limit=20` every ~3 seconds and re-renders newest-first.
- A manual **Refresh button** next to the list that re-fetches `GET /scans`
  on demand (calls the same render function as the poller), so the user can force
  an immediate update without waiting for the next poll tick.
- A small **form** (qr_code, event_type dropdown of IN/OUT/MOVE, location,
  scanned_by) that POSTs to `/scan`; on `201` clears inputs and refreshes the list;
  on `400` shows the returned `error` message inline.
- No build step, no dependencies — opens at `http://localhost:3000/`.

---

## 9. Manual demo plan (curl / browser)

Start: `npm start` (listens on `http://localhost:3000`).

```bash
# health
curl -s localhost:3000/healthz

# valid scan → 201 with id + scanned_at
curl -s -X POST localhost:3000/scan -H 'Content-Type: application/json' \
  -d '{"qr_code":"QR-A1B2C3","event_type":"IN","location":"WH-01","scanned_by":"nguyen.van.a"}'

# invalid qr_code → 400 naming the field
curl -s -X POST localhost:3000/scan -H 'Content-Type: application/json' \
  -d '{"qr_code":"QR-123","event_type":"IN","location":"WH-01","scanned_by":"a"}'

# list newest first
curl -s 'localhost:3000/scans'

# pagination + rejection cases
curl -s 'localhost:3000/scans?page=1&limit=5'
curl -si 'localhost:3000/scans?limit=101'   # expect 400
curl -si 'localhost:3000/scans?page=0'       # expect 400
```
Browser: open `http://localhost:3000/`, submit the form, watch the list auto-refresh.

---

## 10. Commit plan (target 8+ small commits)

Each code commit follows: write code → delegate tests to `test-writer` →
`npm test` green → `/review` → fix findings → commit.

1. `docs: add implementation plan (PLAN.md)`
2. `docs: add CLAUDE.md scenario rules` — validation rules, exact snake_case
   field names, API shapes. **Committed before any implementation code** so
   `/review`'s "naming matches CLAUDE.md" check has a baseline from commit 3 on.
3. `chore: scaffold project (package.json, .gitignore, server/app skeleton, /healthz)`
4. `feat: add SQLite connection and schema init (db.js)`
5. `feat: add scan input validators (validators/scan.js)`
6. `feat: add POST /scan endpoint` — + `tests/post-scan.test.js` (happy path +
   all field-validation 400s, the POST acceptance criteria).
7. `feat: add GET /scans happy path (newest-first list)` — implement the basic
   endpoint with default `page=1`/`limit=20`, `{ data, page, limit, total }`
   shape, newest-first ordering; + initial `tests/get-scans.test.js` covering the
   happy path and ordering. (Keep this commit focused so the endpoint exists and
   is green before the edge-case pass.)
8. `feat: add GET /scans pagination + param validation (required edge cases)` —
   implement `page`/`limit` parsing and strict-integer validation, then add the
   **required acceptance tests** in the same commit: `limit=101` → 400,
   `page=0` → 400, `limit=0`/`page=-1` → 400, non-integer → 400, plus correct
   pagination slicing. Fix any code surfaced by these tests here. (These spec-
   mandated cases are implemented and tested together — not deferred ambiguously.)
9. `feat: add minimal static UI (public/index.html)`
10. `docs: add retrospective (RETROSPECTIVE.md)` (deliverable; demo/run notes go
    in CLAUDE.md, README left untouched)

(10 commits planned, comfortably clears the 8+ target. CLAUDE.md is now commit 2 —
before the first line of implementation code.)

---

## 11. How to use `/review` before each commit

- Stage the change set: `git add -A` (or selectively).
- Run `/review` — it diffs `git diff --staged` against project conventions and
  the checklist: scope, naming/CLAUDE.md style, response-format consistency,
  `400 + { "error": "message" }`, tests exist, **test isolation
  (`DB_PATH=':memory:'` before `require('app')`)**, and security (no secrets,
  parameterized SQL, no string-built queries).
- **High findings are blocking** — fix every one, re-stage, re-run `/review`
  until it reports "No blocking issues found."
- Only then `git commit`. Do this before *every* commit listed in §10.
- Note: create/update `CLAUDE.md` early (scenario validation rules, exact field
  names, API shapes) so `/review`'s "naming conventions match CLAUDE.md" check
  has something to compare against from the first code commit.

---

## 12. How to use the `test-writer` sub-agent for endpoint tests

- After each endpoint's production code is written, **delegate test writing** to
  the `test-writer` agent (it writes only under `tests/`, never touches
  production code).
- Prompt it with: the route file path under test (`routes/scans.js`), `db.js`,
  and the schema, and ask it to cover happy path + validation + edge cases for
  that endpoint. It will read the actual route + `db.js` first and assert against
  **real** behavior (status codes, messages, fields).
- It will produce e.g. `tests/post-scan.test.js` / `tests/get-scans.test.js`
  following the existing Jest+Supertest style, with `process.env.DB_PATH =
  ':memory:'` as the first line.
- The agent **does not run tests** — after it writes them, I run `npm test`
  myself, fix any real production bugs it surfaced (the agent will *stop and
  explain* rather than fix production code), then `/review` and commit.

---

## Verification (end-to-end)

1. `npm install` then `npm test` → all Jest/Supertest suites green.
2. `npm start`, run the curl sequence in §9 → 201 on valid, 400 (naming field)
   on each invalid field, correct newest-first pagination, 400 on `limit=101`
   and `page=0`.
3. Open `http://localhost:3000/` → submit the form, confirm the list
   auto-refreshes newest-first and inline errors show on bad input.
4. Final `/review` on the full diff before the last commit.
