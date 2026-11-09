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
  const mobileLayoutStart = styles.lastIndexOf('@media (max-width:640px)');
  const mobileLayoutEnd = styles.indexOf('@media (max-width:400px)', mobileLayoutStart);
  const mobileLayout = styles.slice(mobileLayoutStart, mobileLayoutEnd);
  const narrowPhone = styles.match(/@media \(max-width:400px\)\{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(styles, /\.category-row\{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,260px\),1fr\)\)/);
  assert.match(styles, /\.product-grid\{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,260px\),1fr\)\)/);
  assert.match(styles, /\.product-card\{[^}]*min-width:0/);
  assert.match(mobileHeader, /\.logo\{[^}]*min-width:0/);
  assert.match(mobileHeader, /\.logo-text\{[^}]*text-overflow:ellipsis/);
  assert.match(mobileHeader, /\.header-actions\{[^}]*flex:0 0 auto/);
  assert.match(mobileControls, /\.product-actions\{flex-direction:column;\}/);
  assert.match(mobileControls, /\.checkout-actions\{flex-direction:column;\}/);
  assert.match(mobileControls, /\.checkout-actions \.btn\{[^}]*white-space:normal/);
  assert.match(mobileControls, /\.step-labels\{display:grid; grid-template-columns:repeat\(5,minmax\(0,1fr\)\);/);
  assert.match(mobileControls, /\.step-labels span\{min-width:0; overflow-wrap:anywhere;\}/);
  assert.match(narrowPhone, /\.product-body\{padding:14px 16px 16px;\}/);
  assert.match(mobileLayout, /\.hero\{padding:28px 0 32px;\}/);
  assert.match(mobileLayout, /\.hero-grid\{gap:18px;\}/);
  assert.match(mobileLayout, /\.hero-blob\{width:min\(280px,72vw\);\}/);
  assert.match(mobileLayout, /\.hero-copy h1\{font-size:clamp\(2rem,8vw,2\.3rem\);\}/);
  assert.match(mobileLayout, /\.section\{padding:40px 0;\}/);
  assert.match(mobileLayout, /\.catalogue-toolbar\{padding:14px; gap:12px; margin-bottom:20px;\}/);
  assert.match(mobileLayout, /\.back-to-top,\.back-to-top\.is-visible,\.whatsapp-float\{display:none;\}/);
  assert.match(mobileLayout, /\.family-tabs::-webkit-scrollbar\{display:none;\}/);
  assert.doesNotMatch(mobileHeader + mobileControls + mobileLayout + narrowPhone, /background:|color-scheme:/);
});

test('pages preserve the light brand palette on dark-mode phones', () => {
  const styles = fs.readFileSync(path.join(root, 'assets', 'style.css'), 'utf8');
  assert.match(styles, /html\{color-scheme:only light;/);
  assert.match(styles, /@media \(max-width:360px\)\{\s*\.logo-text\{display:none;\}/);

  const pages = fs.readdirSync(root).filter(file => file.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<meta name="theme-color" content="#FCF8F2">/, page);
    assert.match(html, /assets\/style\.css\?v=20261109-responsive-7/, page);
  }
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
