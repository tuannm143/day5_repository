const express = require('express');

const app = express();

// Parse JSON request bodies. Malformed JSON is handled by the error middleware
// at the bottom of this file so it returns the project's { error } shape.
app.use(express.json());

// Optional smoke/liveness endpoint (not part of the Option A spec). Lets us
// verify the server boots before any real route exists.
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes (POST /scan, GET /scans) are mounted in later commits.

// JSON parse error handler: express.json() throws a SyntaxError on malformed
// bodies; convert it to the project's standard 400 { error } shape.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  next(err);
});

module.exports = app;
