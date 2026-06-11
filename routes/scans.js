const express = require('express');
const db = require('../db');
const { validateScanBody } = require('../validators/scan');

const router = express.Router();

// Prepared statements (parameterized — no string concatenation of user input).
// The table already exists because requiring db.js runs the schema on load.
const insertScan = db.prepare(
  `INSERT INTO scan_events (qr_code, event_type, location, scanned_by)
   VALUES (@qr_code, @event_type, @location, @scanned_by)`
);
const getScanById = db.prepare('SELECT * FROM scan_events WHERE id = ?');

// Newest first: scanned_at is the primary key, id DESC breaks same-timestamp ties.
const listScans = db.prepare(
  'SELECT * FROM scan_events ORDER BY scanned_at DESC, id DESC LIMIT ? OFFSET ?'
);
const countScans = db.prepare('SELECT COUNT(*) AS total FROM scan_events');

// POST /scan — log a scan event. scanned_at is never taken from the client;
// the schema default fills it, so we re-SELECT the stored row to return it.
router.post('/scan', (req, res) => {
  const result = validateScanBody(req.body);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  const info = insertScan.run(result.value);
  const row = getScanById.get(info.lastInsertRowid);
  return res.status(201).json(row);
});

// GET /scans — recent events, newest first, paginated. Happy path only:
// defaults page=1 / limit=20. Strict param validation (limit<=100, positive
// integers, 400 on bad input) is added in a later commit.
router.get('/scans', (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;

  const data = listScans.all(limit, offset);
  const { total } = countScans.get();

  return res.json({ data, page, limit, total });
});

module.exports = router;
