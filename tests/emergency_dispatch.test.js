/* ==========================================================================
   LifeLink — Emergency Blood Matching & Dispatch End-to-End Test Suite
   --------------------------------------------------------------------------
   Verifies:
     1. ABO & Rh compatibility matrix for all 8 recipient blood types
     2. Only eligible, compatible donors are matched
     3. Haversine distance calculations are mathematically correct
     4. Donors outside the configured search radius are strictly excluded
     5. Donors who are temporarily ineligible (<90 days) are strictly excluded
     6. Emergency notifications are de-duplicated against spam
     7. Workflow state transitions & history retention
     8. SSE event emission and retry headers
     9. Hospital authorization guards (ownership enforcement)
    10. Admin universal monitoring and administrative override
   ========================================================================== */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const app = require('../server');
const { createSessionToken } = require('../auth');
const { haversineKm, rankDonorsForRequest, scoreEligibility } = require('../matching');

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
   1. Authoritative ABO & Rh Red Blood Cell Compatibility Matrix
   ========================================================================== */

test('ABO/Rh: Compatibility table strictly matches WHO/AABB red cell transfusion standards', () => {
  const bloodGroups = db.prepare('SELECT id, type FROM blood_groups').all();
  const idByType = Object.fromEntries(bloodGroups.map((g) => [g.type, g.id]));

  // Standard Red Cell compatibility rules:
  // O- can only receive O-
  // O+ can receive O-, O+
  // A- can receive O-, A-
  // A+ can receive O-, O+, A-, A+
  // B- can receive O-, B-
  // B+ can receive O-, O+, B-, B+
  // AB- can receive O-, A-, B-, AB-
  // AB+ can receive all 8 types
  const expectedRecipients = {
    'O-': ['O-'],
    'O+': ['O-', 'O+'],
    'A-': ['O-', 'A-'],
    'A+': ['O-', 'O+', 'A-', 'A+'],
    'B-': ['O-', 'B-'],
    'B+': ['O-', 'O+', 'B-', 'B+'],
    'AB-': ['O-', 'A-', 'B-', 'AB-'],
    'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
  };

  for (const [recipientType, allowedDonorTypes] of Object.entries(expectedRecipients)) {
    const recipientId = idByType[recipientType];
    assert.ok(recipientId, `Recipient blood group ${recipientType} must exist`);

    const compatibleRows = db
      .prepare('SELECT bg.type FROM blood_compatibility bc JOIN blood_groups bg ON bg.id = bc.donor_group_id WHERE bc.recipient_group_id = ?')
      .all(recipientId);
    const actualDonorTypes = compatibleRows.map((r) => r.type).sort();
    const sortedExpected = [...allowedDonorTypes].sort();

    assert.deepEqual(
      actualDonorTypes,
      sortedExpected,
      `Compatibility for ${recipientType} must exactly match authoritative medical standards`
    );
  }
});

/* ==========================================================================
   2. Haversine Distance Calculations
   ========================================================================== */

test('Distance: Haversine distance formula is mathematically exact', () => {
  // Test point 1: Equator 0,0 to 0,1 (approx 111.19 km)
  const distEquator = haversineKm(0, 0, 0, 1);
  assert.ok(Math.abs(distEquator - 111.19) < 0.5, `Expected ~111.19 km, got ${distEquator}`);

  // Test point 2: Zero distance
  assert.equal(haversineKm(11.0168, 76.9558, 11.0168, 76.9558), 0);

  // Test point 3: Known Coimbatore landmark distances
  // Coimbatore City Center (11.0168, 76.9558) to Peelamedu (11.0290, 77.0050) ~5.5 km
  const coimbatoreDist = haversineKm(11.0168, 76.9558, 11.0290, 77.0050);
  assert.ok(coimbatoreDist > 5.0 && coimbatoreDist < 6.5, `Expected ~5.5 km, got ${coimbatoreDist}`);

  // Test point 4: Null safety
  assert.equal(haversineKm(null, 76.9, 11.0, 76.9), null);
  assert.equal(haversineKm(11.0, null, 11.0, 76.9), null);
});

/* ==========================================================================
   3. Radius Exclusion & Eligibility Filtering
   ========================================================================== */

