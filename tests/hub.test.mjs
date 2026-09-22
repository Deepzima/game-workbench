import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { checkHub, doctor, parseVersion, probeVersion } from '../scripts/hub.mjs';
const hubSchema = JSON.parse(await fs.readFile(new URL('../schemas/hub.schema.json', import.meta.url), 'utf8'));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'games-hub-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const put = async (name, content) => {
    const destination = path.join(root, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, typeof content === 'string' ? content : JSON.stringify(content));
    return destination;
  };
  const catalogEntry = { type: 'object', required: ['id', 'file'], properties: { id: { type: 'string' }, file: { type: 'string' } }, additionalProperties: false };
  const contract = { type: 'object', required: ['schema', 'template'], properties: { schema: { type: 'string' }, template: { type: 'string' } }, additionalProperties: false };
  await put('schemas/hub.schema.json', {
    $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', required: ['schema_version', 'roles', 'skills', 'contracts'], additionalProperties: false,
    properties: { schema_version: { const: 1 }, roles: { type: 'array', items: catalogEntry }, skills: { type: 'array', items: catalogEntry }, workflows: { type: 'array', items: catalogEntry }, guardrails: { type: 'array', items: catalogEntry }, adapters: { type: 'array', items: hubSchema.definitions.adapter }, mcp_servers: { type: 'array' }, contracts: { type: 'object', required: ['task', 'handoff'], properties: { task: contract, handoff: contract }, additionalProperties: false } },
  });
  const manifest = { schema_version: 1, roles: [{ id: 'builder', file: 'agents/builder.md' }], skills: [{ id: 'verify', file: 'skills/verify/SKILL.md' }], contracts: { task: { schema: 'schemas/task.schema.json', template: 'templates/task.yaml' }, handoff: { schema: 'schemas/handoff.schema.json', template: 'templates/handoff.yaml' } } };
  manifest.mcp_servers = [];
  await put('hub.json', manifest);
  await put('agents/builder.md', 'Costruisce il risultato richiesto e riporta le verifiche.');
  await put('skills/verify/SKILL.md', '---\nname: verify\ndescription: |\n  Verifica il risultato\n  con prove riproducibili.\n---\nEseguire i controlli pertinenti.\n');
  await put('schemas/task.schema.json', { type: 'object', required: ['role', 'objective'], properties: { role: { type: 'string' }, objective: { type: 'string', minLength: 1 } }, additionalProperties: false });
  await put('schemas/handoff.schema.json', { type: 'object', required: ['from_role', 'to_role'], properties: { from_role: { type: 'string' }, to_role: { type: 'string' } }, additionalProperties: false });
  await put('templates/task.yaml', 'role: builder\nobjective: Verificare una modifica\n');
  await put('templates/handoff.yaml', 'from_role: builder\nto_role: builder\n');
  return { root, put, manifest };
}

test('valida catalogo, frontmatter YAML multilinea e contratti senza scandire progetti', async t => {
  const f = await fixture(t);
  await f.put('projects/unrelated/hub.json', '{invalid');
  const result = await checkHub({ root: f.root });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.counts, { roles: 1, skills: 1, guardrails: 0, contracts: 2, documents: 0, mcpServers: 0, workflows: 0, adapters: 0 });
});

test('hub:check include adattatori espliciti e conserva validi cataloghi v1 senza adapters', async t => {
  const f = await fixture(t);
  await f.put('schemas/hub.schema.json', hubSchema);
  assert.equal((await checkHub({ root: f.root })).ok, true);
  f.manifest.adapters = [{ id: 'games-builder', client: 'vscode', role: 'builder', file: '.github/agents/games-builder.agent.md' }];
  await f.put('hub.json', f.manifest);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /Adattatori: File non trovato/);
  await f.put(f.manifest.adapters[0].file, '---\nname: games-builder\ndescription: Costruisce il risultato.\n---\nLeggi il [ruolo](../../agents/builder.md).\n');
  const valid = await checkHub({ root: f.root });
  assert.equal(valid.ok, true, valid.errors.join('\n'));
  assert.equal(valid.counts.adapters, 1);
  f.manifest.adapters[0].role = 'missing';
  await f.put('hub.json', f.manifest);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /Adattatori.*ruolo canonico assente/);
  f.manifest.adapters[0].role = 'builder'; f.manifest.adapters[0].client = 'unknown';
  await f.put('hub.json', f.manifest);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /Manifest.*client/);
  delete f.manifest.adapters[0].client;
  await f.put('hub.json', f.manifest);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /Manifest.*client/);
});

