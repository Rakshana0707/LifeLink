const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'lifelink.db');
const db = new DatabaseSync(dbPath);

console.log('=== LIFELINK DATABASE AUDIT ===');
console.log('Database Path:', dbPath);

// 1. Tables check
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('\n1. TABLES (Total: ' + tables.length + '):');
tables.forEach(t => {
  const count = db.prepare(`SELECT COUNT(*) as c FROM [${t.name}]`).get().c;
  console.log(`  - ${t.name.padEnd(28)} : ${count} rows`);
});

// 2. Indexes check
const indexes = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name").all();
console.log('\n2. INDEXES (Total: ' + indexes.length + '):');
indexes.forEach(idx => {
  console.log(`  - ${idx.tbl_name.padEnd(24)} -> ${idx.name}`);
});

// 3. Foreign Key Check
const fkErrors = db.prepare('PRAGMA foreign_key_check').all();
console.log('\n3. FOREIGN KEY CHECK:');
console.log('  Violations found:', fkErrors.length);
if (fkErrors.length > 0) {
  console.log('  Details:', fkErrors);
} else {
  console.log('  ✓ All foreign key constraints intact.');
}

// 4. Integrity Check
const integrity = db.prepare('PRAGMA integrity_check').all();
console.log('\n4. INTEGRITY CHECK:');
console.log('  Status:', integrity[0]?.integrity_check || integrity);

// 5. Test Backup & Restoration
console.log('\n5. BACKUP & RESTORATION TEST:');
const backupPath = path.join(__dirname, '..', 'lifelink_backup_test.db');
if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);

try {
  // SQLite VACUUM INTO creates a live consistent snapshot
  db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}'`);
  console.log('  ✓ Live backup snapshot created successfully via VACUUM INTO.');
  
  // Verify backup can be opened and queried
  const backupDb = new DatabaseSync(backupPath);
  const backupTables = backupDb.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().c;
  const backupUsers = backupDb.prepare("SELECT COUNT(*) as c FROM users").get().c;
  console.log(`  ✓ Backup verified: ${backupTables} tables, ${backupUsers} users.`);
  backupDb.close();
  fs.unlinkSync(backupPath);
  console.log('  ✓ Backup file cleaned up.');
} catch (err) {
  console.error('  ✗ Backup test failed:', err);
}

console.log('\n=== END DATABASE AUDIT ===');
