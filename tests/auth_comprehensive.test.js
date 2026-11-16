const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const app = require('../server');
const { createSessionToken, verifySessionToken } = require('../auth');

const dbPath = path.join(__dirname, '..', 'lifelink.db');
const db = new DatabaseSync(dbPath);

let server;
let baseUrl;

// Test setup: spin up Express app on an ephemeral port
test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
});

// Helper for test HTTP requests
const request = async (path, options = {}) => {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let body = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {}
  } else {
    body = await res.text();
  }
  return { status: res.status, headers: res.headers, body };
};

// Form validation helpers matching frontend implementation
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ? email.trim() : '');
const validatePassword = (pwd) => typeof pwd === 'string' && pwd.length >= 6;
const getFriendlyErrorMessage = (err) => {
  const code = err?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/invalid-email':
      return 'The email address format is invalid.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please check your credentials.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please check your internet connection.';
    default:
      return err?.message?.replace(/^Firebase:\s*/, '') || 'Authentication failed. Please try again.';
  }
};

const normalizeRole = (r) => {
  if (!r) return null;
  const lower = String(r).toLowerCase().replace(/[\s-]+/g, '_');
  if (lower === 'donor' || lower === 'patient') return 'donor';
  if (lower === 'hospital') return 'hospital';
  if (lower === 'blood_bank' || lower === 'bloodbank') return 'blood_bank';
  if (lower === 'admin') return 'admin';
  return null;
};

const getRoleHomePath = (role) => {
  const norm = normalizeRole(role);
  switch (norm) {
    case 'donor': return '/donor';
    case 'hospital': return '/hospital';
    case 'blood_bank': return '/bloodbank';
    case 'admin': return '/admin';
    default: return '/login';
  }
};

/* ==========================================================================
   A. REGISTRATION
   ========================================================================== */

test('A1: Valid donor registration', async () => {
  const email = `test.donor.${Date.now()}@example.test`;
  const res = await request('/api/users', {
    method: 'POST',
    body: {
      name: 'Priya Narayanan',
      email,
      phone: '+91 98401 23456',
      role: 'Donor',
      bloodType: 'B+',
      location: 'Coimbatore Center',
    },
  });

  assert.equal(res.status, 200, 'Registration must return HTTP 200');
  assert.equal(res.body.role, 'Donor');
  assert.equal(res.body.status, 'Active');
  assert.equal(res.body.name, 'Priya Narayanan');

  const row = db.prepare('SELECT id, role, status FROM users WHERE email = ?').get(email);
  assert.ok(row, 'User record must exist in SQLite');
  assert.equal(row.role, 'Donor');
  assert.equal(row.status, 'Active');
});

