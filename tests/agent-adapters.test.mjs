import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validateAgentAdapters } from '../scripts/agent-adapters.mjs';

const metadata = 'name: games-builder\ndescription: |\n  Costruisce il risultato\n  nel proprio ambito.';
const roleLink = '[ruolo canonico](../../agents/builder.md)';
const document = (header = metadata, body = roleLink) => `---\n${header}\n---\n\n${body}\n`;

async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'games adapters '));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'hub space'); await fs.mkdir(root);
  const put = async (relative, contents) => {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, contents);
    return file;
  };
  const roles = [{ id: 'builder', file: 'agents/builder.md' }, { id: 'reviewer', file: 'agents/reviewer.md' }];
  const adapters = [{ id: 'games-builder', client: 'vscode', role: 'builder', file: '.github/agents/games-builder.agent.md' }];
  for (const role of roles) await put(role.file, `# ${role.id}\nRuolo canonico.\n`);
  await put(adapters[0].file, document());
  const validate = (extra = {}) => validateAgentAdapters({ root, roles, adapters, ...extra });
  return { parent, root, put, roles, adapters, validate };
}

test('adattatori espliciti: YAML multilinea, link locali e URL remoti senza scansioni o fetch', async t => {
  const f = await fixture(t);
  await f.put('docs/guide.md', '# Guida\n');
  await f.put('docs/file with spaces.md', '# Spazi\n');
  await f.put('.github/agents/unlisted.agent.md', 'malformed and not listed');
  await f.put('projects/ignored/.github/agents/broken.agent.md', 'not an input');
  await f.put(f.adapters[0].file, `\uFEFF${document(metadata, `${roleLink}\n[guida](../../docs/guide.md#esempio)\n[spazi](../../docs/file%20with%20spaces.md)\n[web](https://never-resolve.invalid/docs)\n[locale](#titolo)` ).replaceAll('\n', '\r\n')}`);
  assert.deepEqual(await f.validate(), f.adapters);
  assert.deepEqual(await f.validate({ adapters: [] }), []);
});

test('rifiuta adattatore mancante, file non canonico, ID duplicato e mapping client/ruolo ambiguo', async t => {
  const f = await fixture(t), original = { ...f.adapters[0] };
  for (const file of ['agents/builder.md', '../outside.agent.md', path.join(f.root, original.file)]) {
    f.adapters[0].file = file;
    await assert.rejects(f.validate(), /file richiesto/);
  }
  f.adapters[0] = original;
  await assert.rejects(f.validate({ adapters: [original, { ...original }] }), /identificatore duplicato/);
  await assert.rejects(f.validate({ adapters: [original, { ...original, id: 'another-builder', file: '.github/agents/another-builder.agent.md' }] }), /mapping client\/ruolo ambiguo/);
  await fs.rm(path.join(f.root, original.file));
  await assert.rejects(f.validate(), { code: 'ENOENT' });
});

test('rifiuta drift del ruolo e riferimenti a ruoli sconosciuti o ambigui', async t => {
  const f = await fixture(t);
  f.adapters[0].role = 'reviewer';
  await assert.rejects(f.validate(), /manca il link inline al ruolo canonico reviewer/);
  f.adapters[0].role = 'unknown';
  await assert.rejects(f.validate(), /ruolo canonico assente/);
  f.adapters[0].role = 'builder';
  await assert.rejects(f.validate({ roles: [...f.roles, f.roles[0]] }), /ruolo canonico assente o ambiguo/);
  f.adapters[0].client = 'claude';
  await assert.rejects(f.validate(), /client vscode/);
});

test('frontmatter richiede un blocco iniziale, YAML valido con chiavi uniche, name e description', async t => {
  const f = await fixture(t);
  const cases = [
    ['# Senza frontmatter', /frontmatter/],
    [document('name: [unclosed\ndescription: test'), /YAML non valido/],
    [document('name: games-builder\nname: games-builder\ndescription: test'), /chiavi duplicate/],
    [document('name: games-builder\ndescription: test\ndescription: again'), /chiavi duplicate/],
    [document('name: another\ndescription: test'), /name deve/],
    [document('name: games-builder\ndescription: " "'), /description/],
    [document('name: games-builder\ndescription: [nested]'), /description/],
    [document(metadata, '  '), /corpo Markdown vuoto/],
    [document(metadata, document()), /un solo frontmatter/],
  ];
  for (const [text, error] of cases) {
    await f.put(f.adapters[0].file, text);
    await assert.rejects(f.validate(), error);
  }
});

test('il ruolo canonico deve essere un link visibile, non un esempio, commento o immagine', async t => {
  const f = await fixture(t);
  for (const body of [`\`${roleLink}\``, `\`\`\`md\n${roleLink}\n\`\`\``, `~~~md\n${roleLink}\n~~~`, `    ${roleLink}`, `\\${roleLink}`, `<!-- ${roleLink} -->`, `!${roleLink}`]) {
    await f.put(f.adapters[0].file, document(metadata, body));
    await assert.rejects(f.validate(), /manca il link inline al ruolo canonico/);
  }
  await f.put(f.adapters[0].file, document(metadata, `${roleLink}\n\`[example](../../missing.md)\`\n\`\`\`md\n[example](../../missing.md)\n\`\`\`\n<!-- [example](../../missing.md) -->`));
  await f.validate();
});

test('verifica tutti i link relativi e rifiuta sintassi non supportate', async t => {
  const f = await fixture(t);
  await f.put(f.adapters[0].file, document(metadata, `${roleLink}\n[missing](../../docs/missing.md)`));
  await assert.rejects(f.validate(), { code: 'ENOENT' });
  for (const link of ['[ref][target]\n[target]: ../../agents/builder.md', '<a href="../../agents/builder.md">ruolo</a>', '[title](../../agents/builder.md "titolo")', '[bad](../../agents/builder(bad).md)', '[unclosed](../../missing.md', '[query](../../agents/builder.md?version=2)', '[percent](../../bad%xy.md)', '[drive](C:/file.md)', '[file](file:///outside.md)']) {
    await f.put(f.adapters[0].file, document(metadata, `${roleLink}\n${link}`));
    await assert.rejects(f.validate(), /soltanto link Markdown inline|non supportat|non valida|ammessi soltanto/);
  }
});

test('link assoluti, traversal oltre la root e symlink esterni sono rifiutati anche se esistono', async t => {
  const f = await fixture(t);
  const outside = path.join(f.parent, 'outside.md'); await fs.writeFile(outside, 'outside fixture');
  await f.put('docs/inside.md', 'Inside fixture');
  await fs.symlink(outside, path.join(f.root, 'docs/outside.md'));
  for (const link of [outside, '../../../outside.md', '%2e%2e/%2e%2e/%2e%2e/outside.md', '../../docs/outside.md']) {
    await f.put(f.adapters[0].file, document(metadata, `${roleLink}\n[escape](${link.replaceAll(' ', '%20')})`));
    await assert.rejects(f.validate(), /non relativo|esce dal hub/);
  }
  await fs.rm(path.join(f.root, f.adapters[0].file));
  await fs.symlink(outside, path.join(f.root, f.adapters[0].file));
  await assert.rejects(f.validate(), /esce dal hub tramite symlink/);
});
