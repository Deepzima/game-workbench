import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { indexMemory, memoryRead, memorySearch, memoryStatus } from '../mcp/memory/store.mjs';

const NOTE = 'memory/decisions/render-loop.md';
const SOURCE = 'docs/rendering.md';
const CACHE = '.games/cache/memory.sqlite';
const sha = (value) => createHash('sha256').update(value).digest('hex');
function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function manifest(root, documents = [NOTE]) {
  write(root, 'memory/sources.json', JSON.stringify({ schema_version: 1, documents }, null, 2));
}
function noteText({ id = 'render-loop', scope = 'hub', status = 'verified', updated = '2026-09-21', sources = [SOURCE], body = 'Rendering uses a fixed timestep. Unicode città works.' } = {}) {
  return `---\nid: ${id}\ntitle: Render loop\nscope: ${scope}\nstatus: ${status}\nupdated: ${updated}\nauthor: Maintainer\nsources: ${JSON.stringify(sources)}\n---\n${body}\n`;
}
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'games memory store '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  manifest(root);
  write(root, NOTE, noteText(options));
  write(root, SOURCE, 'Authoritative rendering contract.');
  return root;
}
function options(root, extra = {}) { return { hubRoot: root, scope: 'hub', ...extra }; }

// Every fixture lives outside the repository and has an explicit allowlist.
test('memory roundtrip: indice FTS, riferimenti e contenuto corrente con scope esplicito', (t) => {
  const root = fixture(t);
  write(root, 'memory/unlisted.md', 'unlisted material must not be scanned');
  const indexed = indexMemory({ root, scope: 'hub' });
  assert.equal(indexed.state, 'ready');
  assert.equal(indexed.documents, 1);
  assert.equal(memoryStatus(options(root)).state, 'ready');
  const search = memorySearch({ ...options(root), query: 'fixed timestep' });
  assert.equal(search.results.length, 1);
  assert.equal(search.results[0].path, NOTE);
  assert.equal(search.results[0].scope, 'hub');
  assert.equal(search.results[0].memory_scope, 'hub');
  assert.equal(search.results[0].sources[0].sha256, sha(fs.readFileSync(path.join(root, SOURCE))));
  assert.match(search.results[0].excerpt, /fixed timestep/);
  const read = memoryRead({ ...options(root), path: NOTE });
  assert.equal(read.state, 'ready');
  assert.equal(read.metadata.status, 'verified');
  assert.equal(read.sha256, sha(read.content));
  assert.deepEqual(read.metadata.sources, [SOURCE]);
  assert.throws(() => memoryRead({ ...options(root), path: 'memory/unlisted.md' }), /non ammessa/);
  assert.throws(() => memoryRead({ ...options(root), path: SOURCE }), /file .md dentro memory/);
});

test('cache mancante: status, search e read non creano file o directory', (t) => {
  const root = fixture(t);
  assert.equal(memoryStatus(options(root)).state, 'missing');
  assert.deepEqual(memorySearch({ ...options(root), query: 'Rendering' }).results, []);
  const read = memoryRead({ ...options(root), path: NOTE });
  assert.equal(read.state, 'missing');
  assert.match(read.content, /Rendering/);
  assert.equal(fs.existsSync(path.join(root, '.games')), false);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'games-memory-empty-'));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  assert.equal(memoryStatus(options(empty)).state, 'missing');
  assert.deepEqual(fs.readdirSync(empty), []);
});

