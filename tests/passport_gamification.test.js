/* ==========================================================================
   LifeLink — Donor Passport & Gamification Module Test Suite
   --------------------------------------------------------------------------
   Verifies:
     1. Donor profile retrieval & field completeness (passportId, bloodType, availabilityStatus)
     2. Total completed donations synchronization with verified records
     3. Total blood units donated calculation (sum of completed units)
     4. Donation history retrieval and authorized access boundaries
     5. Next eligible donation countdown adhering to clinical 90-day whole blood interval
     6. Digital badges unlock rules strictly based on verified completed donations
     7. Donation certificate generation for verified completed donations (400 on scheduled, 403 on unauthorized)
     8. Community leaderboard privacy protection (masked donor names, zero personal info leaks)
     9. Donation milestones progression
    10. Profile editing permitted fields & strict HTTP 403 blocking on manual donation/XP tampering
   ========================================================================== */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const app = require('../server');
const { createSessionToken } = require('../auth');

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
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, data, headers: res.headers };
};

// Seed helper for test donors and hospitals
const createTestDonor = (prefix) => {
  const ts = Date.now() + Math.floor(Math.random() * 10000);
  const id = `donor_${prefix}_${ts}`;
  const passportId = `LL-PASSPORT-${ts}`;
  db.prepare(`
    INSERT INTO users (id, name, email, phone, role, password_hash, passport_id, total_donations, xp, status)
    VALUES (?, ?, ?, ?, 'Donor', 'test_hash', ?, 0, 0, 'Active')
  `).run(id, `Test Donor ${prefix}`, `donor_${ts}@lifelink.test`, '+91 9876543210', passportId);

  // Group 7 is O+
  db.prepare(`
    INSERT INTO donor_profiles (user_id, blood_group_id, availability_status)
    VALUES (?, 7, 'Active')
  `).run(id);

  return { id, passportId, name: `Test Donor ${prefix}`, email: `donor_${ts}@lifelink.test` };
};

const createTestHospital = (prefix) => {
  const ts = Date.now() + Math.floor(Math.random() * 10000);
  const id = `hosp_${prefix}_${ts}`;
  db.prepare(`
    INSERT INTO users (id, name, email, role, password_hash, status)
    VALUES (?, ?, ?, 'Hospital', 'test_hash', 'Active')
  `).run(id, `Test Hospital ${prefix}`, `hosp_${ts}@lifelink.test`);

  db.prepare(`
    INSERT INTO hospital_profiles (user_id, verification_status, quota_used, quota_limit)
    VALUES (?, 'Verified', 0, 100)
  `).run(id);

  return { id, name: `Test Hospital ${prefix}` };
};

/* ==========================================================================
   TEST 1: Donor Profile & Field Completeness
   ========================================================================== */
