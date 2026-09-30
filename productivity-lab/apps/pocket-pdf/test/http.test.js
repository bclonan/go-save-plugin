import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('HTTP MCP initializes and discovers real tools; rejects foreign Origin and missing auth', { timeout: 20000 }, async () => {
  const port = 4378;
  const base = 'http://127.0.0.1:' + port;
  const token = 'integration-test-token';
  const child = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_BASE_URL: base, MCP_BEARER_TOKEN: token },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let startupError = '';
  child.stderr.on('data', bytes => { startupError += bytes.toString(); });
  const client = new Client({ name: 'smoke-test', version: '1.0.0' });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error('Server exited: ' + startupError);
      try { ready = (await fetch(base + '/health')).ok; } catch {}
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, 'server became ready');
    const noAuth = await fetch(base + '/mcp', { method: 'POST' });
    assert.equal(noAuth.status, 401);
    const badOrigin = await fetch(base + '/health', { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(badOrigin.status, 403);
    await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + token } } }));
    const result = await client.listTools();
    assert.ok(result.tools.length >= 1);
    assert.ok(result.tools.every(tool => tool.inputSchema.type === 'object'));
  } finally {
    await client.close().catch(() => {});
    if (child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
  }
});
