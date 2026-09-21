#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jsonc from 'jsonc-parser';
import TOML from '@iarna/toml';

export const HUB_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const CLIENTS = ['vscode', 'claude', 'codex'];
const NAME = 'games-memory';
const LOCAL = '.games/local';
const STATE = `${LOCAL}/memory-adapters-state.json`;
const LOCAL_IGNORE = `${LOCAL}/.gitignore`;
const START = '# BEGIN games-memory managed by games hub';
const END = '# END games-memory managed by games hub';
const TARGETS = { vscode: '.vscode/mcp.json', claude: '.mcp.json', codex: '.codex/config.toml' };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stable = value => JSON.stringify(value, (_, item) => isObject(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => createHash('sha256').update(stable(value)).digest('hex');
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function fail(message) { throw new Error(message); }

async function directoryRoot(root, label) {
  try {
    const actual = await fs.realpath(root);
    if (!(await fs.stat(actual)).isDirectory()) throw new Error();
    return actual;
  } catch { fail(`${label}: directory non accessibile.`); }
}

// Generated adapters must never overwrite a file outside the selected checkout
// through symlinked local configuration directories.
async function checkedPath(root, relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) fail('Configurazione locale: collegamenti simbolici non consentiti.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return current;
}

async function readLocal(root, relative) {
  const filename = await checkedPath(root, relative);
  try { return await fs.readFile(filename, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    fail(`Impossibile leggere ${relative}.`);
  }
}

async function writeLocal(root, relative, content) {
  const filename = await checkedPath(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await checkedPath(root, relative);
  let mode = 0o600;
  try { mode = (await fs.stat(filename)).mode & 0o777; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { flag: 'wx', mode });
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }); }
}

function parseJsonConfig(text, client) {
  const errors = [];
  const tree = jsonc.parseTree(text, errors, { allowTrailingComma: client === 'vscode', disallowComments: client !== 'vscode' });
  if (errors.length || tree?.type !== 'object') fail(`${TARGETS[client]}: configurazione JSON non valida.`);
  function validateKeys(node) {
    if (node.type === 'object') {
      const keys = new Set();
      for (const property of node.children ?? []) {
        const key = property.children[0].value;
        if (keys.has(key)) fail(`${TARGETS[client]}: chiavi duplicate non consentite.`);
        keys.add(key);
      }
    }
    for (const child of node.children ?? []) validateKeys(child);
  }
  validateKeys(tree);
  const value = jsonc.getNodeValue(tree);
  const section = client === 'vscode' ? 'servers' : 'mcpServers';
  if (own(value, section) && !isObject(value[section])) fail(`${TARGETS[client]}: sezione MCP non valida.`);
  return { value, section, entry: value[section]?.[NAME] };
}

function parseTomlConfig(text) {
  let value;
  try { value = TOML.parse(text); }
  catch { fail(`${TARGETS.codex}: configurazione TOML non valida.`); }
  if (own(value, 'mcp_servers') && !isObject(value.mcp_servers)) fail(`${TARGETS.codex}: sezione MCP non valida.`);
  return { value, entry: value.mcp_servers?.[NAME] };
}

function tomlBlock(entry) {
  return `${START}\n${TOML.stringify({ mcp_servers: { [NAME]: entry } }).trimEnd()}\n${END}\n`;
}

function blockRange(text) {
  const lines = text.match(/.*(?:\r?\n|$)/g) ?? [];
  let offset = 0;
  const starts = [], ends = [];
  for (const line of lines) {
    const content = line.replace(/\r?\n$/, '');
    if (content === START) starts.push(offset);
    if (content === END) ends.push(offset + line.length);
    offset += line.length;
  }
  if (!starts.length && !ends.length) return null;
  if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) fail('Blocco Codex games-memory non valido.');
  return { start: starts[0], end: ends[0] };
}

function assertOwned(current, desired, record) {
  if (current === undefined || hash(current) === hash(desired)) return;
  if (!record || record.sha256 !== hash(current)) fail('games-memory esiste con una configurazione diversa non gestita da questo setup. Nessuna sostituzione eseguita.');
}

export function memoryEntry(hubRoot, projectRoot, client) {
  if (!CLIENTS.includes(client)) fail('Client non valido: usare vscode, claude o codex.');
  const portable = client === 'vscode' && !projectRoot;
  const serverRoot = portable ? '${workspaceFolder}' : hubRoot;
  const entry = {
    command: 'mise',
    args: ['-C', serverRoot, 'exec', '--no-deps', '--', 'node', portable ? 'mcp/memory/server.mjs' : path.join(hubRoot, 'mcp/memory/server.mjs'), '--hub-root', serverRoot,
      ...(projectRoot ? ['--project-root', projectRoot] : [])],
    env: { MISE_AUTO_INSTALL: 'false' },
  };
  return client === 'vscode' ? { type: 'stdio', ...entry } : entry;
}

