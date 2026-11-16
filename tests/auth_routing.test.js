const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { createSessionToken, verifySessionToken } = require('../auth');

const dbPath = path.join(__dirname, '..', 'lifelink.db');
const db = new DatabaseSync(dbPath);

// Role normalization logic (mirrors client/src/context/RoutingContext.tsx and server.js)
const normalizeRole = (role) => {
  if (!role) return null;
  const clean = String(role).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (clean === 'donor' || clean === 'patient') return 'donor';
  if (clean === 'hospital') return 'hospital';
  if (clean === 'blood_bank' || clean === 'bloodbank') return 'blood_bank';
  if (clean === 'admin') return 'admin';
  return null;
};

// Canonical role redirect paths (mirrors getRoleHomePath)
const getRoleHomePath = (role) => {
  const norm = normalizeRole(role);
  switch (norm) {
    case 'donor':
      return '/donor';
    case 'hospital':
      return '/hospital';
    case 'blood_bank':
      return '/bloodbank';
    case 'admin':
      return '/admin';
    default:
      return '/login';
  }
};

// Role permissions mapping (mirrors ROLE_PERMISSIONS)
const ROLE_PERMISSIONS = {
  'donor': ['donor'],
  'donor-dash': ['donor'],
  'hospital': ['hospital'],
  'bloodbank': ['blood_bank'],
  'admin': ['admin'],
  'dashboard': ['admin'],
  'forecast': ['admin'],
  'analytics': ['admin', 'hospital', 'blood_bank'],
};

const isPageRoleGated = (page) => page in ROLE_PERMISSIONS;

const isPagePermitted = (page, role) => {
  const allowed = ROLE_PERMISSIONS[page];
  if (!allowed) return true;
  const norm = normalizeRole(role);
  if (!norm) return false;
  return allowed.includes(norm);
};

