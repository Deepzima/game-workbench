import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { parseDocument } from 'yaml';

const MANIFEST = 'memory/sources.json';
const CACHE = '.games/cache/memory.sqlite';
const CACHE_IGNORE = '.games/cache/.gitignore';
const SCHEMA_VERSION = 1;
const LOCK_TIMEOUT_MS = 5000;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_NOTE_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENTS = 1000;
const MAX_SOURCES = 64;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };
const inside = (root, candidate) => candidate === root || candidate.startsWith(`${root}${path.sep}`);

function canonicalRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) fail('La root memoria deve essere un percorso assoluto esplicito.');
  let real;
  try { real = fs.realpathSync(root); } catch { fail('La root memoria non esiste o non è accessibile.'); }
  if (!fs.statSync(real).isDirectory()) fail('La root memoria deve essere una directory.');
  return real;
}

function relativePath(value, kind = 'source') {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\') || /^[a-zA-Z]:/.test(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    fail(`Percorso ${kind} non valido: usare un percorso relativo con separatori /. `);
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) fail(`Percorso ${kind} non valido: ${value}.`);
  if (parts.some((part) => ['.git', '.games', 'projects', 'game-workbench'].includes(part.toLowerCase()) || part.toLowerCase().startsWith('.env'))) {
    fail(`Percorso ${kind} escluso dalla memoria: ${value}.`);
  }
  if (kind === 'note' && (!value.startsWith('memory/') || !value.endsWith('.md'))) {
    fail(`Le note devono essere file .md dentro memory/: ${value}.`);
  }
  return value;
}

// Inspect every existing component before opening a file or creating cache directories.
function confinedPath(root, relative, { optional = false, directory = false } = {}) {
  const components = relative.split('/');
  let candidate = root;
  for (let i = 0; i < components.length; i += 1) {
    candidate = path.join(candidate, components[i]);
    let stat;
    try { stat = fs.lstatSync(candidate); } catch (error) {
      if (error.code === 'ENOENT' && optional) return null;
      fail(`File non accessibile: ${relative}.`);
    }
    let real;
    try { real = fs.realpathSync(candidate); } catch { fail(`Link non risolvibile: ${relative}.`); }
    if (!inside(root, real)) fail(`Percorso fuori dalla root tramite symlink: ${relative}.`);
    if (stat.isSymbolicLink()) stat = fs.statSync(candidate);
    const needDirectory = i < components.length - 1 || directory;
    if (needDirectory ? !stat.isDirectory() : !stat.isFile()) {
      fail(`Tipo di file non valido: ${relative}.`);
    }
  }
  return candidate;
}

function readablePath(root, relative, kind) {
  relativePath(relative, kind);
  const resolved = confinedPath(root, relative);
  const realRelative = path.relative(root, fs.realpathSync(resolved)).split(path.sep).join('/');
  relativePath(realRelative, kind);
  return resolved;
}

function readBytes(root, relative, kind, limit) {
  const file = readablePath(root, relative, kind);
  if (fs.statSync(file).size > limit) fail(`File troppo grande: ${relative} (massimo ${limit} byte).`);
  const bytes = fs.readFileSync(file);
  if (bytes.length > limit) fail(`File troppo grande: ${relative} (massimo ${limit} byte).`);
  return bytes;
}

function loadManifest(root) {
  const bytes = readBytes(root, MANIFEST, 'source', MAX_MANIFEST_BYTES);
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { fail(`${MANIFEST}: JSON non valido.`); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.schema_version !== 1 || !Array.isArray(manifest.documents)) {
    fail(`${MANIFEST}: attesi schema_version: 1 e documents: array.`);
  }
  if (manifest.documents.length > MAX_DOCUMENTS) fail(`${MANIFEST}: massimo ${MAX_DOCUMENTS} documenti.`);
  const seen = new Set();
  for (const item of manifest.documents) {
    relativePath(item, 'note');
    if (seen.has(item)) fail(`${MANIFEST}: nota duplicata ${item}.`);
    seen.add(item);
  }
  return { documents: manifest.documents, sha256: hash(bytes) };
}

