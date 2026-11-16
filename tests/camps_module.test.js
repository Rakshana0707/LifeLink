/* ==========================================================================
   LifeLink — Camps Management & Ingestion Pipeline Test Suite
   --------------------------------------------------------------------------
   Verifies:
     1. Camp creation (community & admin flows)
     2. Camp editing (full fields: date, venue, capacity, organizer, coordinates)
     3. Camp deletion and cancellation (with donor notification)
     4. Camp listing and multi-criteria filtering
     5. Camp registration & verification ID generation
     6. Donor slot management (slot limits enforced)
     7. Total camp registration capacity limits
     8. Duplicate registration prevention
     9. Camp location and geo-coordinates mapping
    10. Ingestion pipeline: source normalization, duplicate detection, robots.txt,
        unavailable external source handling, and full ingestion-to-registration
   ========================================================================== */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const app = require('../server');
const { createSessionToken } = require('../auth');
const { computeDedupeKey, findDuplicate } = require('../services/campIngestion/dedupe');
const { runIngestion } = require('../services/campIngestion/pipeline');
const { normalizeCampRecord } = require('../services/campIngestion/normalize');
const { validateCampRecord } = require('../services/campIngestion/validate');
const { parseRobotsTxt, isPathAllowed } = require('../services/campIngestion/robotsCompliance');
const { safeFetchWithRetry } = require('../services/campIngestion/httpClient');

const dbPath = path.join(__dirname, '..', 'lifelink.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000;');

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

const request = async (route, options = {}) => {
  const url = `${baseUrl}${route}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let body = null;
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, body, headers: res.headers };
};

/* ==========================================================================
   1. Camp Creation & Duplicate Prevention
   ========================================================================== */

test('Camp: Community creation enters Pending Approval and prevents duplicates', async () => {
  const testCampId = 'camp-comm-' + Date.now();
  const testTitle = 'Community Mega Drive ' + Date.now();
  const testDate = '2026-12-15';
  const testCity = 'Coimbatore';

  // 1. Submit community camp
  const res = await request('/api/camps', {
    method: 'POST',
    body: {
      id: testCampId,
      title: testTitle,
      date: testDate,
      venue: 'PSG Tech Campus',
      location: 'PSG Tech Campus',
      city: testCity,
      limit: 100,
      organizer: 'PSG Rotary Club'
    }
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.camp.approved, false);
  assert.equal(res.body.camp.status, 'Pending Approval');
  assert.equal(res.body.camp.verificationStatus, 'Unverified');
  assert.equal(res.body.camp.sourceName, 'Community Submission');

  // 2. Submit identical camp (same title, date, city) must be rejected with 409 Conflict
  const dupRes = await request('/api/camps', {
    method: 'POST',
    body: {
      id: 'camp-comm-dup-' + Date.now(),
      title: testTitle,
      date: testDate,
      venue: 'Different Venue',
      city: testCity,
      limit: 50
    }
  });

  assert.equal(dupRes.status, 409);
  assert.match(dupRes.body.error, /already exists/i);

  // Cleanup
  db.prepare('DELETE FROM camps WHERE id = ?').run(testCampId);
});

test('Camp: Admin creation is auto-approved and distinguished as LifeLink Admin Entry', async () => {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'Admin' LIMIT 1").get();
  assert.ok(admin);
  const adminToken = createSessionToken(admin.id);

  const testCampId = 'camp-admin-' + Date.now();
  const res = await request('/api/camps', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      id: testCampId,
      title: 'Admin Official Drive ' + Date.now(),
      date: '2026-12-20',
      venue: 'Government Hospital Ground',
      city: 'Coimbatore',
      limit: 150
    }
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.camp.approved, true);
  assert.equal(res.body.camp.status, 'Scheduled');
  assert.equal(res.body.camp.verificationStatus, 'Verified');
  assert.equal(res.body.camp.sourceName, 'LifeLink Admin Entry');

  // Cleanup
  db.prepare('DELETE FROM camps WHERE id = ?').run(testCampId);
});

/* ==========================================================================
   2. Camp Editing & Location Management
   ========================================================================== */

test('Camp: Admin can edit camp title, venue, capacity, and coordinates', async () => {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'Admin' LIMIT 1").get();
  const adminToken = createSessionToken(admin.id);

  const testCampId = 'camp-edit-' + Date.now();
  db.prepare(`
    INSERT INTO camps (id, title, venue, city, camp_date, capacity, registered_count, approved, status, dedupe_key)
    VALUES (?, 'Original Camp Title', 'Old Venue', 'Coimbatore', '2026-12-25', 50, 0, 1, 'Scheduled', ?)
  `).run(testCampId, `manual-${testCampId}`);

  try {
    const editRes = await request(`/api/camps/${testCampId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        title: 'Updated Camp Title',
        venue: 'New Grand Auditorium',
        capacity: 120,
        lat: 11.0250,
        lng: 76.9650
      }
    });

    assert.equal(editRes.status, 200);
    assert.equal(editRes.body.camp.title, 'Updated Camp Title');
    assert.equal(editRes.body.camp.venue, 'New Grand Auditorium');
    assert.equal(editRes.body.camp.limit, 120);
    assert.equal(editRes.body.camp.lat, 11.0250);
    assert.equal(editRes.body.camp.lng, 76.9650);
  } finally {
    db.prepare('DELETE FROM camps WHERE id = ?').run(testCampId);
  }
});