test('Matching: Donors outside configured radius are excluded from emergency matches', () => {
  const bloodGroups = db.prepare('SELECT id, type FROM blood_groups').all();
  const groupIdByType = Object.fromEntries(bloodGroups.map((g) => [g.type, g.id]));

  // Hospital in Coimbatore Center (11.0040, 76.9600)
  // Request with a tight 3 km radius
  const tightResult = rankDonorsForRequest(db, {
    requestedBloodType: 'O+',
    urgency: 'Normal', // Normal urgency: 0km radius boost
    lat: 11.0040,
    lng: 76.9600,
    radiusKm: 3,
    limit: 20,
    groupIdByType
  });

  for (const donor of tightResult.results) {
    assert.ok(
      donor.distanceKm !== null && donor.distanceKm <= 3,
      `Donor ${donor.donorId} distance ${donor.distanceKm} exceeds radius 3km`
    );
  }

  // Request with 25 km radius should include donors farther out
  const broadResult = rankDonorsForRequest(db, {
    requestedBloodType: 'O+',
    urgency: 'Normal',
    lat: 11.0040,
    lng: 76.9600,
    radiusKm: 25,
    limit: 20,
    groupIdByType
  });

  assert.ok(
    broadResult.results.length >= tightResult.results.length,
    'Broader radius must include at least as many donors as tight radius'
  );
});