test('rifiuta un manifest che non rispetta lo schema', async t => {
  const f = await fixture(t);
  f.manifest.schema_version = 2;
  await f.put('hub.json', f.manifest);
  const result = await checkHub({ root: f.root });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /Manifest.*schema_version/);
});

test('hub:check include gli MCP e verifica entrypoint e duplicati', async t => {
  const f = await fixture(t);
  f.manifest.mcp_servers = [{ id: 'games-memory', transport: 'stdio', runtime: 'node', entrypoint: 'mcp/memory/server.mjs', args: [] }];
  await f.put('hub.json', f.manifest);
  const missing = await checkHub({ root: f.root });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join('\n'), /MCP.*file non accessibile/);
  await f.put('mcp/memory/server.mjs', '// fixture\n');
  const valid = await checkHub({ root: f.root });
  assert.equal(valid.ok, true, valid.errors.join('\n'));
  assert.equal(valid.counts.mcpServers, 1);
  f.manifest.mcp_servers.push(f.manifest.mcp_servers[0]);
  await f.put('hub.json', f.manifest);
  const duplicate = await checkHub({ root: f.root });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join('\n'), /MCP.*duplicato/);
});

test('hub:check valida workflow, ruoli e ID rispetto al catalogo', async t => {
  const f = await fixture(t);
  f.manifest.workflows = [{ id: 'build', file: 'workflows/build.json' }];
  await f.put('hub.json', f.manifest);
  const workflow = { schema_version: 1, id: 'build', description: 'Prova workflow.', steps: [
    { id: 'build', role: 'builder', adapter: null, objective: 'Costruire il risultato.', depends_on: [], write_scope: ['output/'] },
  ] };
  await f.put('workflows/build.json', workflow);
  const valid = await checkHub({ root: f.root });
  assert.equal(valid.ok, true, valid.errors.join('\n'));
  assert.equal(valid.counts.workflows, 1);
  workflow.steps[0].role = 'unknown';
  await f.put('workflows/build.json', workflow);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /Ruolo non presente/);
  workflow.steps[0].role = 'builder'; workflow.id = 'other';
  await f.put('workflows/build.json', workflow);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /ID del workflow/);
  workflow.id = 'build';
  await f.put('workflows/build.json', workflow);
  f.manifest.workflows.push(f.manifest.workflows[0]);
  await f.put('hub.json', f.manifest);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /workflow duplicato/);
});

test('segnala riferimenti mancanti e identificatori duplicati', async t => {
  const f = await fixture(t);
  f.manifest.roles.push({ id: 'builder', file: 'agents/other.md' });
  f.manifest.contracts.handoff.template = 'templates/missing.yaml';
  await f.put('hub.json', f.manifest);
  const result = await checkHub({ root: f.root });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicato/);
  assert.match(result.errors.join('\n'), /Template handoff: File non trovato/);
});

test('rifiuta percorsi assoluti e attraversamenti anche se il file esiste', async t => {
  const f = await fixture(t);
  for (const filename of [path.join(f.root, 'agents/builder.md'), 'agents/../agents/builder.md']) {
    f.manifest.roles[0].file = filename;
    await f.put('hub.json', f.manifest);
    const result = await checkHub({ root: f.root });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /percorso relativo senza attraversamenti/);
  }
});

test('rifiuta un symlink verso file esterni anche per i template', async t => {
  const f = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'games-hub-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'template.yaml'), 'role: builder\nobjective: Test\n');
  await fs.symlink(path.join(outside, 'template.yaml'), path.join(f.root, 'templates/external.yaml'));
  f.manifest.contracts.task.template = 'templates/external.yaml';
  await f.put('hub.json', f.manifest);
  const result = await checkHub({ root: f.root });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /collegamento simbolico/);
});

test('rifiuta YAML malformato e name incoerente nel frontmatter', async t => {
  const f = await fixture(t);
  for (const metadata of ['name: [verify\ndescription: Test', 'name: other\ndescription: Test']) {
    await f.put('skills/verify/SKILL.md', `---\n${metadata}\n---\nProcedura.\n`);
    const result = await checkHub({ root: f.root });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /YAML non valido|name uguale/);
  }
});