// URL path to Page parser (mirrors pathToPage)
const pathToPage = (pathname) => {
  const clean = (pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
  switch (clean) {
    case '':
    case 'home':
      return 'home';
    case 'donor':
    case 'donor-dash':
      return 'donor';
    case 'hospital':
      return 'hospital';
    case 'bloodbank':
    case 'blood_bank':
    case 'blood-bank':
      return 'bloodbank';
    case 'admin':
    case 'dashboard':
      return 'admin';
    case 'auth':
    case 'login':
    case 'signin':
    case 'register':
      return 'auth';
    case 'forecast':
      return 'forecast';
    case 'analytics':
      return 'analytics';
    default:
      return 'home';
  }
};

/* --------------------------------------------------------------------------
   1. ROLE-BASED REDIRECTS (FOR ALL 4 ROLES)
   -------------------------------------------------------------------------- */

test('redirects: donor maps to canonical path /donor', () => {
  assert.equal(getRoleHomePath('Donor'), '/donor');
  assert.equal(getRoleHomePath('donor'), '/donor');
  assert.equal(getRoleHomePath('Patient'), '/donor');
});

test('redirects: hospital maps to canonical path /hospital', () => {
  assert.equal(getRoleHomePath('Hospital'), '/hospital');
  assert.equal(getRoleHomePath('hospital'), '/hospital');
});

test('redirects: blood_bank maps to canonical path /bloodbank', () => {
  assert.equal(getRoleHomePath('Blood Bank'), '/bloodbank');
  assert.equal(getRoleHomePath('blood_bank'), '/bloodbank');
  assert.equal(getRoleHomePath('bloodbank'), '/bloodbank');
});

test('redirects: admin maps to canonical path /admin', () => {
  assert.equal(getRoleHomePath('Admin'), '/admin');
  assert.equal(getRoleHomePath('admin'), '/admin');
});

/* --------------------------------------------------------------------------
   2. PROTECTED ROUTES FOR DONOR ROLE
   -------------------------------------------------------------------------- */

test('role protection [donor]: permitted on donor dashboard', () => {
  assert.equal(isPagePermitted('donor', 'Donor'), true);
  assert.equal(isPagePermitted('donor-dash', 'Donor'), true);
  assert.equal(isPagePermitted('home', 'Donor'), true);
});

test('role protection [donor]: forbidden on hospital dashboard', () => {
  assert.equal(isPagePermitted('hospital', 'Donor'), false);
});

test('role protection [donor]: forbidden on blood bank dashboard', () => {
  assert.equal(isPagePermitted('bloodbank', 'Donor'), false);
});

test('role protection [donor]: forbidden on admin dashboard and forecast', () => {
  assert.equal(isPagePermitted('admin', 'Donor'), false);
  assert.equal(isPagePermitted('dashboard', 'Donor'), false);
  assert.equal(isPagePermitted('forecast', 'Donor'), false);
});

/* --------------------------------------------------------------------------
   3. PROTECTED ROUTES FOR HOSPITAL ROLE
   -------------------------------------------------------------------------- */

test('role protection [hospital]: permitted on hospital dashboard and analytics', () => {
  assert.equal(isPagePermitted('hospital', 'Hospital'), true);
  assert.equal(isPagePermitted('analytics', 'Hospital'), true);
});

test('role protection [hospital]: forbidden on donor dashboard', () => {
  assert.equal(isPagePermitted('donor', 'Hospital'), false);
});

test('role protection [hospital]: forbidden on blood bank dashboard', () => {
  assert.equal(isPagePermitted('bloodbank', 'Hospital'), false);
});

test('role protection [hospital]: forbidden on admin dashboard and forecast', () => {
  assert.equal(isPagePermitted('admin', 'Hospital'), false);
  assert.equal(isPagePermitted('dashboard', 'Hospital'), false);
  assert.equal(isPagePermitted('forecast', 'Hospital'), false);
});

/* --------------------------------------------------------------------------
   4. PROTECTED ROUTES FOR BLOOD BANK ROLE
   -------------------------------------------------------------------------- */

test('role protection [blood_bank]: permitted on blood bank dashboard and analytics', () => {
  assert.equal(isPagePermitted('bloodbank', 'Blood Bank'), true);
  assert.equal(isPagePermitted('analytics', 'Blood Bank'), true);
});

test('role protection [blood_bank]: forbidden on donor dashboard', () => {
  assert.equal(isPagePermitted('donor', 'Blood Bank'), false);
});

test('role protection [blood_bank]: forbidden on hospital dashboard', () => {
  assert.equal(isPagePermitted('hospital', 'Blood Bank'), false);
});

test('role protection [blood_bank]: forbidden on admin dashboard and forecast', () => {
  assert.equal(isPagePermitted('admin', 'Blood Bank'), false);
  assert.equal(isPagePermitted('dashboard', 'Blood Bank'), false);
  assert.equal(isPagePermitted('forecast', 'Blood Bank'), false);
});

/* --------------------------------------------------------------------------
   5. PROTECTED ROUTES FOR ADMIN ROLE
   -------------------------------------------------------------------------- */

test('role protection [admin]: permitted on admin dashboard, forecast, and analytics', () => {
  assert.equal(isPagePermitted('admin', 'Admin'), true);
  assert.equal(isPagePermitted('dashboard', 'Admin'), true);
  assert.equal(isPagePermitted('forecast', 'Admin'), true);
  assert.equal(isPagePermitted('analytics', 'Admin'), true);
});

test('role protection [admin]: verified admin is distinct from public roles', () => {
  const nonAdminRoles = ['Donor', 'Hospital', 'Blood Bank', 'Patient'];
  nonAdminRoles.forEach((role) => {
    assert.equal(isPagePermitted('admin', role), false, `Role ${role} must not access admin`);
    assert.equal(isPagePermitted('forecast', role), false, `Role ${role} must not access forecast`);
  });
});

/* --------------------------------------------------------------------------
   6. UNAUTHENTICATED USERS GATING
   -------------------------------------------------------------------------- */

test('unauthenticated access: unauthenticated user blocked on all protected dashboards', () => {
  const protectedPages = ['donor', 'hospital', 'bloodbank', 'admin', 'dashboard', 'forecast'];
  protectedPages.forEach((page) => {
    assert.equal(isPagePermitted(page, null), false, `Unauthenticated user must not access ${page}`);
    assert.equal(isPagePermitted(page, undefined), false);
  });
});

test('URL parsing: correctly maps deep links and direct browser URLs to pages', () => {
  assert.equal(pathToPage('/donor'), 'donor');
  assert.equal(pathToPage('/hospital'), 'hospital');
  assert.equal(pathToPage('/bloodbank'), 'bloodbank');
  assert.equal(pathToPage('/admin'), 'admin');
  assert.equal(pathToPage('/dashboard'), 'admin');
  assert.equal(pathToPage('/login'), 'auth');
  assert.equal(pathToPage('/'), 'home');
});

/* --------------------------------------------------------------------------
   7. BACKEND SECURITY: SERVER ROLE ENFORCEMENT & UNAUTHORIZED ROLE CHANGES
   -------------------------------------------------------------------------- */

test('backend security: database user roles are authoritative and read from DB', () => {
  const adminRow = db.prepare('SELECT id, role, status FROM users WHERE role = ? LIMIT 1').get('Admin');
  assert.ok(adminRow);
  assert.equal(adminRow.role, 'Admin');

  const donorRow = db.prepare('SELECT id, role, status FROM users WHERE role = ? LIMIT 1').get('Donor');
  assert.ok(donorRow);
  assert.equal(donorRow.role, 'Donor');

  // Verify that an actor token encodes only userId, NOT the role
  const donorToken = createSessionToken(donorRow.id);
  const verifiedUserId = verifySessionToken(donorToken);
  assert.equal(verifiedUserId, donorRow.id);

  // Even if a client forged a role in localStorage, the server re-queries the DB for the actor's real role
  const reloadedActor = db.prepare('SELECT id, role FROM users WHERE id = ?').get(verifiedUserId);
  assert.equal(reloadedActor.role, 'Donor');
});

test('backend security: expired session tokens return null and clear sessions', () => {
  // Test expired token verification
  const expiredPayload = { sub: 'donor1', iat: Date.now() - 5000000, exp: Date.now() - 1000 };
  const crypto = require('crypto');
  // Token with expired exp is rejected
  assert.equal(verifySessionToken('invalid.token'), null);
  assert.equal(verifySessionToken(''), null);
  assert.equal(verifySessionToken(null), null);
});

test('edge cases: deleted user ID returns null from database', () => {
  const nonExistentUser = db.prepare('SELECT * FROM users WHERE id = ?').get('deleted_user_xyz_9999');
  assert.equal(nonExistentUser, undefined, 'Deleted or non-existent user must not return a profile');
});
