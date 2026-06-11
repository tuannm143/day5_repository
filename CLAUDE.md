# CLAUDE.md — Option A: QR Scan Event Log API + Mini UI

Scenario-specific rules for Claude Code when working in this repository. The full
design lives in [`PLAN.md`](PLAN.md); this file is the short, enforceable rule set
that `/review` checks every change against.

## Project overview

A small Express + SQLite service that logs factory-floor QR scan events and lists
them, plus a minimal static HTML UI. Stack: **Node.js (Express)** + **better-sqlite3**
(synchronous), tested with **Jest + Supertest**.

## Commands

| Command | Purpose |
| ------- | ------- |
| `npm install` | Install dependencies |
| `npm start` | Start the server (`node server.js`) on `http://localhost:3000` |
| `npm run dev` | Same as start (no watch tooling added) |
| `npm test` | Run all Jest/Supertest suites |
| `npx jest tests/post-scan.test.js` | Run one test file |
| `npx jest -t "rejects limit=101"` | Run one test by name |

## Architecture / file layout

- `server.js` — **only** calls `app.listen()`. No routing logic.
- `app.js` — builds and **exports** the configured Express app (Supertest imports
  this; it must not open a port).
- `db.js` — better-sqlite3 connection + schema init. Exports a **single shared
  connection** (module singleton).
- `routes/scans.js` — `POST /scan`, `GET /scans`.
- `validators/scan.js` — pure validation helpers returning `{ ok, error }`.
- `public/index.html` — static mini UI (no framework, built last).
- `tests/` — Jest/Supertest specs (the **only** place the `test-writer` agent writes).

## API conventions

- **JSON response fields use `snake_case`** matching the SQLite columns exactly:
  `id`, `qr_code`, `event_type`, `location`, `scanned_by`, `scanned_at`.
- `POST /scan` → **`201`** with the full stored row (including DB-generated `id`
  and `scanned_at`).
- `GET /scans` → **`200`** with `{ "data": [...], "page", "limit", "total" }`,
  ordered **newest first** (`ORDER BY scanned_at DESC, id DESC`). `total` is the
  unfiltered row count.
- **All validation errors → HTTP `400` with exactly `{ "error": "<message>" }`.**
  No other error shape is acceptable. Error messages must **name the offending
  field**.
- `GET /healthz` → `200 { "status": "ok" }` (optional smoke endpoint, not in spec).

## Validation rules (POST /scan)

Check required/empty first, then format. The first failing field determines the
`400` message.

| Field | Rule |
| ----- | ---- |
| `qr_code` | required string, must match `^QR-[A-Za-z0-9]{6}$` (`QR-` + 6 alphanumerics) |
| `event_type` | required, exactly one of `IN` / `OUT` / `MOVE` (case-sensitive) |
| `location` | required, non-empty after `trim()`, raw length ≤ 20 |
| `scanned_by` | required, non-empty after `trim()`, raw length ≤ 50 |

- Reject when `value.trim()` is empty; measure length against the **raw** string;
  **store values as-is** (do not trim before insert).
- Malformed JSON body (a `SyntaxError` from `express.json()`) must be caught and
  returned as `400 { "error": "invalid JSON body" }` — never Express's default
  HTML error.

## Validation rules (GET /scans pagination)

`page` and `limit` must be **positive integers** (strict parsing — reject `"1.5"`,
`"abc"`, `"10abc"`).

- `page`: default `1`, minimum `1`. `page=0` / negative / non-integer → `400`.
- `limit`: default `20`, minimum `1`, maximum `100`. `limit=101` / `limit=0` /
  negative / non-integer → `400`.

## Schema rules

- **`schema/option-a.sql` is the source of truth and must NOT be modified** unless
  the Option A spec explicitly changes. The API adapts to the schema, never the
  reverse — column names, types, the `event_type` CHECK, and the `scanned_at`
  default are taken as given.
- `db.js` reads and executes the schema file at startup
  (`path.join(__dirname, 'schema', 'option-a.sql')` so cwd doesn't matter).
- `scanned_at` is **never** sent by the client — the column default fills it;
  re-`SELECT` the row after insert to return it.
- **All SQL uses prepared statements / parameterized queries.** Never concatenate
  user input into SQL strings.
- `process.env.DB_PATH` selects the database file (default `./data.db`); tests use
  `':memory:'`.

## Test rules

- Use **Supertest** against the exported `app`. Use `toMatchObject` for partial
  shape assertions.
- **The first executable line of any DB-touching test file must be**
  `process.env.DB_PATH = ':memory:'`, **before** `require('../app')`.
- Reset state in `beforeEach` with `db.exec('DELETE FROM scan_events')`. Only reset
  `sqlite_sequence` (`DELETE FROM sqlite_sequence WHERE name = 'scan_events'`) when
  a test asserts on absolute `id` values.
- Do not assume the DB is empty between `it` blocks unless the reset above runs.
- Cover happy path + validation errors + edge cases for every endpoint.

## `/review` workflow (run before EVERY commit)

1. Stage changes (`git add -A`).
2. Run `/review` — it checks scope, naming vs this file, response-format
   consistency, `400 + { "error": "message" }`, test presence, test isolation
   (`DB_PATH=':memory:'` before `require('app')`), and security (no secrets,
   parameterized SQL).
3. **High findings are blocking** — fix all, re-stage, re-run until "No blocking
   issues found."
4. Only then commit. Keep commits small (aim for 8+ across the project).

## `test-writer` sub-agent usage

- Delegate all endpoint test writing to the `test-writer` agent. It writes **only**
  under `tests/` and **never** touches production code.
- Give it the route file (`routes/scans.js`), `db.js`, and the schema; ask for
  happy path + validation + edge cases. It reads the real code and asserts against
  **actual** behavior.
- It does **not** run tests — after it writes them, run `npm test` yourself, fix any
  real production bug it surfaced (the agent stops and explains rather than editing
  production code), then `/review` and commit.
