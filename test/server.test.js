const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ramas-parfumerie-'));
process.env.PRODUCTS_FILE = path.join(testDirectory, 'products.json');
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.ADMIN_USER = 'test-admin';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'test-password';

const app = require('../server');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

function adminHeaders(username = process.env.ADMIN_USER) {
  const token = Buffer.from(`${username}:${process.env.ADMIN_PASSWORD}`).toString('base64');
  return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}

test('catalogue API requires admin access, persists locally in tests, and reports database readiness', async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true,
    status: 'server-running',
    persistentProducts: false
  });

  const unauthorized = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', categoryId: 'parfums', price: 10 })
  });
  assert.equal(unauthorized.status, 401);

  const created = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: adminHeaders('ADMIN@example.com'),
    body: JSON.stringify({
      name: 'Parfum test',
      categoryId: 'parfums',
      price: 10,
      image: 'data:image/jpeg;base64,dGVzdA=='
    })
  });
  assert.equal(created.status, 201);
  const createdProduct = (await created.json()).product;
  assert.equal(createdProduct.name, 'Parfum test');
  assert.equal(createdProduct.revision, 1);

  const importBody = [{
    importKey: '00000000-0000-4000-8000-000000000001-1',
    name: 'Produit importé',
    categoryId: 'soins',
    price: 12
  }];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const imported = await fetch(`${baseUrl}/api/products/import`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(importBody)
    });
    assert.equal(imported.status, 200);
  }

  const noPhoto = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      name: 'Parfum sans photo',
      categoryId: 'parfums',
      price: 15,
      image: 'data:image/jpeg;base64,'
    })
  });
  assert.equal(noPhoto.status, 201);

  const catalogue = await fetch(`${baseUrl}/api/products`);
  assert.equal(catalogue.headers.get('cache-control'), 'no-store');
  const result = await catalogue.json();
  assert.equal(result.products.length, 3);
  assert.equal(result.products[0].image, undefined);
  assert.equal(result.products[0].imageUrl, '/api/products/1/image?v=1');
  assert.equal(result.products[1].name, 'Produit importé');
  assert.equal(result.products[2].imageUrl, null);

  const adminCatalogue = await fetch(`${baseUrl}/api/products?includeImages=true`);
  const adminProducts = await adminCatalogue.json();
  assert.equal(adminProducts.products[0].image, 'data:image/jpeg;base64,dGVzdA==');

  const image = await fetch(`${baseUrl}/api/products/1/image`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/jpeg/);
  assert.match(image.headers.get('cache-control'), /no-cache/);
  assert.ok(image.headers.get('etag'));
  assert.equal(Buffer.from(await image.arrayBuffer()).toString(), 'test');
  assert.equal((await fetch(`${baseUrl}/api/products/3/image`)).status, 404);

  const updated = await fetch(`${baseUrl}/api/products/1`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ name: 'Parfum test', categoryId: 'parfums', price: 10, stock: false, revision: 1 })
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).product.revision, 2);
  const preservedImage = await fetch(`${baseUrl}/api/products/1/image`);
  assert.equal(preservedImage.status, 200);

  const staleUpdate = await fetch(`${baseUrl}/api/products/1`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ name: 'Modification ancienne', categoryId: 'parfums', price: 10, revision: 1 })
  });
  assert.equal(staleUpdate.status, 409);

  const replacementImage = await fetch(`${baseUrl}/api/products/1`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({
      name: 'Parfum test modifié',
      categoryId: 'parfums',
      price: 10,
      revision: 2,
      image: 'data:image/png;base64,bmV3'
    })
  });
  assert.equal(replacementImage.status, 200);
  const updatedCatalogue = await fetch(`${baseUrl}/api/products`);
  const updatedProducts = await updatedCatalogue.json();
  assert.equal(updatedProducts.products[0].imageUrl, '/api/products/1/image?v=2');
  assert.equal(updatedProducts.products[0].revision, 3);

  const staleDelete = await fetch(`${baseUrl}/api/products/1?revision=2`, {
    method: 'DELETE',
    headers: adminHeaders()
  });
  assert.equal(staleDelete.status, 409);

  const deleteCurrentVersion = await fetch(`${baseUrl}/api/products/1?revision=3`, {
    method: 'DELETE',
    headers: adminHeaders()
  });
  assert.equal(deleteCurrentVersion.status, 200);

  const missingRevision = await fetch(`${baseUrl}/api/products/1`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ name: 'Modification sans version', categoryId: 'parfums', price: 10 })
  });
  assert.equal(missingRevision.status, 428);

  process.env.NODE_ENV = 'production';
  const blockedReplacement = await fetch(`${baseUrl}/api/products`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify([])
  });
  assert.equal(blockedReplacement.status, 405);

  const blockedWrite = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ name: 'Non persisté', categoryId: 'parfums', price: 10 })
  });
  assert.equal(blockedWrite.status, 503);
  const unavailableHealth = await fetch(`${baseUrl}/api/health`);
  assert.equal(unavailableHealth.status, 503);
  process.env.NODE_ENV = 'test';
});