function parseNote(bytes, notePath, indexScope) {
  const match = bytes.toString('utf8').match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) fail(`${notePath}: frontmatter YAML obbligatorio.`);
  let metadata;
  try {
    const document = parseDocument(match[1], { uniqueKeys: true });
    if (document.errors.length) fail('YAML non valido');
    metadata = document.toJS({ maxAliasCount: 20 });
  } catch { fail(`${notePath}: frontmatter YAML non valido.`); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) fail(`${notePath}: metadata non validi.`);
  for (const key of ['id', 'title', 'scope', 'status', 'updated', 'author']) {
    if (typeof metadata[key] !== 'string' || !metadata[key].trim()) fail(`${notePath}: metadata ${key} obbligatorio.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.id)) fail(`${notePath}: id deve essere uno slug.`);
  if (!(indexScope === 'hub' ? ['hub'] : ['project', 'task']).includes(metadata.scope)) fail(`${notePath}: scope incompatibile con ${indexScope}.`);
  if (!['proposed', 'verified', 'superseded'].includes(metadata.status)) fail(`${notePath}: status non valido.`);
  const date = new Date(`${metadata.updated}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.updated) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== metadata.updated) {
    fail(`${notePath}: updated deve essere una data ISO YYYY-MM-DD valida.`);
  }
  if (!Array.isArray(metadata.sources) || metadata.sources.length === 0) fail(`${notePath}: sources deve essere un array non vuoto.`);
  if (metadata.sources.length > MAX_SOURCES) fail(`${notePath}: massimo ${MAX_SOURCES} fonti.`);
  const sourceSet = new Set();
  for (const source of metadata.sources) {
    relativePath(source);
    if (sourceSet.has(source)) fail(`${notePath}: fonte duplicata ${source}.`);
    sourceSet.add(source);
  }
  return {
    metadata: Object.fromEntries(['id', 'title', 'scope', 'status', 'updated', 'author', 'sources'].map((key) => [key, metadata[key]])),
    body: match[2],
  };
}

function loadNote(root, notePath, scope) {
  const bytes = readBytes(root, notePath, 'note', MAX_NOTE_BYTES);
  const { metadata, body } = parseNote(bytes, notePath, scope);
  const sources = metadata.sources.map((source) => ({ path: source, sha256: hash(readBytes(root, source, 'source', MAX_SOURCE_BYTES)) }));
  return { path: notePath, sha256: hash(bytes), metadata, sources, body, content: bytes.toString('utf8') };
}

function cachePath(root, create = false) {
  // SQLite may access sidecars itself: reject symlinks before letting it open them.
  for (const relative of [CACHE, `${CACHE}-journal`, `${CACHE}-wal`, `${CACHE}-shm`, CACHE_IGNORE]) {
    confinedPath(root, relative, { optional: true });
    let candidate = root;
    for (const component of relative.split('/')) {
      candidate = path.join(candidate, component);
      try {
        if (fs.lstatSync(candidate).isSymbolicLink()) fail(`Symlink non ammesso nella cache: ${relative}.`);
      } catch (error) {
        if (error.code === 'ENOENT') break;
        throw error;
      }
    }
  }
  if (create) {
    for (const relative of ['.games', '.games/cache']) {
      if (!confinedPath(root, relative, { optional: true, directory: true })) fs.mkdirSync(path.join(root, relative));
    }
    const marker = path.join(root, CACHE_IGNORE);
    const existing = confinedPath(root, CACHE_IGNORE, { optional: true });
    if (existing) {
      if (fs.readFileSync(existing, 'utf8') !== '*\n') fail(`${CACHE_IGNORE}: contenuto non gestito; nessuna sostituzione eseguita.`);
    } else {
      // Keep generated caches private even in external projects with no root
      // .gitignore. This marker also ignores itself, and precedes SQLite creation.
      fs.writeFileSync(marker, '*\n', { flag: 'wx', mode: 0o600 });
    }
  }
  return confinedPath(root, CACHE, { optional: true }) || (create ? path.join(root, CACHE) : null);
}

