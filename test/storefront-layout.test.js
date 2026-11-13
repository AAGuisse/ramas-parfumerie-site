const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');

test('selecting Wave opens its payment link immediately and falls back when popups are blocked', () => {
  const app = fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8');
  const waveFunction = app.match(/function initiateWavePayment\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(waveFunction);

  const waveUrl = 'https://pay.wave.com/m/M_sn_5g5xdPQdjvDw/c/sn/';
  const banner = { innerHTML: '', classList: { add(value) { this.added = value; } } };
  const popup = { opener: {} };
  const opened = [];
  const context = {
    document: { getElementById: () => banner },
    window: {
      open(...args) { opened.push(args); return popup; },
      location: { assign() { assert.fail('Wave should open in a new tab when allowed'); } }
    }
  };
  vm.runInNewContext(waveFunction, context);
  context.initiateWavePayment();

  assert.deepEqual(opened, [[waveUrl, '_blank']]);
  assert.equal(popup.opener, null);
  assert.equal(banner.classList.added, 'is-visible');
  assert.match(banner.innerHTML, /Après le paiement, revenez ici/);

  let fallbackUrl;
  context.window.open = () => null;
  context.window.location.assign = url => { fallbackUrl = url; };
  context.initiateWavePayment();
  assert.equal(fallbackUrl, waveUrl);
});

test('selecting Orange Money opens the official Max it link and shows payment details', () => {
  const app = fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8');
  const orangeFunction = app.match(/function initiateOrangeMoneyPayment\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(orangeFunction);

  const maxItUrl = 'https://onelink.to/6h78t2';
  const banner = { textContent: '', classList: { add(value) { this.added = value; } } };
  const opened = [];
  const appWindow = { opener: {} };
  const context = {
    checkoutState: { zone: 'dakar' },
    document: { getElementById: () => banner },
    formatPrice: amount => `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`,
    cartTotals: zone => ({ total: zone === 'retrait' ? 10000 : 11000 }),
    STORE_CONFIG: { phone: '+221 78 155 88 13' },
    window: {
      open(...args) { opened.push(args); return appWindow; },
      location: { assign() { assert.fail('Max it should open in a new tab when allowed'); } }
    }
  };
  vm.runInNewContext(orangeFunction, context);
  context.initiateOrangeMoneyPayment();

  assert.deepEqual(opened, [[maxItUrl, '_blank']]);
  assert.equal(appWindow.opener, null);
  assert.equal(banner.classList.added, 'is-visible');
  assert.match(banner.textContent, /Max it s’ouvre/);
  assert.ok(banner.textContent.includes(context.formatPrice(11000)));
  assert.match(banner.textContent, /\+221 78 155 88 13/);

  context.checkoutState.zone = 'retrait';
  context.initiateOrangeMoneyPayment();
  assert.ok(banner.textContent.includes(context.formatPrice(10000)));

  let fallbackUrl;
  context.window.open = () => null;
  context.window.location.assign = url => { fallbackUrl = url; };
  context.initiateOrangeMoneyPayment();
  assert.equal(fallbackUrl, maxItUrl);
});

test('Dakar delivery is added to the total and pickup in Thiaroye is free', () => {
  const app = fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8');
  const data = fs.readFileSync(path.join(root, 'assets', 'data.js'), 'utf8');
  const totalsFunction = app.match(/function cartTotals\(zone = "dakar"\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(totalsFunction);
  assert.match(data, /deliveryFees:\s*\{\s*dakar:\s*1000,\s*retrait:\s*0/);

  const context = {
    cart: [{ id: 'item', qty: 2 }],
    getProduct: () => ({ price: 500 }),
    STORE_CONFIG: { deliveryFees: { dakar: 1000, retrait: 0 } }
  };
  vm.runInNewContext(totalsFunction, context);
  assert.equal(context.cartTotals().total, 2000);
  assert.equal(context.cartTotals('retrait').total, 1000);
  assert.equal(context.cartTotals('retrait').delivery, 0);

  const deliveryFieldsFunction = app.match(/function updateCheckoutDeliveryFields\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(deliveryFieldsFunction);
  const addressField = { hidden: false, classList: { remove() {} } };
  const addressInput = { required: true };
  const cityInput = { value: 'Dakar' };
  const fields = { ckFieldAddress: addressField, ckAddress: addressInput, ckCity: cityInput };
  context.ckZone = { value: 'retrait' };
  context.document = { getElementById: id => fields[id] };
  context.STORE_CONFIG.address = 'Thiaroye';
  vm.runInNewContext(deliveryFieldsFunction, context);
  context.updateCheckoutDeliveryFields();
  assert.equal(addressField.hidden, true);
  assert.equal(addressInput.required, false);
  assert.equal(cityInput.value, 'Thiaroye');
  context.ckZone.value = 'dakar';
  context.updateCheckoutDeliveryFields();
  assert.equal(addressField.hidden, false);
  assert.equal(addressInput.required, true);
  assert.equal(cityInput.value, 'Dakar');

  const checkoutPages = fs.readdirSync(root).filter(file => {
    return file.endsWith('.html') && fs.readFileSync(path.join(root, file), 'utf8').includes('id="ckZone"');
  });
  assert.ok(checkoutPages.length > 0);
  for (const page of checkoutPages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /Dakar : 1 000 FCFA/, page);
    assert.match(html, /Retrait en boutique : Thiaroye/, page);
  }
});

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
  assert.match(styles, /html\{color-scheme:only light !important;/);
  assert.match(styles, /--sand:#E9D9CE;/);
  assert.match(styles, /--cream:#FCF8F2;/);
  assert.match(styles, /--ink:#302019;/);
  assert.match(styles, /@media \(max-width:360px\)\{\s*\.logo-text\{display:none;\}/);

  const pages = fs.readdirSync(root).filter(file => file.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<meta name="theme-color" content="#FCF8F2">/, page);
    assert.match(html, /<meta name="color-scheme" content="light">/, page);
    assert.match(html, /<style>html\{color-scheme:only light!important\}<\/style>/, page);
    if (html.includes('assets/app.js')) {
      assert.match(html, /assets\/app\.js\?v=20261113-max-it-1/, page);
    }
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
