const path = require('path');
const express = require('express');
const scansRouter = require('./routes/scans');

const app = express();

// Parse JSON request bodies. Malformed JSON is handled by the error middleware
// at the bottom of this file so it returns the project's { error } shape.
app.use(express.json());

// Serve the static mini UI (public/index.html at "/"). Does not affect the
// JSON API: /scan and /scans have no matching files and fall through to routes.
app.use(express.static(path.join(__dirname, 'public')));

// Optional smoke/liveness endpoint (not part of the Option A spec). Lets us
// verify the server boots before any real route exists.
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// Scan routes (POST /scan; GET /scans added in a later commit). Mounted above
// the error-handling middleware so route errors can reach it.
app.use(scansRouter);

// JSON parse error handler: express.json() throws a SyntaxError on malformed
// bodies; convert it to the project's standard 400 { error } shape.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  next(err);
});

module.exports = app;
