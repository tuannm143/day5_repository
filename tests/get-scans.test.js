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

  // ── Pagination parameter validation — 400 errors ─────────────────────────────

  describe('parameter validation errors', () => {
    it('?limit=101 returns 400 with an error mentioning "limit"', async () => {
      const res = await request(app).get('/scans?limit=101');

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual(expect.stringContaining('limit'));
    });

    it('?limit=101 returns the exact error message', async () => {
      const res = await request(app).get('/scans?limit=101');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('limit must be an integer between 1 and 100');
    });

    it('?page=0 returns 400 with an error mentioning "page"', async () => {
      const res = await request(app).get('/scans?page=0');

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual(expect.stringContaining('page'));
    });

    it('?page=0 returns the exact error message', async () => {
      const res = await request(app).get('/scans?page=0');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('page must be an integer >= 1');
    });

    it('?limit=0 returns 400 with an error mentioning "limit"', async () => {
      const res = await request(app).get('/scans?limit=0');

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual(expect.stringContaining('limit'));
    });

    it('?page=-1 returns 400 with an error mentioning "page"', async () => {
      const res = await request(app).get('/scans?page=-1');

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual(expect.stringContaining('page'));
    });

    it('?limit=abc returns 400 with an error mentioning "limit"', async () => {
      const res = await request(app).get('/scans?limit=abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual(expect.stringContaining('limit'));
    });

    it('?page=1.5 returns 400 with an error mentioning "page"', async () => {
      const res = await request(app).get('/scans?page=1.5');

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual(expect.stringContaining('page'));
    });
  });

  // ── Accepted boundary: limit=100 ─────────────────────────────────────────────

  describe('boundary: limit=100 is accepted', () => {
    it('?limit=100 returns 200 and echoes limit === 100', async () => {
      await seedScan('QR-AAAAA1');
      await seedScan('QR-AAAAA2');

      const res = await request(app).get('/scans?limit=100');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });
  });

  // ── Pagination slicing ────────────────────────────────────────────────────────
  //
  // Seed 25 rows using QR-000001 … QR-000025 (6-digit zero-padded — satisfies
  // the QR_CODE_RE = /^QR-[A-Za-z0-9]{6}$/ requirement). Request page 2 with
  // limit 10: the response must contain exactly 10 rows, total === 25, and the
  // pagination envelope must echo page and limit back to the caller.

  describe('pagination slicing', () => {
    it('seeds 25 rows: every POST /scan returns 201', async () => {
      for (let i = 1; i <= 25; i++) {
        const qr_code = 'QR-' + String(i).padStart(6, '0');
        const res = await request(app)
          .post('/scan')
          .send({ ...SEED_BASE, qr_code });
        expect(res.status).toBe(201);
      }
    });

    it('GET /scans?limit=10&page=2 with 25 rows returns status 200', async () => {
      for (let i = 1; i <= 25; i++) {
        await seedScan('QR-' + String(i).padStart(6, '0'));
      }

      const res = await request(app).get('/scans?limit=10&page=2');

      expect(res.status).toBe(200);
    });

    it('GET /scans?limit=10&page=2 with 25 rows returns total === 25', async () => {
      for (let i = 1; i <= 25; i++) {
        await seedScan('QR-' + String(i).padStart(6, '0'));
      }

      const res = await request(app).get('/scans?limit=10&page=2');

      expect(res.body.total).toBe(25);
    });

    it('GET /scans?limit=10&page=2 with 25 rows echoes page === 2', async () => {
      for (let i = 1; i <= 25; i++) {
        await seedScan('QR-' + String(i).padStart(6, '0'));
      }

      const res = await request(app).get('/scans?limit=10&page=2');

      expect(res.body.page).toBe(2);
    });

    it('GET /scans?limit=10&page=2 with 25 rows echoes limit === 10', async () => {
      for (let i = 1; i <= 25; i++) {
        await seedScan('QR-' + String(i).padStart(6, '0'));
      }

      const res = await request(app).get('/scans?limit=10&page=2');

      expect(res.body.limit).toBe(10);
    });

    it('GET /scans?limit=10&page=2 with 25 rows returns exactly 10 rows in data', async () => {
      for (let i = 1; i <= 25; i++) {
        await seedScan('QR-' + String(i).padStart(6, '0'));
      }

      const res = await request(app).get('/scans?limit=10&page=2');

      expect(res.body.data).toHaveLength(10);
    });

    it('GET /scans?limit=10&page=2 with 25 rows: ids in the page are strictly descending', async () => {
      for (let i = 1; i <= 25; i++) {
        await seedScan('QR-' + String(i).padStart(6, '0'));
      }

      const res = await request(app).get('/scans?limit=10&page=2');

      const ids = res.body.data.map((row) => row.id);
      for (let i = 0; i < ids.length - 1; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i + 1]);
      }
    });

    it('GET /scans?limit=10&page=2 contains the middle window (rows 11-20 newest-first)', async () => {
      for (let i = 1; i <= 25; i++) {
        await seedScan('QR-' + String(i).padStart(6, '0'));
      }

      // Page 1 gives the 10 highest ids; page 2 must contain the next 10.
      const page1 = await request(app).get('/scans?limit=10&page=1');
      const page2 = await request(app).get('/scans?limit=10&page=2');

      const page1Ids = new Set(page1.body.data.map((r) => r.id));
      const page2Ids = page2.body.data.map((r) => r.id);

      // No id from page 2 should appear on page 1.
      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }

      // Every page-2 id must be lower than every page-1 id (strict ordering).
      const minPage1Id = Math.min(...page1Ids);
      const maxPage2Id = Math.max(...page2Ids);
      expect(maxPage2Id).toBeLessThan(minPage1Id);
    });
  });
});
