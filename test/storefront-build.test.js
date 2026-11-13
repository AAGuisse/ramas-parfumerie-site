const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const buildStorefront = require('../scripts/build-storefront');

test('static deployment contains storefront pages and assets but keeps admin on Render', () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ramas-storefront-'));

  try {
    buildStorefront(outputDirectory);

    const publicPages = fs.readdirSync(root)
      .filter(file => file.endsWith('.html') && file !== 'admin.html');
    for (const page of publicPages) {
      assert.equal(fs.existsSync(path.join(outputDirectory, page)), true, page);
    }
    assert.equal(fs.existsSync(path.join(outputDirectory, 'admin.html')), false);
    assert.equal(fs.existsSync(path.join(outputDirectory, 'assets', 'style.css')), true);
    assert.equal(fs.existsSync(path.join(outputDirectory, 'assets', 'data.js')), true);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});