test('una nota, una fonte o il manifest modificati invalidano l’indice senza risultati obsoleti', (t) => {
  const root = fixture(t);
  indexMemory({ root, scope: 'hub' });
  write(root, NOTE, noteText({ body: 'Rendering now has a variable timestep.' }));
  let result = memorySearch({ ...options(root), query: 'fixed' });
  assert.equal(result.state, 'stale');
  assert.deepEqual(result.results, []);
  assert.ok(result.indexes[0].issues.some((issue) => issue.path === NOTE));
  assert.ok(result.indexes[0].sources_to_read.includes(SOURCE));
  assert.match(memoryRead({ ...options(root), path: NOTE }).content, /variable/);
  indexMemory({ root, scope: 'hub' });
  write(root, SOURCE, 'New source revision.');
  result = memorySearch({ ...options(root), query: 'Rendering' });
  assert.equal(result.state, 'stale');
  assert.deepEqual(result.results, []);
  assert.ok(result.indexes[0].issues.some((issue) => issue.path === SOURCE));
  indexMemory({ root, scope: 'hub' });
  // Whitespace still changes the manifest revision, even with identical entries.
  fs.appendFileSync(path.join(root, 'memory/sources.json'), '\n');
  assert.equal(memoryStatus(options(root)).state, 'stale');
  indexMemory({ root, scope: 'hub' });
  manifest(root, []);
  assert.equal(memoryStatus(options(root)).state, 'stale');
  assert.throws(() => memoryRead({ ...options(root), path: NOTE }), /non ammessa/);
});

test('scope hub, progetto e task restano isolati anche in checkout esterni con spazi', (t) => {
  const hub = fixture(t);
  const project = fixture(t, { scope: 'task', body: 'Physics integration checkpoint.' });
  const other = fixture(t, { scope: 'project', body: 'Audio integration checkpoint.' });
  indexMemory({ root: hub, scope: 'hub' });
  indexMemory({ root: project, scope: 'project' });
  indexMemory({ root: other, scope: 'project' });
  const context = { hubRoot: hub, projectRoot: project };
  const result = memorySearch({ ...context, query: 'integration' });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].scope, 'project');
  assert.equal(result.results[0].memory_scope, 'task');
  assert.match(result.results[0].excerpt, /Physics/);
  assert.equal(memorySearch({ ...context, scope: 'hub', query: 'integration' }).results.length, 0);
  assert.equal(memoryStatus({ hubRoot: hub }).indexes.length, 1);
  assert.equal(memoryStatus(context).indexes.length, 2);
  assert.throws(() => memoryStatus({ hubRoot: hub, scope: 'project' }), /projectRoot/);
  assert.throws(() => memoryStatus({ hubRoot: hub, projectRoot: hub, scope: 'project' }), /distinti/);
  assert.throws(() => memoryStatus({ hubRoot: hub, scope: 'task' }), /Scope/);
  assert.throws(() => memoryStatus({ hubRoot: '.' }), /assoluto/);
  assert.throws(() => indexMemory({ root: hub, scope: 'project' }), /scope incompatibile/);
});

test('un solo scope stale non impedisce di cercare l’altro indice valido', (t) => {
  const hub = fixture(t);
  const project = fixture(t, { scope: 'project' });
  indexMemory({ root: hub, scope: 'hub' });
  indexMemory({ root: project, scope: 'project' });
  fs.appendFileSync(path.join(hub, SOURCE), ' updated');
  const result = memorySearch({ hubRoot: hub, projectRoot: project, query: 'Rendering' });
  assert.equal(result.state, 'stale');
  assert.deepEqual(result.results.map((item) => item.scope), ['project']);
});

test('percorsi manifest e fonti rifiutano traversal, segreti e progetti annidati', (t) => {
  const root = fixture(t);
  const badNotes = ['../outside.md', '/outside.md', 'C:\\outside.md', 'memory/../outside.md', 'memory//note.md', 'memory/a\0.md', 'docs/note.md'];
  for (const bad of badNotes) {
    manifest(root, [bad]);
    assert.throws(() => indexMemory({ root, scope: 'hub' }), /Percorso|file .md dentro memory/);
  }
  manifest(root);
  for (const bad of ['../source', '.env', '.env.local', '.git/config', 'projects/other/docs/spec.md', 'nested/projects/other/file', 'docs\\secret', '/etc/passwd', 'C:/secret']) {
    write(root, NOTE, noteText({ sources: [bad] }));
    assert.throws(() => indexMemory({ root, scope: 'hub' }), /Percorso/);
  }
  assert.equal(fs.existsSync(path.join(root, '.games')), false);
});