test('rifiuta schema invalido e riferimenti remoti senza recuperarli', async t => {
  const f = await fixture(t);
  for (const schema of [{ type: 'not-a-json-schema-type' }, { $ref: 'https://example.invalid/schema.json' }]) {
    await f.put('schemas/task.schema.json', schema);
    const result = await checkHub({ root: f.root });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Schema task:/);
  }
});

test('valida un task esplicito esterno al hub e ne controlla il ruolo', async t => {
  const f = await fixture(t);
  const other = await fs.mkdtemp(path.join(os.tmpdir(), 'games-project-test-'));
  t.after(() => fs.rm(other, { recursive: true, force: true }));
  const task = path.join(other, 'task.yaml');
  await fs.writeFile(task, 'role: builder\nobjective: Implementare il movimento\n');
  const valid = await checkHub({ root: f.root, task });
  assert.equal(valid.ok, true, valid.errors.join('\n'));
  assert.equal(valid.counts.documents, 1);
  await fs.writeFile(task, 'role: missing\nobjective: Implementare il movimento\n');
  const unknown = await checkHub({ root: f.root, task });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors.join('\n'), /campo role/);
  await fs.writeFile(task, 'role: builder\n');
  const invalid = await checkHub({ root: f.root, task });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /objective/);
});

test('valida entrambi i ruoli degli handoff espliciti', async t => {
  const f = await fixture(t);
  const handoff = await f.put('handoff.yaml', 'from_role: builder\nto_role: unknown\n');
  const result = await checkHub({ root: f.root, handoff });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /campo to_role/);
});

test('legge la versione intera di Node con prefisso v senza promuovere una major precedente', async t => {
  assert.equal(probeVersion(process.execPath), process.versions.node);
  assert.equal(parseVersion('v22.23.2\n'), '22.23.2');
  assert.equal(parseVersion('v20.23.2\n'), '20.23.2');
  assert.equal(parseVersion('uv 0.12.17 (build)\n'), '0.12.17');
  assert.equal(parseVersion('versione non disponibile'), null);
  const f = await fixture(t);
  const result = await doctor({ root: f.root, version: command => command === process.execPath ? parseVersion('v20.23.2\n') : '0.12.17' });
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].status, 'error');
  assert.match(result.checks[0].message, /Node 20\.23\.2/);
});

test('doctor riporta solo nomi MCP e non fallisce per integrazioni opzionali', async t => {
  const f = await fixture(t);
  await f.put('.mcp.json', { mcpServers: { blender: { command: 'private-command', env: { KEY: 'private-value' } } } });
  await f.put('.vscode/mcp.json', { servers: { memory: { url: 'private-url' } } });
  const result = await doctor({ root: f.root, version: command => command === process.execPath ? '22.23.2' : command === 'uv' ? '0.12.17' : null });
  assert.equal(result.ok, true);
  const output = JSON.stringify(result);
  assert.match(output, /blender/);
  assert.match(output, /memory/);
  assert.doesNotMatch(output, /private-command|private-value|private-url/);
  const missing = await doctor({ root: f.root, version: () => null });
  assert.equal(missing.ok, false);
});


test('valida moduli guardrail importabili e rifiuta duplicati, metadati e percorsi errati', async t => {
  const f = await fixture(t);
  f.manifest.guardrails = [{ id: 'scope', file: 'guardrails/scope.md' }];
  await f.put('hub.json', f.manifest);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /Guardrail scope: File non trovato/);
  await f.put('guardrails/scope.md', '---\nname: scope\ndescription: Ambito assegnato\n---\nVerificare gli output.\n');
  let result = await checkHub({ root: f.root });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.counts.guardrails, 1);
  f.manifest.guardrails.push(f.manifest.guardrails[0]);
  await f.put('hub.json', f.manifest);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /Guardrail scope: Identificatore duplicato/);
  f.manifest.guardrails.pop();
  f.manifest.guardrails[0].file = 'agents/builder.md';
  await f.put('hub.json', f.manifest);
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /guardrails\/<id>/);
  f.manifest.guardrails[0].file = 'guardrails/scope.md';
  await f.put('hub.json', f.manifest);
  await f.put('guardrails/scope.md', '---\nname: different\ndescription: Ambito assegnato\n---\nVerificare gli output.\n');
  assert.match((await checkHub({ root: f.root })).errors.join('\n'), /name uguale/);
});
