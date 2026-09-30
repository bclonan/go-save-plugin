import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtifactStore } from '../src/artifacts.js';

test('downloads expire and account for bytes', () => {
  let now = 1000;
  const store = createArtifactStore({ baseUrl: 'http://localhost:3000', ttlMs: 100, now: () => now });
  const input = Buffer.from('hello');
  const info = store.add({ name: '../plan\r\n.pdf', mimeType: 'application/pdf', bytes: input });
  const id = new URL(info.url).pathname.split('/').pop();
  input[0] = 0;
  assert.equal(store.get(id).bytes.toString(), 'hello');
  assert.doesNotMatch(info.name, /[\/\r\n]/);
  assert.equal(store.stats().bytes, 5);
  now = 1100;
  assert.equal(store.get(id), undefined);
  assert.deepEqual(store.stats(), { items: 0, bytes: 0 });
});
test('capacity and invalid origins fail clearly', () => {
  const store = createArtifactStore({ baseUrl: 'http://localhost:3000', maxBytes: 4 });
  assert.throws(() => store.add({ name: 'a.pdf', mimeType: 'application/pdf', bytes: Buffer.alloc(5) }), /busy/);
  for (const baseUrl of ['file:///tmp', 'https://a.example/path', 'https://user:pass@a.example/']) {
    assert.throws(() => createArtifactStore({ baseUrl }));
  }
});
