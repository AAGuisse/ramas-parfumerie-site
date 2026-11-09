const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');

test('admin refreshes shared products and protects a product changed by another admin', () => {
  const adminScript = fs.readFileSync(path.join(root, 'assets', 'admin.js'), 'utf8');
  assert.match(adminScript, /cache:"no-store"/);
  assert.match(adminScript, /window\.ADMIN_CATALOG_READY = true/);
  assert.match(adminScript, /setInterval\(\(\) => \{\s*if \(!document\.hidden\) loadProducts\(\{ background:true \}\);\s*\}, 5000\)/);
  assert.match(adminScript, /addEventListener\("visibilitychange"/);
  assert.match(adminScript, /Ce produit a été modifié par l’autre administrateur/);
  assert.match(adminScript, /editingConflict\) \{\s*setFormError/);
  assert.match(adminScript, /revision: editingId === null \? undefined : editingRevision/);
  assert.match(adminScript, /revision:product\.revision/);
  assert.match(adminScript, /\?revision=/);
});

test('admin forces browsers to load the latest scripts and shows whole product photos', () => {
  const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const adminStyles = fs.readFileSync(path.join(root, 'assets', 'admin.css'), 'utf8');
  assert.match(adminHtml, /assets\/admin\.css\?v=/);
  assert.match(adminHtml, /assets\/manage-products\.js\?v=20261109-admin-catalog-2/);
  assert.match(adminHtml, /Le panneau d’administration ne s’est pas chargé/);
  assert.match(adminStyles, /\.admin-product-thumb\{[^}]*object-fit:contain/);
});
