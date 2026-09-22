import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadMcpCatalog, validateMcpCatalog, renderMcpEntry } from '../scripts/mcp-catalog.mjs';

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'games catalog ')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'mcp/memory'), { recursive: true });
  await fs.writeFile(path.join(root, 'mcp/memory/server.mjs'), '// fixture; never executed\n');
  const server = {
    id: 'games-memory', transport: 'stdio', runtime: 'node', entrypoint: 'mcp/memory/server.mjs',
    args: ['--hub-root', { root: 'hub' }], project_args: ['--project-root', { root: 'project' }],
    env: { MISE_AUTO_INSTALL: 'false' },
  };
  const manifest = { schema_version: 1, mcp_servers: [server] };
  const save = value => fs.writeFile(path.join(root, 'hub.json'), JSON.stringify(value));
  await save(manifest);
  return { root, server, manifest, save };
}

test('catalogo MCP: carica soltanto dichiarazioni esplicite e ne restituisce una copia', async t => {
  const f = await fixture(t);
  const result = await validateMcpCatalog({ root: f.root, servers: f.manifest.mcp_servers });
  assert.deepEqual(result, f.manifest.mcp_servers);
  result[0].args.push('changed');
  assert.equal(f.server.args.length, 2);
  assert.deepEqual(await loadMcpCatalog({ root: f.root }), f.manifest.mcp_servers);
  assert.equal((await fs.readdir(f.root)).includes('.games'), false);
});

test('catalogo MCP: versione, forma, runtime e identificatori sono validati', async t => {
  const f = await fixture(t);
  for (const value of [null, {}, { ...f.manifest, schema_version: 2 },
    { schema_version: 1 }, { ...f.manifest, mcp_servers: {} }]) {
    await f.save(value);
    await assert.rejects(loadMcpCatalog({ root: f.root }), /Catalogo MCP/);
  }
  for (const change of [
    { runtime: 'python' }, { transport: 'http' }, { id: 'bad id' },
    { args: [{ root: 'unknown' }] }, { extra: 'unknown' },
    { env: { MISE_AUTO_INSTALL: 'true' } },
  ]) {
    await assert.rejects(validateMcpCatalog({ root: f.root, servers: [{ ...f.server, ...change }] }), /non valido/);
  }
  await assert.rejects(validateMcpCatalog({ root: f.root, servers: [f.server, f.server] }), /duplicato/);
  await fs.writeFile(path.join(f.root, 'hub.json'), '{invalid');
  await assert.rejects(loadMcpCatalog({ root: f.root }), /JSON valido/);
});

test('catalogo MCP: entrypoint relativo, esistente e confinato al componente mcp', async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, 'mcp/directory.mjs'));
  for (const entrypoint of [
    path.join(f.root, f.server.entrypoint), '../server.mjs', 'mcp/../server.mjs',
    'C:\\workspace\\server.mjs', 'mcp//server.mjs', 'mcp/./server.mjs',
    'scripts/server.mjs', 'mcp/server.sh', 'mcp/missing.mjs', 'mcp/directory.mjs',
  ]) {
    await assert.rejects(validateMcpCatalog({ root: f.root, servers: [{ ...f.server, entrypoint }] }), /Entrypoint MCP/);
  }
  const outside = await fixture(t);
  await fs.writeFile(path.join(f.root, 'outside-component.mjs'), '// no\n');
  for (const [name, target] of [
    ['external.mjs', path.join(outside.root, outside.server.entrypoint)],
    ['other-component.mjs', path.join(f.root, 'outside-component.mjs')],
  ]) {
    await fs.symlink(target, path.join(f.root, 'mcp', name));
    await assert.rejects(validateMcpCatalog({ root: f.root, servers: [{ ...f.server, entrypoint: `mcp/${name}` }] }), /symlink/);
  }
  await fs.symlink('memory/server.mjs', path.join(f.root, 'mcp/inside.mjs'));
  assert.equal((await validateMcpCatalog({ root: f.root, servers: [{ ...f.server, entrypoint: 'mcp/inside.mjs' }] })).length, 1);
});

test('catalogo MCP: anche il manifest deve appartenere al checkout selezionato', async t => {
  const f = await fixture(t);
  const outside = await fixture(t);
  await fs.unlink(path.join(f.root, 'hub.json'));
  await fs.symlink(path.join(outside.root, 'hub.json'), path.join(f.root, 'hub.json'));
  await assert.rejects(loadMcpCatalog({ root: f.root }), /symlink/);
});

test('catalogo MCP: niente percorsi macchina o interpolazioni nei valori letterali', async t => {
  const f = await fixture(t);
  for (const value of ['/home/private', 'C:\\private', '~/private', '${SECRET}', 'nul\0value']) {
    for (const change of [{ args: [value] }, { project_args: [value] }, { env: { TEST: value } }]) {
      await assert.rejects(validateMcpCatalog({ root: f.root, servers: [{ ...f.server, ...change }] }), /valori portabili/);
    }
  }
  await assert.rejects(validateMcpCatalog({ root: f.root, servers: [{ ...f.server, args: [{ root: 'project' }] }] }), /soltanto in project_args/);
  const secret = 'value-that-must-not-appear';
  await assert.rejects(validateMcpCatalog({ root: f.root, servers: [{ ...f.server, runtime: secret }] }), error => {
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});

test('render MCP: workspace portabile, TUI locali e checkout progetto esplicito', async t => {
  const f = await fixture(t);
  const project = await fixture(t);
  const [definition] = await loadMcpCatalog({ root: f.root });
  const vscode = renderMcpEntry(definition, { hubRoot: f.root, client: 'vscode' });
  assert.deepEqual(vscode, {
    type: 'stdio', command: 'mise',
    args: ['-C', '${workspaceFolder}', 'exec', '--no-deps', '--', 'node', 'mcp/memory/server.mjs', '--hub-root', '${workspaceFolder}'],
    env: { MISE_AUTO_INSTALL: 'false' },
  });
  for (const client of ['claude', 'codex', 'vscode']) {
    const entry = renderMcpEntry(definition, { hubRoot: f.root, projectRoot: project.root, client });
    assert.deepEqual(entry.args, ['-C', f.root, 'exec', '--no-deps', '--', 'node', path.join(f.root, definition.entrypoint), '--hub-root', f.root, '--project-root', project.root]);
    assert.equal(entry.type, client === 'vscode' ? 'stdio' : undefined);
    if (client !== 'vscode') {
      const hubOnly = renderMcpEntry(definition, { hubRoot: f.root, client });
      assert.equal(hubOnly.args.includes('--project-root'), false);
      assert.equal(hubOnly.args.at(-1), f.root);
    }
  }
  assert.throws(() => renderMcpEntry(definition, { hubRoot: f.root, projectRoot: f.root, client: 'codex' }), /distinti/);
  assert.throws(() => renderMcpEntry(definition, { hubRoot: '.', client: 'codex' }), /assolute/);
  assert.throws(() => renderMcpEntry(definition, { hubRoot: f.root, client: 'other' }), /non supportato/);
});