test('Matching: Temporarily ineligible donors (<90 days donation interval) are excluded', () => {
  // Unit check on scoreEligibility gate
  const ineligible = scoreEligibility(30);
  assert.equal(ineligible.eligible, false);
  assert.equal(ineligible.score, 0);

  const eligibleExact = scoreEligibility(90);
  assert.equal(eligibleExact.eligible, true);
  assert.ok(eligibleExact.score > 0);

  // Database integration check: temporary test donor with recent donation
  const bloodGroups = db.prepare('SELECT id, type FROM blood_groups').all();
  const groupIdByType = Object.fromEntries(bloodGroups.map((g) => [g.type, g.id]));
  const oPosId = groupIdByType['O+'];

  const recentDonorId = 'test_donor_recent_' + Date.now();
  db.prepare(`
    INSERT INTO users (id, name, email, role, password_hash, status, is_new_registration, lat, lng)
    VALUES (?, 'Recent Test Donor', 'recent@test.local', 'Donor', 'hash', 'Active', 0, 11.0040, 76.9600)
  `).run(recentDonorId);

  // Set last donation date to 10 days ago (strictly ineligible under 90-day rule)
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO donor_profiles (user_id, blood_group_id, availability_status, last_donation_date)
    VALUES (?, ?, 'Active', ?)
  `).run(recentDonorId, oPosId, tenDaysAgo);

  try {
    const results = rankDonorsForRequest(db, {
      requestedBloodType: 'O+',
      urgency: 'Normal',
      lat: 11.0040,
      lng: 76.9600,
      radiusKm: 20,
      groupIdByType
    });

    const found = results.results.some((d) => d.donorId === recentDonorId);
    assert.equal(found, false, 'Donor who donated 10 days ago must be gated out as ineligible');
  } finally {
    db.prepare('DELETE FROM donor_profiles WHERE user_id = ?').run(recentDonorId);
    db.prepare('DELETE FROM users WHERE id = ?').run(recentDonorId);
  }
});

/* ==========================================================================
   4. Emergency Creation & Multi-Factor Matching Pipeline
   ========================================================================== */

test('Emergency Creation: End-to-end matching, donor candidate dispatch & persistence', async () => {
  const hospital = db.prepare("SELECT * FROM users WHERE role = 'Hospital' LIMIT 1").get();
  assert.ok(hospital, 'Seeded hospital must exist');

  const emergencyId = 'em_test_' + Date.now();
  const payload = {
    id: emergencyId,
    patientName: 'Critical Test Patient',
    bloodType: 'B+',
    hospital: hospital.name,
    lat: 11.0168,
    lng: 76.9558,
    units: 2,
    urgency: 'Critical',
    ward: 'ICU Trauma 1'
  };

  const res = await request('/api/emergencies', {
    method: 'POST',
    body: payload
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.emergency.id, emergencyId);
  assert.equal(res.body.emergency.status, res.body.matchedDonors > 0 ? 'Donors Notified' : 'Searching');

  // Verify database record
  const emergencyRow = db.prepare('SELECT * FROM emergencies WHERE id = ?').get(emergencyId);
  assert.ok(emergencyRow);
  assert.equal(emergencyRow.hospital_id, hospital.id);

  // Verify status transition history retention
  const history = db.prepare('SELECT * FROM emergency_status_history WHERE emergency_id = ? ORDER BY id ASC').all(emergencyId);
  assert.ok(history.length >= 2, 'Must record creation and progression in emergency_status_history');
  assert.equal(history[0].to_status, 'Pending');

  // Verify matches in donor_matches table
  if (res.body.matchedDonors > 0) {
    const matches = db.prepare('SELECT * FROM donor_matches WHERE emergency_id = ?').all(emergencyId);
    assert.equal(matches.length, res.body.matchedDonors);
    assert.ok(matches[0].distance_km !== null, 'Distance must be populated in donor_matches');
    assert.ok(matches[0].compatibility_score > 0);
  }

  // Cleanup
  db.prepare('DELETE FROM donor_matches WHERE emergency_id = ?').run(emergencyId);
  db.prepare('DELETE FROM emergency_status_history WHERE emergency_id = ?').run(emergencyId);
  db.prepare('DELETE FROM ai_predictions WHERE subject_id = ?').run(emergencyId);
  db.prepare('DELETE FROM emergencies WHERE id = ?').run(emergencyId);
});

/* ==========================================================================
   5. Anti-Spam Notification Deduplication
   ========================================================================== */

test('Notifications: Emergency requests suppress duplicate notifications within dedupe window', async () => {
  const donor = db.prepare("SELECT id FROM users WHERE role = 'Donor' AND status = 'Active' LIMIT 1").get();
  assert.ok(donor);

  const notificationService = require('../services/notifications');
  const testReqId = 'dedupe_test_' + Date.now();

  // First notification for this emergency
  const first = notificationService.notify(db, {
    userId: donor.id,
    type: 'donor_match',
    title: 'Urgent B+ Match',
    message: 'Test notification 1',
    relatedType: 'emergency',
    relatedId: testReqId,
    urgency: 'Urgent'
  });

  assert.equal(first.skipped, false);
  assert.ok(first.notificationId);

  // Immediate second notification for the same emergency & user must be suppressed
  const second = notificationService.notify(db, {
    userId: donor.id,
    type: 'donor_match',
    title: 'Urgent B+ Match (Duplicate)',
    message: 'Test notification 2',
    relatedType: 'emergency',
    relatedId: testReqId,
    urgency: 'Urgent'
  });

  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'duplicate-suppressed');

  // Cleanup
  db.prepare('DELETE FROM notifications WHERE id = ?').run(first.notificationId);
});

/* ==========================================================================
   6. State Machine Transitions & Donor Response Lifecycle
   ========================================================================== */

test('Lifecycle: Pending -> Searching -> Notified -> Responded -> Reserved -> Fulfilled', async () => {
  const hospital = db.prepare("SELECT * FROM users WHERE role = 'Hospital' LIMIT 1").get();
  const donor = db.prepare("SELECT id FROM users WHERE role = 'Donor' AND status = 'Active' LIMIT 1").get();
  const hospitalToken = createSessionToken(hospital.id);
  const donorToken = createSessionToken(donor.id);

  const emergencyId = 'life_cycle_' + Date.now();
  db.prepare(`
    INSERT INTO emergencies (id, patient_name, blood_group_id, hospital_id, hospital_name, lat, lng, units_needed, urgency, ward, status, alerts_sent, expires_at)
    VALUES (?, 'Lifecycle Patient', 1, ?, ?, 11.01, 76.95, 1, 'Critical', 'Emergency OT', 'Donors Notified', 1, datetime('now', '+30 minutes'))
  `).run(emergencyId, hospital.id, hospital.name);

  // Create match row in 'Notified' status
  const matchResult = db.prepare(`
    INSERT INTO donor_matches (emergency_id, donor_id, compatibility_score, distance_km, reliability_score, response_score, status)
    VALUES (?, ?, 100, 2.5, 90, 85, 'Notified')
  `).run(emergencyId, donor.id);

  try {
    // 1. Donor accepts the match
    const acceptRes = await request(`/api/emergencies/${emergencyId}/respond`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${donorToken}` },
      body: { donorId: donor.id, response: 'accept' }
    });
    assert.equal(acceptRes.status, 200);

    const postAcceptEmerg = db.prepare('SELECT status FROM emergencies WHERE id = ?').get(emergencyId);
    assert.equal(postAcceptEmerg.status, 'Donor Responded');

    // 2. Hospital reserves the accepted donor
    const reserveRes = await request(`/api/emergencies/${emergencyId}/reserve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospitalToken}` },
      body: { donorId: donor.id }
    });
    assert.equal(reserveRes.status, 200);

    const postReserveEmerg = db.prepare('SELECT status FROM emergencies WHERE id = ?').get(emergencyId);
    assert.equal(postReserveEmerg.status, 'Blood Reserved');

    // 3. Hospital marks request fulfilled
    const fulfillRes = await request(`/api/emergencies/${emergencyId}/fulfill`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospitalToken}` },
      body: {}
    });
    assert.equal(fulfillRes.status, 200);
    assert.equal(fulfillRes.body.donationCreated, true);

    const finalEmerg = db.prepare('SELECT status FROM emergencies WHERE id = ?').get(emergencyId);
    assert.equal(finalEmerg.status, 'Fulfilled');

    // 4. Verify donor profile was updated with new last_donation_date and next_eligible_date
    const updatedProfile = db.prepare('SELECT last_donation_date, next_eligible_date FROM donor_profiles WHERE user_id = ?').get(donor.id);
    if (updatedProfile) {
      assert.ok(updatedProfile.last_donation_date !== null);
      assert.ok(updatedProfile.next_eligible_date !== null);
    }
  } finally {
    db.prepare('DELETE FROM donations WHERE emergency_id = ?').run(emergencyId);
    db.prepare('DELETE FROM donor_matches WHERE emergency_id = ?').run(emergencyId);
    db.prepare('DELETE FROM emergency_status_history WHERE emergency_id = ?').run(emergencyId);
    db.prepare('DELETE FROM emergencies WHERE id = ?').run(emergencyId);
  }
});

/* ==========================================================================
   7. Authorization Guards: Hospital Isolation & Admin Supervision
   ========================================================================== */

test('Authorization: Unauthorized hospital cannot reserve or fulfill other hospital emergencies', async () => {
  const hospitals = db.prepare("SELECT * FROM users WHERE role = 'Hospital' LIMIT 2").all();
  assert.ok(hospitals.length >= 2, 'Requires two hospital accounts in database');
  const [hospA, hospB] = hospitals;

  const hospBToken = createSessionToken(hospB.id);
  const emergencyId = 'auth_guard_' + Date.now();

  // Create emergency owned by Hospital A
  db.prepare(`
    INSERT INTO emergencies (id, patient_name, blood_group_id, hospital_id, hospital_name, lat, lng, units_needed, urgency, ward, status, alerts_sent)
    VALUES (?, 'Isolation Patient', 1, ?, ?, 11.01, 76.95, 1, 'Critical', 'Ward A', 'Donor Responded', 1)
  `).run(emergencyId, hospA.id, hospA.name);

  try {
    // Hospital B attempts to reserve Hospital A's emergency
    const resReserve = await request(`/api/emergencies/${emergencyId}/reserve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospBToken}` },
      body: { donorId: 'any_donor' }
    });
    assert.equal(resReserve.status, 403);
    assert.match(resReserve.body.error, /only manage requests filed by your own hospital/i);

    // Hospital B attempts to fulfill Hospital A's emergency
    const resFulfill = await request(`/api/emergencies/${emergencyId}/fulfill`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospBToken}` },
      body: {}
    });
    assert.equal(resFulfill.status, 403);

    // Hospital B attempts to cancel Hospital A's emergency
    const resCancel = await request(`/api/emergencies/${emergencyId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospBToken}` },
      body: { reason: 'Malicious cancel' }
    });
    assert.equal(resCancel.status, 403);
  } finally {
    db.prepare('DELETE FROM emergencies WHERE id = ?').run(emergencyId);
  }
});

