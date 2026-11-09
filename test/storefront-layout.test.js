const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');

test('storefront product photos are contained in smaller square cards and bounded detail views', () => {
  const styles = fs.readFileSync(path.join(root, 'assets', 'style.css'), 'utf8');
  assert.match(styles, /\.product-media\{[^}]*aspect-ratio:1;[^}]*overflow:hidden/);
  assert.match(styles, /\.product-media img\{[^}]*position:absolute;[^}]*height:100%;[^}]*object-fit:contain/);
  assert.match(styles, /\.product-modal-media img\{[^}]*height:min\(42vh,360px\);[^}]*object-fit:contain/);
});

test('mobile storefront keeps the header and product actions usable on narrow screens', () => {
  const styles = fs.readFileSync(path.join(root, 'assets', 'style.css'), 'utf8');
  assert.match(styles, /:root\{\s*color-scheme:light;/);
  assert.match(styles, /@media \(max-width:520px\)\{[\s\S]*?\.header-inner\{[^}]*gap:4px;[\s\S]*?\.header-actions\{[^}]*flex-shrink:0;[\s\S]*?\.hero-actions\{[^}]*grid-template-columns:1fr;[\s\S]*?\.product-actions\{flex-direction:column/);
});

test('category pages do not show a maximum-price slider', () => {
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
  const catalogue = fs.readFileSync(path.join(root, 'assets', 'catalogue.js'), 'utf8');
  assert.doesNotMatch(catalogue, /maxPrice|maxPriceValue|priceLimit/);

  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.doesNotMatch(html, /range-field|maxPrice|maxPriceValue|Prix maximum/, page);
  }
});

test('category pages do not display available product counts', () => {
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
  const catalogue = fs.readFileSync(path.join(root, 'assets', 'catalogue.js'), 'utf8');

  assert.doesNotMatch(catalogue, /familyProductCount|load-more-count|produits affichés|au total dans cette famille/);
  assert.match(catalogue, /Charger plus de produits/);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.doesNotMatch(html, /family-count|familyProductCount/, page);
    assert.match(html, /assets\/catalogue\.js\?v=20261104-live-sync-1/, page);
  }
});
