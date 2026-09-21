#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { parseDocument } from 'yaml';

export const HUB_ROOT = fileURLToPath(new URL('../', import.meta.url));

const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

export async function readHubFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') ||
      path.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.split('/').includes('..')) {
    throw new Error('Il riferimento deve essere un percorso relativo senza attraversamenti.');
  }
  const base = await fs.realpath(root);
  const target = await fs.realpath(path.join(base, relative));
  if (!inside(base, target)) throw new Error('Il riferimento esce dal hub tramite un collegamento simbolico.');
  if (!(await fs.stat(target)).isFile()) throw new Error('Il riferimento non è un file.');
  return fs.readFile(target, 'utf8');
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { throw new Error('JSON non valido.'); }
}

function parseYaml(text) {
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) throw new Error('YAML non valido.');
  return document.toJS({ maxAliasCount: 100 });
}

function parseData(text, filename) {
  return filename.endsWith('.json') ? parseJson(text) : parseYaml(text);
}

function schemaErrors(validate) {
  return (validate.errors ?? []).map(error => `${error.instancePath || '/'}: ${error.message}`).join('; ');
}

function assertLocalSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Schema JSON non valido.');
  if (schema.$schema && !['http://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft-07/schema#'].includes(schema.$schema)) {
    throw new Error('È richiesto JSON Schema draft-07.');
  }
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if ('$ref' in value && (typeof value.$ref !== 'string' || !value.$ref.startsWith('#'))) {
      throw new Error('I riferimenti dello schema devono essere interni al documento.');
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(schema);
}

function compileSchema(schema) {
  assertLocalSchema(schema);
  return new Ajv({ allErrors: true, strict: true }).compile(schema);
}

function verifyRoles(data, kind, roleIds) {
  const fields = kind === 'task' ? ['role'] : ['from_role', 'to_role'];
  for (const field of fields) {
    if (!roleIds.has(data[field])) throw new Error(`Il campo ${field} non indica un ruolo del catalogo.`);
  }
}

export async function checkHub({ root = HUB_ROOT, task, handoff } = {}) {
  const errors = [];
  const counts = { roles: 0, skills: 0, contracts: 0, documents: 0 };
  const attempt = async (label, action) => {
    try { return await action(); } catch (error) {
      const message = error.code === 'ENOENT' ? 'File non trovato.' : error.message;
      errors.push(`${label}: ${message}`);
      return undefined;
    }
  };
  const manifest = await attempt('Manifest', async () => {
    const value = parseJson(await readHubFile(root, 'hub.json'));
    const validate = compileSchema(parseJson(await readHubFile(root, 'schemas/hub.schema.json')));
    if (!validate(value)) throw new Error(schemaErrors(validate));
    return value;
  });
  if (!manifest) return { ok: false, errors, counts };

  const roleIds = new Set();
  const skillIds = new Set();
  for (const [kind, entries, ids] of [['Ruolo', manifest.roles, roleIds], ['Skill', manifest.skills, skillIds]]) {
    for (const entry of entries) {
      await attempt(`${kind} ${entry.id}`, async () => {
        if (ids.has(entry.id)) throw new Error('Identificatore duplicato nel catalogo.');
        ids.add(entry.id);
        if (!entry.file.endsWith('.md')) throw new Error('È richiesto un file Markdown.');
        const text = await readHubFile(root, entry.file);
        if (!text.trim()) throw new Error('Il documento è vuoto.');
        if (kind === 'Skill') {
          if (path.posix.basename(entry.file) !== 'SKILL.md' || path.posix.basename(path.posix.dirname(entry.file)) !== entry.id) {
            throw new Error('La skill deve risiedere in una directory con il proprio identificatore e chiamarsi SKILL.md.');
          }
          const frontmatter = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
          if (!frontmatter) throw new Error('Frontmatter YAML mancante o non delimitato.');
          const metadata = parseYaml(frontmatter[1]);
          if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.name !== entry.id ||
              typeof metadata.description !== 'string' || !metadata.description.trim()) {
            throw new Error('Il frontmatter richiede name uguale all’identificatore e description non vuota.');
          }
          if (!frontmatter[2].trim()) throw new Error('Il corpo della skill è vuoto.');
          counts.skills++;
        } else counts.roles++;
      });
    }
  }

  const validators = {};
  for (const kind of ['task', 'handoff']) {
    const contract = manifest.contracts[kind];
    const validator = await attempt(`Schema ${kind}`, async () => {
      if (!contract.schema.endsWith('.json')) throw new Error('È richiesto uno schema JSON.');
      return compileSchema(parseJson(await readHubFile(root, contract.schema)));
    });
    if (!validator) continue;
    validators[kind] = validator;
    await attempt(`Template ${kind}`, async () => {
      if (!/\.(json|ya?ml)$/.test(contract.template)) throw new Error('È richiesto un template JSON o YAML.');
      const data = parseData(await readHubFile(root, contract.template), contract.template);
      if (!validator(data)) throw new Error(schemaErrors(validator));
      verifyRoles(data, kind, roleIds);
      counts.contracts++;
    });
  }

  for (const [kind, filename] of [['task', task], ['handoff', handoff]]) {
    if (!filename || !validators[kind]) continue;
    await attempt(`Documento ${kind}`, async () => {
      if (!/\.(json|ya?ml)$/.test(filename)) throw new Error('È richiesto un documento JSON o YAML.');
      const data = parseData(await fs.readFile(filename, 'utf8'), filename);
      if (!validators[kind](data)) throw new Error(schemaErrors(validators[kind]));
      verifyRoles(data, kind, roleIds);
      counts.documents++;
    });
  }
  return { ok: errors.length === 0, errors, counts };
}

