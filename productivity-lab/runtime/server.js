import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createArtifactStore } from './artifacts.js';
import { registerTools } from './tools.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const baseUrl = process.env.PUBLIC_BASE_URL || ('http://localhost:' + port);
const originUrl = new URL(baseUrl);
if (!['127.0.0.1', '::1', 'localhost'].includes(host) && originUrl.protocol !== 'https:') throw new Error('Remote binding requires an HTTPS PUBLIC_BASE_URL behind a TLS reverse proxy.');
const allowedHosts = new Set([originUrl.host, 'localhost:' + port, '127.0.0.1:' + port, '[::1]:' + port]);
const allowedOrigins = new Set([originUrl.origin, 'http://localhost:' + port, 'http://127.0.0.1:' + port]);
const token = process.env.MCP_BEARER_TOKEN;
const artifacts = createArtifactStore({ baseUrl });
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(value => value.trim()).filter(Boolean));
const quotas = new Map();
let lastPurge = 0;
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!allowedHosts.has(req.get('host')) || (req.get('origin') && !allowedOrigins.has(req.get('origin')))) return res.status(403).json({ error: 'Host or Origin rejected.' });
  const now = Date.now();
  if (now - lastPurge > 60000) { for (const [key, q] of quotas) if (q.until <= now) quotas.delete(key); lastPurge = now; }
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  let quota = quotas.get(ip);
  if (!quota || quota.until <= now) {
    if (quotas.size >= 10000) return res.status(503).json({ error: 'Server busy.' });
    quota = { count: 0, until: now + 60000 }; quotas.set(ip, quota);
  }
  if (++quota.count > 120) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Too many requests.' }); }
  next();
});
app.get('/health', (_req, res) => res.json({ status: 'ok', app: pkg.name }));
app.get('/downloads/:id', (req, res) => {
  const file = artifacts.get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Download missing or expired.' });
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Disposition', 'attachment; filename="' + file.name + '"');
  res.type(file.mimeType).send(file.bytes);
});
app.use('/mcp', (req, res, next) => {
  if (token) {
    const supplied = Buffer.from(req.get('authorization') || '');
    const expected = Buffer.from('Bearer ' + token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
});
app.use('/mcp', express.json({ limit: '12mb', strict: true }));
app.post('/mcp', async (req, res) => {
  const server = new McpServer({ name: pkg.name, version: pkg.version });
  let transport;
  try {
    registerTools(server, artifacts);
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close().catch(() => {}); void server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Request failed.' }, id: null });
    if (transport) await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
});
app.all('/mcp', (_req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'Use POST for stateless MCP.' });
});
app.use((err, _req, res, _next) => res.status(err?.type === 'entity.too.large' ? 413 : 400).json({ error: 'Invalid or oversized request.' }));
const listener = app.listen(port, host, () => process.stderr.write(pkg.name + ' listening on ' + host + ':' + port + '/mcp\n'));
const close = () => { artifacts.clear(); listener.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); };
process.on('SIGTERM', close);
process.on('SIGINT', close);
