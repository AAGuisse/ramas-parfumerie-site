const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('storefront loads shared products asynchronously and uses their photo', async () => {
  const product = {
    id: 9,
    name: 'Parfum partagé',
    categoryId: 'parfums',
    reference: 'PAR-9',
    price: 125000,
    image: 'data:image/jpeg;base64,dGVzdA=='
  };
  const olderProduct = {
    id: 8,
    name: 'Parfum ancien',
    categoryId: 'parfums',
    price: 5000,
    reference: 'PAR-8'
  };
  const context = vm.createContext({
    window: {},
    location: { hostname: 'aaguisse.github.io' },
    fetch: async (_url, options) => {
      assert.equal(options.cache, 'no-store');
      return {
        ok: true,
        json: async () => ({ managed: true, persistent: true, products: [olderProduct, product] })
      };
    },
    localStorage: { getItem: () => null },
    console
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8');

  vm.runInContext(source, context);
  await context.window.STORE_PRODUCTS_READY;

  assert.equal(context.window.STORE_PRODUCTS.length, 2);
  assert.equal(context.window.STORE_PRODUCTS[1].name, product.name);
  assert.equal(vm.runInContext('getCategoryMaxPrice("parfums")', context), 125000);
  assert.equal(vm.runInContext('getNewestProducts(1)[0].name', context), product.name);
  assert.equal(vm.runInContext('productImage(PRODUCTS[1])', context), product.image);
  assert.equal(vm.runInContext('productImage({ name: "Photo publique", imageUrl: "/api/products/9/image" })', context), 'https://ramas-parfumerie-app.onrender.com/api/products/9/image');
  assert.match(vm.runInContext('productImage({ name: "Sans photo", reference: "TEST" })', context), /^data:image\/svg\+xml/);
  assert.match(vm.runInContext('productImage({ name: "Photo invalide", image: "data:image/jpeg;base64," })', context), /^data:image\/svg\+xml/);
});

test('official custom domain loads its catalogue from the shared API', async () => {
  const product = { id: 21, name: 'Produit du domaine officiel', categoryId: 'parfums' };
  let requestedUrl;
  const context = vm.createContext({
    window: {},
    location: { hostname: 'www.ramasparfumerie.sn' },
    fetch: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.cache, 'no-store');
      return {
        ok: true,
        json: async () => ({ managed: true, persistent: true, products: [product] })
      };
    },
    localStorage: { getItem: () => null },
    console
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8');

  vm.runInContext(source, context);
  await context.window.STORE_PRODUCTS_READY;

  assert.equal(context.window.STORE_API_BASE, 'https://ramas-parfumerie-app.onrender.com');
  assert.equal(requestedUrl, 'https://ramas-parfumerie-app.onrender.com/api/products');
  assert.equal(context.window.STORE_PRODUCTS[0].name, product.name);
});

test('storefront never substitutes generated demo products when the shared catalog is unmanaged', async () => {
  const context = vm.createContext({
    window: {},
    location: { hostname: 'aaguisse.github.io' },
    fetch: async () => ({
      ok: true,
      json: async () => ({ managed: false, persistent: true, products: [] })
    }),
    localStorage: { getItem: () => null },
    console
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8');

  vm.runInContext(source, context);
  assert.equal(context.window.STORE_PRODUCTS.length, 0);
  await context.window.STORE_PRODUCTS_READY;

  assert.deepEqual(Array.from(context.window.STORE_PRODUCTS), []);
  assert.match(context.window.STORE_PRODUCTS_ERROR, /Aucun produit de démonstration/);
});

test('storefront rejects products unless the shared catalog is persistent', async () => {
  const context = vm.createContext({
    window: {},
    location: { hostname: 'aaguisse.github.io' },
    fetch: async () => ({
      ok: true,
      json: async () => ({ managed: true, persistent: false, products: [{ id: 1 }] })
    }),
    localStorage: { getItem: () => null },
    console
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8');

  vm.runInContext(source, context);
  await context.window.STORE_PRODUCTS_READY;

  assert.deepEqual(Array.from(context.window.STORE_PRODUCTS), []);
  assert.match(context.window.STORE_PRODUCTS_ERROR, /n’est pas activé ou n’est pas persistant/);
});

test('storefront automatically refreshes an open page when the shared catalog changes', async () => {
  const firstProduct = { id: 1, name: 'Produit initial', categoryId: 'parfums' };
  const updatedProduct = { id: 1, name: 'Produit modifié', categoryId: 'parfums' };
  const responses = [firstProduct, updatedProduct];
  let intervalCallback;
  const events = [];
  const context = vm.createContext({
    window: {
      setInterval: (callback, delay) => {
        assert.equal(delay, 5000);
        intervalCallback = callback;
      },
      dispatchEvent: event => events.push(event.type)
    },
    document: {
      hidden: false,
      addEventListener: () => {}
    },
    Event,
    location: { hostname: 'aaguisse.github.io' },
    fetch: async (_url, options) => {
      assert.equal(options.cache, 'no-store');
      return {
        ok: true,
        json: async () => ({ managed: true, persistent: true, products: [responses.shift()] })
      };
    },
    localStorage: { getItem: () => null },
    console
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8');

  vm.runInContext(source, context);
  await context.window.STORE_PRODUCTS_READY;
  assert.equal(context.window.STORE_PRODUCTS[0].name, firstProduct.name);
  assert.equal(typeof intervalCallback, 'function');

  await intervalCallback();

  assert.equal(context.window.STORE_PRODUCTS[0].name, updatedProduct.name);
  assert.ok(events.includes('store-products-updated'));
});

test('storefront stays empty and reports an error when the shared catalog is unreachable', async () => {
  const context = vm.createContext({
    window: {},
    location: { hostname: 'aaguisse.github.io' },
    fetch: async () => { throw new Error('network unavailable'); },
    localStorage: { getItem: () => null },
    console: { error() {} }
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8');

  vm.runInContext(source, context);
  await context.window.STORE_PRODUCTS_READY;

  assert.deepEqual(Array.from(context.window.STORE_PRODUCTS), []);
  assert.match(context.window.STORE_PRODUCTS_ERROR, /temporairement indisponible/);
});

test('every page that loads the storefront data uses the database-only asset version', () => {
  const pages = fs.readdirSync(path.join(__dirname, '..')).filter(file => file.endsWith('.html'));
  const storefrontPages = pages.filter(file => {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    return html.includes('assets/data.js');
  });

  assert.ok(storefrontPages.length > 0);
  for (const page of storefrontPages) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    assert.match(html, /assets\/data\.js\?v=20261109-custom-domain-sync-1/, page);
  }
});

test('Pages verifies the persistent database catalog every Sunday at 08:00 UTC', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'pages.yml'), 'utf8');

  assert.match(workflow, /cron: "0 8 \* \* 0"/);
  assert.match(workflow, /\.managed == true and \.persistent == true/);
  assert.match(workflow, /api\/products/);
});
