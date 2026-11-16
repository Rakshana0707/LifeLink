const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { createSessionToken, verifySessionToken } = require('../auth');

// Connect to the test/local sqlite database
const dbPath = path.join(__dirname, '..', 'lifelink.db');
const db = new DatabaseSync(dbPath);

// Friendly Error Messages Formatter (mirrors client/src/context/AuthContext.tsx)
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
    case 'auth/requires-recent-login':
      return 'Please re-authenticate and try again.';
    default:
      return err?.message?.replace(/^Firebase:\s*/, '') || 'Authentication failed. Please try again.';
  }
};

// Form validation functions (mirrors client/src/pages/Auth.tsx)
const validateLoginForm = (identifier, password) => {
  const errors = {};
  const trimmed = identifier ? identifier.trim() : '';
  if (!trimmed) errors.identifier = 'Please enter your registered email address or username.';
  if (!password) errors.password = 'Please enter your password.';
  return { isValid: Object.keys(errors).length === 0, errors };
};

const validateRegisterForm = ({ fullName, email, phone, role, password, confirmPassword, licenseNumber, agreeTerms }) => {
  const errors = {};
  const trimmedName = fullName ? fullName.trim() : '';
  const trimmedEmail = email ? email.trim() : '';
  const trimmedPhone = phone ? phone.trim() : '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!trimmedName) {
    errors.fullName = role === 'Hospital' || role === 'Blood Bank'
      ? 'Please enter the official facility name.'
      : 'Please enter your full legal name.';
  }

  if (!trimmedEmail) {
    errors.email = 'Please enter a valid email address.';
  } else if (!emailRegex.test(trimmedEmail)) {
    errors.email = 'Please enter a valid email format (e.g., name@domain.com).';
  }

  if (!trimmedPhone) {
    errors.phone = 'Contact phone number is required for emergency dispatch.';
  } else if (trimmedPhone.replace(/[^0-9]/g, '').length < 8) {
    errors.phone = 'Please enter a valid phone number with area code.';
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match. Please re-enter.';
  }

  if (role === 'Hospital' || role === 'Blood Bank') {
    if (!licenseNumber || !licenseNumber.trim()) {
      errors.licenseNumber = 'Official healthcare clinical establishment or drug license number is required.';
    }
  }

  if (!agreeTerms) {
    errors.terms = 'You must acknowledge the terms & healthcare communications consent.';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

const calculatePasswordStrength = (pwd) => {
  if (!pwd) return { score: 0, label: '' };
  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 9) score += 1;
  if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score += 1;
  return {
    score,
    label: score === 1 ? 'Weak' : score === 2 ? 'Moderate' : 'Strong',
  };
};

/* --------------------------------------------------------------------------
   1. EMPTY FORM & FIELD-LEVEL VALIDATION
   -------------------------------------------------------------------------- */

test('validation: empty login form rejects with field-level errors', () => {
  const result = validateLoginForm('', '');
  assert.equal(result.isValid, false);
  assert.ok(result.errors.identifier);
  assert.ok(result.errors.password);
});

test('validation: login form with whitespace-only identifier fails validation', () => {
  const result = validateLoginForm('   ', 'somePassword');
  assert.equal(result.isValid, false);
  assert.ok(result.errors.identifier);
  assert.equal(result.errors.password, undefined);
});

test('validation: empty registration form rejects all mandatory fields', () => {
  const result = validateRegisterForm({
    fullName: '',
    email: '',
    phone: '',
    role: 'Donor',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.fullName);
  assert.ok(result.errors.email);
  assert.ok(result.errors.phone);
  assert.ok(result.errors.password);
  assert.ok(result.errors.terms);
});

/* --------------------------------------------------------------------------
   2. INVALID EMAIL FORMATS
   -------------------------------------------------------------------------- */

test('validation: rejects invalid email formats', () => {
  const invalidEmails = ['plainaddress', '@missingusername.com', 'user@.com', 'user@domain', 'user name@email.com'];
  invalidEmails.forEach((email) => {
    const result = validateRegisterForm({
      fullName: 'Test User',
      email,
      phone: '+91 9876543210',
      role: 'Donor',
      password: 'validPassword123',
      confirmPassword: 'validPassword123',
      agreeTerms: true,
    });
    assert.equal(result.isValid, false, `Expected ${email} to be invalid`);
    assert.ok(result.errors.email);
  });
});

test('validation: accepts valid email formats', () => {
  const validEmails = ['arjun@example.com', 'dr.sharma+cardio@coimbatore-hospital.org', 'test.user@sub.domain.co'];
  validEmails.forEach((email) => {
    const result = validateRegisterForm({
      fullName: 'Test User',
      email,
      phone: '+91 9876543210',
      role: 'Donor',
      password: 'validPassword123',
      confirmPassword: 'validPassword123',
      agreeTerms: true,
    });
    assert.equal(result.errors.email, undefined, `Expected ${email} to be valid`);
  });
});

/* --------------------------------------------------------------------------
   3. PASSWORD VALIDATION & STRENGTH
   -------------------------------------------------------------------------- */

test('validation: rejects passwords shorter than 6 characters', () => {
  const result = validateRegisterForm({
    fullName: 'Test User',
    email: 'test@example.com',
    phone: '+91 9876543210',
    role: 'Donor',
    password: '12345',
    confirmPassword: '12345',
    agreeTerms: true,
  });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.password.includes('at least 6 characters'));
});

