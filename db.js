const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// DB file is selected by DB_PATH; tests set ':memory:' for isolation.
const dbPath = process.env.DB_PATH || './data.db';

// Single shared connection (module singleton). Because Node caches modules,
// app.js and the test files all get this same connection — important for
// ':memory:', where each connection would otherwise be a separate empty DB.
const db = new Database(dbPath);

// schema/option-a.sql is the source of truth. Resolve via __dirname so it loads
// regardless of the current working directory (e.g. when run from tests).
const schemaPath = path.join(__dirname, 'schema', 'option-a.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema); // CREATE TABLE IF NOT EXISTS ... makes this idempotent

module.exports = db;
