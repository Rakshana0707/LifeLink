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
    const userId = decodedToken.uid;
    const row = db.prepare('SELECT id, name, role, status FROM users WHERE id = ?').get(userId);
    if (row) return row;
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

module.exports = { getActorFromRequest };
