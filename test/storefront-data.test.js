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
        json: async () => ({ managed: true, products: [olderProduct, product] })
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
