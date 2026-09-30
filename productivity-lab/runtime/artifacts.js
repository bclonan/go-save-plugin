import { randomUUID } from 'node:crypto';

export function createArtifactStore({ baseUrl, ttlMs = 15 * 60 * 1000, maxBytes = 64 * 1024 * 1024, maxItems = 100, now = Date.now } = {}) {
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('PUBLIC_BASE_URL must be an HTTP(S) origin without credentials, path, query or fragment.');
  }
  const origin = parsed.origin;
  const files = new Map();
  let total = 0;
  function purge() {
    for (const [id, file] of files) {
      if (file.expiresAt <= now()) { files.delete(id); total -= file.bytes.length; }
    }
  }
  return {
    add({ name, mimeType, bytes }) {
      purge();
      const data = Buffer.from(bytes);
      if (!data.length || data.length > 20 * 1024 * 1024) throw new Error('Output must be between 1 byte and 20 MiB.');
      if (files.size >= maxItems || total + data.length > maxBytes) throw new Error('Download storage is busy. Try again after existing files expire.');
      if (!['text/csv', 'text/csv; charset=utf-8', 'application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(mimeType)) throw new Error('Unsupported download type.');
      const safeName = String(name || 'download').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'download';
      const id = randomUUID();
      const expiresAt = now() + ttlMs;
      files.set(id, { name: safeName, mimeType, bytes: data, expiresAt });
      total += data.length;
      return { url: origin + '/downloads/' + id, name: safeName, mimeType, bytes: data.length, expiresAt: new Date(expiresAt).toISOString() };
    },
    get(id) { purge(); return files.get(id); },
    clear() { files.clear(); total = 0; },
    stats() { purge(); return { items: files.size, bytes: total }; }
  };
}