test('symlink in note, fonti e manifest non possono uscire dalla root o raggiungere scope esclusi', (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  fs.unlinkSync(path.join(root, NOTE));
  fs.symlinkSync(path.join(outside, NOTE), path.join(root, NOTE));
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /fuori dalla root/);
  fs.unlinkSync(path.join(root, NOTE));
  write(root, NOTE, noteText());
  fs.unlinkSync(path.join(root, SOURCE));
  fs.symlinkSync(path.join(outside, SOURCE), path.join(root, SOURCE));
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /fuori dalla root/);
  fs.unlinkSync(path.join(root, SOURCE));
  write(root, 'projects/other/spec.md', 'forbidden nested project source');
  fs.symlinkSync(path.join(root, 'projects/other/spec.md'), path.join(root, SOURCE));
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /escluso/);
  fs.unlinkSync(path.join(root, 'memory/sources.json'));
  fs.symlinkSync(path.join(outside, 'memory/sources.json'), path.join(root, 'memory/sources.json'));
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /fuori dalla root/);
  assert.equal(fs.existsSync(path.join(root, '.games')), false);
});

test('cache, directory e sidecar symlink vengono rifiutati prima di aprire SQLite', (t) => {
  for (const relative of ['.games', '.games/cache', CACHE, `${CACHE}-wal`, `${CACHE}-shm`, `${CACHE}-journal`]) {
    const root = fixture(t);
    const outside = fixture(t);
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    const directory = relative === '.games' || relative === '.games/cache';
    fs.symlinkSync(directory ? outside : path.join(outside, SOURCE), path.join(root, relative), directory ? 'dir' : 'file');
    assert.throws(() => indexMemory({ root, scope: 'hub' }), /fuori dalla root/);
    assert.throws(() => memoryStatus(options(root)), /fuori dalla root/);
    assert.equal(fs.readFileSync(path.join(outside, SOURCE), 'utf8'), 'Authoritative rendering contract.');
  }
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.games/cache'), { recursive: true });
  fs.symlinkSync(path.join(root, SOURCE), path.join(root, CACHE));
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /Symlink non ammesso/);
});

test('frontmatter e limiti sono validati prima di creare la cache', (t) => {
  const root = fixture(t);
  for (const content of [
    'No YAML header',
    noteText({ id: 'Not A Slug' }),
    noteText({ status: 'done' }),
    noteText({ updated: '2026-02-31' }),
    noteText({ scope: 'task' }),
    noteText({ sources: [] }),
    noteText().replace('id: render-loop', 'id: render-loop\nid: duplicate'),
    noteText().replace('author: Maintainer', 'author: null'),
  ]) {
    write(root, NOTE, content);
    assert.throws(() => indexMemory({ root, scope: 'hub' }), /frontmatter|id deve|status|updated|scope|sources|author/);
  }
  write(root, NOTE, noteText({ body: 'a'.repeat(1024 * 1024) }));
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /troppo grande/);
  write(root, NOTE, noteText());
  const fd = fs.openSync(path.join(root, SOURCE), 'w');
  fs.ftruncateSync(fd, 16 * 1024 * 1024 + 1);
  fs.closeSync(fd);
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /troppo grande/);
  manifest(root, Array.from({ length: 1001 }, (_, i) => `memory/${i}.md`));
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /massimo 1000/);
  assert.equal(fs.existsSync(path.join(root, '.games')), false);
});

test('query letterali, Unicode e limiti non interpretano operatori FTS o SQL', (t) => {
  const root = fixture(t);
  indexMemory({ root, scope: 'hub' });
  assert.equal(memorySearch({ ...options(root), query: 'città' }).results.length, 1);
  assert.equal(memorySearch({ ...options(root), query: 'rendering OR nonexistent' }).results.length, 0);
  assert.equal(memorySearch({ ...options(root), query: '"; DROP TABLE documents; --' }).results.length, 0);
  assert.equal(memorySearch({ ...options(root), query: '"fixed timestep"' }).results.length, 1);
  for (const query of ['', '   ', '*', null, 'a'.repeat(501)]) assert.throws(() => memorySearch({ ...options(root), query }), /query/);
  for (const limit of [0, 51, 1.5, '1']) assert.throws(() => memorySearch({ ...options(root), query: 'Rendering', limit }), /limit/);
  assert.equal(memoryStatus(options(root)).state, 'ready');
});

