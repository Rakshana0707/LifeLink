const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');
const { verifySessionToken } = require('./auth');

if (process.env.FIREBASE_CREDENTIALS_PATH && fs.existsSync(process.env.FIREBASE_CREDENTIALS_PATH)) {
  const serviceAccount = require(process.env.FIREBASE_CREDENTIALS_PATH);
  initializeApp({
    credential: cert(serviceAccount)
  });
  console.log('[Firebase] Admin initialized via credentials file.');
} else {
  // Try default application credentials
  initializeApp();
  console.log('[Firebase] Admin initialized via default credentials.');
}

async function getActorFromRequest(req, db) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return null;
  
  // 1. Try Firebase ID Token verification
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // Check if firebase_uid column exists in the table
    let row = null;
    try {
      row = db.prepare('SELECT id, name, role, status FROM users WHERE id = ? OR firebase_uid = ?').get(uid, uid);
    } catch {
      row = db.prepare('SELECT id, name, role, status FROM users WHERE id = ?').get(uid);
    }

    // If not found by UID, match by email (links existing seeded or registered email profiles)
    if (!row && email) {
      row = db.prepare('SELECT id, name, role, status FROM users WHERE lower(email) = lower(?)').get(email);
      if (row) {
        try {
          db.prepare('UPDATE users SET firebase_uid = ? WHERE id = ?').run(uid, row.id);
        } catch {}
      }
    }

    if (row) {
      req.firebaseUser = decodedToken;
      return row;
    }
  } catch (err) {
    // Not a valid Firebase ID token or Firebase verify failed, try internal session token below
  }

  // 2. Try internal HMAC-signed session token (for seeded demo users, Admin, fallback auth)
  try {
    const localUserId = verifySessionToken(token);
    if (localUserId) {
      const row = db.prepare('SELECT id, name, role, status FROM users WHERE id = ?').get(localUserId);
      if (row) return row;
    }
  } catch (err) {
    // Invalid session token
  }

  return null;
}

module.exports = { getActorFromRequest, admin: { getAuth } };
