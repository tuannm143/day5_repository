process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../app');
const db = require('../db');

// Shared base fields for every POST /scan seed call.
const SEED_BASE = {
  event_type: 'IN',
  location: 'WH-01',
  scanned_by: 'nguyen.van.a',
};

// Helper: POST a single scan row and return the parsed response body.
async function seedScan(qr_code) {
  const res = await request(app).post('/scan').send({ ...SEED_BASE, qr_code });
  return res.body;
}

describe('GET /scans', () => {
  beforeEach(() => {
    db.exec('DELETE FROM scan_events');
  });

  // ── HTTP status ──────────────────────────────────────────────────────────────

  it('returns HTTP 200', async () => {
    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
  });

  // ── Response shape ───────────────────────────────────────────────────────────

  it('response body has exactly the keys: data, page, limit, total', async () => {
    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['data', 'limit', 'page', 'total'].sort()
    );
  });

  it('data is an array', async () => {
    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── Defaults ─────────────────────────────────────────────────────────────────

  it('with no query params, page defaults to 1', async () => {
    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
  });

  it('with no query params, limit defaults to 20', async () => {
    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(20);
  });

  // ── total reflects the live row count ────────────────────────────────────────

  it('returns total === 0 and data === [] when the table is empty', async () => {
    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, data: [] });
  });

  it('returns total === 3 after seeding 3 rows', async () => {
    await seedScan('QR-AAAAA1');
    await seedScan('QR-AAAAA2');
    await seedScan('QR-AAAAA3');

    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  it('returns all 3 seeded rows inside data (within the default limit of 20)', async () => {
    await seedScan('QR-AAAAA1');
    await seedScan('QR-AAAAA2');
    await seedScan('QR-AAAAA3');

    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });

  // ── Ordering: newest first (id DESC tiebreaker) ───────────────────────────────
  //
  // Rows are inserted in order: QR-AAAAA1, QR-AAAAA2, QR-AAAAA3.
  // In fast test runs all three share the same scanned_at millisecond, so
  // ORDER BY scanned_at DESC, id DESC resolves to id DESC, meaning
  // QR-AAAAA3 (highest id) must appear at index 0.

  it('the last-inserted row appears first in data (id DESC tiebreaker)', async () => {
    await seedScan('QR-AAAAA1');
    await seedScan('QR-AAAAA2');
    await seedScan('QR-AAAAA3');

    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    expect(res.body.data[0].qr_code).toBe('QR-AAAAA3');
  });

  it('the first-inserted row appears last in data', async () => {
    await seedScan('QR-AAAAA1');
    await seedScan('QR-AAAAA2');
    await seedScan('QR-AAAAA3');

    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data[data.length - 1].qr_code).toBe('QR-AAAAA1');
  });

  it('ids in data are in strictly descending order', async () => {
    await seedScan('QR-AAAAA1');
    await seedScan('QR-AAAAA2');
    await seedScan('QR-AAAAA3');

    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    const ids = res.body.data.map((row) => row.id);
    for (let i = 0; i < ids.length - 1; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i + 1]);
    }
  });

  // ── Each data row has the expected snake_case fields ─────────────────────────

  it('each row in data contains the expected snake_case fields', async () => {
    await seedScan('QR-AAAAA1');

    const res = await request(app).get('/scans');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: expect.any(Number),
      qr_code: 'QR-AAAAA1',
      event_type: SEED_BASE.event_type,
      location: SEED_BASE.location,
      scanned_by: SEED_BASE.scanned_by,
      scanned_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });
});