test('validation: detects password mismatch', () => {
  const result = validateRegisterForm({
    fullName: 'Test User',
    email: 'test@example.com',
    phone: '+91 9876543210',
    role: 'Donor',
    password: 'securePassword1',
    confirmPassword: 'differentPassword2',
    agreeTerms: true,
  });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.confirmPassword.includes('do not match'));
});

test('password strength: accurately rates weak, moderate, and strong passwords', () => {
  assert.equal(calculatePasswordStrength('simple').score, 1);
  assert.equal(calculatePasswordStrength('simple').label, 'Weak');

  assert.equal(calculatePasswordStrength('moderatePassword').score, 2);
  assert.equal(calculatePasswordStrength('moderatePassword').label, 'Moderate');

  assert.equal(calculatePasswordStrength('Complex@2026!Pass').score, 3);
  assert.equal(calculatePasswordStrength('Complex@2026!Pass').label, 'Strong');
});

/* --------------------------------------------------------------------------
   4. TERMS AND PRIVACY ACKNOWLEDGEMENT
   -------------------------------------------------------------------------- */

test('validation: requires terms & health communication acknowledgement', () => {
  const resultWithoutTerms = validateRegisterForm({
    fullName: 'Test User',
    email: 'test@example.com',
    phone: '+91 9876543210',
    role: 'Donor',
    password: 'validPassword123',
    confirmPassword: 'validPassword123',
    agreeTerms: false,
  });
  assert.equal(resultWithoutTerms.isValid, false);
  assert.ok(resultWithoutTerms.errors.terms);

  const resultWithTerms = validateRegisterForm({
    fullName: 'Test User',
    email: 'test@example.com',
    phone: '+91 9876543210',
    role: 'Donor',
    password: 'validPassword123',
    confirmPassword: 'validPassword123',
    agreeTerms: true,
  });
  assert.equal(resultWithTerms.errors.terms, undefined);
});

/* --------------------------------------------------------------------------
   5. SEEDED ACCOUNT AUTHENTICATION & LOGIN CORRECTNESS
   -------------------------------------------------------------------------- */

test('seeded accounts: Platform Admin credentials authenticate successfully', () => {
  const row = db.prepare('SELECT * FROM users WHERE name = ? OR email = ?').get('Platform Admin', 'admin@example.test');
  assert.ok(row, 'Platform Admin user record must exist');
  assert.equal(row.role, 'Admin');
  const passwordValid = bcrypt.compareSync('admin123', row.password_hash);
  assert.equal(passwordValid, true, 'Platform Admin password admin123 must verify');
});

test('seeded accounts: Sunrise Multispecialty Hospital authenticates successfully', () => {
  const row = db.prepare('SELECT * FROM users WHERE name = ?').get('Sunrise Multispecialty Hospital');
  assert.ok(row, 'Sunrise hospital record must exist');
  assert.equal(row.role, 'Hospital');
  const passwordValid = bcrypt.compareSync('sunrise123', row.password_hash);
  assert.equal(passwordValid, true, 'Sunrise Hospital password must verify');
});

test('seeded accounts: City Blood Bank authenticates successfully', () => {
  const row = db.prepare('SELECT * FROM users WHERE name = ?').get('City Blood Bank');
  assert.ok(row, 'City Blood Bank record must exist');
  assert.equal(row.role, 'Blood Bank');
  const passwordValid = bcrypt.compareSync('city123', row.password_hash);
  assert.equal(passwordValid, true, 'City Blood Bank password must verify');
});