function openDatabase(file, readOnly) {
  if (readOnly) {
    // Opening a WAL database can create -shm even in read-only mode. Inspect its
    // fixed header first and refuse that unsupported cache format without SQLite.
    const fd = fs.openSync(file, 'r');
    const header = Buffer.alloc(20);
    try { fs.readSync(fd, header, 0, header.length, 0); } finally { fs.closeSync(fd); }
    if (header[18] === 2 || header[19] === 2) fail('Cache in modalità WAL non supportata in lettura; ricostruire con memory:index.');
  }
  const db = new DatabaseSync(file, { readOnly });
  db.exec(`PRAGMA busy_timeout = ${LOCK_TIMEOUT_MS}`);
  return db;
}

function indexScope(scope) {
  if (!['hub', 'project'].includes(scope)) fail('Scope richiesto: hub oppure project.');
  return scope;
}

function selectedRoots({ hubRoot, projectRoot, scope = 'all' }) {
  if (!['all', 'hub', 'project'].includes(scope)) fail('Scope richiesto: all, hub oppure project.');
  const hub = hubRoot ? canonicalRoot(hubRoot) : null;
  const project = projectRoot ? canonicalRoot(projectRoot) : null;
  if (hub && project && hub === project) fail('hubRoot e projectRoot devono essere checkout distinti.');
  const roots = [];
  if (scope !== 'project') roots.push({ scope: 'hub', root: hub || canonicalRoot(hubRoot) });
  if (scope === 'project' && !projectRoot) fail('projectRoot è obbligatoria per lo scope project.');
  if (scope !== 'hub' && projectRoot) roots.push({ scope: 'project', root: project });
  return roots;
}

