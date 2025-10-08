const fs = require('fs');
const path = require('path');

const appsPath = path.join(__dirname, 'apps.json');

function loadApps() {
  const raw = fs.readFileSync(appsPath, 'utf-8');
  return JSON.parse(raw);
}

module.exports = {
  loadApps,
};