function snippet(entry, client) {
  if (client === 'codex') return tomlBlock(entry);
  return `${JSON.stringify({ [client === 'vscode' ? 'servers' : 'mcpServers']: { [NAME]: entry } }, null, 2)}\n`;
}

async function readState(root) {
  const text = await readLocal(root, STATE);
  if (text === null) return { version: 1, clients: {} };
  let state;
  try { state = JSON.parse(text); } catch { fail('Registro locale degli adattatori non valido.'); }
  if (state?.version !== 1 || !isObject(state.clients) || Object.entries(state.clients).some(([client, record]) =>
    !CLIENTS.includes(client) || !isObject(record) || !/^[a-f\d]{64}$/.test(record.sha256))) {
    fail('Registro locale degli adattatori non valido.');
  }
  return state;
}

async function applyJson(root, client, entry, state) {
  const counterpart = client === 'vscode' ? 'claude' : 'vscode';
  const otherText = await readLocal(root, TARGETS[counterpart]);
  if (otherText !== null && parseJsonConfig(otherText, counterpart).entry !== undefined) {
    fail(`games-memory è già registrato in ${TARGETS[counterpart]}. Usare una sola registrazione tra VS Code e Claude per evitare duplicazioni.`);
  }
  const relative = TARGETS[client];
  const previous = await readLocal(root, relative) ?? '{}\n';
  const { section, entry: current } = parseJsonConfig(previous, client);
  assertOwned(current, entry, state.clients[client]);
  if (current !== undefined && hash(current) === hash(entry)) return false;
  const edits = jsonc.modify(previous, [section, NAME], entry, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: previous.includes('\r\n') ? '\r\n' : '\n' },
  });
  const updated = jsonc.applyEdits(previous, edits);
  const { entry: checked } = parseJsonConfig(updated, client);
  if (hash(checked) !== hash(entry)) fail('Verifica della configurazione generata non riuscita.');
  await writeLocal(root, relative, updated);
  return true;
}

async function applyToml(root, entry, state) {
  const relative = TARGETS.codex;
  const previous = await readLocal(root, relative) ?? '';
  const { value: before, entry: current } = parseTomlConfig(previous);
  assertOwned(current, entry, state.clients.codex);
  if (current !== undefined && hash(current) === hash(entry)) return false;
  const range = blockRange(previous);
  if (current !== undefined && !range) fail('games-memory Codex esiste fuori dal blocco gestito. Nessuna sostituzione eseguita.');
  if (range) {
    // A marker in a string or an edited block must not remove unrelated TOML.
    const block = previous.slice(range.start, range.end);
    const parsed = parseTomlConfig(block).value;
    if (Object.keys(parsed).length !== 1 || Object.keys(parsed.mcp_servers ?? {}).length !== 1 || !own(parsed.mcp_servers ?? {}, NAME)) {
      fail('Il blocco Codex gestito contiene altre impostazioni. Nessuna sostituzione eseguita.');
    }
  }
  const generated = tomlBlock(entry);
  const updated = range ? previous.slice(0, range.start) + generated + previous.slice(range.end)
    : `${previous}${previous && !previous.endsWith('\n') ? '\n' : ''}${previous ? '\n' : ''}${generated}`;
  const { value: after, entry: checked } = parseTomlConfig(updated);
  if (hash(checked) !== hash(entry)) fail('Verifica della configurazione Codex generata non riuscita.');
  const withoutEntry = value => {
    const cloned = structuredClone(value);
    if (cloned.mcp_servers) {
      delete cloned.mcp_servers[NAME];
      if (!Object.keys(cloned.mcp_servers).length) delete cloned.mcp_servers;
    }
    return cloned;
  };
  if (stable(withoutEntry(before)) !== stable(withoutEntry(after))) fail('Il blocco Codex altererebbe altre impostazioni. Nessuna sostituzione eseguita.');
  await writeLocal(root, relative, updated);
  return true;
}

export function isConfigIgnored(root, relative, spawn = spawnSync) {
  // Without --no-index, tracked files are never reported as safely ignored.
  // Failure (including Git unavailable or a checkout without Git) is closed.
  const result = spawn('git', ['-C', root, 'check-ignore', '--quiet', '--', relative], {
    shell: false, windowsHide: true, stdio: 'ignore',
  });
  return !result.error && result.status === 0;
}