export function indexMemory({ root, scope }) {
  root = canonicalRoot(root);
  indexScope(scope);
  const manifest = loadManifest(root);
  // Validate and hash all inputs before acquiring the database write lock.
  const notes = manifest.documents.map((note) => loadNote(root, note, scope));
  const ids = new Set();
  for (const note of notes) {
    if (ids.has(note.metadata.id)) fail(`ID memoria duplicato: ${note.metadata.id}.`);
    ids.add(note.metadata.id);
  }
  const indexedAt = new Date().toISOString();
  const db = openDatabase(cachePath(root, true), false);
  let transaction = false;
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version !== 0 && version !== SCHEMA_VERSION) fail(`Versione indice ${version} non supportata; ricostruire la cache.`);
    if (version === SCHEMA_VERSION) {
      const savedScope = db.prepare('SELECT value FROM metadata WHERE key = ?').get('scope')?.value;
      if (savedScope !== scope) fail('Indice appartenente a un altro scope; non viene sovrascritto.');
    }
    // DELETE mode lets read-only clients inspect the cache without creating WAL/SHM files.
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (
        path TEXT PRIMARY KEY, id TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL,
        metadata TEXT NOT NULL, sources TEXT NOT NULL, body TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(path UNINDEXED, title, body);
      DELETE FROM metadata;
      DELETE FROM documents;
      DELETE FROM document_search;
    `);
    const insertMeta = db.prepare('INSERT INTO metadata VALUES (?, ?)');
    for (const [key, value] of Object.entries({ scope, root_key: hash(root), indexed_at: indexedAt, manifest_sha256: manifest.sha256 })) insertMeta.run(key, value);
    const insertNote = db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)');
    const insertSearch = db.prepare('INSERT INTO document_search VALUES (?, ?, ?)');
    for (const note of notes) {
      insertNote.run(note.path, note.metadata.id, note.sha256, JSON.stringify(note.metadata), JSON.stringify(note.sources), note.body);
      insertSearch.run(note.path, note.metadata.title, note.body);
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
    transaction = false;
  } finally {
    if (transaction) db.exec('ROLLBACK');
    db.close();
  }
  return { scope, state: 'ready', cache: CACHE, manifest: MANIFEST, documents: notes.length, indexed_at: indexedAt };
}

function readIndex(root, scope) {
  const file = cachePath(root);
  if (!file) return null;
  const db = openDatabase(file, true);
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version !== SCHEMA_VERSION) fail(`Versione indice ${version} non supportata; ricostruire la cache.`);
    const meta = Object.fromEntries(db.prepare('SELECT key, value FROM metadata').all().map((entry) => [entry.key, entry.value]));
    if (meta.scope !== scope || meta.root_key !== hash(root)) fail('Indice appartenente a un altro scope o checkout; ricostruire la cache.');
    const documents = db.prepare('SELECT path, sha256, metadata, sources FROM documents').all().map((note) => ({
      ...note, metadata: JSON.parse(note.metadata), sources: JSON.parse(note.sources),
    }));
    return { meta, documents };
  } finally { db.close(); }
}

function inspect(root, scope) {
  const result = { scope, state: 'missing', cache: CACHE, manifest: MANIFEST, documents: 0, indexed_at: null, issues: [], sources_to_read: [] };
  // Path escapes are invalid configuration, not merely a stale/missing index.
  cachePath(root);
  let manifest;
  try { manifest = loadManifest(root); } catch (error) {
    result.issues.push({ path: MANIFEST, reason: error.message });
  }
  let index;
  try { index = readIndex(root, scope); } catch (error) {
    result.state = 'stale';
    result.issues.push({ path: CACHE, reason: error.message });
    result.sources_to_read = manifest?.documents || [];
    return { result, manifest, index: null };
  }
  if (!index) {
    result.issues.push({ path: CACHE, reason: 'Indice assente: eseguire memory:index.' });
    result.sources_to_read = manifest?.documents || [];
    return { result, manifest, index: null };
  }
  result.indexed_at = index.meta.indexed_at;
  result.documents = index.documents.length;
  result.state = 'ready';
  if (!manifest || index.meta.manifest_sha256 !== manifest.sha256) {
    result.issues.push({ path: MANIFEST, reason: 'Manifest assente, non valido o modificato dopo l’indicizzazione.' });
  }
  if (manifest && (manifest.documents.length !== index.documents.length || manifest.documents.some((item) => !index.documents.some((note) => note.path === item)))) {
    result.issues.push({ path: MANIFEST, reason: 'Elenco note diverso dal contenuto dell’indice.' });
  }
  const sources = new Set(manifest?.documents || []);
  for (const note of index.documents) {
    if (!manifest?.documents.includes(note.path)) continue;
    try {
      const current = loadNote(root, note.path, scope);
      for (const source of current.sources) sources.add(source.path);
      if (current.sha256 !== note.sha256) result.issues.push({ path: note.path, reason: 'Nota modificata dopo l’indicizzazione.' });
      for (const source of note.sources) {
        const live = current.sources.find((entry) => entry.path === source.path);
        if (!live || live.sha256 !== source.sha256) result.issues.push({ path: source.path, reason: `Fonte modificata dopo l’indicizzazione (${note.path}).` });
      }
    } catch (error) { result.issues.push({ path: note.path, reason: error.message }); }
  }
  if (result.issues.length) {
    result.state = 'stale';
    result.sources_to_read = [...sources].sort();
  }
  return { result, manifest, index };
}

const aggregateState = (indexes) => indexes.some((item) => item.state === 'stale') ? 'stale' : indexes.some((item) => item.state === 'missing') ? 'missing' : 'ready';

export function memoryStatus(options) {
  const indexes = selectedRoots(options).map(({ root, scope }) => inspect(root, scope).result);
  return { state: aggregateState(indexes), indexes };
}

export function memorySearch({ query, limit = 10, ...options }) {
  if (typeof query !== 'string' || !query.trim()) fail('query deve essere una stringa non vuota.');
  if (query.length > 500) fail('query supera il limite di 500 caratteri.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail('limit deve essere un intero tra 1 e 50.');
  // Treat each word literally; no caller-supplied FTS operators or SQL interpolation.
  const words = query.match(/[\p{L}\p{N}\p{M}_]+/gu) || [];
  if (!words.length) fail('query deve contenere almeno una parola.');
  const ftsQuery = words.map((word) => `"${word.replaceAll('"', '""')}"`).join(' AND ');
  const indexes = [];
  const results = [];
  for (const { root, scope } of selectedRoots(options)) {
    const { result, manifest } = inspect(root, scope);
    indexes.push(result);
    if (result.state !== 'ready') continue;
    const scopeResults = [];
    const db = openDatabase(cachePath(root), true);
    try {
      db.exec('BEGIN');
      const indexedManifest = db.prepare('SELECT value FROM metadata WHERE key = ?').get('manifest_sha256')?.value;
      if (indexedManifest !== manifest.sha256) {
        result.state = 'stale';
        result.issues.push({ path: MANIFEST, reason: 'Indice modificato durante la ricerca.' });
        result.sources_to_read = [...manifest.documents];
        continue;
      }
      const matches = db.prepare(`
        SELECT document_search.path AS path, documents.sha256, documents.sources,
               snippet(document_search, 2, '', '', '…', 32) AS excerpt,
               bm25(document_search, 0, 5, 1) AS score
        FROM document_search JOIN documents ON documents.path = document_search.path
        WHERE document_search MATCH ? ORDER BY score, document_search.path LIMIT ?
      `).all(ftsQuery, limit);
      for (const match of matches) {
        if (!manifest.documents.includes(match.path)) continue;
        // Recheck returned files after the query: never return cached text as current after a detected edit.
        let current;
        try { current = loadNote(root, match.path, scope); } catch (error) {
          result.state = 'stale';
          result.issues.push({ path: match.path, reason: error.message });
          result.sources_to_read = [...new Set([...result.sources_to_read, match.path])];
          continue;
        }
        if (current.sha256 !== match.sha256 || JSON.stringify(current.sources) !== match.sources) {
          result.state = 'stale';
          result.issues.push({ path: match.path, reason: 'Nota o fonti modificate durante la ricerca.' });
          result.sources_to_read = [...new Set([...result.sources_to_read, match.path, ...current.metadata.sources])];
          continue;
        }
        scopeResults.push({ ...current.metadata, scope, memory_scope: current.metadata.scope, path: current.path, sources: current.sources, sha256: current.sha256, excerpt: match.excerpt, score: match.score });
      }
      try {
        if (loadManifest(root).sha256 !== manifest.sha256) fail('Manifest modificato durante la ricerca.');
      } catch (error) {
        result.state = 'stale';
        result.issues.push({ path: MANIFEST, reason: error.message });
        result.sources_to_read = [...new Set([...result.sources_to_read, ...manifest.documents])];
      }
    } finally { db.close(); }
    if (result.state === 'ready') results.push(...scopeResults);
  }
  results.sort((a, b) => a.score - b.score || a.scope.localeCompare(b.scope) || a.path.localeCompare(b.path));
  return { state: aggregateState(indexes), indexes, query, results: results.slice(0, limit) };
}

export function memoryRead({ hubRoot, projectRoot, scope, path: notePath }) {
  indexScope(scope);
  relativePath(notePath, 'note');
  const [{ root }] = selectedRoots({ hubRoot, projectRoot, scope });
  const manifest = loadManifest(root);
  if (!manifest.documents.includes(notePath)) fail(`Nota non ammessa da ${MANIFEST}: ${notePath}.`);
  const note = loadNote(root, notePath, scope);
  const { result } = inspect(root, scope);
  return { scope, path: note.path, state: result.state, sha256: note.sha256, metadata: note.metadata, sources: note.sources, content: note.content, issues: result.issues, sources_to_read: result.sources_to_read };
}
