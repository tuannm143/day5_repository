process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../app');
const db = require('../db');

const VALID_BODY = {
  qr_code: 'QR-A1B2C3',
  event_type: 'IN',
  location: 'WH-01',
  scanned_by: 'nguyen.van.a',
};

describe('POST /scan', () => {
  beforeEach(() => {
    db.exec('DELETE FROM scan_events');
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns 201 with the stored row for a valid body', async () => {
    const res = await request(app).post('/scan').send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      qr_code: VALID_BODY.qr_code,
      event_type: VALID_BODY.event_type,
      location: VALID_BODY.location,
      scanned_by: VALID_BODY.scanned_by,
    });
    expect(typeof res.body.id).toBe('number');
    expect(typeof res.body.scanned_at).toBe('string');
    expect(res.body.scanned_at.length).toBeGreaterThan(0);
  });

  // ── Response shape ───────────────────────────────────────────────────────────

  it('response body contains exactly the expected snake_case keys', async () => {
    const res = await request(app).post('/scan').send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(
      ['id', 'qr_code', 'event_type', 'location', 'scanned_by', 'scanned_at'].sort()
    );
  });

  it('scanned_at is a non-empty ISO-like timestamp string', async () => {
    const res = await request(app).post('/scan').send(VALID_BODY);

    expect(res.status).toBe(201);
    // SQLite default: strftime('%Y-%m-%dT%H:%M:%fZ', 'now') — starts with the year
    expect(res.body.scanned_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ── qr_code validation ───────────────────────────────────────────────────────

  it('returns 400 when qr_code is missing', async () => {
    const { qr_code, ...body } = VALID_BODY;
    const res = await request(app).post('/scan').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('qr_code') });
  });

  it('returns 400 when qr_code is an empty string', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, qr_code: '' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('qr_code') });
  });

  it('returns 400 when qr_code does not match the QR-XXXXXX format (too short suffix)', async () => {
    // 'QR-123' has only 3 alphanumerics after the dash — must be exactly 6
    const res = await request(app).post('/scan').send({ ...VALID_BODY, qr_code: 'QR-123' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('qr_code') });
  });

  it('returns 400 when qr_code does not match the QR-XXXXXX format (wrong prefix)', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, qr_code: 'BC-A1B2C3' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('qr_code') });
  });

  it('returns 400 when qr_code has special characters in the suffix', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, qr_code: 'QR-A1B2!3' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('qr_code') });
  });

  // ── event_type validation ────────────────────────────────────────────────────

  it('returns 400 when event_type is missing', async () => {
    const { event_type, ...body } = VALID_BODY;
    const res = await request(app).post('/scan').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('event_type') });
  });

  it('returns 400 when event_type is lowercase (e.g. "in")', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, event_type: 'in' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('event_type') });
  });

  it('returns 400 when event_type is an unrecognised value (e.g. "SHIP")', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, event_type: 'SHIP' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('event_type') });
  });

  it('accepts all three valid event_type values — OUT', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, event_type: 'OUT' });
    expect(res.status).toBe(201);
    expect(res.body.event_type).toBe('OUT');
  });

  it('accepts all three valid event_type values — MOVE', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, event_type: 'MOVE' });
    expect(res.status).toBe(201);
    expect(res.body.event_type).toBe('MOVE');
  });

  // ── location validation ──────────────────────────────────────────────────────

  it('returns 400 when location is missing', async () => {
    const { location, ...body } = VALID_BODY;
    const res = await request(app).post('/scan').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('location') });
  });

  it('returns 400 when location is an empty string', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, location: '' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('location') });
  });

  it('returns 400 when location is whitespace only', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, location: '   ' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('location') });
  });

  it('returns 400 when location exceeds 20 characters', async () => {
    const res = await request(app)
      .post('/scan')
      .send({ ...VALID_BODY, location: 'A'.repeat(21) });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('location') });
  });

  it('accepts location of exactly 20 characters', async () => {
    const res = await request(app)
      .post('/scan')
      .send({ ...VALID_BODY, location: 'A'.repeat(20) });

    expect(res.status).toBe(201);
    expect(res.body.location).toBe('A'.repeat(20));
  });

  // ── scanned_by validation ────────────────────────────────────────────────────

  it('returns 400 when scanned_by is missing', async () => {
    const { scanned_by, ...body } = VALID_BODY;
    const res = await request(app).post('/scan').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('scanned_by') });
  });

  it('returns 400 when scanned_by is an empty string', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, scanned_by: '' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('scanned_by') });
  });

  it('returns 400 when scanned_by is whitespace only', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, scanned_by: '   ' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('scanned_by') });
  });

  it('returns 400 when scanned_by exceeds 50 characters', async () => {
    const res = await request(app)
      .post('/scan')
      .send({ ...VALID_BODY, scanned_by: 'a'.repeat(51) });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('scanned_by') });
  });

  it('accepts scanned_by of exactly 50 characters', async () => {
    const res = await request(app)
      .post('/scan')
      .send({ ...VALID_BODY, scanned_by: 'a'.repeat(50) });

    expect(res.status).toBe(201);
    expect(res.body.scanned_by).toBe('a'.repeat(50));
  });

  // ── Empty body ───────────────────────────────────────────────────────────────

  it('returns 400 for an empty body {}', async () => {
    const res = await request(app).post('/scan').send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // ── Exact error messages (pinned to validator text) ──────────────────────────

  it('error message for missing qr_code is exact validator text', async () => {
    const { qr_code, ...body } = VALID_BODY;
    const res = await request(app).post('/scan').send(body);

    expect(res.body.error).toBe('qr_code is required and must be a string');
  });

  it('error message for invalid qr_code format is exact validator text', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, qr_code: 'QR-123' });

    expect(res.body.error).toBe('qr_code must match QR- followed by 6 alphanumerics');
  });

  it('error message for invalid event_type is exact validator text', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, event_type: 'SHIP' });

    expect(res.body.error).toBe('event_type must be one of IN, OUT, MOVE');
  });

  it('error message for empty location is exact validator text', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, location: '' });

    expect(res.body.error).toBe('location is required and must be 1-20 characters');
  });

  it('error message for empty scanned_by is exact validator text', async () => {
    const res = await request(app).post('/scan').send({ ...VALID_BODY, scanned_by: '' });

    expect(res.body.error).toBe('scanned_by is required and must be 1-50 characters');
  });
});