async function protectLocalFiles(root, files) {
  const previous = await readLocal(root, LOCAL_IGNORE);
  if (previous !== null) {
    const patterns = previous.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
    const all = patterns.lastIndexOf('*');
    if (all === -1 || patterns.slice(all + 1).some(line => line.startsWith('!'))) {
      fail(`${LOCAL_IGNORE} non protegge tutti i file locali. Aggiungere una riga finale * prima di ripetere il setup; il file esistente non è stato modificato.`);
    }
  }
  const writes = [...files, ...(previous === null ? [LOCAL_IGNORE] : [])];
  const repository = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], {
    shell: false, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (!repository.error && repository.status === 0 && repository.stdout.trim() === 'true') {
    const tracked = spawnSync('git', ['-C', root, 'ls-files', '--cached', '-z', '--', ...writes], {
      shell: false, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (tracked.error || tracked.status !== 0) fail('Impossibile verificare se le configurazioni locali sono già tracciate da Git. Nessuna configurazione generata.');
    if (tracked.stdout.length > 0) fail('Una configurazione in .games/local è già tracciata da Git. Rimuoverla dall’indice prima di rigenerarla; nessuna riscrittura eseguita.');
  }
  if (previous === null) await writeLocal(root, LOCAL_IGNORE, '*\n');
}

export async function configureMemory({ hubRoot = HUB_ROOT, projectRoot, client, apply = false, isIgnored = isConfigIgnored } = {}) {
  if (client !== undefined && !CLIENTS.includes(client)) fail('Client non valido: usare vscode, claude o codex.');
  if (apply && !client) fail('--apply richiede --client esplicito.');
  const hub = await directoryRoot(hubRoot, 'Hub');
  const project = projectRoot ? await directoryRoot(path.resolve(projectRoot), 'Progetto') : undefined;
  if (project === hub) fail('Hub e progetto devono essere checkout distinti. Omettere --project-root per la memoria del hub.');
  const root = project ?? hub;
  const clients = client ? [client] : CLIENTS;
  const snippetPaths = clients.map(selected => `${LOCAL}/games-memory.${selected}.${selected === 'codex' ? 'toml' : 'json'}`);
  await protectLocalFiles(root, [...snippetPaths, ...(apply ? [STATE] : [])]);
  const generated = [];
  for (const selected of clients) {
    const relative = `${LOCAL}/games-memory.${selected}.${selected === 'codex' ? 'toml' : 'json'}`;
    await writeLocal(root, relative, snippet(memoryEntry(hub, project, selected), selected));
    generated.push(path.join(root, relative));
  }
  let changed = false;
  if (apply) {
    if ((client !== 'vscode' || project) && !await isIgnored(root, TARGETS[client])) {
      fail(`La configurazione ${TARGETS[client]} contiene percorsi locali: --apply richiede un file ignorato da Git e non tracciato. Usare lo snippet generato o predisporre il checkout.`);
    }
    const state = await readState(root);
    const entry = memoryEntry(hub, project, client);
    changed = client === 'codex' ? await applyToml(root, entry, state) : await applyJson(root, client, entry, state);
    state.clients[client] = { sha256: hash(entry) };
    await writeLocal(root, STATE, `${JSON.stringify(state, null, 2)}\n`);
  }
  return { hubRoot: hub, root, generated, applied: apply ? path.join(root, TARGETS[client]) : null, changed };
}

export function parseArgs(args, { setup = false } = {}) {
  const options = {};
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (seen.has(arg)) fail(`Opzione ripetuta: ${arg}.`);
    seen.add(arg);
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--skip-install' && setup) options.skipInstall = true;
    else if (arg === '--client' || arg === '--project-root') {
      const value = args[++index];
      if (!value || value.startsWith('--')) fail(`Valore mancante per ${arg}.`);
      options[arg === '--client' ? 'client' : 'projectRoot'] = value;
    } else fail('Opzione non riconosciuta. Usare --help.');
  }
  if (options.client !== undefined && !CLIENTS.includes(options.client)) fail('Client non valido: usare vscode, claude o codex.');
  if (options.apply && !options.client) fail('--apply richiede --client esplicito.');
  return options;
}

export function report(result, write = console.log) {
  for (const generated of result.generated) write(`Configurazione locale generata: ${generated}`);
  if (result.applied) write(`${result.changed ? 'Configurato' : 'Già configurato'} games-memory: ${result.applied}`);
  else write('Nessuna configurazione client modificata. Per applicare: --client vscode|claude|codex --apply.');
}

export async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log('Uso: node scripts/memory-adapters.mjs [--client vscode|claude|codex] [--project-root PATH] [--apply]');
      return 0;
    }
    report(await configureMemory(options));
    return 0;
  } catch (error) {
    console.error(`ERRORE: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