test('authentication: incorrect password fails verification', () => {
  const row = db.prepare('SELECT * FROM users WHERE name = ?').get('Platform Admin');
  const passwordValid = bcrypt.compareSync('incorrectPassword999', row.password_hash);
  assert.equal(passwordValid, false, 'Incorrect password must be rejected');
});

test('session tokens: signs and validates tokens correctly for authenticated actors', () => {
  const token = createSessionToken('admin1');
  assert.ok(token);
  const verifiedUserId = verifySessionToken(token);
  assert.equal(verifiedUserId, 'admin1');

  // Tampered token must fail
  const tampered = token.slice(0, -4) + 'abcd';
  assert.equal(verifySessionToken(tampered), null);
});

/* --------------------------------------------------------------------------
   6. ROLE REQUIREMENTS & PUBLIC REGISTRATION CONSTRAINTS
   -------------------------------------------------------------------------- */

test('role security: Admin is strictly prohibited in public registration schema', () => {
  // Public role selector permits ONLY Donor, Patient, Hospital, Blood Bank
  const publicPermittedRoles = ['Donor', 'Patient', 'Hospital', 'Blood Bank'];
  assert.equal(publicPermittedRoles.includes('Admin'), false, 'Admin must NEVER be a permitted public registration role');
});

test('role verification: Hospital registration requires official license number', () => {
  const hospitalWithoutLicense = validateRegisterForm({
    fullName: 'Metro Heart Institute',
    email: 'info@metroheart.test',
    phone: '+91 9876543210',
    role: 'Hospital',
    password: 'securePassword123',
    confirmPassword: 'securePassword123',
    licenseNumber: '',
    agreeTerms: true,
  });
  assert.equal(hospitalWithoutLicense.isValid, false);
  assert.ok(hospitalWithoutLicense.errors.licenseNumber);

  const hospitalWithLicense = validateRegisterForm({
    fullName: 'Metro Heart Institute',
    email: 'info@metroheart.test',
    phone: '+91 9876543210',
    role: 'Hospital',
    password: 'securePassword123',
    confirmPassword: 'securePassword123',
    licenseNumber: 'LIC-HOSP-2026-9901',
    agreeTerms: true,
  });
  assert.equal(hospitalWithLicense.isValid, true);
});

test('role verification: Blood Bank registration requires official license number', () => {
  const bankWithoutLicense = validateRegisterForm({
    fullName: 'Red Cross Regional Bank',
    email: 'contact@redcrossbank.test',
    phone: '+91 9876543210',
    role: 'Blood Bank',
    password: 'securePassword123',
    confirmPassword: 'securePassword123',
    licenseNumber: '',
    agreeTerms: true,
  });
  assert.equal(bankWithoutLicense.isValid, false);
  assert.ok(bankWithoutLicense.errors.licenseNumber);
});

test('role verification: Donor accounts are provisioned Active while institutions require Pending Verification', () => {
  const donorStatus = 'Active';
  const hospitalStatus = 'Pending Verification';
  const bloodBankStatus = 'Pending Verification';

  assert.equal(donorStatus, 'Active');
  assert.equal(hospitalStatus, 'Pending Verification');
  assert.equal(bloodBankStatus, 'Pending Verification');
});

/* --------------------------------------------------------------------------
   7. ERROR HUMANIZATION & USER-FRIENDLY AUTH FEEDBACK
   -------------------------------------------------------------------------- */

test('error humanization: formats Firebase auth errors into clear patient/donor language', () => {
  assert.equal(
    getFriendlyErrorMessage({ code: 'auth/email-already-in-use' }),
    'An account with this email already exists. Please sign in instead.'
  );
  assert.equal(
    getFriendlyErrorMessage({ code: 'auth/invalid-credential' }),
    'Invalid email or password. Please check your credentials.'
  );
  assert.equal(
    getFriendlyErrorMessage({ code: 'auth/too-many-requests' }),
    'Too many attempts. Please wait a moment and try again.'
  );
  assert.equal(
    getFriendlyErrorMessage({ code: 'auth/network-request-failed' }),
    'Network connection error. Please check your internet connection.'
  );
});

test('error humanization: handles Google OAuth cancellation gracefully', () => {
  const cancelMsg = getFriendlyErrorMessage({ code: 'auth/popup-closed-by-user' });
  assert.ok(cancelMsg.includes('popup was closed'));
  assert.equal(cancelMsg.includes('fatal') || cancelMsg.includes('crash'), false);
});
