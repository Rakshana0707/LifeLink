const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const routeRegex = /app\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;

const routes = [];
let match;
while ((match = routeRegex.exec(code)) !== null) {
  routes.push({ method: match[1].toUpperCase(), path: match[2] });
}

console.log('Total routes found:', routes.length);
const seen = new Map();
const duplicates = [];

routes.forEach(r => {
  const key = `${r.method} ${r.path}`;
  if (seen.has(key)) {
    duplicates.push(key);
  } else {
    seen.set(key, 1);
  }
});

if (duplicates.length > 0) {
  console.log('Duplicate routes detected:', duplicates);
} else {
  console.log('✓ No duplicate routes registered.');
}
