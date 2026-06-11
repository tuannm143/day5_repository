// Pure validation helpers for the QR scan API.
// Each helper returns { ok: true, value } on success or { ok: false, error }
// on failure. Error messages always name the failing field. No I/O, no DB.

const QR_CODE_RE = /^QR-[A-Za-z0-9]{6}$/;
const EVENT_TYPES = ['IN', 'OUT', 'MOVE'];

const LOCATION_MAX = 20;
const SCANNED_BY_MAX = 50;

const PAGE_DEFAULT = 1;
const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 100;

// Validate the POST /scan request body. Checks required/empty before format,
// and returns on the first failing field. Values are returned as-is (not
// trimmed) so stored data matches what the client sent.
function validateScanBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const { qr_code, event_type, location, scanned_by } = b;

  if (typeof qr_code !== 'string' || qr_code.length === 0) {
    return { ok: false, error: 'qr_code is required and must be a string' };
  }
  if (!QR_CODE_RE.test(qr_code)) {
    return { ok: false, error: 'qr_code must match QR- followed by 6 alphanumerics' };
  }

  if (typeof event_type !== 'string' || !EVENT_TYPES.includes(event_type)) {
    return { ok: false, error: 'event_type must be one of IN, OUT, MOVE' };
  }

  if (typeof location !== 'string' || location.trim().length === 0 || location.length > LOCATION_MAX) {
    return { ok: false, error: 'location is required and must be 1-20 characters' };
  }

  if (typeof scanned_by !== 'string' || scanned_by.trim().length === 0 || scanned_by.length > SCANNED_BY_MAX) {
    return { ok: false, error: 'scanned_by is required and must be 1-50 characters' };
  }

  return { ok: true, value: { qr_code, event_type, location, scanned_by } };
}

// Strict positive-integer parse: returns a Number only for a string of digits
// (no sign, no decimal point, no trailing junk). Anything else returns NaN, so
// "1.5", "abc", "10abc", "-1", "" are all rejected.
function parsePositiveInt(raw) {
  const str = typeof raw === 'string' ? raw : String(raw);
  if (!/^\d+$/.test(str)) return NaN;
  return Number(str);
}

// Validate GET /scans pagination params. Missing params fall back to defaults;
// present params must be positive integers within range.
function validatePagination(query) {
  const q = query && typeof query === 'object' ? query : {};

  let page = PAGE_DEFAULT;
  if (q.page !== undefined) {
    const n = parsePositiveInt(q.page);
    if (!Number.isInteger(n) || n < 1) {
      return { ok: false, error: 'page must be an integer >= 1' };
    }
    page = n;
  }

  let limit = LIMIT_DEFAULT;
  if (q.limit !== undefined) {
    const n = parsePositiveInt(q.limit);
    if (!Number.isInteger(n) || n < 1 || n > LIMIT_MAX) {
      return { ok: false, error: 'limit must be an integer between 1 and 100' };
    }
    limit = n;
  }

  return { ok: true, value: { page, limit } };
}

module.exports = { validateScanBody, validatePagination };