test('Authorization: Admin can monitor and administrate all emergencies', async () => {
  const admin = db.prepare("SELECT * FROM users WHERE role = 'Admin' LIMIT 1").get();
  assert.ok(admin, 'Admin must exist');
  const adminToken = createSessionToken(admin.id);

  // Admin lists all emergencies
  const listRes = await request('/api/emergencies', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body));

  // Admin can cancel any emergency
  const hosp = db.prepare("SELECT id, name FROM users WHERE role = 'Hospital' LIMIT 1").get();
  const testId = 'admin_override_' + Date.now();
  db.prepare(`
    INSERT INTO emergencies (id, patient_name, blood_group_id, hospital_id, hospital_name, lat, lng, units_needed, urgency, ward, status)
    VALUES (?, 'Admin Supervised', 1, ?, ?, 11.01, 76.95, 1, 'Urgent', 'General', 'Searching')
  `).run(testId, hosp.id, hosp.name);

  try {
    const cancelRes = await request(`/api/emergencies/${testId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { reason: 'Admin supervisory override' }
    });
    assert.equal(cancelRes.status, 200);

    const check = db.prepare('SELECT status FROM emergencies WHERE id = ?').get(testId);
    assert.equal(check.status, 'Cancelled');
  } finally {
    db.prepare('DELETE FROM emergency_status_history WHERE emergency_id = ?').run(testId);
    db.prepare('DELETE FROM emergencies WHERE id = ?').run(testId);
  }
});

/* ==========================================================================
   8. SSE Stream Verification
   ========================================================================== */

test('SSE: Event stream exposes text/event-stream headers and retry reconnect hint', async () => {
  const res = await fetch(`${baseUrl}/api/events/stream`, {
    headers: { Accept: 'text/event-stream' }
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.equal(res.headers.get('connection'), 'keep-alive');

  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);

  // Server must send retry reconnect parameter (retry: 2000)
  assert.match(text, /retry:\s*2000/);

  await reader.cancel();
});