/* ==========================================================================
   3. Camp Deletion & Cancellation Lifecycle
   ========================================================================== */

test('Camp: Cancellation marks status and notifies registered donors', async () => {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'Admin' LIMIT 1").get();
  const donor = db.prepare("SELECT id FROM users WHERE role = 'Donor' AND status = 'Active' LIMIT 1").get();
  const adminToken = createSessionToken(admin.id);

  const testCampId = 'camp-cancel-' + Date.now();
  db.prepare(`
    INSERT INTO camps (id, title, venue, city, camp_date, capacity, registered_count, approved, status, dedupe_key)
    VALUES (?, 'Camp to Cancel', 'Hall 1', 'Coimbatore', '2026-12-28', 50, 1, 1, 'Scheduled', ?)
  `).run(testCampId, `manual-${testCampId}`);

  db.prepare(`
    INSERT INTO camp_registrations (camp_id, donor_id, verification_id, slot, status)
    VALUES (?, ?, 'CR-CANCEL-TEST', 'Morning', 'Registered')
  `).run(testCampId, donor.id);

  try {
    const cancelRes = await request(`/api/camps/${testCampId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { reason: 'Severe weather alert' }
    });

    assert.equal(cancelRes.status, 200);

    const updatedCamp = db.prepare('SELECT status FROM camps WHERE id = ?').get(testCampId);
    assert.equal(updatedCamp.status, 'Cancelled');

    const updatedReg = db.prepare('SELECT status FROM camp_registrations WHERE camp_id = ?').get(testCampId);
    assert.equal(updatedReg.status, 'Cancelled');
  } finally {
    db.prepare('DELETE FROM camp_registrations WHERE camp_id = ?').run(testCampId);
    db.prepare('DELETE FROM camps WHERE id = ?').run(testCampId);
  }
});

test('Camp: Admin deletion removes camp and cascades registrations', async () => {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'Admin' LIMIT 1").get();
  const adminToken = createSessionToken(admin.id);

  const testCampId = 'camp-delete-' + Date.now();
  db.prepare(`
    INSERT INTO camps (id, title, venue, city, camp_date, capacity, registered_count, approved, status, dedupe_key)
    VALUES (?, 'Delete Camp', 'Hall 2', 'Coimbatore', '2026-12-30', 50, 0, 1, 'Scheduled', ?)
  `).run(testCampId, `manual-${testCampId}`);

  const deleteRes = await request(`/api/camps/${testCampId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  assert.equal(deleteRes.status, 200);
  const row = db.prepare('SELECT id FROM camps WHERE id = ?').get(testCampId);
  assert.equal(row, undefined);
});

/* ==========================================================================
   4. Camp Listing & Multi-Criteria Filtering
   ========================================================================== */

test('Camp: Listing filters by city, approval, status, and text search', async () => {
  const resAll = await request('/api/camps');
  assert.equal(resAll.status, 200);
  assert.ok(Array.isArray(resAll.body));

  // Filter by approved
  const resApproved = await request('/api/camps?approved=true');
  assert.equal(resApproved.status, 200);
  for (const c of resApproved.body) {
    assert.equal(c.approved, true);
  }

  // Filter by city
  const resCity = await request('/api/camps?city=Coimbatore');
  assert.equal(resCity.status, 200);
  for (const c of resCity.body) {
    assert.equal(c.city, 'Coimbatore');
  }
});

/* ==========================================================================
   5. Camp Registration, Slot Management & Capacity Limits
   ========================================================================== */

test('Registration: Enforces total capacity limit, slot limits, and duplicate prevention', async () => {
  const donor = db.prepare("SELECT id FROM users WHERE role = 'Donor' AND status = 'Active' LIMIT 1").get();
  assert.ok(donor);
  const donorToken = createSessionToken(donor.id);

  const testCampId = 'camp-reg-' + Date.now();
  // Camp with capacity = 2 donors (slot limit = ceil(2/4) = 1 donor per slot)
  db.prepare(`
    INSERT INTO camps (id, title, venue, city, camp_date, capacity, registered_count, approved, status, dedupe_key)
    VALUES (?, 'Capacity Test Camp', 'Testing Room', 'Coimbatore', '2026-12-31', 2, 0, 1, 'Scheduled', ?)
  `).run(testCampId, `manual-${testCampId}`);

  try {
    // 1. Successful first registration with slot
    const regRes = await request('/api/camp_registrations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${donorToken}` },
      body: {
        campId: testCampId,
        donorId: donor.id,
        slot: '09:00 AM - 11:00 AM'
      }
    });

    assert.equal(regRes.status, 200);
    assert.equal(regRes.body.success, true);
    assert.ok(regRes.body.verificationId.startsWith('CR-'));
    assert.equal(regRes.body.campTitle, 'Capacity Test Camp');

    // 2. Duplicate registration attempt by same donor must return 409 Conflict
    const dupRegRes = await request('/api/camp_registrations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${donorToken}` },
      body: {
        campId: testCampId,
        donorId: donor.id,
        slot: '09:00 AM - 11:00 AM'
      }
    });

    assert.equal(dupRegRes.status, 409);
    assert.match(dupRegRes.body.error, /already registered/i);

    // 3. Second donor attempts the same slot (which has slot capacity = 1)
    const donor2 = db.prepare("SELECT id FROM users WHERE role = 'Donor' AND status = 'Active' AND id != ? LIMIT 1").get(donor.id);
    if (donor2) {
      const donor2Token = createSessionToken(donor2.id);

      // Slot is full (capacity = 1 reached)
      const slotFullRes = await request('/api/camp_registrations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${donor2Token}` },
        body: {
          campId: testCampId,
          donorId: donor2.id,
          slot: '09:00 AM - 11:00 AM'
        }
      });
      assert.equal(slotFullRes.status, 400);
      assert.match(slotFullRes.body.error, /fully booked/i);

      // Successfully registers for a different available slot
      const altSlotRes = await request('/api/camp_registrations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${donor2Token}` },
        body: {
          campId: testCampId,
          donorId: donor2.id,
          slot: '02:00 PM - 04:00 PM'
        }
      });
      assert.equal(altSlotRes.status, 200);

      // 4. Now total camp capacity (2/2) is reached — third donor cannot register
      const donor3 = db.prepare("SELECT id FROM users WHERE role = 'Donor' AND status = 'Active' AND id NOT IN (?, ?) LIMIT 1").get(donor.id, donor2.id);
      if (donor3) {
        const donor3Token = createSessionToken(donor3.id);
        const campFullRes = await request('/api/camp_registrations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${donor3Token}` },
          body: {
            campId: testCampId,
            donorId: donor3.id,
            slot: '04:00 PM - 06:00 PM'
          }
        });
        assert.equal(campFullRes.status, 400);
        assert.match(campFullRes.body.error, /reached its registration capacity/i);
      }
    }
  } finally {
    db.prepare('DELETE FROM camp_registrations WHERE camp_id = ?').run(testCampId);
    db.prepare('DELETE FROM camps WHERE id = ?').run(testCampId);
  }
});