test('reindicizzazione sostituisce atomicamente FTS; input invalido preserva il database precedente', (t) => {
  const root = fixture(t);
  indexMemory({ root, scope: 'hub' });
  const before = fs.readFileSync(path.join(root, CACHE));
  write(root, NOTE, 'broken');
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /frontmatter/);
  assert.deepEqual(fs.readFileSync(path.join(root, CACHE)), before);
  write(root, NOTE, noteText({ body: 'Fresh replacement word.' }));
  indexMemory({ root, scope: 'hub' });
  assert.equal(memorySearch({ ...options(root), query: 'timestep' }).results.length, 0);
  assert.equal(memorySearch({ ...options(root), query: 'replacement' }).results.length, 1);
  manifest(root, []);
  assert.equal(indexMemory({ root, scope: 'hub' }).documents, 0);
  assert.equal(memoryStatus(options(root)).state, 'ready');
  assert.equal(memorySearch({ ...options(root), query: 'replacement' }).results.length, 0);
});

test('un errore durante INSERT annulla DELETE e conserva l’indice precedente', (t) => {
  const root = fixture(t);
  indexMemory({ root, scope: 'hub' });
  const db = new DatabaseSync(path.join(root, CACHE));
  db.exec("CREATE TRIGGER stop_update BEFORE INSERT ON documents BEGIN SELECT RAISE(ABORT, 'simulated write error'); END");
  db.close();
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /simulated write error/);
  assert.equal(memoryStatus(options(root)).state, 'ready');
  assert.equal(memorySearch({ ...options(root), query: 'timestep' }).results.length, 1);
});

test('letture readonly non modificano il database né creano sidecar e cache copiata risulta stale', (t) => {
  const root = fixture(t);
  const other = fixture(t);
  indexMemory({ root, scope: 'hub' });
  const before = fs.readFileSync(path.join(root, CACHE));
  const files = fs.readdirSync(path.join(root, '.games/cache'));
  assert.deepEqual(files, ['.gitignore', 'memory.sqlite']);
  memoryStatus(options(root));
  memoryRead({ ...options(root), path: NOTE });
  memorySearch({ ...options(root), query: 'Rendering' });
  assert.deepEqual(fs.readFileSync(path.join(root, CACHE)), before);
  assert.deepEqual(fs.readdirSync(path.join(root, '.games/cache')), files);
  write(other, CACHE, before);
  const status = memoryStatus(options(other));
  assert.equal(status.state, 'stale');
  assert.match(status.indexes[0].issues[0].reason, /altro scope o checkout/);
  indexMemory({ root: other, scope: 'hub' });
  assert.equal(memoryStatus(options(other)).state, 'ready');
});

test('schema SQLite sconosciuto non viene sovrascritto e richiede ricostruzione', (t) => {
  const root = fixture(t);
  indexMemory({ root, scope: 'hub' });
  const db = new DatabaseSync(path.join(root, CACHE));
  db.exec('PRAGMA user_version = 99');
  db.close();
  assert.equal(memoryStatus(options(root)).state, 'stale');
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /Versione indice 99/);
});

