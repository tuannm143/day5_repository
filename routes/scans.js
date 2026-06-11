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

module.exports = router;