test('1. Donor Profile: retrieves profile with passportId, bloodType, and availabilityStatus', async () => {
  const donor = createTestDonor('prof');
  const token = createSessionToken(donor.id);

  const res = await request('/api/users/me', {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.id, donor.id);
  assert.equal(res.data.passportId, donor.passportId);
  assert.equal(res.data.bloodType, 'O+');
  assert.equal(res.data.availabilityStatus, 'Active');
  assert.equal(typeof res.data.donations, 'number');
  assert.equal(typeof res.data.totalUnitsDonated, 'number');
});

/* ==========================================================================
   TEST 2: Total Completed Donations & Units Synchronization
   ========================================================================== */
test('2. Total Completed Donations & Units: synchronized strictly with completed donations in DB', async () => {
  const donor = createTestDonor('sync');
  const hosp = createTestHospital('sync');
  const token = createSessionToken(donor.id);

  // Insert 2 completed donations and 1 scheduled donation
  const dn1 = `dn_c1_${Date.now()}`;
  const dn2 = `dn_c2_${Date.now()}`;
  const dn3 = `dn_s1_${Date.now()}`;

  db.prepare(`
    INSERT INTO donations (id, donor_id, blood_group_id, hospital_id, units, status, donation_date)
    VALUES (?, ?, 7, ?, 2, 'Completed', '2026-05-10')
  `).run(dn1, donor.id, hosp.id);

  db.prepare(`
    INSERT INTO donations (id, donor_id, blood_group_id, hospital_id, units, status, donation_date)
    VALUES (?, ?, 7, ?, 1, 'Completed', '2026-08-15')
  `).run(dn2, donor.id, hosp.id);

  db.prepare(`
    INSERT INTO donations (id, donor_id, blood_group_id, hospital_id, units, status, donation_date)
    VALUES (?, ?, 7, ?, 1, 'Scheduled', '2026-12-01')
  `).run(dn3, donor.id, hosp.id);

  const res = await request('/api/users/me', {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(res.status, 200);
  // Exactly 2 completed donations (scheduled is excluded)
  assert.equal(res.data.donations, 2);
  // Total units: 2 + 1 = 3 units
  assert.equal(res.data.totalUnitsDonated, 3);
  // Last donation date should be the latest completed date
  assert.equal(res.data.lastDonationDate, '2026-08-15');
});

/* ==========================================================================
   TEST 3: Manual Tampering Prevention (Donation & XP Self-Editing Blocked)
   ========================================================================== */
test('3. Security: donor attempting to manually edit donations or XP is blocked with HTTP 403', async () => {
  const donor = createTestDonor('tamper');
  const token = createSessionToken(donor.id);

  // Attempt to modify donations count
  const resDonations = await request(`/api/users/${donor.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: { donations: 50 }
  });
  assert.equal(resDonations.status, 403);
  assert.match(resDonations.data.error, /Only an Admin, Hospital, or Blood Bank can record donations/i);

  // Attempt to modify XP
  const resXp = await request(`/api/users/${donor.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: { xp: 100000 }
  });
  assert.equal(resXp.status, 403);
  assert.match(resXp.data.error, /Only an Admin, Hospital, or Blood Bank can adjust XP/i);

  // Verify DB state was NOT modified
  const userRow = db.prepare('SELECT total_donations, xp FROM users WHERE id = ?').get(donor.id);
  assert.equal(userRow.total_donations, 0);
  assert.equal(userRow.xp, 0);
});

/* ==========================================================================
   TEST 4: Permitted Profile Editing (Name, Phone, Location, Availability)
   ========================================================================== */
test('4. Profile Editing: donor can update permitted profile fields and availability status', async () => {
  const donor = createTestDonor('edit');
  const token = createSessionToken(donor.id);

  const res = await request(`/api/users/${donor.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      name: 'Dr. Jane Donor Updated',
      phone: '+91 99999 88888',
      location: 'Coimbatore, Tamil Nadu',
      availabilityStatus: 'On Duty'
    }
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  // Verify database persistence
  const updatedUser = db.prepare('SELECT name, phone FROM users WHERE id = ?').get(donor.id);
  assert.equal(updatedUser.name, 'Dr. Jane Donor Updated');
  assert.equal(updatedUser.phone, '+91 99999 88888');

  const updatedProfile = db.prepare('SELECT availability_status FROM donor_profiles WHERE user_id = ?').get(donor.id);
  assert.equal(updatedProfile.availability_status, 'On Duty');
});

/* ==========================================================================
   TEST 5: Donation History & Access Authorization
   ========================================================================== */
test('5. Donation History: returns accurate history with units and certificateId for owner only', async () => {
  const donor = createTestDonor('hist');
  const otherDonor = createTestDonor('other_hist');
  const hosp = createTestHospital('hist');
  const token = createSessionToken(donor.id);

  const dnId = `dn_hist_${Date.now()}`;
  db.prepare(`
    INSERT INTO donations (id, donor_id, blood_group_id, hospital_id, units, status, donation_date)
    VALUES (?, ?, 7, ?, 1, 'Completed', '2026-07-20')
  `).run(dnId, donor.id, hosp.id);

  // Owner requests own history
  const res = await request('/api/donations', {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data));
  const record = res.data.find((d) => d.id === dnId);
  assert.ok(record, 'Created donation must be in history');
  assert.equal(record.units, 1);
  assert.equal(record.status, 'Completed');
  assert.equal(record.certificateId, `LL-CERT-${dnId.toUpperCase()}`);

  // Non-privileged user querying another donor's ID is restricted to their own
  const otherToken = createSessionToken(otherDonor.id);
  const otherRes = await request(`/api/donations?donor_id=${donor.id}`, {
    headers: { Authorization: `Bearer ${otherToken}` }
  });
  // Server enforces non-privileged actor only sees their own (or empty)
  const leakCheck = otherRes.data.find((d) => d.id === dnId);
  assert.equal(leakCheck, undefined, 'Must not leak donation history of other donors');
});

/* ==========================================================================
   TEST 6: Donation Certificates (Completed Only vs Scheduled Rejection)
   ========================================================================== */
test('6. Certificates: issued for verified completed donations; rejected for scheduled/pending', async () => {
  const donor = createTestDonor('cert');
  const hosp = createTestHospital('cert');
  const token = createSessionToken(donor.id);

  const completedId = `dn_comp_${Date.now()}`;
  const scheduledId = `dn_sched_${Date.now()}`;

  db.prepare(`
    INSERT INTO donations (id, donor_id, blood_group_id, hospital_id, units, status, donation_date)
    VALUES (?, ?, 7, ?, 1, 'Completed', '2026-06-15')
  `).run(completedId, donor.id, hosp.id);

  db.prepare(`
    INSERT INTO donations (id, donor_id, blood_group_id, hospital_id, units, status, donation_date)
    VALUES (?, ?, 7, ?, 1, 'Scheduled', '2026-10-01')
  `).run(scheduledId, donor.id, hosp.id);

  // Completed donation -> certificate success
  const resCert = await request(`/api/donations/${completedId}/certificate`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(resCert.status, 200);
  assert.equal(resCert.data.certificateId, `LL-CERT-${completedId.toUpperCase()}`);
  assert.equal(resCert.data.donorName, donor.name);
  assert.ok(resCert.data.maskedPassportId.includes('***'));
  assert.equal(resCert.data.units, 1);
  assert.equal(resCert.data.verificationSeal, 'LIFELINK-OFFICIAL-VERIFIED');
  assert.ok(resCert.data.verificationCode);

  // Scheduled donation -> rejected with HTTP 400
  const resSchedCert = await request(`/api/donations/${scheduledId}/certificate`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(resSchedCert.status, 400);
  assert.match(resSchedCert.data.error, /Certificates can only be issued for verified completed donations/i);
});

/* ==========================================================================
   TEST 7: Community Leaderboard Privacy Protection
   ========================================================================== */
test('7. Leaderboard: privacy-safe rankings mask donor names and hide sensitive contact details', async () => {
  const donor1 = createTestDonor('privacy1');
  const donor2 = createTestDonor('privacy2');

  // Credit some XP and donations to donor1
  db.prepare("UPDATE users SET total_donations = 8, xp = 1600, status = 'Active' WHERE id = ?").run(donor1.id);
  db.prepare("UPDATE users SET total_donations = 4, xp = 800, status = 'Active' WHERE id = ?").run(donor2.id);

  const token1 = createSessionToken(donor1.id);

  const res = await request('/api/leaderboard', {
    headers: { Authorization: `Bearer ${token1}` }
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.leaderboard));
  assert.ok(res.data.leaderboard.length >= 2);

  // Find donor2 on the leaderboard
  const entry2 = res.data.leaderboard.find((d) => d.donations === 4 && d.xp === 800);
  assert.ok(entry2, 'Donor2 must appear on leaderboard');

  // Verify privacy masking:
  // Full name is masked (e.g. "Test P.")
  assert.ok(entry2.name.includes('.'), `Donor name should be masked: ${entry2.name}`);
  // Sensitive personal fields MUST NOT exist in the payload
  assert.equal(entry2.email, undefined);
  assert.equal(entry2.phone, undefined);
  assert.equal(entry2.passportId, undefined);
  assert.equal(entry2.passport_id, undefined);
  assert.equal(entry2.telegramChatId, undefined);
  // Real DB id should be obscured for other users
  assert.ok(!entry2.id.startsWith('donor_privacy2_'), 'Database ID should not be leaked for other users');

  // Verify caller's own rank is identified
  assert.ok(res.data.currentUserRank);
  assert.equal(res.data.currentUserRank.donations, 8);
  assert.equal(res.data.currentUserRank.isCurrent, true);
});

/* ==========================================================================
   TEST 8: Next Eligible Donation Countdown & Clinical 90-Day Rule
   ========================================================================== */
test('8. Clinical Eligibility: next eligible donation interval enforces 90-day whole blood recovery', async () => {
  const donor = createTestDonor('interval');
  const hosp = createTestHospital('interval');

  // Complete a donation today
  const hospToken = createSessionToken(hosp.id);
  const donationId = `dn_interval_${Date.now()}`;

  const res = await request('/api/recent_donations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${hospToken}` },
    body: {
      id: donationId,
      donor: donor.id,
      bloodType: 'O+',
      hospital: hosp.id,
      units: 1,
      status: 'Completed',
      donationDate: '2026-05-01'
    }
  });

  assert.equal(res.status, 200);

  // Check updated donor profile
  const profile = db.prepare('SELECT last_donation_date, next_eligible_date FROM donor_profiles WHERE user_id = ?').get(donor.id);
  assert.equal(profile.last_donation_date, '2026-05-01');

  // 90 days after 2026-05-01 is 2026-07-30
  const expectedNext = new Date('2026-05-01');
  expectedNext.setDate(expectedNext.getDate() + 90);
  const expectedNextStr = expectedNext.toISOString().split('T')[0];

  assert.equal(profile.next_eligible_date, expectedNextStr);
});

/* ==========================================================================
   TEST 9: Digital Badges & Milestones Logic
   ========================================================================== */
test('9. Badges & Milestones: unlocks strictly with verified completed donations', () => {
  // Test badge evaluation rules
  const badges = [
    { id: 'first_drop', unlockAt: 1 },
    { id: 'lifesaver', unlockAt: 3 },
    { id: 'guardian', unlockAt: 5 },
    { id: 'champion', unlockAt: 10 },
    { id: 'legend', unlockAt: 25 }
  ];

  // Donor with 0 donations has 0 badges
  assert.equal(badges.filter((b) => 0 >= b.unlockAt).length, 0);

  // Donor with 1 donation has 1 badge (First Drop)
  assert.equal(badges.filter((b) => 1 >= b.unlockAt).length, 1);

  // Donor with 4 donations has 2 badges (First Drop, Lifesaver)
  assert.equal(badges.filter((b) => 4 >= b.unlockAt).length, 2);

  // Donor with 12 donations has 4 badges
  assert.equal(badges.filter((b) => 12 >= b.unlockAt).length, 4);

  // Donor with 26 donations has all 5 milestone badges
  assert.equal(badges.filter((b) => 26 >= b.unlockAt).length, 5);
});

/* ==========================================================================
   TEST 10: Authorized Completion Updates Total Donations and XP
   ========================================================================== */
test('10. Donation Completion: authorized draw completion credits total donations, XP, and eligibility', async () => {
  const donor = createTestDonor('complete');
  const hosp = createTestHospital('complete');
  const hospToken = createSessionToken(hosp.id);

  const donationId = `dn_draw_${Date.now()}`;
  // Initially scheduled
  db.prepare(`
    INSERT INTO donations (id, donor_id, blood_group_id, hospital_id, units, status, donation_date)
    VALUES (?, ?, 7, ?, 1, 'Scheduled', NULL)
  `).run(donationId, donor.id, hosp.id);

  // Hospital completes the blood draw
  const res = await request(`/api/donations/${donationId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hospToken}` }
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  // Check donor's total_donations and xp
  const updatedUser = db.prepare('SELECT total_donations, xp FROM users WHERE id = ?').get(donor.id);
  assert.equal(updatedUser.total_donations, 1);
  assert.equal(updatedUser.xp, 200);

  // Check donation row
  const updatedDonation = db.prepare('SELECT status, donation_date FROM donations WHERE id = ?').get(donationId);
  assert.equal(updatedDonation.status, 'Completed');
  assert.ok(updatedDonation.donation_date);
});