test('un database WAL preesistente viene rifiutato senza ricreare sidecar in lettura', (t) => {
  const root = fixture(t);
  indexMemory({ root, scope: 'hub' });
  const db = new DatabaseSync(path.join(root, CACHE));
  db.exec('PRAGMA journal_mode = WAL');
  db.close();
  for (const suffix of ['-wal', '-shm']) fs.rmSync(path.join(root, CACHE + suffix), { force: true });
  assert.equal(fs.readFileSync(path.join(root, CACHE))[18], 2);
  const before = fs.readdirSync(path.join(root, '.games/cache'));
  assert.equal(memoryStatus(options(root)).state, 'stale');
  const result = memorySearch({ ...options(root), query: 'Rendering' });
  assert.equal(result.state, 'stale');
  assert.deepEqual(result.results, []);
  assert.match(result.indexes[0].issues[0].reason, /WAL/);
  assert.equal(memoryRead({ ...options(root), path: NOTE }).state, 'stale');
  assert.deepEqual(fs.readdirSync(path.join(root, '.games/cache')), before);
  indexMemory({ root, scope: 'hub' });
  assert.equal(memoryStatus(options(root)).state, 'ready');
});

test('una fonte modificata durante la query invalida tutto lo scope, compresi i primi risultati', (t) => {
  const root = fixture(t);
  const second = 'memory/decisions/render-alternative.md';
  write(root, second, noteText({ id: 'render-alternative' }));
  manifest(root, [NOTE, second]);
  indexMemory({ root, scope: 'hub' });
  const originalRead = fs.readFileSync;
  const canonicalSource = path.join(fs.realpathSync(root), SOURCE);
  let sourceReads = 0;
  t.mock.method(fs, 'readFileSync', function (file, ...args) {
    if (file === canonicalSource && ++sourceReads === 4) {
      fs.writeFileSync(path.join(root, SOURCE), 'Changed during the second returned result.');
    }
    return originalRead.call(this, file, ...args);
  });
  const result = memorySearch({ ...options(root), query: 'Rendering' });
  assert.equal(sourceReads, 4);
  assert.equal(result.state, 'stale');
  assert.deepEqual(result.results, []);
  assert.ok(result.indexes[0].issues.some((issue) => /durante la ricerca/.test(issue.reason)));
});

test('cache nuova esclusa da Git anche in un progetto senza .gitignore', (t) => {
  const root = fixture(t, { scope: 'project' });
  indexMemory({ root, scope: 'project' });
  assert.equal(fs.readFileSync(path.join(root, '.games/cache/.gitignore'), 'utf8'), '*\n');
  assert.equal(fs.existsSync(path.join(root, '.gitignore')), false);
  if (spawnSync('git', ['--version'], { stdio: 'ignore', shell: false }).status !== 0) {
    t.diagnostic('Git non disponibile: marker verificato; semantica check-ignore non verificata.');
    return;
  }
  assert.equal(spawnSync('git', ['init', '--quiet', root], { stdio: 'ignore', shell: false }).status, 0);
  for (const relative of [CACHE, '.games/cache/.gitignore', `${CACHE}-journal`, `${CACHE}-wal`, `${CACHE}-shm`]) {
    const result = spawnSync('git', ['-C', root, 'check-ignore', '--quiet', '--', relative], { stdio: 'ignore', shell: false });
    assert.equal(result.status, 0, `${relative} deve essere ignorato`);
  }
});

test('marker Git estraneo o symlink rifiutato prima della creazione del database', (t) => {
  const root = fixture(t);
  write(root, '.games/cache/.gitignore', '!memory.sqlite\n');
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /contenuto non gestito/);
  assert.equal(fs.readFileSync(path.join(root, '.games/cache/.gitignore'), 'utf8'), '!memory.sqlite\n');
  assert.equal(fs.existsSync(path.join(root, CACHE)), false);
  assert.equal(memoryStatus(options(root)).state, 'missing');
  fs.unlinkSync(path.join(root, '.games/cache/.gitignore'));
  fs.symlinkSync(path.join(root, SOURCE), path.join(root, '.games/cache/.gitignore'));
  assert.throws(() => indexMemory({ root, scope: 'hub' }), /Symlink non ammesso/);
  assert.equal(fs.existsSync(path.join(root, CACHE)), false);
  assert.equal(fs.readFileSync(path.join(root, SOURCE), 'utf8'), 'Authoritative rendering contract.');
});
