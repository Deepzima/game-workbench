import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { indexMemory } from '../mcp/memory/store.mjs';

const server = fileURLToPath(new URL('../mcp/memory/server.mjs', import.meta.url));
const cli = fileURLToPath(new URL('../mcp/memory/cli.mjs', import.meta.url));
const notePath = 'memory/decision.md';
function fixture(t, scope = 'hub', label = 'jump') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'games memory test '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'memory'));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs/spec.md'), `${label} design\n`);
  fs.writeFileSync(path.join(root, 'memory/sources.json'), JSON.stringify({ schema_version: 1, documents: [notePath] }));
  fs.writeFileSync(path.join(root, notePath), `---\nid: movement\ntitle: Movement\nscope: ${scope}\nstatus: verified\nupdated: 2026-09-21\nauthor: test\nsources:\n  - docs/spec.md\n---\n${label} uses a fixed simulation step.\n`);
  return root;
}
async function connect(t, hubRoot, projectRoot) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server, '--hub-root', hubRoot, ...(projectRoot ? ['--project-root', projectRoot] : [])],
    cwd: os.tmpdir(), stderr: 'pipe',
  });
  let errors = '';
  transport.stderr.on('data', chunk => { errors += chunk; });
  const client = new Client({ name: 'games-memory-integration', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  return { client, errors: () => errors };
}
async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  return result.structuredContent;
}

test('MCP stdio: discovery e tre strumenti, missing senza scritture, poi ricerca e lettura live', { timeout: 15000 }, async t => {
  const root = fixture(t);
  const { client } = await connect(t, root);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['memory_read', 'memory_search', 'memory_status']);
  for (const tool of tools.tools) assert.equal(tool.annotations.readOnlyHint, true);
  const missing = await call(client, 'memory_status');
  assert.equal(missing.state, 'missing');
  assert.equal((await call(client, 'memory_search', { query: 'jump' })).results.length, 0);
  const live = await call(client, 'memory_read', { scope: 'hub', path: notePath });
  assert.match(live.content, /fixed simulation/);
  assert.equal(fs.existsSync(path.join(root, '.games')), false);
  indexMemory({ root, scope: 'hub' });
  const cache = path.join(root, '.games/cache/memory.sqlite');
  const before = fs.readFileSync(cache);
  const found = await call(client, 'memory_search', { scope: 'hub', query: 'jump', limit: 2 });
  assert.equal(found.state, 'ready');
  assert.equal(found.results.length, 1);
  assert.equal(found.results[0].path, notePath);
  assert.equal((await call(client, 'memory_status')).state, 'ready');
  assert.deepEqual(fs.readFileSync(cache), before);
  assert.deepEqual(fs.readdirSync(path.dirname(cache)).sort(), ['.gitignore', 'memory.sqlite']);
  const forbidden = await client.callTool({ name: 'memory_read', arguments: { scope: 'hub', path: 'docs/spec.md' } });
  assert.equal(forbidden.isError, true);
});

test('due sessioni MCP condividono indici ma isolano gli scope e rilevano fonti cambiate', { timeout: 15000 }, async t => {
  const hubRoot = fixture(t, 'hub', 'hubmemory');
  const projectRoot = fixture(t, 'project', 'projectmemory');
  indexMemory({ root: hubRoot, scope: 'hub' });
  indexMemory({ root: projectRoot, scope: 'project' });
  const { client: first } = await connect(t, hubRoot, projectRoot);
  const { client: second } = await connect(t, hubRoot, projectRoot);
  assert.equal((await call(first, 'memory_search', { scope: 'project', query: 'hubmemory' })).results.length, 0);
  const results = await Promise.all([first, second].map(client => call(client, 'memory_search', { query: 'projectmemory' })));
  assert.ok(results.every(result => result.results[0].scope === 'project'));
  fs.writeFileSync(path.join(projectRoot, 'docs/spec.md'), 'changed source\n');
  const stale = await call(second, 'memory_search', { query: 'projectmemory' });
  assert.equal(stale.state, 'stale');
  assert.equal(stale.results.length, 0);
  const live = await call(first, 'memory_read', { scope: 'project', path: notePath });
  assert.equal(live.state, 'stale');
  indexMemory({ root: projectRoot, scope: 'project' });
  assert.equal((await call(second, 'memory_status')).state, 'ready');
});

test('CLI usa argomenti espliciti da un cwd diverso e rifiuta input errati', t => {
  const root = fixture(t);
  const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(run(['--help']).status, 0);
  assert.equal(run(['status', '--hub-root', root]).status, 1);
  assert.equal(run(['index', '--hub-root', root]).status, 0);
  const search = run(['search', '--hub-root', root, '--query', 'jump']);
  assert.equal(search.status, 0, search.stderr);
  assert.equal(JSON.parse(search.stdout).results.length, 1);
  assert.equal(run(['search', '--hub-root', root, '--query', 'jump', '--limit', '0']).status, 1);
  assert.equal(run(['index', '--hub-root', root, '--query', 'irrelevant']).status, 1);
  assert.equal(run(['index', '--scope', 'project', '--hub-root', root]).status, 1);
  assert.equal(run(['index', '--hub-root']).status, 1);
  assert.equal(run(['index', '--hub-root', root, '--hub-root', root]).status, 1);
});