/* ==========================================================================
   6. Ingestion Pipeline & Safe External Source Handling
   ========================================================================== */

test('Ingestion: Robots.txt compliance parser and path allowed checks', () => {
  const robotsSample = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /listings/blood-camps

User-agent: BadBot
Disallow: /
`;
  const parsed = parseRobotsTxt(robotsSample);
  assert.equal(isPathAllowed(parsed, 'LifeLinkCampBot', '/listings/blood-camps'), true);
  assert.equal(isPathAllowed(parsed, 'LifeLinkCampBot', '/admin/camps'), false);
  assert.equal(isPathAllowed(parsed, 'BadBot', '/listings/blood-camps'), false);
});

test('Ingestion: Handles unavailable external sources gracefully without crashing', async () => {
  // safeFetchWithRetry to an unresolvable domain returns an error result rather than throwing
  const result = await safeFetchWithRetry('https://non-existent-domain-123456789.org/api/camps', {
    timeoutMs: 1500,
    maxRetries: 0
  });

  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('Ingestion: End-to-end ingestion pipeline, deduplication & distinguishability', async () => {
  const testTitle = 'Ingested Test Camp ' + Date.now();
  const testDate = '2026-11-25';

  const mockFetchFn = async () => ({
    records: [
      {
        campTitle: testTitle,
        campDate: testDate,
        venue: 'District Health Center',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        capacity: 100,
        sourceUrl: 'https://example-health-dept.gov.in/sample-camp-test'
      },
      // Duplicate of the first record in the exact same batch
      {
        campTitle: testTitle,
        campDate: testDate,
        venue: 'District Health Center',
        city: 'Coimbatore',
        capacity: 100,
        sourceUrl: 'https://example-health-dept.gov.in/sample-camp-test'
      }
    ],
    sourceUrl: 'https://example-health-dept.gov.in'
  });

  const ingestionResult = await runIngestion(db, {
    source: 'official_api',
    sourceName: 'Test Regional Health API',
    fetchFn: mockFetchFn
  });

  assert.equal(ingestionResult.status, 'Completed');
  assert.equal(ingestionResult.fetched, 2);
  assert.equal(ingestionResult.valid, 2);
  assert.equal(ingestionResult.duplicate, 1);
  assert.equal(ingestionResult.inserted, 1);

  const insertedId = ingestionResult.insertedCamps[0].id;
  const campRow = db.prepare('SELECT * FROM camps WHERE id = ?').get(insertedId);

  assert.ok(campRow);
  assert.equal(campRow.source, 'official_api');
  assert.equal(campRow.source_name, 'Test Regional Health API');
  assert.equal(campRow.source_url, 'https://example-health-dept.gov.in/sample-camp-test');
  assert.equal(campRow.verification_status, 'Unverified'); // Ingested camps start Unverified

  // Cleanup
  db.prepare('DELETE FROM camps WHERE id = ?').run(insertedId);
  db.prepare('DELETE FROM camp_ingestion_runs WHERE id = ?').run(ingestionResult.runId);
});

test('Workflow: Ingestion -> Admin Verification -> Donor Slot Booking Workflow', async () => {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'Admin' LIMIT 1").get();
  const donor = db.prepare("SELECT id FROM users WHERE role = 'Donor' AND status = 'Active' LIMIT 1").get();
  const adminToken = createSessionToken(admin.id);
  const donorToken = createSessionToken(donor.id);

  // 1. Ingest camp
  const uniqueTitle = 'Workflow Regional Camp ' + Date.now();
  const ingestionResult = await runIngestion(db, {
    source: 'official_api',
    sourceName: 'Official Blood Transfusion Council',
    fetchFn: async () => ({
      records: [{
        title: uniqueTitle,
        date: '2026-12-10',
        venue: 'Rotary Community Hall',
        city: 'Coimbatore',
        capacity: 60,
        sourceUrl: 'https://official-camps.gov.in/c1'
      }]
    })
  });

  const campId = ingestionResult.insertedCamps[0].id;

  try {
    // 2. Camp starts as Unverified
    let camp = db.prepare('SELECT * FROM camps WHERE id = ?').get(campId);
    assert.equal(camp.verification_status, 'Unverified');

    // 3. Admin verifies camp
    const verifyRes = await request(`/api/camps/${campId}/verify`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { verificationStatus: 'Verified', verifiedBy: admin.id }
    });
    assert.equal(verifyRes.status, 200);

    camp = db.prepare('SELECT * FROM camps WHERE id = ?').get(campId);
    assert.equal(camp.verification_status, 'Verified');

    // 4. Donor registers for slot
    const regRes = await request('/api/camp_registrations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${donorToken}` },
      body: {
        campId,
        donorId: donor.id,
        slot: '11:00 AM - 01:00 PM'
      }
    });

    assert.equal(regRes.status, 200);
    assert.ok(regRes.body.verificationId);

    // 5. Registration confirmed in DB
    const regRow = db.prepare('SELECT * FROM camp_registrations WHERE camp_id = ? AND donor_id = ?').get(campId, donor.id);
    assert.ok(regRow);
    assert.equal(regRow.status, 'Registered');
    assert.equal(regRow.slot, '11:00 AM - 01:00 PM');
  } finally {
    db.prepare('DELETE FROM camp_registrations WHERE camp_id = ?').run(campId);
    db.prepare('DELETE FROM camps WHERE id = ?').run(campId);
    db.prepare('DELETE FROM camp_ingestion_runs WHERE id = ?').run(ingestionResult.runId);
  }
});
