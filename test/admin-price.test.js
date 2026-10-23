const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('admin price inputs allow every positive whole FCFA amount without a maximum', () => {
  const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  for (const id of ['productPrice', 'productOldPrice']) {
    const input = adminHtml.match(new RegExp(`<input id="${id}"[^>]*>`));
    assert.ok(input, `Missing ${id} input`);
    assert.match(input[0], /type="number"/);
    assert.match(input[0], /step="1"/);
    assert.doesNotMatch(input[0], /\bmax=/);
  }
});
