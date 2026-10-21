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
    image: 'data:image/jpeg;base64,dGVzdA=='
  };
  const context = vm.createContext({
    window: {},
    location: { hostname: 'aaguisse.github.io' },
    fetch: async (_url, options) => {
      assert.equal(options.cache, 'no-store');
      return {
        ok: true,
        json: async () => ({ managed: true, products: [product] })
      };
    },
    localStorage: { getItem: () => null },
    console
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'data.js'), 'utf8');

  vm.runInContext(source, context);
  await context.window.STORE_PRODUCTS_READY;

  assert.equal(context.window.STORE_PRODUCTS.length, 1);
  assert.equal(context.window.STORE_PRODUCTS[0].name, product.name);
  assert.equal(vm.runInContext('productImage(PRODUCTS[0])', context), product.image);
  assert.match(vm.runInContext('productImage({ name: "Sans photo", reference: "TEST" })', context), /^data:image\/svg\+xml/);
});