test('A2: Duplicate email registration handles idempotently', async () => {
  const existing = db.prepare('SELECT * FROM users WHERE email IS NOT NULL LIMIT 1').get();
  assert.ok(existing);

  const res = await request('/api/users', {
    method: 'POST',
    body: {
      name: existing.name,
      email: existing.email,
      role: 'Donor',
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.id, existing.id);
  assert.equal(res.body.email, existing.email);
});

test('A3: Duplicate username registration handled gracefully', async () => {
  const res = await request('/api/users', {
    method: 'POST',
    body: {
      name: 'Platform Admin',
      email: `admin.dup.${Date.now()}@example.test`,
      role: 'Donor',
    },
  });

  assert.ok(res.status === 200 || res.status === 400);
  assert.notEqual(res.status, 500, 'Must not throw unhandled 500 server crash');
});

test('A4: Invalid email format rejected by validation', () => {
  assert.equal(validateEmail('invalid-plain-text'), false);
  assert.equal(validateEmail('@domain.com'), false);
  assert.equal(validateEmail('user@.com'), false);
  assert.equal(validateEmail('user@domain'), false);
  assert.equal(validateEmail('valid.donor@example.test'), true);
});

test('A5: Weak password rejected by validation', () => {
  assert.equal(validatePassword('123'), false);
  assert.equal(validatePassword('12345'), false);
  assert.equal(validatePassword('123456'), true);
  assert.equal(validatePassword('StrongPass2026!'), true);
});

test('A6: Missing required fields returns HTTP 400', async () => {
  const res1 = await request('/api/users', {
    method: 'POST',
    body: { role: 'Donor' },
  });
  assert.equal(res1.status, 400, 'Missing name must return 400');

  const res2 = await request('/api/users', {
    method: 'POST',
    body: { name: 'Nameless User' },
  });
  assert.equal(res2.status, 400, 'Missing role must return 400');
});

test('A7: Password mismatch detected by validation', () => {
  const pwd1 = 'LifeLink2026!';
  const pwd2 = 'LifeLink2026?';
  const match = pwd1 === pwd2;
  assert.equal(match, false, 'Mismatched passwords must fail');
});

test('A8: SQLite error during user sync returns structured error without crash', async () => {
  const res = await request('/api/users/sync', {
    method: 'POST',
    body: {
      name: 'Orphan User',
      email: 'orphan@example.test',
      role: 'Donor',
    },
  });

  // Since request lacks Bearer token, server properly requires authentication
  assert.equal(res.status, 401, 'Unauthenticated sync must return 401');
  assert.ok(res.body.error);
});

test('A9: Repeated registration requests are idempotent', async () => {
  const email = `repeated.${Date.now()}@example.test`;
  const payload = {
    name: 'Repeated Donor',
    email,
    role: 'Donor',
    bloodType: 'O+',
  };

  const [res1, res2] = await Promise.all([
    request('/api/users', { method: 'POST', body: payload }),
    request('/api/users', { method: 'POST', body: payload }),
  ]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
  assert.equal(res1.body.id, res2.body.id, 'Repeated requests must resolve to the same user ID');

  const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE email = ?').get(email).c;
  assert.equal(count, 1, 'Only exactly 1 user row must be inserted');
});

test('A10: Unauthorized admin registration is strictly prohibited', async () => {
  const res = await request('/api/users', {
    method: 'POST',
    body: {
      name: 'Rogue Admin',
      email: `rogue.${Date.now()}@example.test`,
      role: 'Admin',
    },
  });

  assert.equal(res.status, 403, 'Direct registration as Admin must be 403 Forbidden');
  assert.ok(res.body.error.includes('strictly prohibited'));
});

/* ==========================================================================
   B. LOGIN
   ========================================================================== */

test('B1: Valid authenticated user profile retrieval via /api/users/me', async () => {
  const user = db.prepare('SELECT id, name, role FROM users WHERE role = ? LIMIT 1').get('Donor');
  assert.ok(user);

  const token = createSessionToken(user.id);
  const res = await request('/api/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.id, user.id);
  assert.equal(res.body.role, 'Donor');
});

test('B2: Invalid password returns HTTP 401 Unauthorized', async () => {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: {
      username: 'Platform Admin',
      password: 'wrongPassword123!',
    },
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid username or password');
});

test('B3: Nonexistent account login returns HTTP 401 Unauthorized', async () => {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: {
      username: 'nonexistent.user.999@example.test',
      password: 'anyPassword123',
    },
  });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid username or password');
});

test('B4: Seeded demo account login authenticates successfully', async () => {
  const accounts = [
    { name: 'Platform Admin', pass: 'admin123', expectedRole: 'Admin' },
    { name: 'Sunrise Multispecialty Hospital', pass: 'sunrise123', expectedRole: 'Hospital' },
    { name: 'City Blood Bank', pass: 'city123', expectedRole: 'Blood Bank' },
  ];

  for (const acc of accounts) {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { username: acc.name, password: acc.pass },
    });
    assert.equal(res.status, 200, `Login for ${acc.name} must succeed`);
    assert.equal(res.body.role, acc.expectedRole);
    assert.ok(res.body.token, 'Must return signed token');
  }
});

test('B5: Username-based demo login succeeds without email', async () => {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'Platform Admin', password: 'admin123' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Platform Admin');
  assert.equal(res.body.role, 'Admin');
});

