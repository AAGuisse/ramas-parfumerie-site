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

test('mobile layout keeps the original design while fitting header and checkout controls', () => {
  const styles = fs.readFileSync(path.join(root, 'assets', 'style.css'), 'utf8');
  const mobileHeader = styles.match(/@media \(max-width:640px\)\{([\s\S]*?)\n\}/)?.[1] || '';
  const mobileControls = styles.match(/@media \(max-width:520px\)\{([\s\S]*?)\n\}/)?.[1] || '';
  const narrowPhone = styles.match(/@media \(max-width:400px\)\{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(mobileHeader, /\.logo\{[^}]*min-width:0/);
  assert.match(mobileHeader, /\.logo-text\{[^}]*text-overflow:ellipsis/);
  assert.match(mobileHeader, /\.header-actions\{[^}]*flex:0 0 auto/);
  assert.match(mobileControls, /\.product-actions\{flex-direction:column;\}/);
  assert.match(mobileControls, /\.checkout-actions\{flex-direction:column;\}/);
  assert.match(mobileControls, /\.checkout-actions \.btn\{[^}]*white-space:normal/);
  assert.match(mobileControls, /\.step-labels\{display:grid; grid-template-columns:repeat\(5,minmax\(0,1fr\)\);/);
  assert.match(mobileControls, /\.step-labels span\{min-width:0; overflow-wrap:anywhere;\}/);
  assert.match(narrowPhone, /\.product-grid\{grid-template-columns:1fr;\}/);
  assert.match(narrowPhone, /\.back-to-top,\.back-to-top\.is-visible,\.whatsapp-float\{display:none;\}/);
  assert.doesNotMatch(mobileHeader + mobileControls + narrowPhone, /background:|color-scheme:|\.hero\{/);
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