export function parseVersion(output) {
  return output.match(/(?:^|[^\w.])v?(\d+\.\d+(?:\.\d+)?)(?![\w.])/)?.[1] ?? null;
}

export function probeVersion(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 2000, maxBuffer: 16 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) return null;
  return parseVersion(result.stdout);
}

export async function doctor({ root = HUB_ROOT, version = probeVersion } = {}) {
  const checks = [];
  const node = version(process.execPath);
  checks.push({ status: node && Number(node.split('.')[0]) >= 22 ? 'ok' : 'error', message: node ? `Node ${node} (richiesto almeno 22).` : 'Node non disponibile.' });
  const uv = version('uv');
  checks.push({ status: uv ? 'ok' : 'error', message: uv ? `uv ${uv}.` : 'uv non disponibile nel PATH.' });
  for (const command of ['claude', 'codex']) {
    const found = version(command);
    checks.push({ status: found ? 'ok' : 'warning', message: found ? `${command} ${found}; autenticazione non verificata.` : `${command} non disponibile o verifica della versione non riuscita; integrazione opzionale.` });
  }
  const vscode = await fs.access('/Applications/Visual Studio Code.app').then(() => true, () => false);
  checks.push({ status: vscode ? 'ok' : 'warning', message: vscode ? 'Applicazione VS Code presente; sessioni e provider non verificati.' : 'Applicazione VS Code non trovata nel percorso macOS previsto.' });
  const names = [];
  for (const [filename, key] of [['.mcp.json', 'mcpServers'], ['.vscode/mcp.json', 'servers']]) {
    try {
      const config = parseJson(await readHubFile(root, filename));
      if (!config[key] || typeof config[key] !== 'object' || Array.isArray(config[key])) throw new Error('Formato non riconosciuto.');
      const servers = Object.keys(config[key]).sort();
      names.push(servers);
      checks.push({ status: 'ok', message: `${filename}: server configurati ${servers.length ? servers.map(name => JSON.stringify(name)).join(', ') : '(nessuno)'}. Connessione non verificata.` });
    } catch (error) {
      names.push(null);
      checks.push({ status: 'warning', message: `${filename}: ${error.code === 'ENOENT' ? 'configurazione assente' : 'configurazione non leggibile o non valida'}.` });
    }
  }
  if (names.every(Boolean)) {
    const onlyClaude = names[0].filter(name => !names[1].includes(name));
    const onlyVscode = names[1].filter(name => !names[0].includes(name));
    checks.push({ status: onlyClaude.length || onlyVscode.length ? 'warning' : 'ok', message: `Differenze nei nomi MCP: solo Claude ${JSON.stringify(onlyClaude)}; solo VS Code ${JSON.stringify(onlyVscode)}. I valori di configurazione non vengono confrontati.` });
  }
  checks.push({ status: 'warning', message: 'Nessun server MCP avviato. Autenticazione, connessioni e integrazione Agent Host restano da verificare.' });
  return { ok: !checks.some(check => check.status === 'error'), checks };
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...options] = args;
  if (command === 'doctor' && options.length === 0) {
    const result = await doctor();
    for (const check of result.checks) console.log(`${check.status === 'ok' ? 'OK' : check.status === 'error' ? 'ERRORE' : 'AVVISO'}: ${check.message}`);
    return result.ok ? 0 : 1;
  }
  if (command === 'check') {
    const documents = {};
    for (let index = 0; index < options.length; index += 2) {
      const key = { '--task': 'task', '--handoff': 'handoff' }[options[index]];
      if (!key || !options[index + 1] || options[index + 1].startsWith('--') || documents[key]) {
        console.error('Uso: node scripts/hub.mjs check [--task FILE] [--handoff FILE]');
        return 1;
      }
      documents[key] = options[index + 1];
    }
    const result = await checkHub(documents);
    for (const error of result.errors) console.error(`ERRORE: ${error}`);
    if (result.ok) console.log(`OK: ${result.counts.roles} ruoli, ${result.counts.skills} skill, ${result.counts.contracts} contratti e ${result.counts.documents} documenti espliciti verificati.`);
    return result.ok ? 0 : 1;
  }
  console.error('Uso: node scripts/hub.mjs check [--task FILE] [--handoff FILE] | doctor');
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main().catch(() => {
    console.error('ERRORE: impossibile completare il comando hub.');
    return 1;
  });
}