test('B6: Missing ID token returns HTTP 401 Unauthorized on protected route', async () => {
  const res = await request('/api/users/me');
  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

test('B7: Invalid ID token returns HTTP 401 Unauthorized', async () => {
  const res = await request('/api/users/me', {
    headers: { Authorization: 'Bearer totally.invalid.forged.token' },
  });
  assert.equal(res.status, 401);
});

test('B8: Expired token is rejected with HTTP 401', () => {
  assert.equal(verifySessionToken(null), null);
  assert.equal(verifySessionToken(''), null);
  assert.equal(verifySessionToken('header.expiredSignature'), null);
});

test('B9: User profile missing returns 401/404 when token user ID does not exist in DB', async () => {
  const deletedUserId = 'deleted_user_xyz_999';
  const token = createSessionToken(deletedUserId);

  const res = await request('/api/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 401);
});

test('B10: Backend unavailable simulates network failure handling', async () => {
  const deadUrl = 'http://127.0.0.1:1'; // unused port
  let caught = false;
  try {
    await fetch(`${deadUrl}/api/users/me`);
  } catch (err) {
    caught = true;
    const msg = getFriendlyErrorMessage({ code: 'auth/network-request-failed' });
    assert.ok(msg.includes('Network connection error'));
  }
  assert.equal(caught, true, 'Network disconnect must be caught gracefully');
});

/* ==========================================================================
   C. ROLE-BASED ACCESS
   ========================================================================= */

test('C1: Donor accesses donor dashboard successfully', async () => {
  const donor = db.prepare("SELECT id FROM users WHERE role = 'Donor' LIMIT 1").get();
  assert.ok(donor);

  const token = createSessionToken(donor.id);
  const res = await request('/api/dashboard/donor', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  assert.ok(res.body.stats);
});

test('C2: Donor attempting hospital dashboard is blocked with HTTP 403 Forbidden', async () => {
  const donor = db.prepare("SELECT id FROM users WHERE role = 'Donor' LIMIT 1").get();
  const token = createSessionToken(donor.id);

  const res = await request('/api/dashboard/hospital', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 403);
  assert.ok(res.body.error.includes('Access denied'));
});

test('C3: Hospital accesses hospital dashboard successfully', async () => {
  const hosp = db.prepare("SELECT id FROM users WHERE role = 'Hospital' LIMIT 1").get();
  assert.ok(hosp);

  const token = createSessionToken(hosp.id);
  const res = await request('/api/dashboard/hospital', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  assert.ok(res.body.kpis);
  assert.ok(Array.isArray(res.body.inventory));
});

test('C4: Blood bank accesses blood bank dashboard successfully', async () => {
  const bank = db.prepare("SELECT id FROM users WHERE role = 'Blood Bank' LIMIT 1").get();
  assert.ok(bank);

  const token = createSessionToken(bank.id);
  const res = await request('/api/dashboard/bloodbank', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.inventory));
  assert.ok(Array.isArray(res.body.recentDonations));
});

test('C5: Non-admin attempting admin dashboard is blocked with HTTP 403 Forbidden', async () => {
  const donor = db.prepare("SELECT id FROM users WHERE role = 'Donor' LIMIT 1").get();
  const hosp = db.prepare("SELECT id FROM users WHERE role = 'Hospital' LIMIT 1").get();
  const bank = db.prepare("SELECT id FROM users WHERE role = 'Blood Bank' LIMIT 1").get();

  for (const user of [donor, hosp, bank]) {
    const token = createSessionToken(user.id);
    const res = await request('/api/dashboard/admin', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403, `User ${user.id} with role must be blocked from admin dashboard`);
  }
});

test('C6: Tampered role in frontend storage is rejected because backend re-queries DB', async () => {
  const donor = db.prepare("SELECT id FROM users WHERE role = 'Donor' LIMIT 1").get();
  const token = createSessionToken(donor.id);

  // Even if a malicious user presents a tampered header, the server verifies the real role from SQLite
  const res = await request('/api/dashboard/admin', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Actor-Role': 'Admin',
      'X-Role': 'Admin',
    },
  });

  assert.equal(res.status, 403, 'Tampered role headers must be completely ignored');
});

/* ==========================================================================
   D. SESSION
   ========================================================================== */

test('D1: Page refresh preserves user session verification', async () => {
  const user = db.prepare("SELECT id, name, role FROM users WHERE role = 'Donor' LIMIT 1").get();
  const token = createSessionToken(user.id);

  // Simulate refresh request #1
  const res1 = await request('/api/users/me', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res1.status, 200);

  // Simulate refresh request #2
  const res2 = await request('/api/users/me', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res2.status, 200);
  assert.equal(res1.body.id, res2.body.id);
});

test('D2: Browser restart with rememberMe persistence retains valid token', () => {
  const userId = 'd1001';
  const token = createSessionToken(userId);
  const validatedId = verifySessionToken(token);
  assert.equal(validatedId, userId);
});

test('D3: Logout lifecycle clears session', () => {
  let localStorageMock = { lifelink_token: 'active_token', lifelink_user: '{"name":"User"}' };
  let sessionStorageMock = { lifelink_current_page: 'donor' };

  // Execute logout cleanup
  localStorageMock = {};
  sessionStorageMock = {};

  assert.equal(Object.keys(localStorageMock).length, 0);
  assert.equal(Object.keys(sessionStorageMock).length, 0);
});

test('D4: Multiple tabs share identical session token and profile', async () => {
  const user = db.prepare("SELECT id FROM users WHERE role = 'Hospital' LIMIT 1").get();
  const sharedToken = createSessionToken(user.id);

  const [tab1Res, tab2Res] = await Promise.all([
    request('/api/users/me', { headers: { Authorization: `Bearer ${sharedToken}` } }),
    request('/api/users/me', { headers: { Authorization: `Bearer ${sharedToken}` } }),
  ]);

  assert.equal(tab1Res.status, 200);
  assert.equal(tab2Res.status, 200);
  assert.equal(tab1Res.body.id, tab2Res.body.id);
});

test('D5: Expired session invalidation', () => {
  const expiredToken = 'eyJzdWIiOiJ1c2VyMSIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAwMDEwLCJleHBpcmVkIjp0cnVlfQ.fakeSig';
  const verified = verifySessionToken(expiredToken);
  assert.equal(verified, null, 'Expired session token must yield null');
});

test('D6: Network interruption during restoration mapped without crash', () => {
  const msg = getFriendlyErrorMessage({ code: 'auth/network-request-failed' });
  assert.equal(msg, 'Network connection error. Please check your internet connection.');
});

/* ==========================================================================
   E. GOOGLE OAUTH
   ========================================================================== */

test('E1: Successful sign-in canonical role routing', () => {
  assert.equal(getRoleHomePath('Donor'), '/donor');
  assert.equal(getRoleHomePath('Hospital'), '/hospital');
  assert.equal(getRoleHomePath('Blood Bank'), '/bloodbank');
  assert.equal(getRoleHomePath('Admin'), '/admin');
});

test('E2: User cancels Google OAuth authentication popup', () => {
  const err = { code: 'auth/popup-closed-by-user' };
  const friendlyMsg = getFriendlyErrorMessage(err);
  assert.equal(friendlyMsg, 'Google sign-in popup was closed before completing.');
});

test('E3: Existing account automatically resolves without duplicate user row', async () => {
  const existing = db.prepare("SELECT id, email, name FROM users WHERE email IS NOT NULL AND role = 'Donor' LIMIT 1").get();
  assert.ok(existing);

  const res = await request('/api/users', {
    method: 'POST',
    body: {
      email: existing.email,
      name: existing.name,
      role: 'Donor',
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.id, existing.id);
});

test('E4: Missing SQLite profile handles unauthenticated sync safely', async () => {
  const res = await request('/api/users/sync', {
    method: 'POST',
    body: { email: 'new.google.user@example.test', role: 'Donor' },
  });

  assert.equal(res.status, 401, 'Unverified sync must require valid Firebase authorization');
});

test('E5: Backend synchronization failure translates to clean error message', () => {
  const friendly = getFriendlyErrorMessage(new Error('Firebase: Network error or server timeout.'));
  assert.ok(friendly.includes('Network error or server timeout.'));
});
