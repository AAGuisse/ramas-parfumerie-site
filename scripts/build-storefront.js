const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function buildStorefront(outputDirectory = path.join(root, 'dist')) {
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(outputDirectory, { recursive: true });

  const storefrontPages = fs.readdirSync(root)
    .filter(file => file.endsWith('.html') && file !== 'admin.html');
  for (const page of storefrontPages) {
    fs.copyFileSync(path.join(root, page), path.join(outputDirectory, page));
  }

  fs.cpSync(path.join(root, 'assets'), path.join(outputDirectory, 'assets'), { recursive: true });
}

if (require.main === module) {
  buildStorefront();
}

module.exports = buildStorefront;
