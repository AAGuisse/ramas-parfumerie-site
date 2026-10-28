const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');

test('storefront product photos are contained in smaller square cards and bounded detail views', () => {
  const styles = fs.readFileSync(path.join(root, 'assets', 'style.css'), 'utf8');
  assert.match(styles, /\.product-media img\{[^}]*aspect-ratio:1;[^}]*object-fit:contain/);
  assert.match(styles, /\.product-modal-media img\{[^}]*height:min\(42vh,360px\);[^}]*object-fit:contain/);
});

test('all category price filters support arbitrary positive prices without a hidden minimum step', () => {
  const pages = [
    'produits-accessoires.html',
    'produits-brumes.html',
    'produits-capillaires.html',
    'produits-coffrets.html',
    'produits-huiles.html',
    'produits-parfums.html',
    'produits-soins.html',
    'produits-thiouraye.html'
  ];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /id="maxPrice" min="0" step="1"/, page);
  }
});
