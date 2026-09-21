import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSnapshot, DEFAULT_SNAPSHOT } from '../scripts/check-snapshot.mjs';

const digest = content => createHash('sha256').update(content).digest('hex');
const script = fileURLToPath(new URL('../scripts/check-snapshot.mjs', import.meta.url));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'games-snapshot-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const put = async (name, content) => {
    const destination = path.join(root, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content));
    return destination;
  };
  const bytes = Buffer.from([0, 255, 10, 13, 127]);
  await put('docs/example.bin', bytes);
  const manifest = { algorithm: 'sha256', created_at: '2026-09-21T16:12:54.830Z', files: [{ path: 'docs/example.bin', sha256: digest(bytes) }] };
  const save = () => put(DEFAULT_SNAPSHOT, manifest);
  await save();
  return { root, put, manifest, save };
}

test('verifica i byte dei soli file elencati, anche con hash maiuscolo', async t => {
  const f = await fixture(t);
  await f.put('projects/unrelated/snapshot.json', '{invalid');
  f.manifest.files[0].sha256 = f.manifest.files[0].sha256.toUpperCase();
  await f.save();
  const result = await checkSnapshot({ root: f.root });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.counts, { checked: 1, matched: 1, mismatched: 0, errors: 0 });
  assert.deepEqual(result.mismatches, []);
});

test('distingue mismatch e file mancanti continuando con gli altri file', async t => {
  const f = await fixture(t);
  await f.put('docs/example.bin', 'contenuto diverso, da non stampare');
  f.manifest.files.push({ path: 'docs/missing.md', sha256: digest('missing') });
  await f.put('docs/valid.md', 'valido');
  f.manifest.files.push({ path: 'docs/valid.md', sha256: digest('valido') });
  await f.save();
  const result = await checkSnapshot({ root: f.root });
  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, { checked: 2, matched: 1, mismatched: 1, errors: 1 });
  assert.deepEqual(result.mismatches, ['docs/example.bin']);
  assert.match(result.errors.join('\n'), /missing\.md.*File non trovato/);
  assert.doesNotMatch(JSON.stringify(result), /contenuto diverso/);
});

test('rifiuta JSON e struttura malformati prima di leggere i file', async t => {
  const f = await fixture(t);
  const invalid = ['{invalid-private-content', null, [], {}, { ...f.manifest, algorithm: 'md5' },
    { ...f.manifest, files: [] }, { ...f.manifest, files: {} }, { ...f.manifest, files: [null] },
    { ...f.manifest, files: [{ path: 'missing.md', sha256: 'not-a-hash' }] }];
  for (const value of invalid) {
    await f.put(DEFAULT_SNAPSHOT, value);
    const result = await checkSnapshot({ root: f.root });
    assert.equal(result.ok, false);
    assert.equal(result.counts.checked, 0);
    assert.ok(result.counts.errors > 0);
    assert.doesNotMatch(JSON.stringify(result), /invalid-private-content|File non trovato/);
  }
});

test('rifiuta attraversamenti, assoluti, backslash e byte nulli', async t => {
  const f = await fixture(t);
  for (const filename of ['../outside.txt', 'docs/../docs/example.bin', path.join(f.root, 'docs/example.bin'), 'C:/private/file', 'docs\\example.bin', 'docs/\0file', '']) {
    f.manifest.files[0].path = filename;
    await f.save();
    const result = await checkSnapshot({ root: f.root });
    assert.equal(result.ok, false, filename);
    assert.equal(result.counts.checked, 0);
    assert.match(result.errors.join('\n'), /percorso relativo senza attraversamenti/);
  }
});

test('rifiuta percorsi duplicati anche con segmenti ridondanti', async t => {
  const f = await fixture(t);
  for (const filename of ['docs/example.bin', './docs/example.bin', 'docs//example.bin']) {
    f.manifest.files = [f.manifest.files[0], { path: filename, sha256: f.manifest.files[0].sha256 }];
    await f.save();
    const result = await checkSnapshot({ root: f.root });
    assert.equal(result.ok, false);
    assert.equal(result.counts.checked, 0);
    assert.match(result.errors.join('\n'), /percorso duplicato/);
  }
});

test('rifiuta symlink esterni e directory, consente un symlink interno', async t => {
  const f = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'games-snapshot-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'file'), 'outside-private-content');
  await fs.symlink(path.join(outside, 'file'), path.join(f.root, 'external'));
  await fs.symlink(path.join(f.root, 'docs/example.bin'), path.join(f.root, 'internal'));
  f.manifest.files = ['external', 'docs', 'internal'].map(filename => ({ path: filename, sha256: f.manifest.files[0].sha256 }));
  await f.save();
  const result = await checkSnapshot({ root: f.root });
  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, { checked: 1, matched: 1, mismatched: 0, errors: 2 });
  assert.match(result.errors.join('\n'), /collegamento simbolico/);
  assert.match(result.errors.join('\n'), /non è un file/);
  assert.doesNotMatch(JSON.stringify(result), /outside-private-content/);
});

test('segnala snapshot assente senza mostrare contenuti o dettagli di sistema', async t => {
  const f = await fixture(t);
  const result = await checkSnapshot({ root: f.root, snapshot: 'missing.json' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, { checked: 0, matched: 0, mismatched: 0, errors: 1 });
  assert.deepEqual(result.errors, ['Snapshot: File non trovato.']);
});

test('CLI usa root esplicita da un altro cwd e restituisce 1 per mismatch', async t => {
  const f = await fixture(t);
  const run = args => spawnSync(process.execPath, [script, ...args], { cwd: os.tmpdir(), encoding: 'utf8', timeout: 5000 });
  const valid = run(['--root', f.root]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /checked=1 matched=1 mismatched=0 errors=0/);
  await f.put('docs/example.bin', 'modified-private-content');
  const changed = run([DEFAULT_SNAPSHOT, '--root', f.root]);
  assert.equal(changed.status, 1);
  assert.match(changed.stdout, /checked=1 matched=0 mismatched=1 errors=0/);
  assert.match(changed.stderr, /DIFF.*docs\/example\.bin/);
  assert.doesNotMatch(changed.stdout + changed.stderr, /modified-private-content/);
  assert.equal(run(['--root']).status, 1);
  assert.equal(run(['--unknown']).status, 1);
});
